/**
 * Brace yourself, the information flow is complex.
 *
 * There are two entry points, depending on what is in the clipboard:
 *
 * A) Rich text containing embedded (base64) images:
 *  1. CKEditor5 "clipboardInput" event fires (priority "highest"), we intercept it
 *  2. We clean the HTML with process(), which extracts embedded images as File objects
 *     and replaces their src with placeholders (￼_0_, ￼_1_, …)
 *  3. If there are no embedded images, we let CKEditor process the event as usual
 *  4. Otherwise, we stop the event, build _fileMap (placeholder → File with a
 *     timestamp-based name), and show the balloon
 *
 * B) Raw image paste (screenshot, image file copied from OS, drag-and-drop):
 *  1. CKEditor5 "clipboardInput" fires; dataTransfer.files contains the images but
 *     there is no HTML. We intercept the event (priority "highest") before CKEditor's
 *     own ImageUpload plugin would otherwise emit filerepository-no-upload-adapter
 *  2. We build _fileMap from the raw File objects, synthesize a minimal HTML string
 *     (<img src="￼_0_"> …), store it as _clipboardData, and show the balloon
 *
 * Shared flow from step 4 / 2 onwards (both paths):
 *  3. The balloon shows thumbnails of each image with an editable filename input
 *     (pre-populated with the generated name) and a folder picker
 *  4. When the upload folder picker button is clicked, we open the CE file picker;
 *     when a folder is selected, the balloon is updated with the selected path
 *  5. When the user clicks "Paste" in the balloon, we collect the user-edited filenames,
 *     rebuild _fileMap with the new names, and fire a "paste" event on the balloon view
 *  6. This triggers the "paste" listener which pushes all files to the Redux upload
 *     queue with a happyPasteCallback attached to each entry
 *  7. Upload progress is tracked in a useEffect in the React component; when all
 *     happy-paste uploads reach UPLOADED status, happyPasteCallback is called once
 *  8. The callback replaces every ￼_n_ placeholder in _clipboardData's HTML with the
 *     final /files/{workspace}{path}/{filename} URL, then re-fires "clipboardInput"
 *  9. On this second pass, process() sees regular <img src="https://…"> (no data URIs
 *     or placeholders), so processed.files is empty, the event is not stopped, and
 *     CKEditor inserts the images normally
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
  ViewCollection,
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

class FileRowView extends View {
  readonly placeholder: string;
  private readonly _extension: string;
  private readonly _objectUrl: string;
  /** Closure so TypeScript infers InputTextView (which has .value) from the constructor call */
  private readonly _getValue: () => string;

  constructor(locale: Locale, placeholder: string, file: File) {
    super(locale);
    this.placeholder = placeholder;
    this._objectUrl = URL.createObjectURL(file);
    this._extension = mimeTypeExtension.get(file.type) ?? ".png";

    const baseName = file.name.endsWith(this._extension)
      ? file.name.slice(0, -this._extension.length)
      : file.name;

    const inputView = new LabeledFieldView(locale, createLabeledInputText);
    inputView.set({ label: "File name" });
    inputView.extendTemplate({ attributes: { style: "flex:1" } });
    inputView.fieldView.extendTemplate({ attributes: { style: "width:100%" } });
    inputView.fieldView.value = baseName;
    this._getValue = () => inputView.fieldView.element?.value ?? inputView.fieldView.value ?? "";

    this.setTemplate({
      tag: "div",
      attributes: {
        style: "display:flex;align-items:center;gap:var(--ck-spacing-small)",
      },
      children: [
        {
          tag: "img",
          attributes: {
            src: this._objectUrl,
            style: "width:48px;height:48px;object-fit:scale-down;border-radius:2px;flex-shrink:0",
          },
        },
        inputView,
        {
          tag: "span",
          attributes: {
            style:
              "white-space:nowrap;color:var(--ck-color-text);opacity:0.6;font-size:var(--ck-font-size-base)",
          },
          children: [this._extension],
        },
      ],
    });
  }

  getFilename(): string {
    return this._getValue() + this._extension;
  }

  destroy() {
    URL.revokeObjectURL(this._objectUrl);
    return super.destroy();
  }
}

class BalloonContentsView extends View {
  pickerOpen = false;
  private _fileRows: ViewCollection<FileRowView>;

