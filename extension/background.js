const i18n = (key) => chrome.i18n.getMessage(key);

const BYPASS_SCRIPT_ID = "bypass";
const ICON_SIZES = [16, 24, 32, 48, 128];
const COLOR_ICON_PATH = ICON_SIZES.reduce((acc, size) => {
  acc[size] = "images/icon@128.png";
  return acc;
}, {});

let grayIconCache = null;

/**
 * 将彩色 icon 转为灰度 ImageData，缓存供 chrome.action.setIcon 使用
 * service worker 重启会丢缓存，下次调用时按需重新生成
 */
async function getGrayIcon() {
  if (grayIconCache) return grayIconCache;
  const response = await fetch(chrome.runtime.getURL("images/icon@128.png"));
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const result = {};
  for (const size of ICON_SIZES) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
      // 整体再降一点 alpha，让"禁用"视觉更弱
      data[i + 3] = Math.round(data[i + 3] * 0.6);
    }
    ctx.putImageData(imageData, 0, 0);
    result[size] = imageData;
  }
  grayIconCache = result;
  return grayIconCache;
}

async function getSyncState() {
  const { whitelist, pluginEnabled } = await chrome.storage.sync.get([
    "whitelist",
    "pluginEnabled",
  ]);
  return { whitelist: whitelist || {}, pluginEnabled };
}

function isOriginDisabledBy(state, origin) {
  if (state.pluginEnabled === "off") return true;
  if (!origin) return false;
  return !!state.whitelist[origin];
}

function safeOrigin(url) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch (e) {
    return null;
  }
}

async function updateActionIcon(tabId, url, state) {
  if (typeof tabId !== "number") return;
  const syncState = state || (await getSyncState());
  const origin = safeOrigin(url);
  // 非 http(s) 页面（chrome://、about: 等）按全局开关判断即可
  const disabled = isOriginDisabledBy(syncState, origin);
  try {
    if (disabled) {
      const grayIcon = await getGrayIcon();
      await chrome.action.setIcon({ tabId, imageData: grayIcon });
    } else {
      await chrome.action.setIcon({ tabId, path: COLOR_ICON_PATH });
    }
  } catch (e) {
    // tab 已关闭或权限不足，忽略
  }
}

async function refreshAllTabIcons() {
  const state = await getSyncState();
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) => updateActionIcon(tab.id, tab.url, state))
  );
}

/**
 * origin 转 match pattern 用于 excludeMatches
 * 注意：match pattern 不支持端口，带非默认端口的 origin 会落空
 * 这是 Chrome 的限制，无解，需向用户说明
 */
function originToMatchPattern(origin) {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch (e) {
    return null;
  }
}

async function buildExcludeMatches(state) {
  const whitelist = (state || (await getSyncState())).whitelist;
  return Object.keys(whitelist)
    .filter((origin) => whitelist[origin])
    .map(originToMatchPattern)
    .filter(Boolean);
}

async function registerBypassScript() {
  const excludeMatches = await buildExcludeMatches();
  const config = {
    id: BYPASS_SCRIPT_ID,
    matches: ["<all_urls>"],
    // 始终传入完整数组，避免 updateContentScripts 保留旧 excludeMatches 导致站点解除禁用后仍被排除
    excludeMatches,
    allFrames: true,
    js: ["bypass.js"],
    runAt: "document_start",
    world: "MAIN",
  };

  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({
      ids: [BYPASS_SCRIPT_ID],
    });
    if (existing && existing.length) {
      await chrome.scripting.updateContentScripts([config]);
    } else {
      await chrome.scripting.registerContentScripts([config]);
    }
  } catch (e) {
    // 兜底
    try {
      await chrome.scripting.registerContentScripts([config]);
    } catch (e2) {}
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
  const { pluginEnabled } = await getSyncState();
  if (pluginEnabled === "off") {
    await unregisterBypassScript();
  } else {
    await registerBypassScript();
  }
}

function createMenuIdempotent(id, title) {
  return new Promise((resolve) => {
    chrome.contextMenus.create({ id, title, contexts: ["all"] }, () => {
      // 已存在等错误吞掉，避免污染日志
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function removeMenuIfExists(id) {
  return new Promise((resolve) => {
    chrome.contextMenus.remove(id, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

/**
 * 幂等地确保右键菜单与当前配置一致
 *   - 不使用 removeAll：避免在用户右键瞬间菜单被清空再重建，造成菜单闪烁/消失
 *   - 旧版本 ID（auto_copy/disable_copy）做一次清理，防止残留
 */
async function ensureContextMenus() {
  const { contextMenu } = await chrome.storage.sync.get(["contextMenu"]);
  const enabled = contextMenu === "on" || contextMenu === undefined;

  // 清理历史遗留的旧菜单 ID
  await removeMenuIfExists("auto_copy");
  await removeMenuIfExists("disable_copy");

  if (!enabled) {
    await removeMenuIfExists("site_enable");
    await removeMenuIfExists("site_disable");
    return;
  }
  await createMenuIdempotent("site_enable", i18n("site_enable"));
  await createMenuIdempotent("site_disable", i18n("site_disable"));
}

// 监听插件开关 / 白名单 / 菜单开关变化，实时同步 bypass.js、菜单与图标
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "sync") return;
  if ("contextMenu" in changes) {
    await ensureContextMenus();
  }
  const touched = "pluginEnabled" in changes || "whitelist" in changes;
  if (!touched) return;
  if ("pluginEnabled" in changes) {
    if (changes.pluginEnabled.newValue === "off") {
      await unregisterBypassScript();
    } else {
      await registerBypassScript();
    }
  } else {
    // 白名单变化（pluginEnabled 不变）
    await registerBypassScript();
  }
  await refreshAllTabIcons();
});

// service worker 启动时同步一次（每次唤醒都跑，幂等的菜单创建保证菜单不丢）
syncBypassScript();
refreshAllTabIcons();
ensureContextMenus();

chrome.runtime.onInstalled.addListener(async () => {
  await syncBypassScript();
  await ensureContextMenus();
  await refreshAllTabIcons();
});

chrome.runtime.onStartup.addListener(async () => {
  await syncBypassScript();
  await ensureContextMenus();
  await refreshAllTabIcons();
});

chrome.contextMenus.onClicked.addListener(async ({ menuItemId, pageUrl }) => {
  const origin = safeOrigin(pageUrl);
  if (!origin) return;
  const { whitelist } = await getSyncState();

  if (menuItemId === "site_enable") {
    // 从白名单移除该 origin
    delete whitelist[origin];
    await chrome.storage.sync.set({ whitelist });
  } else if (menuItemId === "site_disable") {
    whitelist[origin] = true;
    await chrome.storage.sync.set({ whitelist });
  }
});

// tab 激活时刷新当前 tab 的图标
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await updateActionIcon(tabId, tab.url);
  } catch (e) {}
});

// 地址栏跳转或页面加载触发图标刷新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "loading") {
    updateActionIcon(tabId, tab.url);
  }
});
