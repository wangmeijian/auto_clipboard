/**
 * 识别历史记录的内容类型，用于打标签和按类型筛选
 * 渲染时实时计算，老数据也能识别；纯函数，popup、历史面板与单元测试共用
 */
const ContentType = (() => {
  const TYPES = ["link", "email", "phone", "color", "json"];
  // 超过这个长度不做识别，避免大段文本每次渲染都 JSON.parse
  const MAX_DETECT_LENGTH = 100000;

  const LINK = /^(https?:\/\/|www\.)[^\s]+$/i;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  // 中国大陆手机号（可带 +86），或带 + 前缀的国际号码
  const PHONE_CN = /^(?:\+?86[-\s]?)?1[3-9]\d(?:[-\s]?\d{4}){2}$/;
  const PHONE_INTL = /^\+\d{1,3}[-\s]?\d(?:[-\s]?\d){5,13}$/;
  const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  const FUNC_COLOR = /^(?:rgba?|hsla?)\(\s*[\d.]+%?\s*(?:[,\s]\s*[\d.]+%?\s*){2}(?:[,/]\s*[\d.]+%?\s*)?\)$/i;

  function isJSON(text) {
    const first = text[0];
    const last = text[text.length - 1];
    const wrapped = (first === "{" && last === "}") || (first === "[" && last === "]");
    if (!wrapped) return false;
    try {
      const parsed = JSON.parse(text);
      return parsed !== null && typeof parsed === "object";
    } catch (e) {
      return false;
    }
  }

  // 列表每次渲染（搜索、筛选）都会识别全部记录，缓存结果避免反复 JSON.parse 大段文本
  const MAX_CACHE_SIZE = 2000;
  const cache = new Map();

  /**
   * @arg {string} value
   * @returns {"link" | "email" | "phone" | "color" | "json" | "text"}
   */
  function detect(value) {
    if (typeof value !== "string") return "text";
    if (cache.has(value)) return cache.get(value);
    const type = detectUncached(value);
    if (cache.size >= MAX_CACHE_SIZE) cache.delete(cache.keys().next().value);
    cache.set(value, type);
    return type;
  }

  function detectUncached(value) {
    const text = value.trim();
    if (text.length === 0 || text.length > MAX_DETECT_LENGTH) return "text";
    if (isJSON(text)) return "json";
    // 以下正则均为整串匹配且限制了空白，多行文本不会命中
    if (LINK.test(text)) return "link";
    if (EMAIL.test(text)) return "email";
    if (HEX_COLOR.test(text) || FUNC_COLOR.test(text)) return "color";
    if (PHONE_CN.test(text) || PHONE_INTL.test(text)) return "phone";
    return "text";
  }

  /**
   * @desc JSON 美化，非 JSON 返回 null
   */
  function prettyJSON(value) {
    try {
      return JSON.stringify(JSON.parse(value.trim()), null, 2);
    } catch (e) {
      return null;
    }
  }

  return { TYPES, detect, prettyJSON };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = ContentType;
}
