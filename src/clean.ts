import { fromHtmlIsomorphic } from "hast-util-from-html-isomorphic";
import { toHtml } from "hast-util-to-html";
import type { Element, ElementContent, Root, RootContent } from "hast";

export interface Output {
  html: string;
  files: File[];
}

interface Context {
  files: File[];
  depth: number;
}

export function process(input: string): Output {
  const ast = fromHtmlIsomorphic(input);

  const files: File[] = [];

  const result = visitRoot(ast, { files, depth: 0 });

  return {
    html: toHtml(result, { characterReferences: { useNamedReferences: true } }),
    files,
  };
}

function visitRoot(root: Root, context: Context): Root {
  return {
    type: "root",
    children: root.children
      .flatMap((child) => visitNode(child, context))
      .filter((node) => node !== undefined),
  };
}

function visitNode(
  node: RootContent,
  context: Context,
): ElementContent[] | ElementContent | undefined {
  if (node.type === "element") return visitElement(node, context);
  else if (node.type === "text" && node.value !== "") return node;
}

const structureNodes = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6"]);
const inlineNodes = new Set(["strong", "em", "a", "img"]);

function visitElement(
  node: Element,
  context: Context,
): ElementContent[] | ElementContent | undefined {
  const visitChild = (child: RootContent) =>
    visitNode(child, { ...context, depth: context.depth + 1 });

  if (structureNodes.has(node.tagName)) {
    return {
      type: "element",
      tagName: node.tagName,
      properties: {},
      children: node.children.flatMap(visitChild).filter((child) => child !== undefined),
    };
  }

  if (node.tagName === "img") {
    const src = node.properties.src;
    if (typeof src === "string" && src.startsWith("data:")) {
      const type = src.substring(5, src.indexOf(";"));
      const name = `￼_${context.files.length}_`;
      const binary = atob(src.slice(src.indexOf("base64,") + 7));
      const buffer = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
      context.files.push(new File([buffer], name, { type }));
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
      children: node.children.flatMap(visitChild).filter((child) => child !== undefined),
    };
  }

  if (
    node.tagName === "span" &&
    typeof node.properties.style === "string" &&
    /font-weight\s?:\s?(bold|[789]\d\d)/.test(node.properties.style)
  ) {
    return {
      type: "element",
      tagName: "strong",
      properties: {},
      children: node.children.flatMap(visitChild).filter((child) => child !== undefined),
    };
  }

  if (inlineNodes.has(node.tagName)) {
    return {
      type: "element",
      tagName: node.tagName,
      properties: {},
      children: node.children.flatMap(visitChild).filter((child) => child !== undefined),
    };
  }

  const children = node.children
    // We use visitNode directly because we stay at the same depth level
    .flatMap((child) => visitNode(child, context))
    .filter((child) => child !== undefined);

  // In case we are at the top level and some nodes are text nodes,
  if (
    context.depth === 0 &&
    children.some(
      (child) =>
        child.type === "text" || (child.type === "element" && inlineNodes.has(child.tagName)),
    )
  ) {
    return {
      type: "element",
      tagName: "p",
      properties: {},
      children,
    };
  }

  return children;
}
