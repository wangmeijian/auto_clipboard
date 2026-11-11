const test = require("node:test");
const assert = require("node:assert/strict");
const ContentType = require("../extension/content-type.js");

const { detect, prettyJSON } = ContentType;

test("识别链接", () => {
  assert.equal(detect("https://www.zhihu.com/question/1?a=b#c"), "link");
  assert.equal(detect("  www.example.com/path  "), "link");
  assert.equal(detect("https://a.com 后面还有字"), "text");
});

test("识别邮箱", () => {
  assert.equal(detect("foo.bar+tag@example.co"), "email");
  assert.equal(detect("foo@bar"), "text");
});

test("识别手机号", () => {
  assert.equal(detect("13812345678"), "phone");
  assert.equal(detect("+86 138-1234-5678"), "phone");
  assert.equal(detect("+1 415 555 2671"), "phone");
  assert.equal(detect("12345678901"), "text");
  assert.equal(detect("2024"), "text");
});

test("识别颜色", () => {
  assert.equal(detect("#51b362"), "color");
  assert.equal(detect("#FFF"), "color");
  assert.equal(detect("rgb(81, 179, 98)"), "color");
  assert.equal(detect("rgba(0,0,0,0.5)"), "color");
  assert.equal(detect("hsl(120 50% 40% / 0.8)"), "color");
  assert.equal(detect("#issue12"), "text");
});

test("识别 JSON", () => {
  assert.equal(detect('{"a":1,"b":[1,2]}'), "json");
  assert.equal(detect("[1, 2, 3]"), "json");
  assert.equal(detect("{not json}"), "text");
  assert.equal(detect('"string"'), "text");
});

test("普通文本与异常输入", () => {
  assert.equal(detect("一段普通的文字"), "text");
  assert.equal(detect(""), "text");
  assert.equal(detect(undefined), "text");
});

test("JSON 美化", () => {
  assert.equal(prettyJSON('{"a":1}'), '{\n  "a": 1\n}');
  assert.equal(prettyJSON("nope"), null);
});

test("识别结果被缓存，重复调用结果一致", () => {
  const value = '{"cached":true}';
  assert.equal(detect(value), "json");
  assert.equal(detect(value), "json");
});
