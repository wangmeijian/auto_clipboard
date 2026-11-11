/**
 * 轻量 HTML → Markdown 转换，用于「复制为 Markdown」
 * 覆盖网页正文常见元素：标题、段落、粗斜体、删除线、行内代码、代码块、链接、图片、列表、引用、分隔线、表格
 * 只读 DOM 不改 DOM，输入为节点（通常是选区 cloneContents 后的容器），content script 使用
 */
/* exported HtmlToMarkdown */
const HtmlToMarkdown = (() => {
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "CANVAS", "IFRAME", "BUTTON", "SELECT", "INPUT", "TEXTAREA"]);
  const BLOCK_TAGS = new Set(["P", "DIV", "SECTION", "ARTICLE", "MAIN", "HEADER", "FOOTER", "ASIDE", "NAV", "FIGURE", "FIGCAPTION", "DL", "DT", "DD", "ADDRESS", "DETAILS", "SUMMARY"]);
  const SAFE_URL = /^(https?:|mailto:|tel:|#|\/)/i;

  // Markdown 行内特殊字符；下划线只在词边界转义，避免 snake_case 变得难看
  function escapeText(text) {
    return text
      .replace(/([\\`*[\]])/g, "\\$1")
      .replace(/(^|\W)_|_(?=\W|$)/g, (match) => match.replace("_", "\\_"));
  }

  // 文本节点开头若是块语法标记（# > - + 1.），转义以免被解析成标题、引用、列表
  // 允许前导空白：块级元素随后会 trim，源码缩进去掉后标记就到了行首
  function escapeBlockStart(text) {
    return text.replace(/^(\s*)([#>+-]|\d+\.)(?=\s)/, "$1\\$2");
  }

  function isHidden(el) {
    return el.hidden || el.getAttribute("aria-hidden") === "true";
  }

  function absoluteUrl(el, attr) {
    // 克隆节点仍属于当前 document，读取属性（el.href / el.src）会按页面地址解析为绝对地址
    const value = el[attr] || el.getAttribute(attr) || "";
    return SAFE_URL.test(value) ? value : "";
  }

  // 括号会提前闭合 Markdown 的 (url)
  function escapeUrl(url) {
    return url.replace(/[()]/g, (c) => (c === "(" ? "%28" : "%29"));
  }

  function codeLanguage(el) {
    const code = el.querySelector("code") || el;
    const match = /(?:^|\s)(?:language|lang)-([\w+#-]+)/.exec(`${code.className || ""} ${el.className || ""}`);
    return match ? match[1] : "";
  }

  function fence(text) {
    const longest = Math.max(2, ...(text.match(/`+/g) || []).map((s) => s.length));
    return "`".repeat(longest + 1);
  }

  function inlineCode(text) {
    // 比内容中最长的连续反引号多一个
    const longest = Math.max(0, ...(text.match(/`+/g) || []).map((run) => run.length));
    const ticks = "`".repeat(longest + 1);
    const pad = /^`|`$/.test(text) ? " " : "";
    return `${ticks}${pad}${text}${pad}${ticks}`;
  }

  function wrap(marker, content) {
    const trimmed = content.trim();
    if (!trimmed) return content;
    // 保留首尾空白在标记外，否则 "** 粗体 **" 不会被解析
    const lead = content.match(/^\s*/)[0];
    const trail = content.match(/\s*$/)[0];
    return `${lead}${marker}${trimmed}${marker}${trail}`;
  }

  function prefixLines(text, firstPrefix, restPrefix = " ".repeat(firstPrefix.length)) {
    return text
      .split("\n")
      .map((line, index) => (line ? (index === 0 ? firstPrefix : restPrefix) + line : line))
      .join("\n");
  }

  function convertTable(table, ctx) {
    const rows = Array.from(table.querySelectorAll("tr")).filter((tr) => tr.closest("table") === table);
    if (rows.length === 0) return "";
    const cellText = (cell) =>
      convertChildren(cell, ctx).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();
    const matrix = rows.map((tr) => Array.from(tr.children).filter((c) => /^T[HD]$/.test(c.tagName)).map(cellText));
    const width = Math.max(...matrix.map((row) => row.length));
    if (width === 0) return "";
    const line = (cells) => `| ${Array.from({ length: width }, (_, i) => cells[i] || "").join(" | ")} |`;
    const [header, ...body] = matrix;
    return `\n\n${[line(header), line(Array(width).fill("---")), ...body.map(line)].join("\n")}\n\n`;
  }

  function convertList(list, ctx) {
    const ordered = list.tagName === "OL";
    let index = Number(list.getAttribute("start")) || 1;
    const items = Array.from(list.children)
      .filter((child) => child.tagName === "LI")
      .map((li) => {
        const marker = ordered ? `${index++}. ` : "- ";
        const content = convertChildren(li, { ...ctx, inList: true }).replace(/\n{3,}/g, "\n\n").trim();
        return prefixLines(content, marker);
      });
    return `\n\n${items.join("\n")}\n\n`;
  }

  function convertElement(el, ctx) {
    const tag = el.tagName.toUpperCase();
    if (SKIP_TAGS.has(tag) || isHidden(el)) return "";

    if (/^H[1-6]$/.test(tag)) {
      const text = convertChildren(el, ctx).replace(/\s+/g, " ").trim();
      return text ? `\n\n${"#".repeat(Number(tag[1]))} ${text}\n\n` : "";
    }
    switch (tag) {
      case "BR":
        return ctx.inPre ? "\n" : "  \n";
      case "HR":
        return "\n\n---\n\n";
      case "STRONG":
      case "B":
        return wrap("**", convertChildren(el, ctx));
      case "EM":
      case "I":
        return wrap("*", convertChildren(el, ctx));
      case "DEL":
      case "S":
      case "STRIKE":
        return wrap("~~", convertChildren(el, ctx));
      case "CODE":
        return ctx.inPre ? el.textContent : inlineCode(el.textContent);
      case "PRE": {
        const code = el.textContent.replace(/\n$/, "");
        const ticks = fence(code);
        return `\n\n${ticks}${codeLanguage(el)}\n${code}\n${ticks}\n\n`;
      }
      case "A": {
        const text = convertChildren(el, ctx).trim();
        const href = absoluteUrl(el, "href");
        if (!href || !text) return text;
        return `[${text}](${escapeUrl(href)})`;
      }
      case "IMG": {
        const src = absoluteUrl(el, "src");
        if (!src) return "";
        const alt = (el.getAttribute("alt") || "").replace(/[[\]]/g, "");
        return `![${alt}](${escapeUrl(src)})`;
      }
      case "UL":
      case "OL":
        return convertList(el, ctx);
      case "BLOCKQUOTE": {
        const content = convertChildren(el, ctx).replace(/\n{3,}/g, "\n\n").trim();
        return `\n\n${content.split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n")}\n\n`;
      }
      case "TABLE":
        return convertTable(el, ctx);
      default: {
        const content = convertChildren(el, ctx);
        // 块级元素去掉首尾空白，避免 HTML 源码里的缩进带到行首
        return BLOCK_TAGS.has(tag) || tag === "LI" ? `\n\n${content.trim()}\n\n` : content;
      }
    }
  }

  function convertNode(node, ctx) {
    if (node.nodeType === 3) {
      if (ctx.inPre) return node.nodeValue;
      return escapeBlockStart(escapeText(node.nodeValue.replace(/\s+/g, " ")));
    }
    if (node.nodeType === 1) {
      const isPre = node.tagName === "PRE";
      return convertElement(node, isPre ? { ...ctx, inPre: true } : ctx);
    }
    if (node.nodeType === 11) return convertChildren(node, ctx);
    return "";
  }

  function convertChildren(node, ctx) {
    return Array.from(node.childNodes).map((child) => convertNode(child, ctx)).join("");
  }

  /**
   * @arg {Node} root 元素或 DocumentFragment
   * @returns {string}
   */
  function convert(root) {
    if (!root) return "";
    const markdown = convertChildren(root, { inPre: false, inList: false });
    return markdown
      // 去掉行尾空白，但保留 <br> 产生的硬换行（两个空格 + 换行）
      .replace(/[ \t]+\n/g, (match) => (match.endsWith("  \n") ? "  \n" : "\n"))
      // 去掉块之间空白文本节点留下的行首空格
      .replace(/\n +(?=\n)/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return { convert };
})();
