const test = require("node:test");
const assert = require("node:assert/strict");

// i18n.js 依赖 chrome 全局，测试中只覆盖纯函数 format
global.chrome = { i18n: { getMessage: () => "", getUILanguage: () => "en" } };
const I18n = require("../extension/i18n.js");

test("无占位符时原样返回", () => {
  assert.equal(I18n.format({ message: "复制成功" }), "复制成功");
});

test("命名占位符替换为位置参数", () => {
  const entry = {
    message: "已导入 $COUNT$ 条，跳过 $SKIPPED$ 条",
    placeholders: { count: { content: "$1" }, skipped: { content: "$2" } },
  };
  assert.equal(I18n.format(entry, [3, 1]), "已导入 3 条，跳过 1 条");
});

test("单个参数可直接传值", () => {
  const entry = { message: "共 $N$ 条", placeholders: { n: { content: "$1" } } };
  assert.equal(I18n.format(entry, 5), "共 5 条");
});

test("$$ 转义为 $", () => {
  assert.equal(I18n.format({ message: "价格 $$9" }), "价格 $9");
});

test("未初始化时回退 chrome.i18n", () => {
  global.chrome.i18n.getMessage = (key) => `native:${key}`;
  assert.equal(I18n.t("copySuccess"), "native:copySuccess");
});

test("回退 chrome.i18n 时数字参数转为字符串", () => {
  let received;
  global.chrome.i18n.getMessage = (key, subs) => {
    received = subs;
    return "";
  };
  I18n.t("exportSuccess", 51);
  assert.deepEqual(received, ["51"]);
  I18n.t("importSuccess", [2, 0]);
  assert.deepEqual(received, ["2", "0"]);
});
