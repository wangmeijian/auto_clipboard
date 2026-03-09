const i18n = (key) => chrome.i18n.getMessage(key);

const BYPASS_SCRIPT_ID = "bypass";

async function registerBypassScript() {
  try {
    await chrome.scripting.registerContentScripts([{
      id: BYPASS_SCRIPT_ID,
      matches: ["<all_urls>"],
      allFrames: true,
      js: ["bypass.js"],
      runAt: "document_start",
      world: "MAIN",
    }]);
  } catch (e) {
    // 已注册，忽略
  }
}

async function unregisterBypassScript() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [BYPASS_SCRIPT_ID] });
  } catch (e) {
    // 未注册，忽略
  }
}

async function syncBypassScript() {
  const { pluginEnabled } = await chrome.storage.sync.get(["pluginEnabled"]);
  if (pluginEnabled === "off") {
    await unregisterBypassScript();
  } else {
    await registerBypassScript();
  }
}

// 监听插件开关变化，实时同步 bypass.js 的注册状态
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !("pluginEnabled" in changes)) return;
  if (changes.pluginEnabled.newValue === "off") {
    unregisterBypassScript();
  } else {
    registerBypassScript();
  }
});

// service worker 启动时同步一次
syncBypassScript();

chrome.runtime.onInstalled.addListener(async () => {
  // 安装/更新时同步 bypass.js 注册状态
  await syncBypassScript();

  const results = await chrome.storage.sync.get(["contextMenu"]);

  if (results.contextMenu === "on") {
    chrome.contextMenus.create({
      id: "auto_copy",
      title: i18n("auto_copy"),
      contexts: ["all"],
    });

    chrome.contextMenus.create({
      id: "disable_copy",
      title: i18n("disable_copy"),
      contexts: ["all"],
    });
  }
});

chrome.contextMenus.onClicked.addListener(async ({ menuItemId, pageUrl }) => {
  // 不自动复制文本的站点
  const whitehost = ((await chrome.storage.sync.get(["whitelist"])) ?? {})[
    "whitelist"
  ] ?? {};
  const currenthost = new URL(pageUrl).origin;

  if (menuItemId === "auto_copy") {
    // 域名从白名单移除
    whitehost[currenthost] = undefined;
    chrome.storage.sync.set({whitelist: whitehost});
  } else if (menuItemId === "disable_copy") {
    // 站点域名加入白名单
    whitehost[currenthost] = true;
    chrome.storage.sync.set({whitelist: whitehost});
  }
});
