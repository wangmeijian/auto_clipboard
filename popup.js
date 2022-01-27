const i18n = (key) => chrome.i18n.getMessage(key);

class Popup {
  constructor() {
    this._STORAGE_KEY = 'auto_clipboard_history';
    this._history = [];
    this._initPage();
    this._addEventListener();
    this._timer = null;
  }
  /**
   * @desc 生成页面
   */
  async _initPage() {
    const storageKey = this._STORAGE_KEY;
    const historyStorage = await chrome.storage.sync.get([storageKey]);
    this._history = historyStorage[storageKey] || [];
    const historyHTML = this._buildHistoryHTML();
    const optionsHTML = `
      <div class="popup">
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
  }
  /**
   * @desc 生成历史记录
   * @returns HTMLElement
   */
  _buildHistoryHTML(){
    if(this._history.length === 0) return i18n("historyEmpty");
    return this._history
      .map((item, index) => {
        return `<a class="copy_item" href="#">
          <span class="click_target">${item}</span>
          <span class="delete_item" dindex="${index}"></span>
        </a>`;
      })
      .join("");
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
        console.log(e.target.className);
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
        if (e.target.className === "delete_item") {
          const index = e.target.getAttribute('dindex');
          if(typeof index === undefined)return;
          this._history.splice(index, 1);
          chrome.storage.sync.set({
            [this._STORAGE_KEY]: this._history
          })
          // 刷新页面
          const historyHTML = this._buildHistoryHTML();
          document.querySelector('.copy_history').innerHTML = historyHTML;
        }
      },
      false
    );
    // 回车自动复制
    window.addEventListener("keyup", (e) => {
      const code = e.code || e.key;
      if (code === "Enter" && e.target.className === "copy_item") {
        this._selectText(e.target.querySelector(".click_target"));
        this._copy();
      }
    });
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
