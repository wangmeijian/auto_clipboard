const test = require("node:test");
const assert = require("node:assert/strict");
const CopyFormatter = require("../extension/copy-formatter.js");

const source = { url: "https://www.zhihu.com/q/1", title: "标题 [转载]" };

test("plain 原样返回", () => {
  assert.equal(CopyFormatter.format("a\nb", { format: "plain", source }), "a\nb");
});

test("未知格式按 plain 处理", () => {
  assert.equal(CopyFormatter.format("a", { format: "bogus" }), "a");
});

test("quote：逐行加引用并附来源，转义标题方括号", () => {
  const result = CopyFormatter.format("第一行\n\n第三行", { format: "quote", source });
  assert.equal(result, "> 第一行\n>\n> 第三行\n>\n> — [标题 \\[转载\\]](https://www.zhihu.com/q/1)");
});

test("quote：无来源时只加引用；无标题时用链接作文本", () => {
  assert.equal(CopyFormatter.quote("a", undefined), "> a");
  assert.equal(
    CopyFormatter.quote("a", { url: "https://a.com/x(1)", title: "" }),
    "> a\n>\n> — [https://a.com/x(1)](https://a.com/x%281%29)"
  );
});

test("markdown：使用转换结果并经过净化", () => {
  const result = CopyFormatter.format("plain", {
    format: "markdown",
    getMarkdown: () => "**bold**  ",
    postProcess: (s) => s.trim(),
  });
  assert.equal(result, "**bold**");
});

test("markdown：转换结果为空时回退纯文本", () => {
  assert.equal(CopyFormatter.format("plain", { format: "markdown", getMarkdown: () => "" }), "plain");
});
