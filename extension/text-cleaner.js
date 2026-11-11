/**
 * 复制文本净化
 *   - 去掉零宽字符、异常空格、行尾空白、多余空行
 *   - 去掉知乎、CSDN、掘金、简书、B 站等站点在复制内容末尾追加的版权尾巴
 * 纯函数，无 DOM 依赖，content script 与单元测试共用
 */
const TextCleaner = (() => {
  // 不含 \u200c / \u200d：它们分别是波斯语等文字和 emoji 组合序列的合法组成部分
  const ZERO_WIDTH = /[\u200b\u2060\ufeff]/g;
  const NBSP = /\u00a0/g;
  // 尾巴最多几行、多少字符，超出视为正文，避免误删
  const MAX_TAIL_LINES = 8;
  const MAX_TAIL_LENGTH = 500;
  // 可能出现在尾巴中的行：「字段：值」、版权语句、裸链接、分隔线
  const TAIL_LINE = new RegExp(
    [
      /^(作者|链接|原文链接|本文链接|文章链接|原文地址|来源|出处|source|link|author)\s*[:：]/.source,
      /^(版权声明|著作权|商业转载|非商业转载|转载请|版权归|本文为.*(原创|版权)|copyright|©)/.source,
      /^https?:\/\/\S+$/.source,
      /^[-—_=─]{4,}$/.source,
    ].join("|"),
    "i"
  );
  // 强特征：出现任意一个即可认定为尾巴
  const STRONG_MARKER = /著作权|版权|转载|原文链接|本文链接|copyright|©/i;
  // 弱特征：「来源 / 出处」需同时带链接，避免误删正文末尾的「来源：新华社」
  const WEAK_MARKER = /(来源|出处)\s*[:：]/;
  const LINK = /https?:\/\//;

  /**
   * @desc 去掉末尾的版权尾巴
   * @arg {string} text
   * @returns {{ text: string, removed: boolean }}
   */
  function stripTail(text) {
    if (typeof text !== "string" || text.length === 0) {
      return { text: "", removed: false };
    }
    const lines = text.replace(/\s+$/, "").split("\n");
    let start = lines.length;
    let tailLineCount = 0;
    // 从末尾往前，吞掉连续的尾巴行（空行不计数）
    while (start > 0) {
      const line = lines[start - 1].trim();
      if (line.length === 0) {
        start -= 1;
        continue;
      }
      if (!TAIL_LINE.test(line) || tailLineCount >= MAX_TAIL_LINES) break;
      tailLineCount += 1;
      start -= 1;
    }
    const tail = lines.slice(start).join("\n");
    const body = lines.slice(0, start).join("\n");
    const isTail =
      tailLineCount > 0 &&
      body.trim().length > 0 && // 用户只选中了尾巴本身，则原样保留
      tail.length <= MAX_TAIL_LENGTH &&
      (STRONG_MARKER.test(tail) || (WEAK_MARKER.test(tail) && LINK.test(tail)));
    return isTail ? { text: body, removed: true } : { text, removed: false };
  }

  /**
   * @desc 归一化：去零宽字符、nbsp、统一换行、去行尾空白、压缩多余空行
   * @arg {boolean} [keepHardBreaks] Markdown 中行尾两个空格表示硬换行，需保留
   */
  function normalize(text, keepHardBreaks = false) {
    const trimLineEnd = keepHardBreaks
      ? (line) => (/ {2,}$/.test(line) ? line.replace(/[ \t]+$/, "  ") : line.replace(/[ \t]+$/, ""))
      : (line) => line.replace(/[ \t]+$/, "");
    return text
      .replace(ZERO_WIDTH, "")
      .replace(NBSP, " ")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(trimLineEnd)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  /**
   * @desc 是否带有版权尾巴（先归一化，避免尾巴里夹零宽字符导致漏判）
   */
  function hasTail(text) {
    if (typeof text !== "string" || text.length === 0) return false;
    return stripTail(normalize(text)).removed;
  }

  /**
   * @desc 净化复制文本
   * @arg {string} text
   * @arg {{ markdown?: boolean }} [options] markdown 为 true 时保留硬换行
   * @returns {string}
   */
  function clean(text, { markdown = false } = {}) {
    if (typeof text !== "string" || text.length === 0) return "";
    return stripTail(normalize(text, markdown))
      .text // 只去首尾空行，保留首行缩进（代码片段）
      .replace(/^(?:[ \t]*\n)+/, "")
      .replace(/\s+$/, "");
  }

  return { clean, hasTail, stripTail };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = TextCleaner;
}
