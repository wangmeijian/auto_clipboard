/**
 * 可切换语言的 i18n
 *   chrome.i18n 只跟随浏览器语言、不能运行时切换，这里按用户配置自行加载 _locales 下的语言包
 *   - language 为 "auto"（默认）时直接走 chrome.i18n
 *   - 扩展页面 / service worker 直接 fetch 语言包；content script 无权 fetch 扩展资源，通过 background 获取
 *   - manifest 中的扩展名称、描述、快捷键描述由浏览器读取，不受此配置影响
 * popup、background、content script 共用
 */
const I18n = (() => {
  const STORAGE_KEY = "language";
  const AUTO = "auto";
  // 选项文案用各语言自己的名称，任何界面语言下都能认出来
  const LANGUAGES = [
    { value: "zh_CN", label: "简体中文", bcp47: "zh-CN" },
    { value: "en", label: "English", bcp47: "en" },
  ];
  const SUPPORTED = LANGUAGES.map((item) => item.value);
  const GET_MESSAGES = "i18n:getMessages";

  let language = AUTO;
  let messages = null;
  const listeners = [];

  const isExtensionContext = () =>
    typeof location !== "undefined" && location.protocol === "chrome-extension:";

  function normalizeLanguage(value) {
    return SUPPORTED.includes(value) ? value : AUTO;
  }

  async function fetchMessages(locale) {
    const response = await fetch(chrome.runtime.getURL(`_locales/${locale}/messages.json`));
    if (!response.ok) throw new Error(`Failed to load locale ${locale}`);
    return response.json();
  }

  async function loadMessages(locale) {
    if (locale === AUTO) return null;
    try {
      if (isExtensionContext()) return await fetchMessages(locale);
      const result = await chrome.runtime.sendMessage({ type: GET_MESSAGES, locale });
      return result && typeof result === "object" ? result : null;
    } catch (e) {
      // 加载失败回退到浏览器语言
      return null;
    }
  }

  async function apply(value) {
    language = normalizeLanguage(value);
    messages = await loadMessages(language);
  }

  /**
   * @desc 读取配置并加载语言包，之后监听配置变化
   */
  let initialized = false;
  async function init() {
    if (!initialized) {
      initialized = true;
      // 先同步注册监听再 await，service worker 被 storage 事件唤醒时也不会漏掉
      // 只监听 sync：local 中的历史记录每次复制都会整份重写
      chrome.storage.sync.onChanged.addListener(async (changes) => {
        if (!(STORAGE_KEY in changes)) return;
        const previous = language;
        await apply(changes[STORAGE_KEY].newValue);
        // 例如首次保存设置时从 undefined 变为 "auto"，实际语言没变，不通知
        if (language !== previous) listeners.forEach((listener) => listener(language));
      });
    }
    const stored = await chrome.storage.sync.get([STORAGE_KEY]);
    await apply(stored[STORAGE_KEY]);
  }

  /**
   * @desc 替换 Chrome 语言包格式的占位符：$NAME$ → placeholders.name.content → $1..$9
   */
  function format(entry, substitutions) {
    const subs = substitutions === undefined ? [] : [].concat(substitutions);
    const placeholders = entry.placeholders || {};
    return entry.message
      .replace(/\$([a-z0-9_@]+)\$/gi, (match, name) => {
        const placeholder = placeholders[name.toLowerCase()];
        return placeholder ? placeholder.content : match;
      })
      // $$ 与 $1..$9 一次处理，避免 "$$9" 被误当成第 9 个参数
      .replace(/\$(\$|\d)/g, (match, token) => {
        if (token === "$") return "$";
        const value = subs[Number(token) - 1];
        return value === undefined ? "" : String(value);
      });
  }

  function t(key, substitutions) {
    // chrome.i18n.getMessage 只接受字符串参数，传数字会被静默忽略
    const subs = substitutions === undefined ? undefined : [].concat(substitutions).map(String);
    const entry = messages && messages[key];
    if (entry && typeof entry.message === "string") return format(entry, subs);
    return chrome.i18n.getMessage(key, subs);
  }

  /**
   * @desc 当前生效语言的 BCP 47 标签，用于 Intl 格式化
   */
  function getLocale() {
    const matched = LANGUAGES.find((item) => item.value === language);
    return matched ? matched.bcp47 : chrome.i18n.getUILanguage();
  }

  function onChange(listener) {
    listeners.push(listener);
  }

  /**
   * @desc background 侧：响应 content script 的语言包请求
   */
  function serveMessages() {
    const cache = {};
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || message.type !== GET_MESSAGES || sender.id !== chrome.runtime.id) return;
      const locale = normalizeLanguage(message.locale);
      if (locale === AUTO) {
        sendResponse(null);
        return;
      }
      cache[locale] = cache[locale] || fetchMessages(locale);
      cache[locale].then(sendResponse, () => {
        delete cache[locale];
        sendResponse(null);
      });
      return true; // 异步 sendResponse
    });
  }

  return {
    STORAGE_KEY,
    AUTO,
    LANGUAGES,
    init,
    t,
    format,
    getLocale,
    getLanguage: () => language,
    onChange,
    serveMessages,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = I18n;
}
