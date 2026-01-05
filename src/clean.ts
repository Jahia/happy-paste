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
  pre?: boolean;
  bold?: boolean;
  strike?: boolean;
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
  if (node.type === "element") {
    return visitElement(node, context);
  } else if (node.type === "text") {
    if (context.pre) return node;
    if (/\S/.test(node.value)) return { type: "text", value: node.value.replace(/\s+/g, " ") };
  }
}

function splitOnNewLines(node: Element): Element[] {
  return (
    node.children
      .reduce<Element[]>(
        (parts, child) => {
          const currentPart = parts.at(-1);
          const lastChildOfCurrentPart = parts.at(-1)?.children?.at(-1);

          // On two consecutive <br>, split the element
          if (
            lastChildOfCurrentPart &&
            lastChildOfCurrentPart.type === "element" &&
            lastChildOfCurrentPart.tagName === "br" &&
            child.type === "element" &&
            child.tagName === "br"
          ) {
            return [
              ...parts.slice(0, -1),
              {
                ...currentPart!,
                // Remove the last <br>
                children: currentPart!.children.slice(0, -1),
              },
              {
                // Clone the current part
                ...currentPart!,
                children: [],
              },
            ];
          }

          // Drop `child` if it's a <br> at the start of a part
          if (
            child.type === "element" &&
            child.tagName === "br" &&
            currentPart &&
            currentPart.children.length === 0
          ) {
            return parts;
          }

          // Otherwise, add `child` to the current part
          currentPart?.children.push(child);
          return parts;
        },
        [
          // Start with an empty copy of the node
          { ...node, children: [] },
        ],
      )
      // Remove <br> at the end of parts
      .map((part) => {
        const last = part.children.at(-1);
        return {
          ...part,
          children:
            last?.type === "element" && last?.tagName === "br"
              ? part.children.slice(0, -1)
              : part.children,
        };
      })
      .filter((part) => part.children.length > 0)
  );
}

const structureNodes = new Set("p,h1,h2,h3,h4,h5,h6,pre,li,blockquote,table".split(","));
const tableNodes = new Set("thead,tbody,tfoot,tr,th,td".split(","));
const inlineNodes = new Set("strong,em,a,img,code,s".split(","));
const preNodes = new Set("pre,code".split(","));
const implicitBoldNodes = new Set("h1,h2,h3,h4,h5,h6,th".split(","));

function visitElement(
  node: Element,
  context: Context,
): ElementContent[] | ElementContent | undefined {
  const childContext = {
    ...context,
    depth: context.depth + 1,
    pre: context.pre || preNodes.has(node.tagName),
    bold: context.bold || implicitBoldNodes.has(node.tagName),
  };
  const visitChild = (child: RootContent) => visitNode(child, childContext);

  // Google docs creates invalid nested lists (e.g. <ul><ul><li>), fix them
  if (node.tagName === "ul" || node.tagName === "ol") {
    const children = node.children.flatMap(visitChild).filter((child) => child !== undefined);

    if (children.length > 0) {
      return {
        type: "element",
        tagName: node.tagName,
        properties: {},
        // Merge non-li children into the previous li
        children: children.reduce<typeof children>((children, child) => {
          if (child.type === "element" && child.tagName === "li") return [...children, child];

          // Last is guaranteed to be li
          const last = (children as Element[]).at(-1) ?? {
            type: "element",
            tagName: "li",
            properties: {},
            children: [],
          };
          return [
            // All but last
            ...children.slice(0, -1),
            {
              // Add `child` at the end of the last li
              ...last,
              children: [...last.children, child],
            },
          ];
        }, []),
      };
    }
  }

  if (structureNodes.has(node.tagName)) {
    const children = node.children.flatMap(visitChild).filter((child) => child !== undefined);
    if (children.length > 0) {
      const element: Element = { type: "element", tagName: node.tagName, properties: {}, children };
      return node.tagName === "p" ? splitOnNewLines(element) : element;
    }
  }

  if (tableNodes.has(node.tagName)) {
    // The only difference with structureNodes is that we keep empty nodes
    return {
      type: "element",
      tagName: node.tagName,
      properties: {},
      children: node.children.flatMap(visitChild).filter((child) => child !== undefined),
    };
  }

  if (node.tagName === "hr") {
    return { type: "element", tagName: "hr", properties: {}, children: [] };
  }

  // Only keep child <br>
  if (node.tagName === "br" && context.depth > 0) {
    return { type: "element", tagName: "br", properties: {}, children: [] };
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
    const children = node.children.flatMap(visitChild).filter((child) => child !== undefined);
    if (children.length > 0) {
      return {
        type: "element",
        tagName: "a",
        properties: { href: node.properties.href },
        children,
      };
    }
  }

  if (
    node.tagName === "strong" ||
    node.tagName === "b" ||
    (node.tagName === "span" &&
      typeof node.properties.style === "string" &&
      /font-weight\s*:\s*(bold|[789]\d\d)/.test(node.properties.style))
  ) {
    // If already in bold context, skip this node to avoid nesting
    if (context.bold)
      return node.children.flatMap(visitChild).filter((child) => child !== undefined);

    childContext.bold = true;
    const children = node.children.flatMap(visitChild).filter((child) => child !== undefined);
    if (children.length > 0)
      return { type: "element", tagName: "strong", properties: {}, children };
  }

  if (
    node.tagName === "s" ||
    node.tagName === "strike" ||
    node.tagName === "del" ||
    (node.tagName === "span" &&
      typeof node.properties.style === "string" &&
      /text-decoration\s*:\s*line-through/.test(node.properties.style))
  ) {
    // If already in strike context, skip this node to avoid nesting
    if (context.strike)
      return node.children.flatMap(visitChild).filter((child) => child !== undefined);

    childContext.strike = true;
    const children = node.children.flatMap(visitChild).filter((child) => child !== undefined);
    if (children.length > 0) {
      return {
        type: "element",
        tagName: node.tagName === "del" ? "del" : "s",
        properties: {},
        children,
      };
    }
  }

  if (inlineNodes.has(node.tagName)) {
    const children = node.children.flatMap(visitChild).filter((child) => child !== undefined);
    if (children.length > 0)
      return { type: "element", tagName: node.tagName, properties: {}, children };
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
    return { type: "element", tagName: "p", properties: {}, children };
  }

  return children;
}
