const test = require("node:test");
const assert = require("node:assert/strict");
const HistoryStore = require("../extension/history-store.js");

const { insertEntry, sanitizeSource, normalize } = HistoryStore;

test("新记录插到置顶记录之后", () => {
  const history = [
    { value: "pinned", topping: true },
    { value: "old", topping: false },
  ];
  const next = insertEntry(history, { value: "new", time: 1 });
  assert.deepEqual(
    next.map((item) => item.value),
    ["pinned", "new", "old"]
  );
});

test("重复内容移到前面并继承置顶状态，更新来源", () => {
  const source = { url: "https://a.com/", title: "A" };
  const history = [
    { value: "x", topping: false },
    { value: "pinned", topping: true },
  ];
  const next = insertEntry(history, { value: "pinned", time: 2, source });
  assert.equal(next.length, 2);
  assert.deepEqual(next[0], { value: "pinned", topping: true, time: 2, source });
});

test("不修改入参", () => {
  const history = Object.freeze([Object.freeze({ value: "a", topping: false })]);
  assert.doesNotThrow(() => insertEntry(history, { value: "b" }));
  assert.equal(history.length, 1);
});

test("insertEntry 本身不截断", () => {
  const history = [{ value: "a", topping: false }, { value: "b", topping: false }];
  assert.equal(insertEntry(history, { value: "c" }).length, 3);
});

test("来源只接受 http(s)", () => {
  assert.equal(sanitizeSource({ url: "about:blank", title: "" }), undefined);
  assert.equal(sanitizeSource({ url: "javascript:alert(1)", title: "" }), undefined);
  assert.equal(sanitizeSource({ url: "not a url" }), undefined);
  assert.equal(sanitizeSource(undefined), undefined);
  assert.deepEqual(sanitizeSource({ url: "https://a.com/p", title: 1 }), {
    url: "https://a.com/p",
    title: "",
  });
});

test("标题过长时截断", () => {
  const source = sanitizeSource({ url: "https://a.com", title: "t".repeat(500) });
  assert.equal(source.title.length, 200);
});

test("兼容早期 string 格式", () => {
  assert.deepEqual(normalize("abc"), { value: "abc", topping: false });
});

test("相对时间", () => {
  const now = 1_000_000_000_000;
  const { formatRelativeTime } = HistoryStore;
  assert.equal(formatRelativeTime(undefined, "en", now), "");
  assert.equal(formatRelativeTime(now - 5 * 1000, "en", now), "now");
  assert.equal(formatRelativeTime(now - 3 * 60 * 1000, "en", now), "3 minutes ago");
  assert.equal(formatRelativeTime(now - 2 * 3600 * 1000, "en", now), "2 hours ago");
  assert.equal(formatRelativeTime(now - 86400 * 1000, "en", now), "yesterday");
});

test("解析域名", () => {
  assert.equal(HistoryStore.getHostname("https://www.zhihu.com/q/1"), "www.zhihu.com");
  assert.equal(HistoryStore.getHostname("bad"), "");
});

const { prune, normalizeSettings, parseImport, mergeImport, buildExport } = HistoryStore;
const DAY = 86400000;

test("prune：超出容量时丢弃末尾的普通记录，置顶不占容量", () => {
  const history = [
    { value: "p1", topping: true },
    { value: "p2", topping: true },
    { value: "a", topping: false },
    { value: "b", topping: false },
    { value: "c", topping: false },
  ];
  const next = prune(history, { maxLength: 2, expireDays: 0 });
  assert.deepEqual(next.map((item) => item.value), ["p1", "p2", "a", "b"]);
});

test("prune：过期的普通记录被删除，置顶和无时间的老记录保留", () => {
  const now = 100 * DAY;
  const history = [
    { value: "pinned-old", topping: true, time: now - 50 * DAY },
    { value: "fresh", topping: false, time: now - DAY / 2 },
    { value: "stale", topping: false, time: now - 8 * DAY },
    { value: "legacy", topping: false },
  ];
  const next = prune(history, { maxLength: 100, expireDays: 7 }, now);
  assert.deepEqual(next.map((item) => item.value), ["pinned-old", "fresh", "legacy"]);
});

test("prune：expireDays 为 0 时永不过期", () => {
  const history = [{ value: "a", topping: false, time: 1 }];
  assert.equal(prune(history, { maxLength: 10, expireDays: 0 }, 1e15).length, 1);
});

test("normalizeSettings 只接受可选值", () => {
  assert.deepEqual(normalizeSettings({ historyMaxLength: "500", historyExpireDays: 30 }), {
    maxLength: 500,
    expireDays: 30,
  });
  assert.deepEqual(normalizeSettings({ historyMaxLength: 99999, historyExpireDays: -1 }), {
    maxLength: 100,
    expireDays: 0,
  });
  assert.deepEqual(normalizeSettings(undefined), { maxLength: 100, expireDays: 0 });
});

