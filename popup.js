const i18n = (key) => chrome.i18n.getMessage(key);

class Popup {
  constructor() {
    this._STORAGE_KEY = "auto_clipboard_history";
    this._history = [];
    this._timer = null;
    this._initPage();
  }
  /**
   * @desc 生成页面
   */
  async _initPage() {
    const storageKey = this._STORAGE_KEY;
    const historyStorage = await chrome.storage.local.get([storageKey]);
    this._history = historyStorage[storageKey] || [];
    const historyHTML = this._buildHistoryHTML();
    const optionsHTML = `
      <div class="popup">
        <h1 class="popup_title">${i18n("popupTitle")}</h1>
        <input class="search_history" placeholder="${i18n("searchHistory")}" />
        <div class="copy_history">
          ${historyHTML}
        </div>
        <div class="copy_success">${i18n("copySuccess")}</div>
      </div>
    `;
    const optionsDOM = document.createElement("div");
    optionsDOM.innerHTML = optionsHTML;
    document.body.appendChild(optionsDOM);
    this._addEventListener();
  }
  /**
   * @desc 生成历史记录
   * @returns HTMLElement
   */
  _buildHistoryHTML(filterString = "") {
    if (this._history.length === 0) return `<div class="empty">${i18n("historyEmpty")}</div>`;
    filterString = filterString.trim().toLowerCase();

    return this._history
      .filter((item) => {
        return filterString.length > 0
          ? item.toLowerCase().includes(filterString)
          : true;
      })
      .map((item, index) => {
        return `<span class="copy_item stick">
          <a class="click_target" title="${item}" href="#">${item}</a>
          <span class="action_item delete_item" title="${i18n(
            "delete"
          )}" dindex="${index}"></span>
          <span class="action_item stick_item" title="${i18n(
            "stick"
          )}" dindex="${index}"></span>
        </span>`;
      })
      .join("") + `<span class="privacy">${i18n("privacy")}</span>`;
  }
  /**
   * @desc 复制
   */
  _copy() {
    Popup.copySelectedText()
      .then(() => {
        const messageEle = document.querySelector(".copy_success");
        window.getSelection().removeAllRanges();
        messageEle.style.display = "block";
        clearTimeout(this._timer);
        this._timer = setTimeout(() => {
          messageEle.style.display = "none";
        }, 1500);
      })
      .catch((error) => {});
  }

  /**
   * @desc 事件绑定
   */
  _addEventListener() {
    // 点击自动复制
    window.addEventListener(
      "click",
      (e) => {
        if (e.target.className === "click_target") {
          this._selectText(e.target);
          this._copy();
        }
      },
      false
    );
    // 删除记录
    window.addEventListener(
      "click",
      (e) => {
        if (e.target.className.split(/\s+/).indexOf("delete_item") > -1) {
          const index = e.target.getAttribute("dindex");
          if (typeof index === undefined) return;
          this._history.splice(index, 1);
          chrome.storage.local.set({
            [this._STORAGE_KEY]: this._history,
          });
          // 刷新页面
          this._reload();
        }
      },
      false
    );
    // 回车自动复制
    window.addEventListener("keyup", (e) => {
      const code = e.code || e.key;
      
      if (code === "Enter" && e.className.split(/\s+/).indexOf("copy_item") > -1) {
        this._selectText(e.target.querySelector(".click_target"));
        this._copy();
      }
    });
    // 过滤
    window.addEventListener("input", (e) => {
      if (e.target.className === "search_history") {
        const searchKey = e.target.value.trim();
        this._reload(searchKey);
      }
    });
  }
  /**
   * 刷新页面
   */
  _reload(filterString = "") {
    const historyHTML = this._buildHistoryHTML(filterString);
    document.querySelector(".copy_history").innerHTML = historyHTML;
  }
  /**
   * @desc 选中要复制的文本
   */
  _selectText(element) {
    if (!element) return;
    const range = document.createRange();
    const selection = window.getSelection();

    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  /**
   * @desc 复制选中的文本
   * @returns Promise
   */
  static copySelectedText() {
    const selectedText = window.getSelection().toString();
    if (!selectedText || selectedText?.length === 0) return Promise.reject();
    // 仅在https下可用
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(selectedText);
    } else {
      return new Promise((resolve, reject) => {
        document.execCommand("copy") ? resolve() : reject();
      });
    }
  }
}

new Popup();
