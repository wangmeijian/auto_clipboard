const test = require("node:test");
const assert = require("node:assert/strict");
const Theme = require("../extension/theme.js");

const DARK = "(prefers-color-scheme: dark)";

// 最小化的 CSSMediaRule / CSSStyleRule 模拟
const mediaRule = (mediaText, cssRules = []) => ({ media: { mediaText }, cssRules });
const styleRule = () => ({ selectorText: ".a" });
const sheet = (...cssRules) => ({ cssRules });

test("normalize：只接受 auto / light / dark，其余回退 auto", () => {
  assert.equal(Theme.normalize("dark"), "dark");
  assert.equal(Theme.normalize("light"), "light");
  assert.equal(Theme.normalize("auto"), "auto");
  assert.equal(Theme.normalize("blue"), "auto");
  assert.equal(Theme.normalize(undefined), "auto");
});

test("applyToSheet：dark 让暗色规则恒生效，light 让其恒不生效", () => {
  const rule = mediaRule(DARK);
  const s = sheet(styleRule(), rule);
  Theme.applyToSheet(s, "dark");
  assert.equal(rule.media.mediaText, "all");
  Theme.applyToSheet(s, "light");
  assert.equal(rule.media.mediaText, "not all");
});

test("applyToSheet：auto 还原为原始媒体查询，可反复切换", () => {
  const rule = mediaRule(DARK);
  const s = sheet(rule);
  Theme.applyToSheet(s, "dark");
  Theme.applyToSheet(s, "light");
  Theme.applyToSheet(s, "auto");
  assert.equal(rule.media.mediaText, DARK);
});

test("applyToSheet：只处理暗色媒体查询，不碰其他 @media", () => {
  const motion = mediaRule("(prefers-reduced-motion: reduce)");
  const print = mediaRule("print");
  Theme.applyToSheet(sheet(motion, print), "dark");
  assert.equal(motion.media.mediaText, "(prefers-reduced-motion: reduce)");
  assert.equal(print.media.mediaText, "print");
});

test("applyToSheet：嵌套在其他规则里的暗色查询也会处理", () => {
  const inner = mediaRule(DARK);
  const outer = mediaRule("screen", [inner]);
  Theme.applyToSheet(sheet(outer), "light");
  assert.equal(inner.media.mediaText, "not all");
});

test("applyToSheet：读取 cssRules 抛错（跨域样式表）时不影响其他样式表", () => {
  const blocked = {
    get cssRules() {
      throw new Error("SecurityError");
    },
  };
  assert.doesNotThrow(() => Theme.applyToSheet(blocked, "dark"));
  assert.doesNotThrow(() => Theme.applyToSheet(null, "dark"));
});

test("colorSchemeFor：auto 返回空串交还给浏览器，其余原样返回", () => {
  assert.equal(Theme.colorSchemeFor("auto"), "");
  assert.equal(Theme.colorSchemeFor("dark"), "dark");
  assert.equal(Theme.colorSchemeFor("light"), "light");
});

test("track：登记的样式在切换主题时被应用，已移除的节点被清理", () => {
  const rule = mediaRule(DARK);
  const el = { sheet: sheet(rule), isConnected: true };
  const gone = { sheet: sheet(mediaRule(DARK)), isConnected: true };
  Theme.track(el);
  Theme.track(gone);
  gone.isConnected = false;
  Theme.set("dark");
  assert.equal(rule.media.mediaText, "all");
  assert.equal(gone.sheet.cssRules[0].media.mediaText, DARK);
  Theme.set("auto");
  assert.equal(rule.media.mediaText, DARK);
});

test("track：登记时若已选定主题，立即应用", () => {
  Theme.set("light");
  const rule = mediaRule(DARK);
  Theme.track({ sheet: sheet(rule), isConnected: true });
  assert.equal(rule.media.mediaText, "not all");
  Theme.set("auto");
});
