/**
 * 设置页：复制选项、历史记录（容量 / 过期 / 导入导出）、外观、语言
 * 依赖 I18n、HistoryStore、CopyFormatter，由 popup.js 调用 initSettingsPage
 */
const SETTINGS_DEFAULTS = {
  tooltip: true,
  background: "#51b362",
  color: "#FFFFFF",
  selectionBgColor: "#51b362",
  selectionTextColor: "#ffffff",
  contextMenu: true,
  ctrlCopy: false,
  passwordQuickView: true,
  cleanText: true,
  plainTextCopy: false,
  copyFormat: CopyFormatter.DEFAULT_FORMAT,
  historyMaxLength: HistoryStore.DEFAULT_SETTINGS.maxLength,
  historyExpireDays: HistoryStore.DEFAULT_SETTINGS.expireDays,
  language: I18n.AUTO,
};
const MAX_IMPORT_FILE_SIZE = 20 * 1024 * 1024;

/**
 * @arg {object} options
 * @arg {boolean} options.isTab 是否以标签页打开（文件选择框在 popup 中会导致 popup 关闭）
 * @arg {boolean} options.pendingImport 从 popup 跳转过来导入，需提示用户选择文件
 * @arg {(history: object[]) => void} options.onHistoryChange 历史数据被清理或导入后回调
 */
