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
  _pastedRange: any = null;
  _clipboardData: string | undefined;
  _pasteStartPosition: any = null;

  static get requires() {
    return [ContextualBalloon];
  }

  init() {
    this._balloon = this.editor.plugins.get(ContextualBalloon);
    this._balloonView = new BalloonPanelView(this.editor.locale);

    const pasteFormattedButton = new ButtonView(this.editor.locale);
    pasteFormattedButton.set({ label: "Paste with formatting", withText: true });
    pasteFormattedButton.on("execute", () => {
      this._balloonView.fire("submit");
    });

    const pastePlainButton = new ButtonView(this.editor.locale);
    pastePlainButton.set({ label: "Paste as plain text", withText: true });
    pastePlainButton.on("execute", () => {
      this._convertToPlainText();
      this._balloonView.fire("submit");
    });

    const pasteStructuredButton = new ButtonView(this.editor.locale);
    pasteStructuredButton.set({ label: "Paste as structured content", withText: true });
    pasteStructuredButton.on("execute", () => {
      this._convertToStructured();
      this._balloonView.fire("submit");
    });

    this._balloonView.setTemplate({
      tag: "div",
      children: [pasteFormattedButton, pastePlainButton, pasteStructuredButton],
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

    // Listen to clipboard input event to detect paste and capture data
    let isPasting = false;

    this.listenTo(this.editor.editing.view.document, "clipboardInput", (evt, data) => {
      isPasting = true;
      // Store the clipboard data and start position
      this._clipboardData =
        data.dataTransfer.getData("text/html") || data.dataTransfer.getData("text/plain");
      this._pasteStartPosition = this.editor.model.document.selection.getFirstPosition();
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
        // Store the range of pasted content
        const pasteEndPosition = this.editor.model.document.selection.getFirstPosition();
        if (this._pasteStartPosition && pasteEndPosition) {
          this._pastedRange = this.editor.model.createRange(
            this._pasteStartPosition,
            pasteEndPosition,
          );
        }
        this._showBalloon();
      });
    });
  }

  _hideBalloon() {
    if (this._balloon.hasView(this._balloonView)) {
      this._balloon.remove(this._balloonView);
    }
  }

  _convertToPlainText() {
    const editor = this.editor;

    if (!this._pastedRange) return;

    // Extract plain text from the pasted content
    let plainText = "";
    for (const item of this._pastedRange.getItems()) {
      if (item.is("$textProxy") || item.is("$text")) {
        plainText += item.data;
      }
    }

    // Replace the content with plain text (no attributes)
    editor.model.change((writer) => {
      writer.remove(this._pastedRange);
      const insertPosition = this._pastedRange.start;
      writer.insertText(plainText, insertPosition);
    });

    this._pastedRange = null;
  }

  _convertToStructured() {
    const editor = this.editor;

    if (!this._pastedRange || !this._clipboardData) return;

    // Get the HTML content from clipboard
    const htmlContent = this._clipboardData;
    if (!htmlContent) return;

    // Parse and clean the HTML
    const cleanedHtml = this._cleanHtml(htmlContent);

    // Replace the pasted content with cleaned version
    editor.model.change((writer) => {
      writer.remove(this._pastedRange);
      const insertPosition = this._pastedRange.start;

      // Use the editor's data processor to convert HTML to model
      const viewFragment = editor.data.processor.toView(cleanedHtml);
      const modelFragment = editor.data.toModel(viewFragment);
      writer.insert(modelFragment, insertPosition);
    });

    this._pastedRange = null;
    this._clipboardData = undefined;
  }

  _cleanHtml(html: string): string {
    // Create a temporary DOM element to parse the HTML
    const temp = document.createElement("div");
    temp.innerHTML = html;

    // Remove style attributes and unwrap divs/spans
    this._cleanNode(temp);

    return temp.innerHTML;
  }

  _cleanNode(node: Node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;

      // Remove style attribute
      element.removeAttribute("style");

      // Get tag name
      const tagName = element.tagName.toLowerCase();

      // If it's a div or span, unwrap it (replace with its children)
      if (tagName === "div" || tagName === "span") {
        const parent = element.parentNode;
        if (parent) {
          // Move all children before the element
          while (element.firstChild) {
            parent.insertBefore(element.firstChild, element);
          }
          // Remove the empty div/span
          parent.removeChild(element);
          return; // Don't process children as they're already moved
        }
      }
    }

    // Process children
    const children = Array.from(node.childNodes);
    children.forEach((child) => this._cleanNode(child));
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
