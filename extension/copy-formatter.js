/**
 * 复制格式：纯文本 / Markdown / 带来源链接的引用
 * 依赖 HtmlToMarkdown（html-to-markdown.js）；quote 为纯函数，可单测
 */
const CopyFormatter = (() => {
  const FORMATS = ["plain", "markdown", "quote"];
  const DEFAULT_FORMAT = "plain";

  function normalizeFormat(value) {
    return FORMATS.includes(value) ? value : DEFAULT_FORMAT;
  }

  // 标题里的方括号会打断 Markdown 链接语法
  function escapeLinkText(text) {
    return text.replace(/([\\[\]])/g, "\\$1");
  }

  /**
   * @desc 引用格式：每行加 "> "，末尾附来源
   *   > 选中的内容
   *   >
   *   > — [页面标题](url)
   * @arg {string} text
   * @arg {{ url: string, title: string } | undefined} source
   */
  function quote(text, source) {
    const body = text
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n");
    if (!source || !source.url) return body;
    const title = escapeLinkText((source.title || "").trim()) || source.url;
    const url = source.url.replace(/[()]/g, (c) => (c === "(" ? "%28" : "%29"));
    return `${body}\n>\n> — [${title}](${url})`;
  }

  /**
   * @desc 当前选区转 Markdown，选区不在页面正文（如输入框内）时返回空串
   */
  function selectionToMarkdown(selection = window.getSelection()) {
    if (!selection || selection.rangeCount === 0 || typeof HtmlToMarkdown === "undefined") return "";
    const container = document.createElement("div");
    for (let i = 0; i < selection.rangeCount; i++) {
      container.appendChild(selection.getRangeAt(i).cloneContents());
    }
    return HtmlToMarkdown.convert(container);
  }

  /**
   * @arg {string} text 已处理（净化）过的纯文本
   * @arg {object} options
   * @arg {string} options.format plain | markdown | quote
   * @arg {{ url: string, title: string }} [options.source]
   * @arg {() => string} [options.getMarkdown] 取选区 Markdown，便于测试替换
   * @arg {(text: string) => string} [options.postProcess] 对 Markdown 结果做净化
   */
  function format(text, { format: type, source, getMarkdown = selectionToMarkdown, postProcess = (s) => s } = {}) {
    switch (normalizeFormat(type)) {
      case "markdown": {
        const markdown = postProcess(getMarkdown() || "");
        return markdown || text;
      }
      case "quote":
        return quote(text, source);
      default:
        return text;
    }
  }

  return { FORMATS, DEFAULT_FORMAT, normalizeFormat, quote, format, selectionToMarkdown };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = CopyFormatter;
}
