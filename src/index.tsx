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
import type { UnknownAction } from "redux";

function guessExtensionFromMimeType(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "image/bmp":
      return ".bmp";
    case "image/svg+xml":
      return ".svg";
    case "image/tiff":
      return ".tiff";
    case "image/heic":
      return ".heic";
    case "image/avif":
      return ".avif";
    default: // Default to png (most common)
      return ".png";
  }
}

/** Type of objects in the state.jcontent.fileUpload.uploads Redux store */
interface Upload {
  id: string;
  status: "QUEUED" | "UPLOADING" | "UPLOADED" | "FAILED";
  error: string | null;
  path: string;
  file: File;
  /** Callback when the upload is successfull, specific to happy-paste */
  happyPasteCallback?: () => void;
}

function App() {
  const dispatch = useDispatch();
  const dispatchBatch = (actions: UnknownAction[]) => dispatch(batchActions(actions) as any);

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
    if (!pasteUploads.every(({ status }) => status === "UPLOADED")) return;

    // All uploads from a single paste share the same callback, get the first one, call it
    const { happyPasteCallback } = pasteUploads[0];

    happyPasteCallback();

    // Remove happyPasteCallback to avoid re-calling in the future
    dispatch({
      type: "FILEUPLOAD_SET_UPLOADS",
      payload: uploads.map(({ happyPasteCallback: _, ...upload }) => upload),
    });
  }, [uploads]);

  class HappyPaste extends Plugin {
    init() {
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
          CE_API.openPicker({
            site: contextJsParameters.siteKey,
            lang: contextJsParameters.lang,
            type: "folder",
            setValue: async ([{ path }]: Array<{ path: string }>) => {
              const prefix =
                "clipboard-" + new Date().toISOString().replace(/[T:.]/g, "-").slice(0, 19);

              // Map original file (￼_n_) names to new File objects with proper names
              const map = new Map(
                processed.files.map((file, index, files) => {
                  const name =
                    files.length > 1
                      ? prefix + `-${index + 1}` + guessExtensionFromMimeType(file.type)
                      : prefix + guessExtensionFromMimeType(file.type);
                  return [file.name, new File([file], name, { type: file.type })];
                }),
              );

              const happyPasteCallback = () => {
                const updatedHtml = html.replaceAll(
                  /￼_\d+_/g,
                  (match) => `/files/{workspace}${path}/${map.get(match)?.name}`,
                );

                console.log("Updated HTML:", updatedHtml);

                data.dataTransfer.setData("text/html", updatedHtml);
                data.dataTransfer.setData("text/plain", text);

                // Fire the paste event once for all images
                this.editor.editing.view.document.fire(new EventInfo(evt.source, evt.name), data);
              };

              const payload = [...map.values()].map<Upload>((file) => ({
                id: file.name,
                status: "QUEUED",
                error: null,
                path,
                file,
                happyPasteCallback,
              }));

              // Dispatch the actions directly using Redux action types
              dispatchBatch([
                { type: "FILEUPLOAD_ADD_UPLOADS", payload: payload },
                // Something is wrong with the batching implementation, only 1 by 1 works
                { type: "FILEUPLOAD_TAKE_FROM_QUEUE", payload: 1 },
              ]);
            },
          });
        },
      );
    }
  }

  useEffect(() => {
    for (const config of registry.find({ type: "ckeditor5-config" })) {
      (config as EditorConfig)?.plugins?.push(HappyPaste);
    }
  });

  return <></>;
  // const Picker = (registry.get("selectorType", "Picker") as any).resolver([], {}).cmp;

  // return (
  //   <Modal isOpen={isOpen} style={{ zIndex: 1300 }}>
  //     <>
  //       <ModalHeader title="Modal Title" />
  //       <ModalBody>
  //         <Typography>
  //           Lorem ipsum dolor sit amet, consectetur adipiscing elit. Fusce sed elit et nibh rhoncus
  //           tincidunt id vel orci. Quisque vehicula eleifend odio, vitae dapibus eros volutpat vel.
  //         </Typography>
  //         {/* <Picker /> */}
  //       </ModalBody>
  //       <ModalFooter>
  //         <Typography>Modal footer</Typography>
  //         <Button
  //           label="Close"
  //           onClick={function () {
  //             CE_API.openPicker({
  //               site: contextJsParameters.siteKey,
  //               type: "folder",
  //               setValue: (value) => {
  //                 console.log(value);
  //               },
  //               lang: contextJsParameters.lang,
  //             });
  //           }}
  //         />
  //       </ModalFooter>
  //     </>
  //   </Modal>
  // );
}

export default function init() {
  registry.add("callback", "happy-paste", {
    targets: ["jahiaApp-init:999"],
    callback() {
      const root = document.createElement("div");
      root.dataset.testid = "happy-paste-root";
      document.body.appendChild(root);
    },
  });

  registry.add("app", "happy-paste", {
    targets: ["root:17"],
    render: (next: ReactNode) => (
      <>
        <App />
        {next}
      </>
    ),
  });
}
