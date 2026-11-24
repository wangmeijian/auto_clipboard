const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../extension/bypass-paste.js"), "utf8");

function loadBypassPaste() {
  class ET extends EventTarget {}
  const ctx = vm.createContext({
    EventTarget: ET,
    HTMLElement: function () {},
    Document: function () {},
    Window: function () {},
  });
  vm.runInContext(source, ctx);
  return ET;
}

test("paste：页面 preventDefault 被屏蔽", () => {
  const ET = loadBypassPaste();
  const target = new ET();
  target.addEventListener("paste", (e) => e.preventDefault());
  const e = new Event("paste", { cancelable: true });
  target.dispatchEvent(e);
  assert.equal(e.defaultPrevented, false);
});

test("removeEventListener 能移除被包裹的监听器", () => {
  const ET = loadBypassPaste();
  const target = new ET();
  let calls = 0;
  const fn = () => calls++;
  target.addEventListener("paste", fn);
  target.removeEventListener("paste", fn);
  target.dispatchEvent(new Event("paste"));
  assert.equal(calls, 0);
});