/* exported initSettingsPage */
function initSettingsPage({ isTab, pendingImport, onHistoryChange }) {
  const t = (key, subs) => I18n.t(key, subs);
  const esc = (str) => escapeHTML(str);

  const toggleRow = (name, labelKey) => `
    <label class="settings-row">
      <span class="settings-row__label">${t(labelKey)}</span>
      <span class="settings-toggle">
        <input type="checkbox" name="${name}" />
        <span class="settings-toggle__slider"></span>
      </span>
    </label>
  `;

  const selectRow = (name, labelKey, options) => `
    <label class="settings-row">
      <span class="settings-row__label">${t(labelKey)}</span>
      <select class="settings-select" name="${name}">
        ${options.map(({ value, label }) => `<option value="${esc(value)}">${esc(label)}</option>`).join("")}
      </select>
    </label>
  `;

  const colorField = (name, labelKey, defaultValue) => `
    <label class="color-field">
      <span class="color-field__label">${t(labelKey)}</span>
      <span class="color-field__picker">
        <input type="color" name="${name}" value="${defaultValue}" />
      </span>
    </label>
  `;

  const formatOptions = CopyFormatter.FORMATS.map((value) => ({ value, label: t(`copyFormat_${value}`) }));
  const maxLengthOptions = HistoryStore.MAX_LENGTH_OPTIONS.map((value) => ({
    value,
    label: t("historyMaxLengthOption", value),
  }));
  const expireOptions = HistoryStore.EXPIRE_DAYS_OPTIONS.map((value) => ({
    value,
    label: value === 0 ? t("expireNever") : t("expireDaysOption", value),
  }));
  const languageOptions = [
    { value: I18n.AUTO, label: t("languageAuto") },
    ...I18n.LANGUAGES.map(({ value, label }) => ({ value, label })),
  ];

  const optionsHTML = `
    <div class="auto_clipboard_options">
      <h1 class="popup_title"><span class="back" title="${t("back")}"></span>${t("setting")}</h1>
      <form id="optionForm" name="optionForm" class="settings-form">
        <section class="settings-section">
          <h3 class="settings-section__title">${t("operation")}</h3>
          <div class="settings-section__body">
            ${toggleRow("ctrlCopy", "ctrlCopy")}
            ${toggleRow("tooltip", "tooltip")}
            ${toggleRow("contextMenu", "contextMenu")}
            ${toggleRow("passwordQuickView", "passwordQuickView")}
            ${toggleRow("cleanText", "cleanText")}
            ${toggleRow("plainTextCopy", "plainTextCopy")}
            ${selectRow("copyFormat", "copyFormat", formatOptions)}
            <button type="button" class="settings-row settings-row--link" id="shortcutRow" title="${t("editShortcut")}">
              <span class="settings-row__label">${t("historyShortcut")}</span>
              <kbd class="settings-shortcut" id="shortcutKey"></kbd>
            </button>
          </div>
        </section>

        <section class="settings-section">
          <h3 class="settings-section__title">${t("historySection")}</h3>
          <div class="settings-section__body">
            ${selectRow("historyMaxLength", "historyMaxLength", maxLengthOptions)}
            ${selectRow("historyExpireDays", "historyExpireDays", expireOptions)}
            <p class="settings-hint">${t("historyPinnedHint")}</p>
            <div class="settings-row settings-row--actions">
              <span class="settings-row__label">${t("historyBackup")}</span>
              <span class="settings-actions">
                <button type="button" class="btn btn--ghost btn--small" id="exportHistory">${t("exportHistory")}</button>
                <button type="button" class="btn btn--ghost btn--small" id="importHistory">${t("importHistory")}</button>
                <input type="file" id="importFile" accept="application/json,.json" hidden />
              </span>
            </div>
            <p class="settings-status" id="dataStatus" role="status" aria-live="polite"></p>
          </div>
        </section>

        <section class="settings-section">
          <h3 class="settings-section__title">${t("color")}</h3>
          <div class="settings-section__body">
            <div class="color-group">
              <div class="color-group__fields">
                ${colorField("background", "messageBackground", SETTINGS_DEFAULTS.background)}
                ${colorField("color", "messageColor", SETTINGS_DEFAULTS.color)}
              </div>
              <div class="color-group__preview">
                <span class="color-group__preview-label">${t("preview")}</span>
                <span class="preview rightBottom" id="preview">
                  <svg class="preview-check" viewBox="0 0 13 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1.5 5L5 8.5L11.5 1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  ${t("copySuccess")}
                </span>
              </div>
            </div>

            <div class="color-group">
              <div class="color-group__fields">
                ${colorField("selectionBgColor", "selectionBgColor", SETTINGS_DEFAULTS.selectionBgColor)}
                ${colorField("selectionTextColor", "selectionTextColor", SETTINGS_DEFAULTS.selectionTextColor)}
              </div>
              <div class="color-group__preview">
                <span class="color-group__preview-label">${t("preview")}</span>
                <span class="preview preview--selection" id="selectionPreview">${t("selectionTextExample")}</span>
              </div>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h3 class="settings-section__title">${t("generalSection")}</h3>
          <div class="settings-section__body">
            ${selectRow("language", "language", languageOptions)}
          </div>
        </section>

        <div class="form_submit">
          <span class="option_tips">${t("saveSuccess")}</span>
          <button id="recover" type="reset" class="btn btn--ghost">${t("reset")}</button>
          <button id="submit" type="button" class="btn btn--primary">${t("save")}</button>
        </div>
      </form>
    </div>
  `;
  const optionsDOM = document.createElement("div");
  optionsDOM.className = "options_wrapper";
  optionsDOM.setAttribute("tabindex", "-1");
  optionsDOM.innerHTML = optionsHTML;
  document.body.appendChild(optionsDOM);

  const dq = (selector) => document.querySelector(selector);
  const form = dq("#optionForm");
  const preview = dq("#preview");
  const selectionPreview = dq("#selectionPreview");
  const tips = dq(".option_tips");
  const CHECKBOXES = ["ctrlCopy", "tooltip", "contextMenu", "passwordQuickView", "cleanText", "plainTextCopy"];
  const VALUES = ["background", "color", "selectionBgColor", "selectionTextColor", "copyFormat", "historyMaxLength", "historyExpireDays", "language"];

  const updatePreview = () => {
    preview.style.background = form.background.value;
    preview.style.color = form.color.value;
    selectionPreview.style.background = form.selectionBgColor.value;
    selectionPreview.style.color = form.selectionTextColor.value;
  };

  // 历史存储里的 ctrlCopy / tooltip / contextMenu 为 "on" 或 null，其余开关为布尔值
  const fill = (config) => {
    CHECKBOXES.forEach((name) => {
      form[name].checked = config[name] === true || config[name] === "on";
    });
    VALUES.forEach((name) => {
      form[name].value = String(config[name]);
    });
    updatePreview();
  };

  chrome.storage.sync.get([...CHECKBOXES, ...VALUES], (results) => {
    const config = { ...SETTINGS_DEFAULTS, ...(results || {}) };
    // 存储值不在选项中（如老版本数据）时回退默认值
    const normalizedHistory = HistoryStore.normalizeSettings(config);
    fill({
      ...config,
      copyFormat: CopyFormatter.normalizeFormat(config.copyFormat),
      historyMaxLength: normalizedHistory.maxLength,
      historyExpireDays: normalizedHistory.expireDays,
      language: I18n.getLanguage(),
    });
  });

  dq("#submit").addEventListener("click", async () => {
    const data = new FormData(form);
    await chrome.storage.sync.set({
      background: data.get("background"),
      color: data.get("color"),
      selectionBgColor: data.get("selectionBgColor"),
      selectionTextColor: data.get("selectionTextColor"),
      ctrlCopy: data.get("ctrlCopy"),
      tooltip: data.get("tooltip"),
      contextMenu: data.get("contextMenu"),
      passwordQuickView: form.passwordQuickView.checked,
      cleanText: form.cleanText.checked,
      plainTextCopy: form.plainTextCopy.checked,
      copyFormat: form.copyFormat.value,
      historyMaxLength: Number(form.historyMaxLength.value),
      historyExpireDays: Number(form.historyExpireDays.value),
      language: form.language.value,
    });
    // contextMenu 的菜单同步交给 background.js 监听 storage.onChanged 处理
    // popup 直接操作 contextMenus 会与 background 竞争，导致菜单闪烁
    // 容量 / 过期配置立即生效
    onHistoryChange(await HistoryStore.update((history) => history));
    tips.style.display = "inline-block";
    setTimeout(() => {
      tips.style.display = "none";
    }, 1500);
  });

  form.addEventListener("reset", (e) => {
    e.preventDefault();
    fill({ ...SETTINGS_DEFAULTS, language: form.language.value });
  });

  form.addEventListener("change", (e) => {
    if (["background", "color", "selectionBgColor", "selectionTextColor"].includes(e.target.name)) {
      updatePreview();
    }
  });

  // 快捷键只能在浏览器的快捷键页修改，这里展示当前值并提供跳转
  chrome.commands.getAll((commands) => {
    const command = commands.find((item) => item.name === "toggle-history-panel");
    dq("#shortcutKey").textContent = (command && command.shortcut) || t("shortcutNotSet");
  });
  dq("#shortcutRow").addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });

  initDataTransfer({ isTab, pendingImport, onHistoryChange, t });
}

