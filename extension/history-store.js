/**
 * 剪切板历史的读写，content script 与 popup 共用
 * 记录结构：{ value: string, topping: boolean, time?: number, source?: { url: string, title: string } }
 *   time / source 为后加字段，老数据可能没有
 */
const HistoryStore = (() => {
  // 已申请 unlimitedStorage，不受 chrome.storage.local 默认 10M 配额限制
  const KEY = "auto_clipboard_history";
  const MAX_ITEM_LENGTH = 10000;
  const MAX_TITLE_LENGTH = 200;
  const MAX_URL_LENGTH = 2048;
  const DAY_MS = 86400000;
  // 容量与过期配置（存在 storage.sync），可选值同时用于设置页下拉框与入参校验
  const SETTINGS_KEYS = { maxLength: "historyMaxLength", expireDays: "historyExpireDays" };
  const MAX_LENGTH_OPTIONS = [50, 100, 200, 500, 1000];
  const EXPIRE_DAYS_OPTIONS = [0, 1, 7, 30, 90]; // 0 表示永不过期
  const DEFAULT_SETTINGS = { maxLength: 100, expireDays: 0 };
  // 导出文件格式
  const EXPORT_APP = "auto_clipboard";
  const EXPORT_VERSION = 1;
  const MAX_IMPORT_ITEMS = 10000;

  /**
   * @desc 早期版本存的是 string，统一转成对象
   */
  function normalize(item) {
    return typeof item === "string" ? { value: item, topping: false } : item;
  }

  /**
   * @desc 只接受 http(s) 来源，避免存下 about:blank、chrome:// 等无法跳回的地址
   * @returns {{ url: string, title: string } | undefined}
   */
  function sanitizeSource(source) {
    if (!source || typeof source.url !== "string") return undefined;
    if (source.url.length > MAX_URL_LENGTH) return undefined;
    try {
      const { protocol } = new URL(source.url);
      if (protocol !== "http:" && protocol !== "https:") return undefined;
    } catch (e) {
      return undefined;
    }
    const title = typeof source.title === "string" ? source.title : "";
    return { url: source.url, title: title.slice(0, MAX_TITLE_LENGTH) };
  }

  /**
   * @desc 把一条记录放到合适位置，返回新数组（不修改入参）
   *   - 已存在相同内容：移除旧记录，继承其置顶状态
   *   - 置顶记录插到最前，普通记录插到所有置顶记录之后
   */
  function insertEntry(history, entry) {
    const existing = history.find((item) => item.value === entry.value);
    const rest = history.filter((item) => item.value !== entry.value);
    const merged = { ...entry, topping: existing ? !!existing.topping : false };
    const toppingCount = rest.filter((item) => item.topping).length;
    const insertIndex = merged.topping ? 0 : toppingCount;
    return [...rest.slice(0, insertIndex), merged, ...rest.slice(insertIndex)];
  }

  function normalizeSettings(raw = {}) {
    const maxLength = Number(raw[SETTINGS_KEYS.maxLength]);
    const expireDays = Number(raw[SETTINGS_KEYS.expireDays]);
    return {
      maxLength: MAX_LENGTH_OPTIONS.includes(maxLength) ? maxLength : DEFAULT_SETTINGS.maxLength,
      expireDays: EXPIRE_DAYS_OPTIONS.includes(expireDays) ? expireDays : DEFAULT_SETTINGS.expireDays,
    };
  }

  /**
   * @desc 按容量与过期时间清理，置顶记录不受影响（不过期、不占容量）
   *   没有 time 的老记录无法判断时间，不参与过期，只受容量限制
   */
  function prune(history, settings = DEFAULT_SETTINGS, now = Date.now()) {
    const { maxLength, expireDays } = settings;
    const expireBefore = expireDays > 0 ? now - expireDays * DAY_MS : -Infinity;
    let kept = 0;
    return history.filter((item) => {
      if (item.topping) return true;
      if (item.time && item.time < expireBefore) return false;
      kept += 1;
      return kept <= maxLength;
    });
  }

  function getHostname(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return "";
    }
  }

  /**
   * @desc 相对时间，如「3 分钟前」「昨天」
   * @arg {number} time 毫秒时间戳
   * @arg {string} locale
   * @arg {number} [now]
   */
  function formatRelativeTime(time, locale, now = Date.now()) {
    if (!time) return "";
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const seconds = Math.round((time - now) / 1000);
    const units = [
      ["year", 365 * 86400],
      ["month", 30 * 86400],
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60],
    ];
    const matched = units.find(([, size]) => Math.abs(seconds) >= size);
    return matched
      ? rtf.format(Math.round(seconds / matched[1]), matched[0])
      : rtf.format(0, "second");
  }

  // ---------- 导入导出 ----------

  function buildExport(history, now = Date.now()) {
    return {
      app: EXPORT_APP,
      version: EXPORT_VERSION,
      exportedAt: new Date(now).toISOString(),
      history,
    };
  }

  /**
   * @desc 校验单条导入记录，不合法返回 null
   */
  function sanitizeImportItem(raw) {
    const item = normalize(raw);
    if (!item || typeof item !== "object") return null;
    if (typeof item.value !== "string" || item.value.trim().length === 0) return null;
    const time = Number.isFinite(item.time) && item.time > 0 ? item.time : undefined;
    return {
      value: item.value.slice(0, MAX_ITEM_LENGTH),
      topping: item.topping === true,
      time,
      source: sanitizeSource(item.source),
    };
  }

  /**
   * @desc 解析导入文件内容，兼容导出格式与纯数组
   * @returns {{ items: object[], skipped: number }}
   * @throws {Error} 文件不是合法 JSON 或结构不对
   */
  function parseImport(text) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data && data.app === EXPORT_APP ? data.history : null;
    if (!Array.isArray(list)) throw new Error("Invalid backup file");
    if (list.length > MAX_IMPORT_ITEMS) throw new Error("Too many items");
    const items = list.map(sanitizeImportItem).filter(Boolean);
    return { items, skipped: list.length - items.length };
  }

  /**
   * @desc 合并导入记录：已存在的内容保留原记录（任一侧置顶即置顶），新内容追加
   * @returns {{ history: object[], added: number }}
   */
  function mergeImport(history, imported) {
    const byValue = new Map(imported.map((item) => [item.value, item]));
    const merged = history.map((item) => {
      const incoming = byValue.get(item.value);
      return incoming && incoming.topping && !item.topping ? { ...item, topping: true } : item;
    });
    const existing = new Set(history.map((item) => item.value));
    const seen = new Set();
    const added = imported.filter((item) => {
      if (existing.has(item.value) || seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    });
    // 普通记录按时间倒序，避免导入的记录排在末尾、在容量已满时被优先清理；无时间的老记录排最后
    const byRecency = (a, b) => (b.time || 0) - (a.time || 0);
    const combined = [...merged, ...added];
    return {
      history: [
        ...combined.filter((item) => item.topping),
        ...combined.filter((item) => !item.topping).sort(byRecency),
      ],
      added: added.length,
    };
  }

  // ---------- 存储 ----------

  async function getSettings() {
    const raw = await chrome.storage.sync.get(Object.values(SETTINGS_KEYS));
    return normalizeSettings(raw);
  }

  async function getAll() {
    const result = (await chrome.storage?.local?.get([KEY])) ?? {};
    return (result[KEY] || []).map(normalize);
  }

  async function save(history) {
    await chrome.storage.local?.set({ [KEY]: history });
  }

  /**
   * @desc 读取最新数据 → 变换 → 清理 → 写回，返回写入后的数据
   *   基于存储中的最新值，避免拿很久以前的快照整体覆盖；但读写之间不是原子的，
   *   并发写入仍可能互相覆盖，页面侧的新增因此统一走 record() 交给 background 串行处理
   * @arg {(history: object[]) => object[]} updater
   */
  async function update(updater) {
    const [history, settings] = await Promise.all([getAll(), getSettings()]);
    const next = prune(updater(history), settings);
    await save(next);
    return next;
  }

  /**
   * @desc 读取并按当前配置清理（只读，不写回）
   */
  async function getActive() {
    const [history, settings] = await Promise.all([getAll(), getSettings()]);
    return prune(history, settings);
  }

  /**
   * @desc 新增一条记录
   * @arg {string} text 复制的文本
   * @arg {{ url: string, title: string }} [source] 来源页面
   */
  async function add(text, source) {
    if (typeof text !== "string" || text.length === 0) return;
    const entry = {
      value: text.slice(0, MAX_ITEM_LENGTH),
      time: Date.now(),
      source: sanitizeSource(source),
    };
    await update((history) => insertEntry(history, entry));
  }

  // ---------- 由 background 串行写入 ----------

  const RECORD_MESSAGE = "history:record";
  let recordQueue = Promise.resolve();

  /**
   * @desc 页面侧新增记录：发给 background 串行写入；background 不可用时直接写
   */
  async function record(text, source) {
    try {
      await chrome.runtime.sendMessage({ type: RECORD_MESSAGE, text, source });
    } catch (e) {
      await add(text, source).catch(() => {});
    }
  }

  /**
   * @desc background 侧：按到达顺序逐条写入
   */
  function serveRecord() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || message.type !== RECORD_MESSAGE || sender.id !== chrome.runtime.id) return;
      recordQueue = recordQueue
        .then(() => add(message.text, message.source))
        .catch(() => {});
      recordQueue.then(() => sendResponse(true));
      return true; // 异步 sendResponse
    });
  }

  /**
   * @desc 搜索：匹配内容、来源标题与地址，popup 与历史面板共用
   */
  function matchesKeyword(item, keyword) {
    const key = keyword.trim().toLowerCase();
    if (!key) return true;
    const source = item.source || {};
    return [item.value, source.title, source.url]
      .filter(Boolean)
      .join("\n")
      .toLowerCase()
      .includes(key);
  }

  return {
    KEY,
    SETTINGS_KEYS,
    MAX_LENGTH_OPTIONS,
    EXPIRE_DAYS_OPTIONS,
    DEFAULT_SETTINGS,
    normalize,
    sanitizeSource,
    insertEntry,
    normalizeSettings,
    prune,
    getHostname,
    formatRelativeTime,
    buildExport,
    parseImport,
    mergeImport,
    getSettings,
    getAll,
    getActive,
    save,
    update,
    add,
    record,
    serveRecord,
    matchesKeyword,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = HistoryStore;
}
