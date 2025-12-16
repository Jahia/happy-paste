import { registry } from "@jahia/ui-extender";
import {
  ButtonView,
  Plugin,
  ContextualBalloon,
  clickOutsideHandler,
  BalloonPanelView,
} from "ckeditor5";

class PasteBalloon extends Plugin {
  _balloon!: ContextualBalloon;
  _balloonView!: BalloonPanelView;

  static get requires() {
    return [ContextualBalloon];
  }

  init() {
    this._balloon = this.editor.plugins.get(ContextualBalloon);
    this._balloonView = new BalloonPanelView(this.editor.locale);

    const dummyButton = new ButtonView(this.editor.locale);
    dummyButton.set({ label: "Dummy", withText: true });
    dummyButton.on("execute", () => {
      this._balloonView.fire("submit");
    });

    this._balloonView.setTemplate({
      tag: "div",
      children: [dummyButton],
    });

    this._balloonView.on("submit", () => {
      this._hideBalloon();
    });

    clickOutsideHandler({
      emitter: this._balloonView,
      activator: () => this._balloon.visibleView === this._balloonView,
      contextElements: () => [this._balloon.view.element!],
      callback: () => this._hideBalloon(),
    });

    // Listen to clipboard input event to detect paste
    let isPasting = false;
    this.listenTo(this.editor.editing.view.document, "clipboardInput", () => {
      isPasting = true;
    });

    // Show balloon after the model change completes (after paste is inserted)
    this.listenTo(this.editor.model.document, "change:data", () => {
      if (!isPasting) {
        this._hideBalloon();
        return;
      }

      isPasting = false;
      // Use nextTick to ensure selection is updated
      void Promise.resolve().then(() => {
        this._showBalloon();
      });
    });
  }

  _hideBalloon() {
    if (this._balloon.hasView(this._balloonView)) {
      this._balloon.remove(this._balloonView);
    }
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
  registry.add("callback", "customConfig", {
    targets: ["jahiaApp-init:99.5"],
    callback() {
      // Our `customConfig` is based on the `minimal` configuration
      const completeConfig = registry.get("ckeditor5-config", "complete") as any;
      const customConfig = {
        ...completeConfig,
        // Register the PasteBalloon and Timestamp plugins
        plugins: (completeConfig.plugins as any[]).concat([PasteBalloon]),
      };
      registry.addOrReplace("ckeditor5-config", "complete", customConfig);
    },
  });
}
