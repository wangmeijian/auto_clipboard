const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

/**
 * content script 启动流程的回归测试：
 * 加载真实的 content-script.js，模拟 background 转发的快捷键消息，
 * 断言历史面板会被唤起。曾因初始化 Promise.all 的取值错位，
 * 导致 config 为 undefined、插件始终未启用、快捷键失效，而单元测试毫无察觉。
 */

const EXT = path.join(__dirname, "../extension");
const read = (name) => fs.readFileSync(path.join(EXT, name), "utf8");

/** 任意属性访问 / 调用都不会抛错的哑对象，用来充当 DOM 节点 */
function dummy() {
  const fn = function () {};
  const proxy = new Proxy(fn, {
    get: (_, key) => {
      if (key === Symbol.toPrimitive) return () => "";
      if (key === "then") return undefined;
      if (key === "length") return 0;
      return dummy();
    },
    set: () => true,
    apply: () => dummy(),
    construct: () => dummy(),
  });
  return proxy;
}

/**
 * @arg {object} opts
 * @arg {object} opts.sync storage.sync 里的初始数据
 * @arg {boolean} [opts.focused] document.hasFocus() 的返回值
 */
function loadContentScript({ sync = {}, focused = true } = {}) {
  const listeners = [];
  const toggled = { count: 0 };
  const store = { pluginEnabled: "on", ...sync };

  const area = {
    get: (keys, cb) => {
      const out = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
        if (k in store) out[k] = store[k];
      });
      if (cb) {
        cb(out);
        return undefined;
      }
      return Promise.resolve(out);
    },
    set: () => Promise.resolve(),
    onChanged: { addListener() {} },
  };

  const document = {
    hasFocus: () => focused,
    activeElement: { tagName: "BODY" },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => dummy(),
    addEventListener() {},
    removeEventListener() {},
    head: dummy(),
    body: dummy(),
    documentElement: dummy(),
    styleSheets: [],
    readyState: "complete",
  };

  const chrome = {
    storage: { sync: area, local: area, onChanged: { addListener() {} } },
    runtime: {
      id: "ext",
      getURL: (p) => p,
      sendMessage: () => Promise.resolve({}),
      onMessage: { addListener: (fn) => listeners.push(fn) },
    },
    i18n: { getMessage: (k) => k, getUILanguage: () => "zh-CN" },
  };

  class HistoryPanel {
    toggle() {
      toggled.count += 1;
    }
    close() {}
  }

  const win = {
    addEventListener() {},
    removeEventListener() {},
    getSelection: () => ({ toString: () => "" }),
    location: { href: "https://example.com/", protocol: "https:", origin: "https://example.com" },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
  };

  const context = vm.createContext({
    document,
    chrome,
    HistoryPanel,
    window: win,
    location: win.location,
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    console,
    setTimeout,
    clearTimeout,
    Promise,
    URL,
    module: undefined,
  });
  Object.assign(context, win);

  // 与 manifest 一致的加载顺序里，除 history-panel.js（已替换为桩）外的依赖
  ["i18n.js", "theme.js", "text-cleaner.js", "content-type.js", "history-store.js", "html-to-markdown.js", "copy-formatter.js"].forEach(
    (name) => vm.runInContext(read(name), context, { filename: name })
  );
  vm.runInContext(read("content-script.js"), context, { filename: "content-script.js" });

  const send = () => {
    let replied = false;
    listeners.forEach((fn) => fn({ type: "toggleHistoryPanel" }, { id: "ext" }, () => (replied = true)));
    return replied;
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
  return { send, settle, toggled };
}

test("启动后收到快捷键消息会唤起历史面板", async () => {
  const page = loadContentScript();
  await page.settle();
  assert.equal(page.send(), true);
  assert.equal(page.toggled.count, 1);
});

test("manifest 里 theme.js 排在使用它的脚本之前", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const js = manifest.content_scripts[0].js;
  assert.ok(js.indexOf("theme.js") !== -1, "content script 需要加载 theme.js");
  assert.ok(js.indexOf("theme.js") < js.indexOf("history-panel.js"));
  assert.ok(js.indexOf("theme.js") < js.indexOf("content-script.js"));
});

test("插件总开关关闭时快捷键不响应", async () => {
  const page = loadContentScript({ sync: { pluginEnabled: "off" } });
  await page.settle();
  assert.equal(page.send(), false);
  assert.equal(page.toggled.count, 0);
});

test("页面没有焦点时快捷键不响应（只由持有焦点的 frame 处理）", async () => {
  const page = loadContentScript({ focused: false });
  await page.settle();
  assert.equal(page.send(), false);
  assert.equal(page.toggled.count, 0);
});
