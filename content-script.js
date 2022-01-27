const i18n = (key) => chrome.i18n.getMessage(key);

class AutoClipboard {
  constructor() {
    // chrome.storage.local 最大容量为5M，即5242880字节
    // 最多存储条数
    this._MAX_HISTORY_LENGTH = 100;
    // 单条数据最大字符数
    this._MAX_ITEM_LENGTH = 10000;
    this.message = null;
    this.selectedText = "";
    this._init();
  }
  /**
   * @desc 初始化提示语颜色
   */
  _init() {
    this._getStorage().then((config) => {
      this._createMessage(config.background, config.color);
    });
    this._addActionListener();
  }

  /**
   * @desc 获取配置
   * @returns Promise
   */
  _getStorage() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(["background", "color"], (config) => {
        config ? resolve(config) : reject({});
      });
    });
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
  /**
   * @desc 提示框
   * @arg {string} background 背景色
   * @arg {string} color 字体颜色
   * @returns {HTMLElement} HTMLElement
   */
  _createMessage(background = "#51b362", fontColor = "white") {
    const message = document.createElement("div");
    message.id = "autoClipboardMessage";
    message.setAttribute(
      "style",
      `
      width: 100px;
      height: 30px;
      text-align: center;
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 9999999;
      border-radius: 4px;
      font-size: 14px;
      line-height: 30px;
      margin: 0;
      padding: 0;
      background: ${background};
      color: ${fontColor};
    `
    );
    message.setAttribute("draggable", true);
    message.innerText = i18n("copySuccess");
    message.style.display = "none";
    document.body && document.body.appendChild(message);
    this.message = message;
    this._addDragListener();
    return message;
  }
  /**
   * @desc 更新Message样式
   * @style CSSStyleDeclaration
   */
  _updateMessageStyle(style) {
    if (!this.message) return;
    Object.keys(style).forEach((key) => {
      if (key in this.message.style) {
        this.message.style[key] = style[key];
      }
    });
  }
  /**
   * @desc 监听事件回调
   */
  _handleAction(e) {
    // 要复制输入框内容，需按下ctrl键（Mac上为command键）
    if (
      e &&
      !e.metaKey &&
      ["input", "textarea"].includes(
        document.activeElement.nodeName.toLowerCase()
      )
    )
      return;
    AutoClipboard.copySelectedText()
      .then(() => {
        this.selectedText = window.getSelection().toString();
        this._setMessageHistory(this.selectedText);

        chrome.storage.local.get(["background", "color"], (historyStorage) => {
          this._updateMessageStyle({
            ...historyStorage,
            display: "block",
          });
          this.timer = setTimeout(() => {
            this._updateMessageStyle({
              display: "none",
            });
            this.timer = null;
          }, 2000);
        });
      })
      .catch(() => {});
  }
  /**
   * @desc 设置历史记录
   */
  async _setMessageHistory(text = "") {
    if (typeof text !== "string" || text.length === 0) return;
    // 限制字符长度
    if (text.length > this._MAX_ITEM_LENGTH) {
      text = text.slice(0, this._MAX_ITEM_LENGTH);
    }
    const STORAGE_KEY = "auto_clipboard_history";
    let historyStorage = await chrome.storage.local.get([STORAGE_KEY]);
    let historysMerge = [];
    // 更新
    const updateMessageHistory = () => {
      // 复制的内容和历史记录中某条重复，将其位置放到第一位
      if (historyStorage[STORAGE_KEY].includes(text)) {
        const index = historyStorage[STORAGE_KEY].findIndex(
          (item) => item === text
        );
        historyStorage[STORAGE_KEY].splice(index, 1);
      }
      historyStorage[STORAGE_KEY].splice(0, 0, text);
      historysMerge = historyStorage[STORAGE_KEY];
      // 限制容量为this._MAX_HISTORY_LENGTH
      if (historysMerge.length > this._MAX_HISTORY_LENGTH) {
        historysMerge.length = this._MAX_HISTORY_LENGTH;
      }
    };

    // 已有历史记录 ? 更新历史记录 : 设置历史记录
    historyStorage[STORAGE_KEY]
      ? updateMessageHistory()
      : (historysMerge = [text]);
    chrome.storage.local.set({
      [STORAGE_KEY]: historysMerge,
    });
  }
  /**
   * @desc 组合键
   * @arg {Event} event 事件对象
   */
  _combinationKey(event) {
    const keys = [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
    ];
    const actionKey = event.key;

    // 按住shift组合键和上下左右或Home或End键，来选择文本
    if (event.shiftKey && keys.includes(actionKey)) {
      this._handleAction(event);
    }
  }
  /**
   * @desc 事件绑定
   */
  _addActionListener() {
    document.addEventListener("dblclick", this._handleAction.bind(this));
    document.addEventListener("keyup", this._combinationKey.bind(this));
    document.addEventListener("mouseup", (e) => {
      setTimeout(this._handleAction.bind(this, e), 0);
    });
  }

  /**
   * @desc 拖动
   */
  _addDragListener() {
    if (!this.message) return;
    this.message.addEventListener("dragstart", (e) => {
      clearTimeout(this.timer);
    });
    this.message.addEventListener("dragend", (e) => {
      console.log(e);
      this._updateMessageStyle({
        left: `${e.clientX}px`,
        right: `${e.clientY}px`,
      });
    });
  }
}

new AutoClipboard();
