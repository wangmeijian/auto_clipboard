/**
 * 主题：跟随系统 / 浅色 / 深色，popup 与 content script（历史面板、密码图标）共用
 *
 * 暗色样式都写在 @media (prefers-color-scheme: dark) 里，而页面无法改写系统的偏好。
 * 这里不重复维护一套暗色规则，而是直接改写这些 @media 规则自身的条件：
 *   dark  -> "all"      恒生效
 *   light -> "not all"  恒不生效
 *   auto  -> 还原为原始条件，交还系统决定
 */
const Theme = (() => {
  const STORAGE_KEY = "theme";
  const OPTIONS = ["auto", "light", "dark"];
  const DARK_QUERY = /prefers-color-scheme\s*:\s*dark/i;

  let current = "auto";
  // 规则 -> 原始媒体查询，auto 时据此还原
  const originals = new WeakMap();
  // 已登记的 <style>（如 Shadow DOM 里的），主题变化时重新应用
  const tracked = new Set();

  const normalize = (value) => (OPTIONS.includes(value) ? value : "auto");
  const colorSchemeFor = (theme) => (theme === "auto" ? "" : theme);

  function applyToRules(rules, theme) {
    for (const rule of Array.from(rules)) {
      if (rule.media && typeof rule.media.mediaText === "string") {
        if (!originals.has(rule)) {
          if (DARK_QUERY.test(rule.media.mediaText)) originals.set(rule, rule.media.mediaText);
        }
        if (originals.has(rule)) {
          rule.media.mediaText =
            theme === "dark" ? "all" : theme === "light" ? "not all" : originals.get(rule);
        }
      }
      if (rule.cssRules) applyToRules(rule.cssRules, theme);
    }
  }

  function applyToSheet(sheet, theme) {
    if (!sheet) return;
    let rules;
    try {
      rules = sheet.cssRules;
    } catch (e) {
      return; // 跨域样式表不可读，跳过
    }
    if (rules) applyToRules(rules, theme);
  }

  function applyAll() {
    if (typeof document !== "undefined" && document.styleSheets) {
      Array.from(document.styleSheets).forEach((sheet) => applyToSheet(sheet, current));
      if (document.documentElement) {
        // 同步表单控件、滚动条等浏览器自带部件的配色
        document.documentElement.style.colorScheme = colorSchemeFor(current);
      }
    }
    tracked.forEach((el) => {
      if (!el.isConnected) {
        tracked.delete(el);
        return;
      }
      applyToSheet(el.sheet, current);
    });
  }

  /** 登记一个已插入文档（或 Shadow DOM）的 <style>，之后随主题变化 */
  function track(styleEl) {
    if (!styleEl) return;
    tracked.add(styleEl);
    applyToSheet(styleEl.sheet, current);
  }

  function set(value) {
    current = normalize(value);
    applyAll();
  }

  /** 读取已保存的主题并开始监听变化；popup 在渲染前 await，避免闪一下系统主题 */
  async function init() {
    try {
      const stored = await chrome.storage.sync.get([STORAGE_KEY]);
      set(stored[STORAGE_KEY]);
    } catch (e) {
      set("auto");
    }
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes[STORAGE_KEY]) set(changes[STORAGE_KEY].newValue);
    });
  }

  return { OPTIONS, normalize, colorSchemeFor, applyToSheet, track, set, init, get: () => current };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Theme;
}
