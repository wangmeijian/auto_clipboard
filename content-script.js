const i18n = (key) => chrome.i18n.getMessage(key);

class AutoClipboard {
  constructor() {
    // chrome.storage.local 最大容量为5M，即5242880字节
    // 最多存储条数
    this._MAX_HISTORY_LENGTH = 100;
    // 单条数据最大字符数
    this._MAX_ITEM_LENGTH = 10000;
    // message宽高
    this.MESSAGE_WIDTH = 100;
    this.MESSAGE_HEIGHT = 30;
    this.MESSAGE_MARGING = 20;
    this.selectedText = "";
    this.timer = null;
    this.message = null;
    this._init();
  }

  /**
   * @desc 初始化提示语颜色
   */
  _init() {
    this._getStorage().then((config) => {
      this._createMessage(
        config.background,
        config.color,
        config.messagePosition
      );
    });
    this._addActionListener();
  }

  _getMessageBoundaryPosition() {
    return {
      left: document.documentElement.clientWidth - this.MESSAGE_WIDTH,
      top: document.documentElement.clientHeight - this.MESSAGE_HEIGHT,
    };
  }

  /**
   * @desc 获取配置
   * @returns Promise
   */
  _getStorage() {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(
        ["background", "color", "messagePosition"],
        (config) => {
          config ? resolve(config) : reject({});
        }
      );
    });
  }
  /**
   * @desc 复制选中的文本
   * @returns Promise
   */
  static copySelectedText() {
    const selectedText = window.getSelection().toString();

    if (!selectedText || selectedText?.trim().length === 0)
      return Promise.reject();
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
  _createMessage(
    background = "#51b362",
    fontColor = "white",
    position = {
      left: this._getMessageBoundaryPosition().left - this.MESSAGE_MARGING,
      top: this._getMessageBoundaryPosition().top - this.MESSAGE_MARGING,
    }
  ) {
    // 创建影子DOM
    const message = document
      .createElement("ac-message")
      .attachShadow({ mode: "closed" });
    const content = document.createElement("div");
    const contentStyle = document.createElement("style");
    content.id = "autoClipboardMessage";
    content.className = "ac-message";
    content.innerText = i18n("copySuccess");

    contentStyle.innerText = `
      .ac-message{
        width: ${this.MESSAGE_WIDTH}px;
        height: ${this.MESSAGE_HEIGHT}px;
        text-align: center;
        position: fixed;
        left: ${position.left}px;
        top: ${position.top}px;
        z-index: 9999999;
        border-radius: 4px;
        font-size: 14px;
        line-height: ${this.MESSAGE_HEIGHT}px;
        margin: 0;
        padding: 0;
        cursor: move;
        box-shadow: rgba(0,0,0,0.2) 0 5px 15px;
        background: ${background};
        color: ${fontColor};
        display: none;
      }
      .ac-message:hover{
        box-shadow: rgba(0,0,0,0.4) 0 5px 15px;
      }
    `;

    message.appendChild(content);
    message.appendChild(contentStyle);
    document.body && document.body.appendChild(message.host);
    this.message = content;
    this._addDragListener();
    return message;
  }
  /**
   * @desc 更新Message样式
   * @style CSSStyleDeclaration
   */
  async _updateMessageStyle(style) {
    // 不存在则重新创建
    if (!document.querySelector('ac-message')) {
      await this._getStorage().then((config) => {
        this._createMessage(
          config.background,
          config.color,
          config.messagePosition
        );
      });
    };
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
    // 是否普通输入框
    const isInputActive = ["input", "textarea"].includes(
      document.activeElement.nodeName.toLowerCase()
    );
    // 是否富文本编辑器
    const isRichTextEditor = () => {
      const activeElement = document.activeElement;
      const isElementContenteditable = (element) => {
        if(!element || element.parentElement === null)return false;
        
        return element.getAttribute('contenteditable') === 'true' || isElementContenteditable(element.parentElement);
      }
      return isElementContenteditable(activeElement);
    }
    // 当前聚焦的元素是否属于富文本编辑器的一部分
    const activeElementIsRichTextEditor = isRichTextEditor();
    // 如果是输入框内容，但没有按下ctrl键（Mac上为command键），不复制
    if ( e && !e.metaKey && (isInputActive || activeElementIsRichTextEditor) )return;
    // 判断是否意外地选中了文本
    // 没选中文本，或者选中的文本父元素并不是触发事件的元素
    const { focusNode } = window.getSelection();
    if (
      ["dblclick","mouseup"].indexOf(e.type) > -1 &&
      focusNode && 
      !isInputActive && 
      !activeElementIsRichTextEditor && 
      // #Text Node
      !(focusNode.nodeType === 3 && e.target === focusNode.parentElement)
    ) {
      return;
    }
    AutoClipboard.copySelectedText()
      .then(() => {
        this.selectedText = window.getSelection().toString();
        this._setMessageHistory(this.selectedText);

        chrome.storage.sync.get(
          ["background", "color", "messagePosition"],
          (historyStorage) => {
            const boundaryPosition = this._getMessageBoundaryPosition();
            historyStorage.messagePosition = historyStorage.messagePosition || {
              // 给个默认值
              left: boundaryPosition.left,
              top: boundaryPosition.top,
            };
            this._updateMessageStyle({
              background: historyStorage.background,
              color: historyStorage.color,
              display: "block",
              left:
                Math.min(
                  boundaryPosition.left,
                  historyStorage.messagePosition.left
                ) + "px",
              top:
                Math.min(
                  boundaryPosition.top,
                  historyStorage.messagePosition.top
                ) + "px",
            });
            clearTimeout(this.timer);
            this._hideMessageSync();
          }
        );
      })
      .catch(() => {});
  }
  _hideMessageSync() {
    this.timer = setTimeout(() => {
      this._updateMessageStyle({
        display: "none",
      });
      this.timer = null;
    }, 2000);
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
    if (event.key === "Shift") {
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
    this.message.addEventListener("mousedown", (e) => {
      const startLeft = e.clientX;
      const startTop = e.clientY;
      const position = e.target.getBoundingClientRect();
      let endLeft = position.left;
      let endTop = position.top;

      const handleMouseMove = (e) => {
        endLeft = position.left + e.clientX - startLeft;
        endTop = position.top + e.clientY - startTop;

        // 限制范围
        endLeft = Math.max(endLeft, 0);
        endLeft = Math.min(
          endLeft,
          document.documentElement.clientWidth - this.MESSAGE_WIDTH
        );
        endTop = Math.min(
          endTop,
          document.documentElement.clientHeight - this.MESSAGE_HEIGHT
        );
        endTop = Math.max(endTop, 0);

        this._updateMessageStyle({
          left: `${endLeft}px`,
          top: `${endTop}px`,
          right: "none",
          bottom: "none",
        });
        e.preventDefault();
      };
      const handleMouseUp = () => {
        // 存储当前位置
        chrome.storage.sync.set({
          messagePosition: {
            left: endLeft,
            top: endTop,
          },
        });
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    });

    this.message.addEventListener("mouseover", () => {
      clearTimeout(this.timer);
    });

    this.message.addEventListener("mouseleave", () => {
      this._hideMessageSync();
    });
  }
}

new AutoClipboard();