  constructor(locale: Locale) {
    super(locale);
    this._fileRows = this.createCollection();
    const pathInput = new LabeledFieldView(this.locale, createLabeledInputText);
    pathInput.set({ label: "Upload path", isEnabled: false });
    pathInput.extendTemplate({ attributes: { style: "flex:1" } });
    pathInput.fieldView.extendTemplate({ attributes: { style: "width:100%" } });
    const pickerButton = new ButtonView();
    pickerButton.set({ label: "Choose", icon: IconLocal, withText: true });
    const cancelButton = new ButtonView();
    cancelButton.set({ label: "Cancel", withText: true });
    const pasteButton = new ButtonView();
    pasteButton.set({ label: "Paste", withText: true, class: "ck-button-action" });
    pasteButton.bind("isEnabled").to(pathInput.fieldView, "value", Boolean);

    // In case the user previously selected a path, restore it so they don't have to re-pick
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
          "max-width:400px;display:flex;flex-direction:column;padding-block:var(--ck-spacing-standard);gap:var(--ck-spacing-standard)",
      },
      children: [
        {
          tag: "p",
          attributes: {
            style: "white-space:wrap;line-height:1.25;padding-inline:var(--ck-spacing-standard)",
          },
          children: ["Your clipboard contains images. Please choose a folder to upload them to."],
        },
        {
          tag: "div",
          attributes: {
            style:
              "max-height:192px;overflow-y:auto;display:flex;flex-direction:column;gap:var(--ck-spacing-small);padding-inline:var(--ck-spacing-standard);margin-block-end:var(--ck-spacing-standard)",
          },
          children: this._fileRows,
        },
        {
          tag: "div",
          attributes: {
            style:
              "display:flex;gap:var(--ck-spacing-small);padding-inline:var(--ck-spacing-standard)",
          },
          children: [pathInput, pickerButton],
        },
        {
          tag: "div",
          attributes: {
            style:
              "display:flex;justify-content:space-between;padding-inline:var(--ck-spacing-standard)",
          },
          children: [cancelButton, pasteButton],
        },
      ],
    });
  }

  setFiles(fileMap: Map<string, File>) {
    const oldRows = [...this._fileRows];
    this._fileRows.clear();
    for (const row of oldRows) row.destroy();
    for (const [placeholder, file] of fileMap) {
      this._fileRows.add(new FileRowView(this.locale!, placeholder, file));
    }
  }

  getFilenames(): Map<string, string> {
    const map = new Map<string, string>();
    for (const row of this._fileRows) map.set(row.placeholder, row.getFilename());
    return map;
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
      // Collect user-edited filenames and rebuild _fileMap with the new File objects
      const filenames = this._balloonContents.getFilenames();
      for (const [placeholder, file] of this._fileMap) {
        const newName = filenames.get(placeholder);
        if (newName) {
          this._fileMap.set(placeholder, new File([file], newName, { type: file.type }));
        }
      }

      const happyPasteCallback = () => {
        // Replace every ￼_n_ placeholder with the final server path
        this._clipboardData.dataTransfer.setData(
          "text/html",
          this._clipboardData.dataTransfer
            .getData("text/html")
            .replaceAll(
              /￼_\d+_/g,
              (match) => `/files/{workspace}${path}/${this._fileMap.get(match)?.name}`,
            ),
        );

        // Re-fire clipboardInput; this time process() finds no embedded images,
        // so CKEditor handles it normally and inserts the images with real URLs
        this.editor.editing.view.document.fire(
          new EventInfo(this.editor.editing.view.document, "clipboardInput"),
          this._clipboardData,
        );

        // Hide the balloon once the re-fire is queued
        this._hideBalloon();
      };

      // Push all files to the Redux upload queue; each entry carries happyPasteCallback
      // so the React component can trigger it once every upload has completed
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

        // Handle pasting raw image files (no HTML, e.g. screenshot or image file from OS).
        // We intercept here at "highest" priority, before CKEditor's ImageUpload plugin
        // would attempt to use a (non-existent) upload adapter.
        const imageFiles = [...(dataTransfer.files ?? [])].filter((f) =>
          mimeTypeExtension.has(f.type),
        );
        if (!html && imageFiles.length > 0) {
          evt.stop();

          const prefix =
            "clipboard-" + new Date().toISOString().replace(/[T:.]/g, "-").slice(0, 19);
          this._fileMap = new Map(
            imageFiles.map((file, index, files) => {
              const ext = mimeTypeExtension.get(file.type) ?? ".png";
              const name =
                file.name.toLowerCase() || prefix + (files.length > 1 ? `-${index + 1}` : "") + ext;
              const placeholder = `\uFFFC_${index}_`;
              return [placeholder, new File([file], name, { type: file.type })];
            }),
          );

          // Build synthetic HTML with placeholder srcs so that happyPasteCallback
          // can replace them with real URLs in the same way as the rich-text path
          const syntheticHtml = [...this._fileMap.keys()]
            .map((placeholder) => `<img src="${placeholder}">`)
            .join("");

          // @ts-expect-error The original one is read-only
          data.dataTransfer = new DataTransfer();
          data.dataTransfer.setData("text/html", syntheticHtml);
          data.dataTransfer.setData("text/plain", "");

          this._clipboardData = data;
          this._balloonContents.setFiles(this._fileMap);
          this._showBalloon();
          return;
        }

        if (!html) return;

        // Rich text path: clean the HTML and extract embedded base64 images
        // @ts-expect-error The original one is read-only
        data.dataTransfer = new DataTransfer();
        const processed = process(html);

        data.dataTransfer.setData("text/html", processed.html);
        data.dataTransfer.setData("text/plain", text);

        // No embedded images — let CKEditor handle the event normally
        if (processed.files.length === 0) return;

        evt.stop();

        this._clipboardData = data;

        // Give each extracted image a timestamp-based name and map it to its placeholder
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

        this._balloonContents.setFiles(this._fileMap);
        this._showBalloon();
      },
      { priority: "highest" },
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
