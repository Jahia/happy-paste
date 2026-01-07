import { fromHtmlIsomorphic } from "hast-util-from-html-isomorphic";
import { toHtml } from "hast-util-to-html";
import type { Element, ElementContent, Root, RootContent, Text } from "hast";

export interface Output {
  html: string;
  files: File[];
}

let i = 0;
const Attr = {
  /** Node that is part of the document structure (e.g. <p>) */
  STRUCTURE: 1 << i++,
  /** Node that is part of a table (e.g. <tr>) */
  TABLE: 1 << i++,
  /** Node that is inline (e.g. <strong>) */
  INLINE: 1 << i++,
  /** Node that implies preformatted text (e.g. <pre>) */
  PRE: 1 << i++,
  /** Node that implies bold formatting (e.g. <h1>) */
  IMPLICIT_BOLD: 1 << i++,
  /** Node that can contain another document themselves (e.g. <li>) */
  ROOT: 1 << i++,
};

/** All known nodes with their attributes */
const KnownNodes: Record<string, number> = {
  a: Attr.INLINE,
  blockquote: Attr.STRUCTURE,
  code: Attr.INLINE | Attr.PRE,
  del: Attr.INLINE,
  em: Attr.INLINE,
  h1: Attr.STRUCTURE | Attr.IMPLICIT_BOLD,
  h2: Attr.STRUCTURE | Attr.IMPLICIT_BOLD,
  h3: Attr.STRUCTURE | Attr.IMPLICIT_BOLD,
  h4: Attr.STRUCTURE | Attr.IMPLICIT_BOLD,
  h5: Attr.STRUCTURE | Attr.IMPLICIT_BOLD,
  h6: Attr.STRUCTURE | Attr.IMPLICIT_BOLD,
  img: Attr.INLINE,
  li: Attr.STRUCTURE | Attr.ROOT,
  p: Attr.STRUCTURE,
  pre: Attr.STRUCTURE | Attr.PRE,
  s: Attr.INLINE,
  strong: Attr.INLINE,
  table: Attr.STRUCTURE,
  tbody: Attr.TABLE,
  td: Attr.TABLE | Attr.ROOT,
  tfoot: Attr.TABLE,
  th: Attr.TABLE | Attr.IMPLICIT_BOLD | Attr.ROOT,
  thead: Attr.TABLE,
  tr: Attr.TABLE,
};

/** @example checkAttr(element, Attr.INLINE) */
const checkAttr = (element: Element, attrs: number) =>
  KnownNodes[element.tagName] !== undefined && (KnownNodes[element.tagName] & attrs) !== 0;

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
  /** Whether we are in an italic context (e.g. inside an <em>) */
  italic?: boolean;
  /** Whether we are in a strike context (e.g. inside an <s>) */
  strike?: boolean;
}

/** Takes an HTML string and process it to extract images and the structure of the document. */
export function process(input: string): Output {
  const ast = fromHtmlIsomorphic(input, { fragment: true });

  const context: Context = {
    files: [],
    depth: 0,
    // If the root only contains phrasing content, we are in a phrasing context
    phrasing: ast.children.every(
      (child) =>
        child.type === "text" || (child.type === "element" && checkAttr(child, Attr.INLINE)),
    ),
  };

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

    // Collapse whitespace to single space
    if (/\S/.test(node.value)) return { type: "text", value: node.value.replace(/\s+/g, " ") };
    return { type: "text", value: " " };
  }
}

/** Will transform <em><img /></em> into <img />  */
function unnestSelfClosing(node: Element): Element {
  if (
    node.children.length === 1 &&
    node.children[0].type === "element" &&
    (node.children[0].tagName === "img" || node.children[0].tagName === "br")
  ) {
    return node.children[0];
  }

  return node;
}

/** Split an element on double <br />, drop <br /> at start and end. */
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

/**
 * Find the first nested node that matches the predicate.
 *
 * This function only explores the first child recursively.
 */
function findFirstNestedNode<T extends ElementContent>(
  children: ElementContent[],
  predicate: (node: ElementContent) => node is T,
): T | undefined {
  const first = children[0];
  if (first && predicate(first)) return first;
  if (first && first.type === "element") return findFirstNestedNode(first.children, predicate);
}

/**
 * Find the last nested node that matches the predicate.
 *
 * This function only explores the last child recursively.
 */
function findLastNestedNode<T extends ElementContent>(
  children: ElementContent[],
  predicate: (node: ElementContent) => node is T,
): T | undefined {
  const last = children[children.length - 1];
  if (last && predicate(last)) return last;
  if (last && last.type === "element") return findLastNestedNode(last.children, predicate);
}

/** Return whether the node consists only of whitespace. */
function onlyWhitespace(node: ElementContent): boolean {
  if (node.type === "element")
    return node.tagName !== "img" && node.tagName !== "hr" && node.children.every(onlyWhitespace);
  if (node.type === "text") return !/\S/.test(node.value);
  return true;
}

