import i18next from "i18next";
import { registry } from "@jahia/ui-extender";
import {
  Plugin,
  type ViewDocumentClipboardInputEvent,
  type EditorConfig,
  type ContextualBalloon,
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
import type { Store } from "redux";
import { batchActions } from "redux-batched-actions";
import "./oskour.css";

const t = i18next.getFixedT(null, "happy-paste");

const LAST_PATH_KEY = "happy-paste-last-path";

/** Type of objects in the state.jcontent.fileUpload.uploads Redux store */
interface Upload {
  id: string;
  status: "QUEUED" | "UPLOADING" | "UPLOADED" | "FAILED";
  path: string;
  file: File;
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

/** CK5 UI element with [image] [input] .ext */
class HPFileRowView extends View {
  private readonly _id: string;
  private readonly _file: File;
  private readonly _extension: string;
  private readonly _objectUrl: string;
  /** Closure so TypeScript infers InputTextView (which has .value) from the constructor call */
  private readonly _getValue: () => string;

  constructor(locale: Locale, id: string, file: File) {
    super(locale);
    this._id = id;
    this._file = file;
    this._objectUrl = URL.createObjectURL(file);
    this._extension = mimeTypeExtension.get(file.type) ?? ".png";

    const baseName = file.name.endsWith(this._extension)
      ? file.name.slice(0, -this._extension.length)
      : file.name;

    const inputView = new LabeledFieldView(locale, createLabeledInputText);
    inputView.set({ label: t("fileName") });
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
            alt: "",
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

  getFile(): File {
    return new File([this._file], this._getValue() + this._extension, { type: this._file.type });
  }

  getId(): string {
    return this._id;
  }

  destroy() {
    URL.revokeObjectURL(this._objectUrl);
    return super.destroy();
  }
}

class HPBalloonContentsView extends View {
  pickerOpen = false;
  private _fileRows: ViewCollection<HPFileRowView>;

  constructor(locale: Locale) {
    super(locale);
    this._fileRows = this.createCollection();
    const pathInput = new LabeledFieldView(this.locale, createLabeledInputText);
    pathInput.set({ label: t("uploadPath"), isEnabled: false });
    pathInput.extendTemplate({ attributes: { style: "flex:1" } });
    pathInput.fieldView.extendTemplate({ attributes: { style: "width:100%" } });
    const pickerButton = new ButtonView();
    pickerButton.set({
      label: t("choose"),
      icon: IconLocal,
      withText: true,
    });
    const cancelButton = new ButtonView();
    cancelButton.set({ label: t("cancel"), withText: true });
    const pasteButton = new ButtonView();
    pasteButton.set({
      label: t("paste"),
      withText: true,
      class: "ck-button-action",
    });
    pasteButton.bind("isEnabled").to(pathInput.fieldView, "value", Boolean);

    // In case the user previously selected a path, restore it so they don't have to re-pick
    if (sessionStorage.getItem(LAST_PATH_KEY))
      pathInput.fieldView.value = sessionStorage.getItem(LAST_PATH_KEY) ?? "";

    pasteButton.on("execute", () => {
      this.fire("paste", pathInput.fieldView.value);
    });
    cancelButton.on("execute", () => {
      this.fire("cancel");
    });

    pickerButton.on("execute", () => {
      this.pickerOpen = true;
      CE_API.openPicker({
        site: window.contextJsParameters.siteKey,
        lang: window.contextJsParameters.lang,
        type: "folder",
        setValue: async ([{ path }]: Array<{ path: string }>) => {
          this.pickerOpen = false;
          pathInput.fieldView.value = path;
          sessionStorage.setItem(LAST_PATH_KEY, path);
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
            style:
              "white-space:normal;overflow-wrap:anywhere;line-height:1.25;padding-inline:var(--ck-spacing-standard)",
          },
          children: [t("clipboardImages")],
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
    for (const [id, file] of fileMap) this._fileRows.add(new HPFileRowView(this.locale!, id, file));
  }

  getFiles(): Map<string, File> {
    return new Map(this._fileRows.map((r) => [r.getId(), r.getFile()]));
  }
}

class HappyPaste extends Plugin {
  _balloon!: ContextualBalloon;
  _balloonView!: BalloonPanelView;
  _clipboardData!: ViewDocumentClipboardInputEvent["args"][0];
  _happyPasteCallback: (() => void) | null = null;

  static get requires() {
    return ["ContextualBalloon"];
  }

  init() {
    this._balloon = this.editor.plugins.get("ContextualBalloon");
    this._balloonView = new BalloonPanelView(this.editor.locale);
    const balloonContents = new HPBalloonContentsView(this.editor.locale);

    this._balloonView.setTemplate({
      tag: "div",
      children: this._balloonView.createCollection([balloonContents]),
    });

    clickOutsideHandler({
      emitter: this._balloonView,
      activator: () =>
        this._balloon.visibleView === this._balloonView && !balloonContents.pickerOpen,
      contextElements: [this._balloon.view.element!],
      callback: () => this._hideBalloon(),
    });

    balloonContents.on("cancel", () => {
      this._hideBalloon();
    });

    this.editor.model.document.on("change:data", () => {
      this._hideBalloon();
    });

    balloonContents.on("paste", (evt, path: string) => {
      const files = balloonContents.getFiles();

      this._happyPasteCallback = () => {
        // Replace every ￼_n_ placeholder with the final server path
        this._clipboardData.dataTransfer.setData(
          "text/html",
          this._clipboardData.dataTransfer
            .getData("text/html")
            .replaceAll(
              /￼_\d+_/g,
              (match) =>
                `${window.contextJsParameters.contextPath}/files/{workspace}${path}/${encodeURIComponent(files.get(match)?.name ?? "")}`,
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

      // Dispatch uploads directly to the Redux store and watch for completion
      const store: Store = (window.jahia as any).reduxStore;
      // Use placeholder as the stable id — file.name is user-editable and may collide
      const uploads = [...files].map<Upload>(([id, file]) => ({
        id,
        status: "QUEUED" as const,
        path,
        file,
      }));

      store.dispatch(
        // @ts-expect-error Incompatible redux libs
        batchActions([
          { type: "FILEUPLOAD_ADD_UPLOADS", payload: uploads },
          // The upstream lib has a bug where only 1 upload at a time is dequeued
          { type: "FILEUPLOAD_TAKE_FROM_QUEUE", payload: 1 },
        ]),
      );

      const unsubscribe = store.subscribe(() => {
        const allUploads: Upload[] = store.getState().jcontent.fileUpload.uploads;
        const pasteUploads = allUploads.filter((u) => uploads.some((up) => up.id === u.id));
        if (pasteUploads.length === 0) return;
        if (pasteUploads.some((u) => u.status === "FAILED")) {
          unsubscribe();
          this._happyPasteCallback = null;
          console.error("[happy-paste] One or more image uploads failed.");
          return;
        }
        if (!pasteUploads.every((u) => u.status === "UPLOADED")) return;
        unsubscribe();
        this._happyPasteCallback?.();
        this._happyPasteCallback = null;
      });
    });

    this.listenTo<ViewDocumentClipboardInputEvent>(
      this.editor.editing.view.document,
      "clipboardInput",
      (evt, data) => {
        // If the balloon is already visible, it means the user clicked "Paste" and
        // we're delegating to CK to complete the insertion
        if (this._balloon.hasView(this._balloonView)) return;

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

          // @ts-expect-error The original one is read-only
          data.dataTransfer = new DataTransfer();
          data.dataTransfer.setData("text/plain", "");

          // Create a minimal HTML with placeholders
          const fileMap = new Map(imageFiles.map((file, index) => [`￼_${index}_`, file]));
          data.dataTransfer.setData(
            "text/html",
            [...fileMap.keys()].map((placeholder) => `<img alt="" src="${placeholder}">`).join(""),
          );

          this._clipboardData = data;
          balloonContents.setFiles(fileMap);
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

        const prefix = "clipboard-" + new Date().toISOString().replace(/[T:.]/g, "-").slice(0, 19);
        balloonContents.setFiles(
          new Map(
            processed.files.map((file, index) => {
              const ext = mimeTypeExtension.get(file.type) ?? ".png";
              const generatedName =
                prefix + (processed.files.length > 1 ? `-${index + 1}` : "") + ext;
              return [file.name, new File([file], generatedName, { type: file.type })];
            }),
          ),
        );
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

export default function init() {
  // Let the app-shell load the translations for us using path conventions
  void i18next.loadNamespaces("happy-paste");

  registry.add("callback", "happy-paste", {
    targets: ["jahiaApp-init:99.5"],
    callback: () => {
      for (const config of registry.find({
        type: "ckeditor5-config",
      }) as unknown as EditorConfig[]) {
        (config.extraPlugins ??= []).push(HappyPaste);
      }
    },
  });
}
