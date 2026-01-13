/**
 * Brace yourself, the information flow is complex.
 *
 * When the user pastes content into CKEditor:
 *  1. CKEditor5 "clipboardInput" event is fired, we intercept it
 *  2. We clean the HTML, extract embedded images, update the event dataTransfer
 *  3. If there are no images, we let CKEditor process the event as usual
 *  4. Otherwise, we stop the event, open a balloon to ask for the upload folder
 *  5. When the upload folder picker button is clicked, we open the CE file picker and
 *     when a folder is selected, we update the balloon with the selected path
 *  6. When the user clicks "Paste" in the balloon, we trigger a "paste" event back to
 *     the HappyPaste plugin, with the selected path as argument
 *  7. This event is listened to, and, when fired, we push all extracted images to
 *     the Redux upload queue with a special happyPasteCallback
 *  8. Upload progress is tracked in a useEffect in the React component, when complete
 *     the happyPasteCallback is called
 *  9. This callback prepares a new "clipboardInput" event and fires it to CKEditor,
 *     we're back to step 1, but this time the clipboard data contains image URLs instead
 *     of embedded images
 *
 * @module
 */
import { registry } from "@jahia/ui-extender";
import {
  Plugin,
  type ViewDocumentClipboardInputEvent,
  type EditorConfig,
  ContextualBalloon,
  BalloonPanelView,
  Locale,
  View,
  LabeledFieldView,
  createLabeledInputText,
  ButtonView,
  IconLocal,
  clickOutsideHandler,
  EventInfo,
} from "ckeditor5";
import { process } from "./clean.ts";
import { useEffect, type ReactNode } from "react";
import { shallowEqual, useDispatch, useSelector } from "react-redux";
import { batchActions } from "redux-batched-actions";
import "./oskour.css";

/** Type of objects in the state.jcontent.fileUpload.uploads Redux store */
interface Upload {
  id: string;
  status: "QUEUED" | "UPLOADING" | "UPLOADED" | "FAILED";
  path: string;
  file: File;
  /** Callback when the upload is successful, specific to happy-paste */
  happyPasteCallback?: () => void;
}

declare module "@ckeditor/ckeditor5-core" {
  interface EditorConfig {
    happyPaste: {
      /**
       * Because uploading files is done through Redux, which is only available in
       * React components, we use a config key to hold the Redux uploadFiles callback
       */
      uploadFiles: (files: Upload[]) => void;
    };
  }
}

const mimeTypeExtension = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["image/bmp", ".bmp"],
  ["image/svg+xml", ".svg"],
  ["image/tiff", ".tiff"],
  ["image/heic", ".heic"],
  ["image/avif", ".avif"],
]);

class BalloonContentsView extends View {
  pickerOpen = false;

  constructor(locale: Locale) {
    super(locale);
    const pathInput = new LabeledFieldView(this.locale, createLabeledInputText);
    pathInput.set({ label: "Upload path", isEnabled: false });
    const pickerButton = new ButtonView();
    pickerButton.set({ label: "Choose folder", icon: IconLocal, tooltip: true });
    const cancelButton = new ButtonView();
    cancelButton.set({ label: "Cancel", withText: true });
    const pasteButton = new ButtonView();
    pasteButton.set({ label: "Paste", withText: true, class: "ck-button-action" });
    pasteButton.bind("isEnabled").to(pathInput.fieldView, "value", Boolean);

    // In case the user previously selected a path, restore it
    if (sessionStorage.getItem("happy-paste-last-path"))
      pathInput.fieldView.value = sessionStorage.getItem("happy-paste-last-path") ?? "";

    pasteButton.on("execute", () => {
      this.fire("paste", pathInput.fieldView.value);
    });
    cancelButton.on("execute", () => {
      this.fire("cancel");
    });

    pickerButton.on("execute", () => {
      this.pickerOpen = true;
      CE_API.openPicker({
        site: contextJsParameters.siteKey,
        lang: contextJsParameters.lang,
        type: "folder",
        setValue: async ([{ path }]: Array<{ path: string }>) => {
          this.pickerOpen = false;
          pathInput.fieldView.value = path;
          sessionStorage.setItem("happy-paste-last-path", path);
        },
      });
    });

    this.setTemplate({
      tag: "div",
      attributes: {
        class: ["ck"],
        style:
          "max-width:284px;display:flex;flex-direction:column;padding:var(--ck-spacing-standard);gap:var(--ck-spacing-standard)",
      },
      children: [
        {
          tag: "p",
          attributes: { style: "white-space:wrap;line-height:1.25" },
          children: ["Your clipboard contains images. Please choose a folder to upload them to."],
        },
        {
          tag: "div",
          attributes: { style: "display:flex;gap:var(--ck-spacing-small)" },
          children: [pathInput, pickerButton],
        },
        {
          tag: "div",
          attributes: { style: "display:flex;justify-content:space-between" },
          children: [cancelButton, pasteButton],
        },
      ],
    });
  }
}

class HappyPaste extends Plugin {
  _balloon!: ContextualBalloon;
  _balloonView!: BalloonPanelView;
  _balloonContents!: BalloonContentsView;
  _clipboardData!: ViewDocumentClipboardInputEvent["args"][0];
  _fileMap!: Map<string, File>;

  static get requires() {
    return [ContextualBalloon];
  }

