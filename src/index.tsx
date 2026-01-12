import { registry } from "@jahia/ui-extender";
import {
  Plugin,
  type ViewDocumentClipboardInputEvent,
  type EditorConfig,
  EventInfo,
} from "ckeditor5";
import { process } from "./clean.ts";
import { useEffect, type ReactNode } from "react";
import { shallowEqual, useDispatch, useSelector } from "react-redux";
import { batchActions } from "redux-batched-actions";

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

class HappyPaste extends Plugin {
  init() {
    // When something is pasted into the editor:
    // 1. Retrieve HTML and text/plain from clipboard
    // 2. Clean the HTML, extract embedded images
    // 3. If no images, update clipboard data and let CKEditor process as usual
    // 4. Otherwise, stop the clipboard process, open the folder picker,
    //    upload all images to the selected folder, then trigger a paste event again
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

        if (processed.files.length === 0) {
          data.dataTransfer.setData("text/html", processed.html);
          data.dataTransfer.setData("text/plain", text);
          return;
        }

        evt.stop();

        // Map original file (￼_n_) names to new File objects with proper names
        const prefix = "clipboard-" + new Date().toISOString().replace(/[T:.]/g, "-").slice(0, 19);
        const map = new Map(
          processed.files.map((file, index, files) => {
            const name =
              prefix +
              (files.length > 1 ? `-${index + 1}` : "") +
              (mimeTypeExtension.get(file.type) ?? ".png");
            return [file.name, new File([file], name, { type: file.type })];
          }),
        );

        CE_API.openPicker({
          site: contextJsParameters.siteKey,
          lang: contextJsParameters.lang,
          type: "folder",
          setValue: async ([{ path }]: Array<{ path: string }>) => {
            const happyPasteCallback = () => {
              // Replace all ￼_n_ with the uploaded file paths
              data.dataTransfer.setData(
                "text/html",
                processed.html.replaceAll(
                  /￼_\d+_/g,
                  (match) => `/files/{workspace}${path}/${map.get(match)?.name}`,
                ),
              );
              data.dataTransfer.setData("text/plain", text);

              // Fire the paste event once for all images
              this.editor.editing.view.document.fire(new EventInfo(evt.source, evt.name), data);
            };

            // Push files to upload queue in Redux
            this.editor.config.get("happyPaste.uploadFiles")?.(
              [...map.values()].map<Upload>((file) => ({
                id: file.name,
                status: "QUEUED",
                path,
                file,
                happyPasteCallback,
              })),
            );
          },
        });
      },
    );
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
