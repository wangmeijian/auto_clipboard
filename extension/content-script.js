const i18n = (key) => chrome.i18n.getMessage(key);

class AutoClipboard {
  constructor() {
    // chrome.storage.local 最大容量为5M，即5242880字节
    // 最多存储条数
    this._MAX_HISTORY_LENGTH = 100;
    // 单条数据最大字符数
    this._MAX_ITEM_LENGTH = 10000;
    // message宽高
    this.MESSAGE_WIDTH = 110;
    this.MESSAGE_HEIGHT = 32;
    this.MESSAGE_MARGING = 20;
    this.timer = null;
    this.message = null;
    // 默认值
    this.websiteIndex = this.websites.length - 1;
    this._init();
  }

  websites = [
    {
      regexp: /^https:\/\/wenku\.baidu\.com\/view\//,
      copySelectedText: () => {
        let text = AutoClipboard.defaultCopySelectedText();
        return new Promise((resolve) => {
          if (!text || text.length === 0) {
            var matchText = /查看全部包含“([\w\W]*?)”的文档/.exec(
              document.body.innerHTML
            );
            return matchText ? resolve(matchText[1]) : resolve('');
          }
          return resolve(text);
        });
      },
    },
    {
      regexp: /^.+/,
      copySelectedText: () => {
        return Promise.resolve(AutoClipboard.defaultCopySelectedText());
      },
    },
  ];

  /**
   * @desc 初始化
   */
  _init() {
    this._detectWebsites();
    // 初始化提示语颜色及选中样式
    this._getStorage().then((config) => {
      this._createMessage(
        config.background,
        config.color,
        config.messagePosition
      );
      if (config.pluginEnabled !== 'off' && (config.selectionBgColor || config.selectionTextColor)) {
        this._applySelectionStyle(
          config.selectionBgColor || "#4a90e2",
          config.selectionTextColor || "#ffffff"
        );
      }
    });
    this._addActionListener();
    this._addStorageChangeListener();
  }

