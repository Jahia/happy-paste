import { registry } from "@jahia/ui-extender";
import { ButtonView, Plugin } from "ckeditor5";

class Timestamp extends Plugin {
  init() {
    const editor = this.editor;

    editor.ui.componentFactory.add("timestamp", () => {
      const button = new ButtonView();
      button.set({ label: "Timestamp", withText: true });
      button.on("execute", () => {
        const now = new Date();
        editor.model.change((writer) => {
          editor.model.insertContent(writer.createText(now.toString()));
        });
      });
      return button;
    });
  }
}

export default function init() {
  registry.add("callback", "customConfig", {
    targets: ["jahiaApp-init:99.5"],
    callback() {
      // Our `customConfig` is based on the `minimal` configuration
      const completeConfig = registry.get("ckeditor5-config", "complete");
      const customConfig = {
        ...completeConfig,
        // Register the Timestamp plugin
        plugins: completeConfig.plugins.concat([Timestamp]),
        toolbar: {
          // Add the timestamp button at the end of the toolbar
          items: completeConfig.toolbar.items.concat(["timestamp"]),
          shouldNotGroupWhenFull: true,
        },
      };
      registry.addOrReplace("ckeditor5-config", "complete", customConfig);
    },
  });
}
