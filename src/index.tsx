import { registry } from "@jahia/ui-extender";
import { Plugin, ViewDocumentClipboardInputEvent, type EditorConfig } from "ckeditor5";
import { process } from "./clean.ts";

class HappyPaste extends Plugin {
  init() {
    this.listenTo<ViewDocumentClipboardInputEvent>(
      this.editor.editing.view.document,
      "clipboardInput",
      (evt, data) => {
        console.log("clipboardInput", evt, data);
        const dataTransfer = data.dataTransfer;
        const html = dataTransfer.getData("text/html");
        const text = dataTransfer.getData("text/plain");
        if (!html) return;

        // @ts-expect-error The original one is read-only
        data.dataTransfer = new DataTransfer();
        const processed = process(html);
        if (processed.files.length > 0) {
          evt.stop();
          alert("Pasting files is WIP");
        }
        data.dataTransfer.setData("text/html", processed.html);
        data.dataTransfer.setData("text/plain", text);
      },
    );
  }
}

export default function init() {
  registry.add("callback", "happy-paste", {
    targets: ["jahiaApp-init:999"],
    callback() {
      for (const config of registry.find({ type: "ckeditor5-config" })) {
        (config as EditorConfig)?.plugins?.push(HappyPaste);
      }
    },
  });
}