test("导出后可原样导入", () => {
  const history = [{ value: "a", topping: true, time: 5, source: { url: "https://a.com/", title: "A" } }];
  const { items, skipped } = parseImport(JSON.stringify(buildExport(history, 0)));
  assert.equal(skipped, 0);
  assert.deepEqual(items, history);
});

test("导入：兼容纯数组和老的 string 格式，跳过非法记录并清洗字段", () => {
  const raw = ["plain", { value: "" }, { value: 1 }, null, { value: "x", topping: "yes", time: -1, source: { url: "javascript:alert(1)" } }];
  const { items, skipped } = parseImport(JSON.stringify(raw));
  assert.equal(skipped, 3);
  assert.deepEqual(items, [
    { value: "plain", topping: false, time: undefined, source: undefined },
    { value: "x", topping: false, time: undefined, source: undefined },
  ]);
});

test("导入：非法文件抛错", () => {
  assert.throws(() => parseImport("not json"));
  assert.throws(() => parseImport(JSON.stringify({ app: "other", history: [] })));
  assert.throws(() => parseImport(JSON.stringify({ foo: 1 })));
});

test("合并导入：去重、置顶取并集、置顶排前", () => {
  const history = [
    { value: "a", topping: false },
    { value: "b", topping: false },
  ];
  const imported = [
    { value: "b", topping: true },
    { value: "c", topping: false },
    { value: "c", topping: false },
    { value: "d", topping: true },
  ];
  const { history: next, added } = mergeImport(history, imported);
  assert.equal(added, 2);
  assert.deepEqual(next.map((item) => `${item.value}:${item.topping}`), ["b:true", "d:true", "a:false", "c:false"]);
});

test("相对时间：超过 30 天用月、超过一年用年", () => {
  const now = 1_000_000_000_000;
  assert.equal(HistoryStore.formatRelativeTime(now - 70 * DAY, "en", now), "2 months ago");
  assert.equal(HistoryStore.formatRelativeTime(now - 400 * DAY, "en", now), "last year");
});

test("合并导入：普通记录按时间倒序，导入的新记录不会因排在末尾被优先清理", () => {
  const history = [
    { value: "old", topping: false, time: 1 },
    { value: "legacy", topping: false },
  ];
  const imported = [{ value: "recent", topping: false, time: 5 }];
  const merged = mergeImport(history, imported).history;
  assert.deepEqual(merged.map((item) => item.value), ["recent", "old", "legacy"]);
  assert.deepEqual(prune(merged, { maxLength: 1, expireDays: 0 }).map((item) => item.value), ["recent"]);
});

test("matchesKeyword：匹配内容、来源标题与地址，忽略大小写和首尾空白", () => {
  const item = { value: "Hello", source: { url: "https://zhihu.com/q", title: "知乎问答" } };
  assert.equal(HistoryStore.matchesKeyword(item, "  hello "), true);
  assert.equal(HistoryStore.matchesKeyword(item, "知乎"), true);
  assert.equal(HistoryStore.matchesKeyword(item, "ZHIHU.COM"), true);
  assert.equal(HistoryStore.matchesKeyword(item, ""), true);
  assert.equal(HistoryStore.matchesKeyword({ value: "abc" }, "zzz"), false);
});

test("record：background 不可用时直接写入", async () => {
  const store = {};
  global.chrome = {
    runtime: { sendMessage: async () => { throw new Error("no receiver"); } },
    storage: {
      local: { get: async () => store, set: async (obj) => Object.assign(store, obj) },
      sync: { get: async () => ({}) },
    },
  };
  await HistoryStore.record("text", { url: "https://a.com", title: "A" });
  assert.equal(store[HistoryStore.KEY][0].value, "text");
  delete global.chrome;
});

test("serveRecord：并发消息按顺序串行写入，不丢记录", async () => {
  const store = {};
  let listener;
  global.chrome = {
    runtime: { id: "self", onMessage: { addListener: (fn) => (listener = fn) } },
    storage: {
      // 模拟存储读写有延迟，若非串行则后写入者会覆盖先写入者
      local: {
        get: () => new Promise((r) => setTimeout(() => r({ ...store }), 5)),
        set: (obj) => new Promise((r) => setTimeout(() => r(Object.assign(store, obj)), 5)),
      },
      sync: { get: async () => ({}) },
    },
  };
  HistoryStore.serveRecord();
  const send = (text) =>
    new Promise((resolve) => listener({ type: "history:record", text }, { id: "self" }, resolve));
  await Promise.all(["a", "b", "c"].map(send));
  assert.deepEqual(store[HistoryStore.KEY].map((item) => item.value).sort(), ["a", "b", "c"]);
  assert.equal(listener({ type: "history:record", text: "x" }, { id: "other" }, () => {}), undefined);
  delete global.chrome;
});