  init() {
    this._balloon = this.editor.plugins.get(ContextualBalloon);
    this._balloonView = new BalloonPanelView(this.editor.locale);
    this._balloonContents = new BalloonContentsView(this.editor.locale);

    this._balloonView.setTemplate({
      tag: "div",
      children: this._balloonView.createCollection([this._balloonContents]),
    });

    clickOutsideHandler({
      emitter: this._balloonView,
      activator: () =>
        this._balloon.visibleView === this._balloonView && !this._balloonContents.pickerOpen,
      contextElements: [this._balloon.view.element!],
      callback: () => this._hideBalloon(),
    });

    this._balloonContents.on("cancel", () => {
      this._hideBalloon();
    });

    this.editor.model.document.on("change:data", () => {
      this._hideBalloon();
    });

    this._balloonContents.on("paste", (evt, path: string) => {
      const happyPasteCallback = () => {
        // Replace all ￼_n_ with the uploaded file paths
        this._clipboardData.dataTransfer.setData(
          "text/html",
          this._clipboardData.dataTransfer
            .getData("text/html")
            .replaceAll(
              /￼_\d+_/g,
              (match) => `/files/{workspace}${path}/${this._fileMap.get(match)?.name}`,
            ),
        );

        // Fire the paste event once for all images
        this.editor.editing.view.document.fire(
          new EventInfo(this.editor.editing.view.document, "clipboardInput"),
          this._clipboardData,
        );

        // Hide the balloon when done
        this._hideBalloon();
      };

      // Push files to upload queue in Redux
      this.editor.config.get("happyPaste.uploadFiles")?.(
        [...this._fileMap.values()].map<Upload>((file) => ({
          id: file.name,
          status: "QUEUED",
          path,
          file,
          happyPasteCallback,
        })),
      );
    });

    this.listenTo<ViewDocumentClipboardInputEvent>(
      this.editor.editing.view.document,
      "clipboardInput",
      (evt, data) => {
        const dataTransfer = data.dataTransfer;
        const html = dataTransfer.getData("text/html");
        const text = dataTransfer.getData("text/plain");
        if (!html) return;

        // @ts-expect-error The original one is read-only
        data.dataTransfer = new DataTransfer();
        const processed = process(html);

        data.dataTransfer.setData("text/html", processed.html);
        data.dataTransfer.setData("text/plain", text);

        if (processed.files.length === 0) return;

        evt.stop();

        this._clipboardData = data;

        // Map original file (￼_n_) names to new File objects with proper names
        const prefix = "clipboard-" + new Date().toISOString().replace(/[T:.]/g, "-").slice(0, 19);
        this._fileMap = new Map(
          processed.files.map((file, index, files) => {
            const name =
              prefix +
              (files.length > 1 ? `-${index + 1}` : "") +
              (mimeTypeExtension.get(file.type) ?? ".png");
            return [file.name, new File([file], name, { type: file.type })];
          }),
        );

        this._showBalloon();
      },
    );
  }

  _hideBalloon() {
    if (this._balloon.hasView(this._balloonView)) this._balloon.remove(this._balloonView);
  }

  _showBalloon() {
    this._hideBalloon(); // If already visible, remove it first

    const view = this.editor.editing.view;
    this._balloon.add({
      view: this._balloonView,
      position: {
        target: () => view.domConverter.viewRangeToDom(view.document.selection.getFirstRange()!),
      },
    });
  }
}

/** This is not a real UI component, it only exists to interact with React contexts */
function HappyPasteComponent() {
  const dispatch = useDispatch();

  // Retrieve all uploads from the Redux store (queued, uploading, uploaded, failed)
  const uploads: Upload[] = useSelector(
    (state: any) => state.jcontent.fileUpload.uploads,
    shallowEqual,
  );

  // Because uploads are tracked in Redux, we need an effect to monitor their status
  useEffect(() => {
    if (!uploads || uploads.length === 0) return;

    // Filter uploads that have a happyPasteCallback
    const pasteUploads = uploads.filter((u): u is Upload & { happyPasteCallback: () => void } =>
      Object.hasOwn(u, "happyPasteCallback"),
    );

    // Check if all tracked uploads are complete
    if (pasteUploads.length === 0 || !pasteUploads.every(({ status }) => status === "UPLOADED"))
      return;

    // All uploads from a single paste share the same callback, get the first one, call it
    pasteUploads[0].happyPasteCallback();

    // Remove happyPasteCallback to avoid re-calling in the future
    dispatch({
      type: "FILEUPLOAD_SET_UPLOADS",
      payload: uploads.map(({ happyPasteCallback: _, ...upload }) => upload),
    });
  }, [uploads]);

  // Register CKEditor plugin and configure it
  useEffect(() => {
    for (const config of registry.find({ type: "ckeditor5-config" }) as unknown as EditorConfig[]) {
      (config.extraPlugins ??= []).push(HappyPaste);
      config.happyPaste = {
        // This is how we allow the CKEditor plugin to interact with Redux
        uploadFiles: (payload) => {
          dispatch(
            batchActions([
              { type: "FILEUPLOAD_ADD_UPLOADS", payload },
              // Something is wrong with the batching implementation, only 1 by 1 works
              { type: "FILEUPLOAD_TAKE_FROM_QUEUE", payload: 1 },
            ]) as any,
          );
        },
      };
    }
  }, []);

  return undefined; // We don't actually render anything, we just use the component for its context
}

export default function init() {
  registry.add("app", "happy-paste", {
    targets: ["root:17"],
    render: (next: ReactNode) => (
      <>
        <HappyPasteComponent />
        {next}
      </>
    ),
  });
}
