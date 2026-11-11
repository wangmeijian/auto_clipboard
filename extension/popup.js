const i18n = (key, substitutions) => I18n.t(key, substitutions);

const escapeHTML = (str = "") =>
  String(str).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

class Popup {
  constructor() {
    this._history = [];
    this._timer = null;
    // 当前类型筛选：all 或 ContentType.TYPES 之一
    this._typeFilter = "all";
    const params = new URLSearchParams(location.search);
    // 以标签页打开（导入历史时），而非工具栏 popup
    this._isTab = params.get("tab") === "1";
    this._params = params;
    this._initPage();
  }
  /**
   * @desc 生成页面
   */
  async _initPage() {
    await I18n.init().catch(() => {});
    // 切换语言后整页重新渲染，并停留在设置页（语言是在设置页里切换的）
    I18n.onChange(() => {
      const params = new URLSearchParams(location.search);
      params.set("page", "settings");
      location.search = params.toString();
    });
    const [history, settings, syncStorage] = await Promise.all([
      HistoryStore.getAll(),
      HistoryStore.getSettings(),
      chrome.storage.sync.get(["pluginEnabled"]),
    ]);
    this._history = HistoryStore.prune(history, settings);
    // 打开时顺带清理过期记录
    if (this._history.length !== history.length) {
      HistoryStore.save(this._history);
    }

    document.documentElement.lang = I18n.getLocale();
    document.body.classList.toggle("is-tab", this._isTab);
    const isPluginEnabled = syncStorage.pluginEnabled !== "off";
    const popupPageHTML = `
      <div class="popup">
        <h1 class="popup_title">
          ${i18n("popupTitle")}
          <span class="setting"></span>
          <span class="plugin-toggle${isPluginEnabled ? " on" : ""}" title="${i18n("togglePlugin")}"></span>
        </h1>
        <input class="search_history" id="searchHistory" placeholder="${i18n(
          "searchHistory"
        )}" />
        <div class="type_filter" role="radiogroup" aria-label="${i18n("typeFilter")}">
          ${["all", ...ContentType.TYPES]
            .map(
              (type) =>
                `<button type="button" class="type_filter__item${type === "all" ? " active" : ""}" role="radio" aria-checked="${type === "all"}" data-type="${type}">${i18n(`type_${type}`)}</button>`
            )
            .join("")}
        </div>
        <div class="copy_history">
          ${this._buildHistoryHTML()}
        </div>
        <div class="footer">
          <div class="donate-wrap"><span class="donate"></span> ${i18n(
            "donate"
          )}</div> |
          <a class="github-wrap" href="https://github.com/wangmeijian/auto_clipboard" target="_blank"><span class="github"></span> ${i18n(
            "contribute"
          )}</a>
        </div>
        <div class="copy_success">
          <svg class="cs-check" viewBox="0 0 13 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1.5 5L5 8.5L11.5 1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>${i18n("copySuccess")}</span>
        </div>
      </div>
    `;
    const popupPageDOM = document.createElement("div");
    popupPageDOM.classList = 'wrapper'
    popupPageDOM.innerHTML = popupPageHTML;
    document.body.appendChild(popupPageDOM);

    initSettingsPage({
      isTab: this._isTab,
      pendingImport: this._params.get("action") === "import",
      onHistoryChange: (next) => {
        this._history = next;
        this._reload();
      },
    });
    this._addEventListener();
    this._initQrcode();
    this._watchHistory();
    if (this._params.get("page") === "settings") this._toggleOverlay(".options_wrapper", true);
  }
  // 初始化打赏二维码
  _initQrcode() {
    const html = `
      <div class="qrcode_content">
        <h1 class="popup_title"><span class="qrcode_back"></span>${i18n("thank_you")}</h1>
        <div class="qrcode"></div>
      </div>
    `
    const qrcodeDom = document.createElement("div");
    qrcodeDom.className = "qrcode_wrapper";
    qrcodeDom.setAttribute("tabindex", "-1");
    qrcodeDom.innerHTML = html;
    document.body.appendChild(qrcodeDom);
  }
  /**
   * @desc popup 打开期间页面上又复制了内容，实时刷新列表
   */
  _watchHistory() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !(HistoryStore.KEY in changes)) return;
      this._history = (changes[HistoryStore.KEY].newValue || []).map(HistoryStore.normalize);
      this._reload();
    });
  }
  /**
   * @desc 当前搜索词 + 类型筛选后的记录，保留在 this._history 中的下标
   */
  _getVisibleItems() {
    const searchInput = document.querySelector("#searchHistory");
    const keyword = searchInput ? searchInput.value : "";
    return this._history
      .map((item, index) => ({ item, index, type: ContentType.detect(item.value) }))
      .filter(({ type }) => this._typeFilter === "all" || type === this._typeFilter)
      .filter(({ item }) => HistoryStore.matchesKeyword(item, keyword));
  }
  /**
   * @desc 生成历史记录
   * @returns HTMLElement
   */
  _buildHistoryHTML() {
    const visible = this._getVisibleItems();
    if (visible.length === 0)
      return `<div class="empty">${i18n("historyEmpty")}</div>`;
    const includeCode = /<[^>]+>/;

    return (
      visible
        .map(({ item, index, type }) => {
          const result = includeCode.test(item.value)
            ? this._renderCode(item.value, index)
            : `<a class="click_target" title="${escapeHTML(item.value)}" href="#" dindex="${index}">${escapeHTML(item.value)}</a>`;

          return `<span class="copy_item stick">
          <span class="action_item stick_item ${
            item.topping ? "topping" : ""
          }" title="${
            item.topping ? i18n("cancelStick") : i18n("stick")
          }" dindex="${index}"></span>
          <span class="copy_item__main">
            ${result}
            ${this._buildMetaHTML(item, index, type)}
          </span>
          <span class="action_item delete_item" title="${i18n(
            "delete"
          )}" dindex="${index}"></span>
        </span>`;
        })
        .join("") + `<div class="privacy">${i18n("privacy")}</div>`
    );
  }

  /**
   * @desc 类型标签 + 来源（favicon + 域名）+ 相对时间；JSON 额外提供「格式化复制」
   */
  _buildMetaHTML(item, index, type) {
    const parts = [];
    if (type !== "text") {
      // color 类型已经过 ContentType 严格校验，只含颜色语法字符，可安全写入 style
      const swatch = type === "color" ? `<span class="color_swatch" style="background:${escapeHTML(item.value.trim())}"></span>` : "";
      parts.push(`<span class="type_tag type_tag--${type}">${swatch}${i18n(`type_${type}`)}</span>`);
    }
    const source = item.source;
    if (source) {
      const favicon = `${chrome.runtime.getURL("/_favicon/")}?pageUrl=${encodeURIComponent(source.url)}&size=16`;
      const tooltip = [source.title, source.url].filter(Boolean).join("\n");
      parts.push(`<a class="source_link" href="#" data-url="${escapeHTML(source.url)}" title="${escapeHTML(tooltip)}">
        <img class="source_favicon" src="${escapeHTML(favicon)}" alt="" width="12" height="12" />
        <span class="source_host">${escapeHTML(HistoryStore.getHostname(source.url))}</span>
      </a>`);
    }
    const time = HistoryStore.formatRelativeTime(item.time, I18n.getLocale());
    if (time) parts.push(`<span class="source_time">${escapeHTML(time)}</span>`);
    if (type === "json") {
      parts.push(`<button type="button" class="json_format" dindex="${index}">${i18n("formatJSON")}</button>`);
    }
    return parts.length ? `<span class="copy_item__meta">${parts.join("")}</span>` : "";
  }

  _renderCode(str = "", index) {
    let div = document.createElement("div");
    let textNode = document.createTextNode(str);
    div.append(textNode);

    return `
      <pre title=${div.innerHTML.replace(/\s/g, "&nbsp;")}>
        <code><a class="click_target" href="#" dindex="${index}">${div.innerHTML}</a></code>
      </pre>
    `;
  }
  /**
   * @desc 复制文本并提示
   */
  async _copyText(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      return;
    }
    const messageEle = document.querySelector(".copy_success");
    const config = await chrome.storage.sync.get(["background", "color"]);
    messageEle.style.background = config.background || "#51b362";
    messageEle.style.color = config.color || "#ffffff";
    messageEle.classList.remove('cs-hiding', 'cs-visible');
    void messageEle.offsetWidth;
    messageEle.classList.add('cs-visible');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      messageEle.classList.add('cs-hiding');
      messageEle.addEventListener('animationend', () => {
        messageEle.classList.remove('cs-visible', 'cs-hiding');
      }, { once: true });
      this._timer = null;
    }, 1500);
  }

  _itemAt(target) {
    const index = Number(target.getAttribute("dindex"));
    return Number.isInteger(index) ? this._history[index] : undefined;
  }

  /**
   * @desc 删除：基于存储中的最新数据按内容删除，避免覆盖 popup 打开后新增的记录
   */
  async _delete(item) {
    this._history = await HistoryStore.update((history) =>
      history.filter((entry) => entry.value !== item.value)
    );
    this._reload();
  }

  /**
   * @desc 置顶 / 取消置顶：置顶放到最前，取消置顶放到剩余置顶记录之后
   */
  async _toggleTopping(item) {
    this._history = await HistoryStore.update((history) => {
      const current = history.find((entry) => entry.value === item.value);
      if (!current) return history;
      const toggled = { ...current, topping: !current.topping };
      const rest = history.filter((entry) => entry.value !== item.value);
      const pinned = rest.filter((entry) => entry.topping);
      const others = rest.filter((entry) => !entry.topping);
      return toggled.topping ? [toggled, ...pinned, ...others] : [...pinned, toggled, ...others];
    });
    this._reload();
  }

  _toggleOverlay(selector, open) {
    const wrap = document.querySelector(selector);
    if (open) {
      wrap.classList.add("open");
      wrap.focus();
    } else {
      wrap.classList.remove("open");
    }
  }

  _setTypeFilter(type) {
    this._typeFilter = type;
    document.querySelectorAll(".type_filter__item").forEach((button) => {
      const active = button.dataset.type === type;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
    this._reload();
  }

  /**
   * @desc 事件绑定
   */
  _addEventListener() {
    // favicon 加载失败时隐藏（error 事件不冒泡，需捕获）
    document.addEventListener(
      "error",
      (e) => {
        if (e.target.classList && e.target.classList.contains("source_favicon")) {
          e.target.style.visibility = "hidden";
        }
      },
      true
    );

    window.addEventListener("click", (e) => {
      const target = e.target.closest ? e.target : e.target.parentElement;
      if (!target) return;
      const closest = (selector) => target.closest(selector);

      // 点击来源回到原页面，只允许 http(s)
      const link = closest(".source_link");
      if (link) {
        e.preventDefault();
        const url = link.dataset.url;
        if (HistoryStore.sanitizeSource({ url })) chrome.tabs.create({ url });
        return;
      }
      const filterButton = closest(".type_filter__item");
      if (filterButton) return this._setTypeFilter(filterButton.dataset.type);

      const jsonButton = closest(".json_format");
      if (jsonButton) {
        const item = this._itemAt(jsonButton);
        if (item) this._copyText(ContentType.prettyJSON(item.value));
        return;
      }
      // 点击复制原始内容（而不是选中 DOM 文本），保留换行
      const clickTarget = closest(".click_target");
      if (clickTarget) {
        e.preventDefault();
        const item = this._itemAt(clickTarget);
        if (item) this._copyText(item.value);
        return;
      }

      const classList = target.classList;
      if (classList.contains("delete_item")) {
        const item = this._itemAt(target);
        if (item) this._delete(item);
      } else if (classList.contains("stick_item")) {
        const item = this._itemAt(target);
        if (item) this._toggleTopping(item);
      } else if (classList.contains("setting")) {
        this._toggleOverlay(".options_wrapper", true);
      } else if (classList.contains("back")) {
        this._toggleOverlay(".options_wrapper", false);
      } else if (classList.contains("donate-wrap") || classList.contains("donate")) {
        this._toggleOverlay(".qrcode_wrapper", true);
      } else if (classList.contains("qrcode_back")) {
        this._toggleOverlay(".qrcode_wrapper", false);
      } else if (classList.contains("plugin-toggle")) {
        const isOn = classList.toggle("on");
        chrome.storage.sync.set({ pluginEnabled: isOn ? "on" : "off" });
      }
    });
    // 回车复制
    window.addEventListener("keyup", (e) => {
      const code = e.code || e.key;
      if (code !== "Enter" || !e.target.classList.contains("copy_item")) return;
      const item = this._itemAt(e.target.querySelector(".click_target"));
      if (item) this._copyText(item.value);
    });
    // 过滤
    window.addEventListener("input", (e) => {
      if (e.target.id === "searchHistory") this._reload();
    });
  }
  /**
   * 刷新列表
   */
  _reload() {
    document.querySelector(".copy_history").innerHTML = this._buildHistoryHTML();
  }
}

new Popup();
