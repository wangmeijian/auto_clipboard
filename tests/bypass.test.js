const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../extension/bypass.js"), "utf8");

// 与真实 DataTransfer 一致：setData / items.add 定义在原型上
class FakeItems {
  add() {
    this.owner.added = true;
  }
}
class FakeDataTransfer {
  constructor() {
    this.data = {};
    this.items = new FakeItems();
    this.items.owner = this;
  }
  setData(type, value) {
    this.data[type] = value;
  }
}

/** 在隔离的 vm 上下文里加载 bypass.js，用 EventTarget 子类避免污染宿主原型 */
function loadBypass() {
  class ET extends EventTarget {}
  const win = new ET();
  win.getSelection = () => ({ toString: () => "" });
  const ctx = vm.createContext({
    EventTarget: ET,
    HTMLElement: function () {},
    Document: function () {},
    Window: function () {},
    window: win,
  });
  vm.runInContext(source, ctx);
  return ET;
}

function dispatchCopy(ET, listener, { type = "copy", withClipboard = true } = {}) {
  const target = new ET();
  const dt = new FakeDataTransfer();
  target.addEventListener(type, listener);
  const e = new Event(type, { cancelable: true });
  if (withClipboard) Object.defineProperty(e, "clipboardData", { value: dt });
  target.dispatchEvent(e);
  return { e, dt };
}

test("copy：页面只调 preventDefault 禁止复制时被屏蔽", () => {
  const ET = loadBypass();
  const { e } = dispatchCopy(ET, (ev) => ev.preventDefault());
  assert.equal(e.defaultPrevented, false);
});

test("copy：页面通过 setData 写入后 preventDefault 必须保留（Google Sheets 场景）", () => {
  const ET = loadBypass();
  const { e, dt } = dispatchCopy(ET, (ev) => {
    ev.clipboardData.setData("text/plain", "cell");
    ev.preventDefault();
  });
  assert.equal(e.defaultPrevented, true);
  assert.equal(dt.data["text/plain"], "cell");
});

test("copy：页面通过 items.add 写入后 preventDefault 必须保留", () => {
  const ET = loadBypass();
  const { e, dt } = dispatchCopy(ET, (ev) => {
    ev.clipboardData.items.add();
    ev.preventDefault();
  });
  assert.equal(e.defaultPrevented, true);
  assert.equal(dt.added, true);
});

test("cut：写入后同样保留 preventDefault", () => {
  const ET = loadBypass();
  const { e } = dispatchCopy(ET, (ev) => {
    ev.clipboardData.setData("text/plain", "x");
    ev.preventDefault();
  }, { type: "cut" });
  assert.equal(e.defaultPrevented, true);
});

test("copy：写入但未 preventDefault 时不会凭空取消默认行为", () => {
  const ET = loadBypass();
  const { e } = dispatchCopy(ET, (ev) => ev.clipboardData.setData("text/plain", "x"));
  assert.equal(e.defaultPrevented, false);
});

test("copy：监听器执行后 setData 恢复为原型方法，事后调用不受影响", () => {
  const ET = loadBypass();
  const { e, dt } = dispatchCopy(ET, () => {});
  assert.equal(Object.prototype.hasOwnProperty.call(dt, "setData"), false);
  e.clipboardData.setData("text/plain", "after");
  assert.equal(dt.data["text/plain"], "after");
});

test("selectstart：无 clipboardData 的事件 preventDefault 仍被屏蔽", () => {
  const ET = loadBypass();
  const { e } = dispatchCopy(ET, (ev) => ev.preventDefault(), {
    type: "selectstart",
    withClipboard: false,
  });
  assert.equal(e.defaultPrevented, false);
});

test("removeEventListener 能移除被包裹的监听器", () => {
  const ET = loadBypass();
  const target = new ET();
  let calls = 0;
  const fn = () => calls++;
  target.addEventListener("copy", fn);
  target.removeEventListener("copy", fn);
  target.dispatchEvent(new Event("copy"));
  assert.equal(calls, 0);
});
