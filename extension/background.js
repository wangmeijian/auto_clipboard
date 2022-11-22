chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "auto_copy",
    title: "自动复制本站内容",
    contexts: ["all"],
  });

  chrome.contextMenus.create({
    id: "disable_copy",
    title: "不要自动复制本站内容",
    contexts: ["all"],
  });
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
