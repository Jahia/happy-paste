import { registry } from "@jahia/ui-extender";
import { Plugin, type ViewDocumentClipboardInputEvent, type EditorConfig } from "ckeditor5";
import { process } from "./clean.ts";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, Typography } from "@jahia/moonstone";
import { useEffect, useState } from "react";

function App() {
  const [isOpen, setIsOpen] = useState(true);

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
            setIsOpen(true);
          }
          data.dataTransfer.setData("text/html", processed.html);
          data.dataTransfer.setData("text/plain", text);
        },
      );
    }
  }

  useEffect(() => {
    for (const config of registry.find({ type: "ckeditor5-config" })) {
      (config as EditorConfig)?.plugins?.push(HappyPaste);
    }
  });

  const Picker = (registry.get("selectorType", "Picker") as any).resolver([], {}).cmp;

  return (
    <Modal isOpen={isOpen} style={{ zIndex: 1300 }}>
      <>
        <ModalHeader title="Modal Title" />
        <ModalBody>
          <Typography>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Fusce sed elit et nibh rhoncus
            tincidunt id vel orci. Quisque vehicula eleifend odio, vitae dapibus eros volutpat vel.
          </Typography>
          {/* <Picker /> */}
        </ModalBody>
        <ModalFooter>
          <Typography>Modal footer</Typography>
          <Button
            label="Close"
            onClick={function () {
              CE_API.openPicker({
                site: contextJsParameters.siteKey,
                type: "folder",
                setValue: (value) => {
                  console.log(value);
                },
                lang: contextJsParameters.lang,
              });
            }}
          />
        </ModalFooter>
      </>
    </Modal>
  );
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

  // registry.add("app", "happy-paste", {
  //   targets: ["root:17"],
  //   render: (next) => (
  //     <>
  //       <App />
  //       {next}
  //     </>
  //   ),
  // });
}