/**
 * @desc 历史记录导出 / 导入
 */
function initDataTransfer({ isTab, pendingImport, onHistoryChange, t }) {
  const status = document.querySelector("#dataStatus");
  const fileInput = document.querySelector("#importFile");
  const showStatus = (text, variant = "success") => {
    status.textContent = text;
    status.dataset.variant = variant;
  };

  // 文件选择框必须由用户点击触发，无法自动打开
  if (isTab && pendingImport) {
    showStatus(t("importChooseFile"), "info");
    document.querySelector("#importHistory").focus();
  }

  document.querySelector("#exportHistory").addEventListener("click", async () => {
    const history = await HistoryStore.getAll();
    const json = JSON.stringify(HistoryStore.buildExport(history), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `auto-clipboard-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showStatus(t("exportSuccess", history.length));
  });

  document.querySelector("#importHistory").addEventListener("click", () => {
    if (isTab) {
      fileInput.click();
      return;
    }
    // popup 中打开文件选择框会让 popup 失焦关闭，改到标签页里操作
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?tab=1&page=settings&action=import") });
    window.close();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      showStatus(t("importTooLarge"), "error");
      return;
    }
    try {
      const { items, skipped } = HistoryStore.parseImport(await file.text());
      const importedValues = new Set(items.map((item) => item.value));
      const before = new Set((await HistoryStore.getAll()).map((item) => item.value));
      const next = await HistoryStore.update((history) => HistoryStore.mergeImport(history, items).history);
      // 以清理后实际保留下来的新记录计数（可能因容量上限被裁掉）
      const added = next.filter((item) => importedValues.has(item.value) && !before.has(item.value)).length;
      onHistoryChange(next);
      showStatus(t("importSuccess", [added, skipped]));
    } catch (e) {
      showStatus(t("importInvalid"), "error");
    }
  });
}
