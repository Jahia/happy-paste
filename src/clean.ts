import { fromHtmlIsomorphic } from "hast-util-from-html-isomorphic";
import { toHtml } from "hast-util-to-html";
import type { Element, ElementContent, Root, RootContent } from "hast";

interface Output {
  html: string;
  files: File[];
}

function visitRoot(root: Root, files: File[]): Root {
  return {
    type: "root",
    children: root.children
      .map((child) => visitNode(child, files))
      .flat()
      .filter((node) => node !== undefined)
      .map((node) => {
        if (node.type === "text") {
          return {
            type: "element",
            tagName: "p",
            properties: {},
            children: [node],
          };
        }
        return node;
      }),
  };
}

function visitNode(
  node: RootContent,
  files: File[],
): ElementContent[] | ElementContent | undefined {
  if (node.type === "element") return visitElement(node, files);
  else if (node.type === "text" && node.value !== "") return node;
}

function visitElement(node: Element, files: File[]): ElementContent[] | ElementContent | undefined {
  if (
    node.tagName === "p" ||
    node.tagName === "table" ||
    node.tagName === "thead" ||
    node.tagName === "tbody" ||
    node.tagName === "tr" ||
    node.tagName === "td" ||
    node.tagName === "th" ||
    node.tagName === "ul" ||
    node.tagName === "ol" ||
    node.tagName === "li"
  ) {
    return {
      type: "element",
      tagName: node.tagName,
      properties: {},
      children: node.children
        .map((child) => visitNode(child, files))
        .flat()
        .filter((child) => child !== undefined),
    };
  }

  if (node.tagName === "h1" || node.tagName === "h2" || node.tagName === "h3") {
    return {
      type: "element",
      tagName: node.tagName,
      properties: {},
      children: node.children
        .map((child) => visitNode(child, files))
        .flat()
        .filter((child) => child !== undefined)
        .flatMap((child) => {
          if (child.type === "element" && child.tagName === "strong") return child.children;
          return child;
        }),
    };
  }

  if (node.tagName === "img") {
    const src = node.properties.src;
    if (typeof src === "string" && src.startsWith("data:")) {
      const type = src.substring(5, src.indexOf(";"));
      const name = `￼_${files.length}_`;
      const binary = atob(src.slice(src.indexOf("base64,") + 7));
      const buffer = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
      files.push(new File([buffer], name, { type }));

      return {
        type: "element",
        tagName: "img",
        properties: {
          src: name,
          width: node.properties.width || undefined,
          height: node.properties.height || undefined,
        },
        children: [],
      };
    }
  }

  if (node.tagName === "a") {
    return {
      type: "element",
      tagName: "a",
      properties: {
        href: node.properties.href || undefined,
      },
      children: node.children
        .map((child) => visitNode(child, files))
        .flat()
        .filter((child) => child !== undefined),
    };
  }

  if (
    typeof node.properties.style === "string" &&
    /font-weight\s?:\s?(bold|[789]\d\d)/.test(node.properties.style)
  ) {
    return {
      type: "element",
      tagName: "strong",
      properties: {},
      children: node.children
        .map((child) => visitNode(child, files))
        .flat()
        .filter((child) => child !== undefined),
    };
  }

  return node.children
    .map((child) => visitNode(child, files))
    .flat()
    .filter((child) => child !== undefined);
}

export function process(input: string): Output {
  const ast = fromHtmlIsomorphic(input);

  const files: File[] = [];

  const result = visitRoot(ast, files);

  return {
    html: toHtml(result, { characterReferences: { useNamedReferences: true } }),
    files,
  };
}