  /**
   * @desc 识别特定站点
   */
  _detectWebsites() {
    const self = this;
    this.websites.find((site, index) => {
      if (site.regexp.test(location.href)) {
        self.websiteIndex = index;

        return true;
      }
    });
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
        ["background", "color", "messagePosition", "selectionBgColor", "selectionTextColor", "pluginEnabled"],
        (config) => {
          config ? resolve(config) : reject({});
        }
      );
    });
  }

  /**
   * @desc 注入选中文本样式
   */
  _applySelectionStyle(bgColor, textColor) {
    const STYLE_ID = "ac-selection-style";
    let styleEl = document.getElementById(STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      document.head && document.head.appendChild(styleEl);
    }
    styleEl.textContent = `*::selection { background: ${bgColor} !important; color: ${textColor} !important; }`;
  }

  /**
   * @desc 移除选中文本样式
   */
  _removeSelectionStyle() {
    const styleEl = document.getElementById("ac-selection-style");
    if (styleEl) styleEl.remove();
  }

  /**
   * @desc 监听 storage 变化，响应插件开关
   */
  _addStorageChangeListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if ('pluginEnabled' in changes) {
        if (changes.pluginEnabled.newValue === 'off') {
          this._removeSelectionStyle();
        } else {
          chrome.storage.sync.get(['selectionBgColor', 'selectionTextColor'], (config) => {
            if (config.selectionBgColor || config.selectionTextColor) {
              this._applySelectionStyle(
                config.selectionBgColor || "#4a90e2",
                config.selectionTextColor || "#ffffff"
              );
            }
          });
        }
      }
    });
  }

  /**
   * @desc 默认的复制选中文本的方法
   * @returns string
   */
  static defaultCopySelectedText() {
    const selectedText = window.getSelection().toString();

    if (!selectedText || selectedText?.trim().length === 0) return "";
    return selectedText;
  }
  /**
   * @desc 替换异常空格
   * @returns string
   */
  replaceAbnormalSpace(value) {
    return value.replaceAll(/\u00a0/g, ' ');
  }

  /**
   * @desc 复制选中的文本
   * @returns Promise<string | undefined>
   */
  async getSelectedText() {
    const result = await this.websites[this.websiteIndex].copySelectedText();
    return new Promise((resolve) => {
      return result && result.length ? resolve(this.replaceAbnormalSpace(result)) : resolve("");
    })
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
    const newElement = document.createElement("div");
    newElement.id = "acMessage";
    const message = newElement.attachShadow({ mode: "closed" });
    const content = document.createElement("div");
    const contentStyle = document.createElement("style");
    content.id = "autoClipboardMessage";
    content.className = "ac-message";
    content.innerHTML = `
      <svg class="ac-check" viewBox="0 0 13 10" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1.5 5L5 8.5L11.5 1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="ac-label">${i18n("copySuccess")}</span>
    `;

    contentStyle.innerText = `
      @keyframes ac-in {
        0%   { opacity: 0; transform: scale(0.82) translateY(10px); }
        60%  { opacity: 1; transform: scale(1.04) translateY(-2px); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes ac-out {
        0%   { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(0.88) translateY(6px); }
      }
      @keyframes ac-check-draw {
        from { stroke-dashoffset: 16; }
        to   { stroke-dashoffset: 0; }
      }
      .ac-message {
        display: none;
        flex-direction: row;
        align-items: center;
        gap: 6px;
        padding: 0 14px;
        height: ${this.MESSAGE_HEIGHT}px;
        position: fixed;
        left: ${position.left}px;
        top: ${position.top}px;
        z-index: 9999999;
        border-radius: ${this.MESSAGE_HEIGHT / 2}px;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
        font-weight: 500;
        letter-spacing: 0.01em;
        white-space: nowrap;
        margin: 0;
        cursor: move;
        box-shadow: 0 4px 20px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.08);
        background: ${background};
        color: ${fontColor};
        -webkit-user-select: none;
        user-select: none;
      }
      .ac-message.ac-visible {
        display: flex;
        animation: ac-in 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }
      .ac-message.ac-hiding {
        animation: ac-out 0.2s ease both;
      }
      .ac-message:hover {
        box-shadow: 0 6px 24px rgba(0,0,0,0.26), 0 2px 8px rgba(0,0,0,0.1);
      }
      .ac-check {
        width: 14px;
        height: 11px;
        flex-shrink: 0;
        overflow: visible;
      }
      .ac-check path {
        stroke-dasharray: 16;
        stroke-dashoffset: 16;
      }
      .ac-message.ac-visible .ac-check path {
        animation: ac-check-draw 0.3s cubic-bezier(0.22, 1, 0.36, 1) 0.18s both;
      }
      .ac-label {
        line-height: 1;
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
    if (!document.querySelector("#acMessage")) {
      await this._getStorage().then((config) => {
        this._createMessage(
          config.background,
          config.color,
          config.messagePosition
        );
      });
    }
    Object.keys(style).forEach((key) => {
      if (key === 'display') {
        if (style[key] === 'block') {
          // 重置动画（先移除再添加，强制 reflow 重新触发入场动画）
          this.message.classList.remove('ac-hiding', 'ac-visible');
          void this.message.offsetWidth;
          this.message.classList.add('ac-visible');
        } else if (style[key] === 'none') {
          this.message.classList.remove('ac-visible', 'ac-hiding');
        }
      } else if (key in this.message.style) {
        this.message.style[key] = style[key];
      }
    });
  }
  /**
   * @desc 监听事件回调
   */
  async _handleAction(e, ctrlKeyOverride) {
    // 是否普通输入框
    const isInputActive = ["input", "textarea"].includes(
      document.activeElement.nodeName.toLowerCase()
    );
    // 是否富文本编辑器
    const isRichTextEditor = () => {
      const activeElement = document.activeElement;
      const isBodyContentEditable = document.body.isContentEditable || document.designMode === 'on';
      const isElementContenteditable = (element) => {
        if (!element || element.parentElement === null) return false;

        return (
          element.isContentEditable ||
          isElementContenteditable(element.parentElement)
        );
      };
      return isBodyContentEditable || isElementContenteditable(activeElement);
    };
    const storage = await chrome.storage.sync.get(['whitelist', 'pluginEnabled', 'ctrlCopy']);
    const currenthost = new URL(location.href).origin;
    // 当前聚焦的元素是否属于富文本编辑器的一部分
    const activeElementIsRichTextEditor = isRichTextEditor();
    // 插件被全局禁用
    if (storage.pluginEnabled === 'off') return;
    // 开启了"按住 Ctrl 键才复制"，但未按下 Ctrl 键
    // ctrlKeyOverride 用于捕获 mousedown 时的 Ctrl 状态，避免用户在松开鼠标前已释放 Ctrl 导致误判
    const hasCtrlKey = ctrlKeyOverride !== undefined ? ctrlKeyOverride : e?.ctrlKey;
    if (storage.ctrlCopy === 'on' && !hasCtrlKey) return;
    // 如果没打开自动复制开关 || 当前站点在不自动复制的白名单列表
    // 如果选择的是输入框内容，但没有按下ctrl键（Mac上为command键），不复制
    if ((storage.whitelist && storage.whitelist[currenthost]) || e && !e.metaKey && (isInputActive || activeElementIsRichTextEditor))
      return;

    this.getSelectedText()
      .then((selectedText) => {
        if (!selectedText || selectedText.length === 0) return;
        this._setMessageHistory(selectedText);
        // 复制到剪切板
        // 仅在https下可用
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(selectedText);
        } else {
          document.execCommand("copy");
        }
        // 查询tooltip的样式配置并提示
        chrome.storage.sync.get(
          ["background", "color", "messagePosition", "tooltip", "selectionBgColor", "selectionTextColor"],
          (historyStorage) => {
            if (historyStorage.selectionBgColor || historyStorage.selectionTextColor) {
              this._applySelectionStyle(
                historyStorage.selectionBgColor || "#4a90e2",
                historyStorage.selectionTextColor || "#ffffff"
              );
            }
            // 配置为不提示
            if(historyStorage.tooltip === null)return;
            const boundaryPosition = this._getMessageBoundaryPosition();
            historyStorage.messagePosition = historyStorage.messagePosition || {
              // 给个默认值
              left: boundaryPosition.left - this.MESSAGE_MARGING,
              top: boundaryPosition.top - this.MESSAGE_MARGING,
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
      if (this.message) {
        // 播放淡出动画，结束后移除 visible 类（恢复 display: none）
        this.message.classList.add('ac-hiding');
        this.message.addEventListener('animationend', () => {
          this.message.classList.remove('ac-visible', 'ac-hiding');
        }, { once: true });
      }
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
    let historyStorage = ((await chrome.storage?.local?.get([STORAGE_KEY])) ??
      {})[STORAGE_KEY];
    let historysMerge = [];
    // 更新
    const updateMessageHistory = () => {
      // 复制的内容和历史记录中某条重复，将其位置放到第一位
      const repeatIndex = historyStorage.findIndex(
        (item) => item.value === text
      );
      const toppingCount = historyStorage.filter((item) => item.topping).length;

      let isCurrentTopping = false;
      let insertIndex = toppingCount || 0;

      if (repeatIndex > -1) {
        isCurrentTopping = historyStorage[repeatIndex].topping;
        historyStorage.splice(repeatIndex, 1);
        insertIndex = isCurrentTopping ? 0 : toppingCount;
      }
      historyStorage.splice(insertIndex, 0, {
        value: text,
        topping: isCurrentTopping,
      });
      historysMerge = historyStorage;
      // 限制容量为this._MAX_HISTORY_LENGTH
      if (historysMerge.length > this._MAX_HISTORY_LENGTH) {
        historysMerge.length = this._MAX_HISTORY_LENGTH;
      }
    };

    // 已有历史记录 ? 更新历史记录 : 设置历史记录
    historyStorage
      ? updateMessageHistory()
      : (historysMerge = [
          {
            topping: false,
            value: text,
          },
        ]);
    chrome.storage.local?.set({
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
    } else if (event.key === "Control") {
      // Ctrl 键松开时触发（此时 e.ctrlKey 已为 false，需显式传 true）
      this._handleAction(event, true);
    }
  }
  /**
   * @desc 事件绑定
   */
  _addActionListener() {
    const handleActionDebounce = this._debounce(this._handleAction);
    let ctrlAtMousedown = false;

    document.addEventListener("keyup", this._combinationKey.bind(this));
    // 使用捕获阶段，防止页面调用 stopPropagation 导致扩展收不到事件
    document.addEventListener("mousedown", (e) => {
      ctrlAtMousedown = e.ctrlKey;
    }, true);
    document.addEventListener("mouseup", (e) => {
      // 用户可能在松开鼠标前就已经释放了 Ctrl 键，需综合 mousedown 时的状态判断
      const ctrlActive = e.ctrlKey || ctrlAtMousedown;
      ctrlAtMousedown = false;
      handleActionDebounce(e, ctrlActive);
    }, true);
    // stopImmediatePropagation 阻止同阶段其他监听器，防止页面脚本在捕获阶段调用 preventDefault
    document.addEventListener('selectstart', (e) => e.stopImmediatePropagation(), true);
    // document.execCommand("copy") 会触发copy事件，某些站点针对oncopy事件return false，因此需手动setData
    document.addEventListener('copy', (e) => {
      const selectedText = this.replaceAbnormalSpace(window.getSelection().toString().trim());
      selectedText.length > 0 && e.clipboardData.setData('text/plain', selectedText )
    }, true);
  }
  /**
   * @desc 防抖
   * @arg func 需要防抖的函数
   * @arg timeout 防抖时长
   */
  _debounce(func, timeout = 250) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        func.apply(this, args);
      }, timeout);
    };
  }

  /**
   * @desc 拖动
   */
  _addDragListener() {
    if (!this.message) return;
    this.message.addEventListener("mousedown", (e) => {
      const startLeft = e.clientX;
      const startTop = e.clientY;
      const position = this.message.getBoundingClientRect();
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
      this.timer = null;
      // 若正在播放消失动画，立即停止，防止 animationend 回调把浮层隐藏
      this.message.classList.remove('ac-hiding');
    });

    this.message.addEventListener("mouseleave", () => {
      this._hideMessageSync();
    });
  }
}

new AutoClipboard();