/**
 * Remove trailing whitespace, merge text nodes, migrate misplaced whitespace.
 *
 * @example
 *   normalizeChildren([' ', <a>Hello </a>, 'World '])
 *   // => [<a>Hello</a>, ' World']
 */
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
  if (normalized.length === 1 && normalized[0].type === "text" && context.phrasing)
    return normalized;

  // Remove leading whitespace
  const first = normalized[0];
  if (first && first.type === "text") {
    const value = first.value.trimStart();
    if (value) normalized[0] = { type: "text", value };
    else normalized.shift();
  }

  // Remove trailing whitespace
  const last = normalized.at(-1);
  if (last && last.type === "text") {
    const value = last.value.trimEnd();
    if (value) normalized[normalized.length - 1] = { type: "text", value };
    else normalized.pop();
  }

  // In non phrasing context, remove whitespace-only children and trim first and last text nodes
  // e.g. [<p> </p>, <p> Hello </p>] => [<p>Hello</p>]
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

/** Visit an element node, process it and its its children (with the help of visitNode). */
function visitElement(
  node: Element,
  context: Context,
): ElementContent[] | ElementContent | undefined {
  const childContext = {
    ...context,
    depth: context.depth + 1,
    phrasing:
      (context.phrasing || checkAttr(node, Attr.STRUCTURE) || checkAttr(node, Attr.INLINE)) &&
      !checkAttr(node, Attr.ROOT),
    pre: context.pre || checkAttr(node, Attr.PRE),
    bold: context.bold || checkAttr(node, Attr.IMPLICIT_BOLD),
  };

  /** Visit all children of the current node and normalize the result. */
  const visitChildren = () =>
    normalizeChildren(
      node.children.flatMap((child) => visitNode(child, childContext)),
      childContext,
    );

  // Google docs creates invalid nested lists (e.g. <ul><ul><li>), fix them
  if (node.tagName === "ul" || node.tagName === "ol") {
    const children = visitChildren();

    if (children.length > 0) {
      return {
        type: "element",
        tagName: node.tagName,
        properties: { start: node.properties.start },
        // Merge non-li children into the previous li
        children: children.reduce<typeof children>((children, child) => {
          if (child.type === "element" && child.tagName === "li") return children.concat(child);

          // If there's no li yet, create an empty one
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

  if (checkAttr(node, Attr.STRUCTURE)) {
    const children = visitChildren();
    if (children.length > 0) {
      const element: Element = { type: "element", tagName: node.tagName, properties: {}, children };
      return node.tagName === "p" ? splitOnNewLines(element) : element;
    }
  }

  // The only difference with structureNodes is that we keep empty nodes
  if (checkAttr(node, Attr.TABLE)) {
    return { type: "element", tagName: node.tagName, properties: {}, children: visitChildren() };
  }

  if (node.tagName === "hr") {
    return { type: "element", tagName: "hr", properties: {}, children: [] };
  }

  // Only keep child <br>, not top-level ones
  if (node.tagName === "br" && context.depth > 0 && context.phrasing) {
    return { type: "element", tagName: "br", properties: {}, children: [] };
  }

  if (node.tagName === "img") {
    const src = node.properties.src;
    if (typeof src === "string" && src.startsWith("data:")) {
      const type = src.substring(5, src.indexOf(";"));
      const name = `￼_${context.files.length}_`;
      // @ts-expect-error Baseline 2025 Newly available
      const buffer = Uint8Array.fromBase64(src.slice(src.indexOf("base64,") + 7));
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
    const children = visitChildren();
    if (children.length > 0) {
      return unnestSelfClosing({
        type: "element",
        tagName: "a",
        properties: { href: node.properties.href },
        children,
      });
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
    const children = visitChildren();

    // If already in bold context, skip this node to avoid nesting
    if (context.bold) return children;

    if (children.length > 0)
      return unnestSelfClosing({ type: "element", tagName: "strong", properties: {}, children });
  }

  if (
    node.tagName === "em" ||
    node.tagName === "i" ||
    (node.tagName === "span" &&
      typeof node.properties.style === "string" &&
      /font-style\s*:\s*italic/.test(node.properties.style))
  ) {
    childContext.italic = true;
    const children = visitChildren();

    // If already in italic context, skip this node to avoid nesting
    if (context.italic) return children;

    if (children.length > 0)
      return unnestSelfClosing({ type: "element", tagName: "em", properties: {}, children });
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
    const children = visitChildren();

    // If already in strike context, skip this node to avoid nesting
    if (context.strike) return children;

    if (children.length > 0) {
      return unnestSelfClosing({
        type: "element",
        tagName: node.tagName === "del" ? "del" : "s",
        properties: {},
        children,
      });
    }
  }

  if (checkAttr(node, Attr.INLINE)) {
    const children = visitChildren();
    if (children.length > 0) {
      return unnestSelfClosing({
        type: "element",
        tagName: node.tagName,
        properties: {},
        children,
      });
    }
  }

  const children = normalizeChildren(
    // We use visitNode directly because we stay at the same depth level
    node.children.flatMap((child) => visitNode(child, context)),
    childContext,
  );

  // In case we are at the top level and some nodes are text nodes, wrap them in a <p>
  if (
    context.depth === 0 &&
    !context.phrasing &&
    children.length > 0 &&
    children.every(
      (child) =>
        child.type === "text" || (child.type === "element" && checkAttr(child, Attr.INLINE)),
    )
  ) {
    return { type: "element", tagName: "p", properties: {}, children };
  }

  return children;
}
