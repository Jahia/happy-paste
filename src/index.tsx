import { registry } from "@jahia/ui-extender";
import {
  ButtonView,
  Plugin,
  ContextualBalloon,
  clickOutsideHandler,
  BalloonPanelView,
  type EditorConfig,
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
    pasteFormattedButton.set({
      label: "Paste with formatting",
      // Icon from Fluent UI System Icons by Microsoft Corporation - https://github.com/microsoft/fluentui-system-icons/blob/main/LICENSE
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16"><path fill="currentColor" d="M5.085 2A1.5 1.5 0 0 1 6.5 1h3a1.5 1.5 0 0 1 1.415 1h.585A1.5 1.5 0 0 1 13 3.5v3.767a2 2 0 0 0-.414.319L12 8.172V3.5a.5.5 0 0 0-.5-.5h-.585A1.5 1.5 0 0 1 9.5 4h-3a1.5 1.5 0 0 1-1.415-1H4.5a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h.585a1.5 1.5 0 0 0 .234.425q.245.312.52.575H4.5A1.5 1.5 0 0 1 3 13.5v-10A1.5 1.5 0 0 1 4.5 2zM6.5 2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1zm8.207 6.293a1 1 0 0 1 0 1.414l-1.88 1.88a2.5 2.5 0 0 1-.558 2.68c-1.64 1.664-4.545 1.605-6.163-.458a.5.5 0 0 1 .252-.788c1.076-.319 1.386-.653 1.554-.927a3 3 0 0 0 .177-.351q.044-.102.108-.235c.116-.24.269-.51.535-.776a2.5 2.5 0 0 1 2.681-.56l1.88-1.88a1 1 0 0 1 1.414 0m-3.147 3.146a1.5 1.5 0 0 0-2.12 0a1.7 1.7 0 0 0-.341.502l-.07.15c-.07.157-.159.353-.265.526c-.259.422-.648.785-1.367 1.094c1.273 1.056 3.095.935 4.16-.148l.003-.002a1.5 1.5 0 0 0 0-2.122"/></svg>`,
      tooltip: true,
    });
    pasteFormattedButton.on("execute", () => {
      this._balloonView.fire("submit");
    });

    const pastePlainButton = new ButtonView(this.editor.locale);
    pastePlainButton.set({
      label: "Paste as plain text",
      // Icon from Fluent UI System Icons by Microsoft Corporation - https://github.com/microsoft/fluentui-system-icons/blob/main/LICENSE
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16"><path fill="currentColor" d="M5.085 2A1.5 1.5 0 0 1 6.5 1h3a1.5 1.5 0 0 1 1.415 1h.585A1.5 1.5 0 0 1 13 3.5v3.717l-.13-.303a1.5 1.5 0 0 0-.87-.82V3.5a.5.5 0 0 0-.5-.5h-.585A1.5 1.5 0 0 1 9.5 4h-3a1.5 1.5 0 0 1-1.415-1H4.5a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h2.583c-.12.334-.113.686-.003 1H4.5A1.5 1.5 0 0 1 3 13.5v-10A1.5 1.5 0 0 1 4.5 2zM6.5 2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1zm5.451 5.308a.5.5 0 0 0-.919 0l-2.115 4.943a.5.5 0 0 0-.046.107l-.835 1.95a.5.5 0 1 0 .92.394L9.683 13h3.621l.73 1.702a.5.5 0 0 0 .92-.394l-.837-1.95a.5.5 0 0 0-.046-.107zM12.876 12h-2.764l1.38-3.226z"/></svg>`,
      tooltip: true,
    });
    pastePlainButton.on("execute", () => {
      this._convertToPlainText();
      this._balloonView.fire("submit");
    });

    const pasteStructuredButton = new ButtonView(this.editor.locale);
    pasteStructuredButton.set({ label: "st", withText: true });
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
        // Get all elements that were inserted between start and current position
        const pasteEndPosition = this.editor.model.document.selection.getFirstPosition();

        if (this._pasteStartPosition && pasteEndPosition) {
          // Find the minimal range that contains all pasted elements
          const startElement = this._pasteStartPosition.parent;
          const endElement = pasteEndPosition.parent;

          // If they're in the same element, the range is within it
          if (startElement === endElement) {
            this._pastedRange = this.editor.model.createRange(
              this._pasteStartPosition,
              pasteEndPosition,
            );
          } else {
            // If different elements, find common ancestor and expand range
            const commonAncestor = startElement.getCommonAncestor(endElement);

            // Find start element that's a child of common ancestor
            let startNode = startElement;
            while (startNode.parent !== commonAncestor) {
              startNode = startNode.parent as any;
            }

            // Find end element that's a child of common ancestor
            let endNode = endElement;
            while (endNode.parent !== commonAncestor) {
              endNode = endNode.parent as any;
            }

            // Create range from before first element to after last element
            this._pastedRange = this.editor.model.createRange(
              this.editor.model.createPositionBefore(startNode as any),
              this.editor.model.createPositionAfter(endNode as any),
            );
          }
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
      // Find the elements to remove - we need to remove entire paragraphs/elements, not just content
      const elementsToRemove: any[] = [];

      // Check if the range spans entire elements or is within elements
      const startElement = this._pastedRange.start.parent;
      const endElement = this._pastedRange.end.parent;

      if (startElement === endElement && startElement.is("element")) {
        // If within a single element, check if we should remove the whole element
        // This happens when paste creates a styled paragraph
        const htmlAttrs =
          startElement.getAttribute("htmlPAttributes") ||
          startElement.getAttribute("htmlAttributes") ||
          startElement.getAttribute("htmlLiAttributes") ||
          startElement.getAttribute("htmlDivAttributes");

        if (htmlAttrs) {
          elementsToRemove.push(startElement);
        }
      }

      // Collect all elements in the range
      for (const item of this._pastedRange.getItems({ shallow: true })) {
        if (item.is("element") && !elementsToRemove.includes(item)) {
          elementsToRemove.push(item);
        }
      }

      // Determine insertion point
      const insertPosition =
        elementsToRemove.length > 0
          ? editor.model.createPositionBefore(elementsToRemove[0])
          : this._pastedRange.start;

      // Remove elements or range
      if (elementsToRemove.length > 0) {
        elementsToRemove.forEach((el) => writer.remove(el));
      } else {
        writer.remove(this._pastedRange);
      }

      // Use the editor's data processor to convert HTML to model
      const viewFragment = editor.data.processor.toView(cleanedHtml);
      const modelFragment = editor.data.toModel(viewFragment);

      // Insert the cleaned content at the original position
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

    // Flatten nested block elements (e.g., p inside p)
    this._flattenNestedBlocks(temp);

    return temp.innerHTML;
  }

  _flattenNestedBlocks(node: Node) {
    const blockElements = ["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"];
    const containerElements = ["li", "td", "th", "dd", "dt"]; // Elements that can legitimately contain block elements

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const tagName = element.tagName.toLowerCase();

      // Only unwrap if it's a block element that contains nested blocks
      // But skip container elements that are allowed to have block children
      if (blockElements.includes(tagName) && !containerElements.includes(tagName)) {
        // Find any nested block elements
        const nestedBlocks = Array.from(element.children).filter((child) =>
          blockElements.includes(child.tagName.toLowerCase()),
        );

        // If there are nested blocks, unwrap this element
        if (nestedBlocks.length > 0) {
          const parent = element.parentNode;
          if (parent) {
            // Move all children before this element
            while (element.firstChild) {
              parent.insertBefore(element.firstChild, element);
            }
            // Remove the empty wrapper
            parent.removeChild(element);
            return; // Don't process children as they're already moved
          }
        }
      }
    }

    // Process children
    const children = Array.from(node.childNodes);
    children.forEach((child) => this._flattenNestedBlocks(child));
  }

  _cleanNode(node: Node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const tagName = element.tagName.toLowerCase();

      // Process children FIRST before we potentially unwrap this element
      const children = Array.from(node.childNodes);
      children.forEach((child) => this._cleanNode(child));

      // Remove style attribute and other inline styling attributes
      element.removeAttribute("style");
      element.removeAttribute("dir");
      element.removeAttribute("id");

      // Remove data attributes related to Google Docs
      Array.from(element.attributes).forEach((attr) => {
        if (attr.name.startsWith("data-")) {
          element.removeAttribute(attr.name);
        }
      });

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
        }
      }
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
  registry.add("callback", "happy-paste", {
    targets: ["jahiaApp-init:999"],
    callback() {
      for (const config of registry.find({ type: "ckeditor5-config" })) {
        (config as EditorConfig)?.plugins?.push(PasteBalloon);
      }
    },
  });
}
