const test = require("node:test");
const assert = require("node:assert/strict");
const TextCleaner = require("../extension/text-cleaner.js");

const { clean, stripTail } = TextCleaner;

test("移除知乎尾巴", () => {
  const input = [
    "正文第一段",
    "正文第二段",
    "",
    "作者：某某",
    "链接：https://www.zhihu.com/question/1/answer/2",
    "来源：知乎",
    "著作权归作者所有。商业转载请联系作者获得授权，非商业转载请注明出处。",
  ].join("\n");
  assert.equal(clean(input), "正文第一段\n正文第二段");
});

test("移除 CSDN 尾巴（带分隔线与缩进）", () => {
  const input = [
    "const a = 1;",
    "————————————————",
    "",
    "                            版权声明：本文为博主原创文章，遵循 CC 4.0 BY-SA 版权协议，转载请附上原文出处链接和本声明。",
    "                        ",
    "原文链接：https://blog.csdn.net/foo/article/details/123",
  ].join("\n");
  assert.equal(clean(input), "const a = 1;");
});

test("移除 B 站尾巴（来源 + 链接）", () => {
  const input = "正文\n作者：up主\nhttps://www.bilibili.com/read/cv123\n出处：bilibili";
  assert.equal(clean(input), "正文");
});

test("正文末尾的「来源：xx」不带链接时保留", () => {
  const input = "今日新闻内容。\n来源：新华社";
  assert.equal(clean(input), input);
});

test("只选中尾巴本身时原样保留", () => {
  const input = "著作权归作者所有。商业转载请联系作者获得授权。";
  assert.equal(stripTail(input).removed, false);
  assert.equal(clean(input), input);
});

test("普通文本不受影响", () => {
  const input = "作者认为这个方案可行\n链接表是一种数据结构";
  assert.equal(clean(input), input);
});

test("尾巴过长视为正文", () => {
  const long = "著作权" + "很长".repeat(300);
  const input = `正文\n${long}`;
  assert.equal(stripTail(input).removed, false);
});

test("去掉零宽字符与 nbsp，保留 emoji 组合字符", () => {
  const family = "\u{1F468}\u200d\u{1F469}\u200d\u{1F467}";
  const input = `a\u200bb\u00a0c\ufeff ${family}`;
  assert.equal(clean(input), `ab c ${family}`);
});

test("压缩多余空行、去掉行尾空白，保留首行缩进", () => {
  const input = "\n\n    indented   \n\n\n\nnext\t\r\nend  \n\n";
  assert.equal(clean(input), "    indented\n\nnext\nend");
});

test("非字符串或空串返回空串", () => {
  assert.equal(clean(""), "");
  assert.equal(clean(undefined), "");
  assert.equal(clean(null), "");
});

test("尾巴中夹零宽字符时仍能识别", () => {
  const input = "正文\n著\u200b作\u200b权归作者所有。\n原文链接：https://x.com/1";
  assert.equal(TextCleaner.hasTail(input), true);
  assert.equal(clean(input), "正文");
});

test("hasTail 对普通文本返回 false", () => {
  assert.equal(TextCleaner.hasTail("普通文本"), false);
  assert.equal(TextCleaner.hasTail(""), false);
});

test("markdown 模式保留硬换行（行尾两个空格）", () => {
  const input = "第一行   \n第二行  \n第三行 \n末行";
  assert.equal(clean(input, { markdown: true }), "第一行  \n第二行  \n第三行\n末行");
  assert.equal(clean(input), "第一行\n第二行\n第三行\n末行");
});
