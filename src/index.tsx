import { registry } from "@jahia/ui-extender";
import {
  Plugin,
  type ViewDocumentClipboardInputEvent,
  type EditorConfig,
  EventInfo,
  FileRepository,
  type UploadAdapter,
  type FileLoader,
  type UploadResponse,
} from "ckeditor5";
import { process } from "./clean.ts";
// import { Button, Modal, ModalBody, ModalFooter, ModalHeader, Typography } from "@jahia/moonstone";
import { useEffect } from "react";

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

export class Base64UploadAdapter extends Plugin {
  public static get requires() {
    return [FileRepository] as const;
  }

  public init(): void {
    this.editor.plugins.get(FileRepository).createUploadAdapter = (loader) => new Adapter(loader);
  }
}

class Adapter implements UploadAdapter {
  public loader: FileLoader;

  public reader?: FileReader;

  constructor(loader: FileLoader) {
    this.loader = loader;
  }

  public upload(): Promise<UploadResponse> {
    return new Promise((resolve, reject) => {
      const reader = (this.reader = new window.FileReader());

      reader.addEventListener("load", () => {
        resolve({ default: reader.result });
      });

      reader.addEventListener("error", (err) => {
        reject(err);
      });

      reader.addEventListener("abort", () => {
        reject();
      });

      void this.loader.file.then((file) => {
        reader.readAsDataURL(file!);
      });
    });
  }

  public abort() {
    this.reader?.abort();
  }
}

function App() {
  // const [isOpen, setIsOpen] = useState(true);

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
          if (processed.files.length > 0) {
            evt.stop();
            CE_API.openPicker({
              site: contextJsParameters.siteKey,
              type: "folder",
              setValue: async (value) => {
                const { path } = value[0];
                const { handleUpload } = registry.get("fileUpload", "default");

                const prefix =
                  "clipboard-" + new Date().toISOString().replace(/[T:.]/g, "-").slice(0, 19);

                const map = new Map(
                  processed.files.map((file, index, files) => [
                    file.name,
                    files.length > 1
                      ? prefix + `-${index}` + guessExtensionFromMimeType(file.type)
                      : prefix + guessExtensionFromMimeType(file.type),
                  ]),
                );

                await Promise.all(
                  processed.files.map((file) =>
                    handleUpload({
                      path,
                      file,
                      filename: map.get(file.name)!,
                      client: jahia.apolloClient,
                      lang: contextJsParameters.lang,
                    }),
                  ),
                );

                const updatedHtml = processed.html.replaceAll(
                  /￼_\d+_/g,
                  (match) => `/files/{workspace}${path}/${map.get(match)}`,
                );

                console.log("Updated HTML:", updatedHtml);

                data.dataTransfer.setData("text/html", updatedHtml);
                data.dataTransfer.setData("text/plain", text);

                this.editor.editing.view.document.fire(new EventInfo(evt.source, evt.name), data);
              },
              lang: contextJsParameters.lang,
            });
            return;
          }
          data.dataTransfer.setData("text/html", processed.html);
          data.dataTransfer.setData("text/plain", text);
        },
      );
    }
  }

  useEffect(() => {
    for (const config of registry.find({ type: "ckeditor5-config" })) {
      (config as EditorConfig)?.plugins?.push(Base64UploadAdapter, HappyPaste);
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
    render: (next) => (
      <>
        <App />
        {next}
      </>
    ),
  });
}
