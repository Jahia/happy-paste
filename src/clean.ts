import { fromHtmlIsomorphic } from "hast-util-from-html-isomorphic";
import { toHtml } from "hast-util-to-html";
import type { Element, ElementContent, Root, RootContent, Text } from "hast";

export interface Output {
  html: string;
  files: File[];
}

interface Context {
  /** Files extracted from the input */
  files: File[];
  /** Current depth in the tree */
  depth: number;
  /** Whether we are in a phrasing context (e.g. inside a <p>) */
  phrasing?: boolean;
  /** Whether we are in a preformatted context (e.g. inside a <pre>) */
  pre?: boolean;
  /** Whether we are in a bold context (e.g. inside an <h1>) */
  bold?: boolean;
  /** Whether we are in a strike context (e.g. inside an <s>) */
  strike?: boolean;
}

export function process(input: string): Output {
  const ast = fromHtmlIsomorphic(input);

  const context: Context = { files: [], depth: 0 };

  const result: Root = {
    type: "root",
    children: normalizeChildren(
      ast.children.flatMap((child) => visitNode(child, context)),
      context,
    ),
  };

  return {
    html: toHtml(result, { characterReferences: { useNamedReferences: true } }),
    files: context.files,
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
    return { type: "text", value: " " }; // Collapse whitespace to single space
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
            return parts.slice(0, -1).concat(
              {
                ...currentPart!,
                // Remove the last <br>
                children: currentPart!.children.slice(0, -1),
              },
              // Clone the current part
              { ...currentPart!, children: [] },
            );
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
        // Start with an empty copy of the node
        [{ ...node, children: [] }],
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

function findFirstNestedNode<T extends ElementContent>(
  children: ElementContent[],
  predicate: (node: ElementContent) => node is T,
): T | undefined {
  const first = children[0];
  if (first && predicate(first)) return first;
  if (first && first.type === "element") return findFirstNestedNode(first.children, predicate);
}

function findLastNestedNode<T extends ElementContent>(
  children: ElementContent[],
  predicate: (node: ElementContent) => node is T,
): T | undefined {
  const last = children[children.length - 1];
  if (last && predicate(last)) return last;
  if (last && last.type === "element") return findLastNestedNode(last.children, predicate);
}

function onlyWhitespace(node: ElementContent): boolean {
  if (node.type === "element")
    return node.tagName !== "img" && node.tagName !== "hr" && node.children.every(onlyWhitespace);
  if (node.type === "text") return /^\s*$/.test(node.value);
  return true;
}

/** Remove trailing whitespace, merge text nodes, migrate misplaced whitespace. */
function normalizeChildren(
  children: Array<ElementContent | undefined>,
  context: Context,
): ElementContent[] {
  const normalized = children.reduce<ElementContent[]>((normalized, child) => {
    if (!child) return normalized;

    // In preformatted text, don't touch whitespace
    if (context.pre) return normalized.concat(child);

    const last = normalized.at(-1);

    // Merge text nodes
    if (last && last.type === "text" && child.type === "text") {
      return normalized.slice(0, -1).concat({
        type: "text",
        value: (last.value + child.value).replace(/\s+/g, " "),
      });
    }

    // Migrate leading whitespace to previous text node
    let firstNestedText;
    if (
      last &&
      last.type === "text" &&
      child.type === "element" &&
      (firstNestedText = findFirstNestedNode(
        child.children,
        (child): child is Text => child.type === "text" && /^\s+/.test(child.value),
      ))
    ) {
      firstNestedText.value = firstNestedText.value.trimStart();
      return normalized
        .slice(0, -1)
        .concat({ type: "text", value: (last.value + " ").replace(/\s+/g, " ") }, child);
    }

    // It can also be the other way around: migrate trailing whitespace to next text node
    let lastNestedText;
    if (
      child.type === "text" &&
      last &&
      last.type === "element" &&
      (lastNestedText = findLastNestedNode(
        last.children,
        (last): last is Text => last.type === "text" && /\s+$/.test(last.value),
      ))
    ) {
      lastNestedText.value = lastNestedText.value.trimEnd();
      return normalized.concat({ type: "text", value: (" " + child.value).replace(/\s+/g, " ") });
    }

    return normalized.concat(child);
  }, []);

  if (context.pre) return normalized;

  // In case we have a single text node, we will let the parent finish the trimming
  // to ensure we don't remove a meaningful space. (e.g. <strong>foo </strong>bar)
  //                                                                ^
  if (normalized.length === 1 && normalized[0].type === "text" && context.phrasing) {
    return normalized;
  }

  // Remove trailing whitespace
  const first = normalized[0];
  if (first && first.type === "text") {
    const value = first.value.trimStart();
    if (value) normalized[0] = { type: "text", value };
    else normalized.shift();
  }

  const last = normalized.at(-1);
  if (last && last.type === "text") {
    const value = last.value.trimEnd();
    if (value) normalized[normalized.length - 1] = { type: "text", value };
    else normalized.pop();
  }

  // In non phrasing context, remove whitespace-only children and trim first/last text nodes
  if (!context.phrasing) {
    return normalized
      .filter((child) => !onlyWhitespace(child))
      .map((child) => {
        // Trim the first and last text nodes of element children
        if (child.type === "element") {
          const first = findFirstNestedNode(
            child.children,
            (node): node is Text => node.type === "text",
          );
          if (first) first.value = first.value.trimStart();
          const last = findLastNestedNode(
            child.children,
            (node): node is Text => node.type === "text",
          );
          if (last) last.value = last.value.trimEnd();
        }
        return child;
      });
  }

  return normalized;
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
    phrasing: context.phrasing || structureNodes.has(node.tagName) || inlineNodes.has(node.tagName),
    pre: context.pre || preNodes.has(node.tagName),
    bold: context.bold || implicitBoldNodes.has(node.tagName),
  };
  const visitChild = (child: RootContent) => visitNode(child, childContext);

  // Google docs creates invalid nested lists (e.g. <ul><ul><li>), fix them
  if (node.tagName === "ul" || node.tagName === "ol") {
    const children = normalizeChildren(node.children.flatMap(visitChild), childContext);

    if (children.length > 0) {
      return {
        type: "element",
        tagName: node.tagName,
        properties: {},
        // Merge non-li children into the previous li
        children: children.reduce<typeof children>((children, child) => {
          if (child.type === "element" && child.tagName === "li") return children.concat(child);

          // Last is guaranteed to be li
          const last = (children as Element[]).at(-1) ?? {
            type: "element",
            tagName: "li",
            properties: {},
            children: [],
          };
          // All but last
          return children.slice(0, -1).concat({
            // Add `child` at the end of the last li
            ...last,
            children: last.children.concat(child),
          });
        }, []),
      };
    }
  }

  if (structureNodes.has(node.tagName)) {
    const children = normalizeChildren(node.children.flatMap(visitChild), childContext);
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
      children: normalizeChildren(node.children.flatMap(visitChild), childContext),
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
    const children = normalizeChildren(node.children.flatMap(visitChild), childContext);
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
    childContext.bold = true;
    const children = normalizeChildren(node.children.flatMap(visitChild), childContext);

    // If already in bold context, skip this node to avoid nesting
    if (context.bold) return children;

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
    childContext.strike = true;
    const children = normalizeChildren(node.children.flatMap(visitChild), childContext);

    // If already in strike context, skip this node to avoid nesting
    if (context.strike) return children;

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
    const children = normalizeChildren(node.children.flatMap(visitChild), childContext);
    if (children.length > 0)
      return { type: "element", tagName: node.tagName, properties: {}, children };
  }

  const children = normalizeChildren(
    // We use visitNode directly because we stay at the same depth level
    node.children.flatMap((child) => visitNode(child, context)),
    childContext,
  );

  // In case we are at the top level and some nodes are text nodes,
  if (
    context.depth === 0 &&
    !context.phrasing &&
    children.length > 0 &&
    children.every(
      (child) =>
        child.type === "text" || (child.type === "element" && inlineNodes.has(child.tagName)),
    )
  ) {
    return { type: "element", tagName: "p", properties: {}, children };
  }

  return children;
}
