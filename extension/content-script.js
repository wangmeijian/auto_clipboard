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
    // 当前站点是否启用（pluginEnabled !== 'off' 且未被本站禁用）
    this._enabled = false;
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
   *   事件监听 / storage 监听始终绑定（确保 storage 切换时能动态启用/禁用）
   *   实际副作用（DOM 注入、user-select 全局样式、密码助手）由 _activate / _deactivate 管理
   */
  _init() {
    this._detectWebsites();
    this._addActionListener();
    this._addStorageChangeListener();
    this.passwordHelper = new PasswordHelper(this);

    this._getStorage().then((config) => {
      this._setEnabled(this._computeEnabled(config), config);
    });
  }

  /**
   * @desc 计算当前站点是否启用
   */
  _computeEnabled(config) {
    if (!config) return false;
    if (config.pluginEnabled === "off") return false;
    const origin = location.origin;
    if (config.whitelist && config.whitelist[origin]) return false;
    return true;
  }

  /**
   * @desc 切换启用状态
   */
  _setEnabled(enabled, config) {
    if (this._enabled === enabled) return;
    this._enabled = enabled;
    if (enabled) {
      this._activate(config);
    } else {
      this._deactivate();
    }
  }

  /**
   * @desc 启用当前站点的所有副作用
   */
  _activate(config) {
    this._injectGlobalSelectStyle();
    const apply = (c) => {
      if (!this._enabled) return; // 异步期间可能又被禁用
      if (!document.querySelector("#acMessage")) {
        this._createMessage(c.background, c.color, c.messagePosition);
      }
      if (c.selectionBgColor || c.selectionTextColor) {
        this._applySelectionStyle(
          c.selectionBgColor || "#4a90e2",
          c.selectionTextColor || "#ffffff"
        );
      }
      if (this.passwordHelper && c.passwordQuickView !== false) {
        this.passwordHelper.enable();
      }
    };
    if (config) {
      apply(config);
    } else {
      this._getStorage().then(apply);
    }
  }

  /**
   * @desc 完全关闭当前站点的所有副作用
   */
  _deactivate() {
    this._removeGlobalSelectStyle();
    this._removeSelectionStyle();
    if (this.passwordHelper) this.passwordHelper.disable();
    const host = document.getElementById("acMessage");
    if (host && host.parentNode) host.parentNode.removeChild(host);
    this.message = null;
    clearTimeout(this.timer);
    this.timer = null;
  }

  /**
   * @desc 注入全局 user-select 样式，允许文字选中
   */
  _injectGlobalSelectStyle() {
    const STYLE_ID = "ac-global-select-style";
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `* { user-select: text !important; -webkit-user-select: text !important; }`;
    (document.head || document.documentElement).appendChild(style);
  }

  _removeGlobalSelectStyle() {
    const el = document.getElementById("ac-global-select-style");
    if (el) el.remove();
  }

  /**
   * @desc 在已有 message 浮层中显示自定义文本，2s 后自动隐藏并恢复原文案
   * @arg {string} text 要显示的文案
   * @arg {"success" | "error"} variant 图标变体；error 显示叉叉
   */
  _showMessageWithText(text, variant = "success") {
    chrome.storage.sync.get(
      ["background", "color", "messagePosition", "tooltip"],
      async (config) => {
        if (config.tooltip === null) return;
        const boundary = this._getMessageBoundaryPosition();
        const pos = config.messagePosition || {
          left: boundary.left - this.MESSAGE_MARGING,
          top: boundary.top - this.MESSAGE_MARGING,
        };
        await this._updateMessageStyle({
          background: variant === "error" ? "#f5a623" : config.background,
          color: variant === "error" ? "#ffffff" : config.color,
          display: "block",
          left: Math.min(boundary.left, pos.left) + "px",
          top: Math.min(boundary.top, pos.top) + "px",
        });
        const label = this.message && this.message.querySelector(".ac-label");
        const checkSvg = this.message && this.message.querySelector(".ac-check");
        const originalText = label ? label.textContent : null;
        const originalCheck = checkSvg ? checkSvg.innerHTML : null;
        if (label) label.textContent = text;
        if (checkSvg) {
          checkSvg.innerHTML =
            variant === "error"
              ? `<path d="M6.5 1.5V6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="6.5" cy="8.5" r="1" fill="currentColor"/>`
              : `<path d="M1.5 5L5 8.5L11.5 1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          if (this.message) {
            this.message.classList.add("ac-hiding");
            this.message.addEventListener(
              "animationend",
              () => {
                this.message.classList.remove("ac-visible", "ac-hiding");
                if (label && originalText !== null) label.textContent = originalText;
                if (checkSvg && originalCheck !== null) checkSvg.innerHTML = originalCheck;
              },
              { once: true }
            );
          }
          this.timer = null;
        }, 2000);
      }
    );
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
        ["background", "color", "messagePosition", "selectionBgColor", "selectionTextColor", "pluginEnabled", "passwordQuickView", "whitelist"],
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
   * @desc 监听 storage 变化，响应插件开关与本站启用/禁用
   */
  _addStorageChangeListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      // pluginEnabled 或 whitelist 变化，重新计算本站启用状态
      if ('pluginEnabled' in changes || 'whitelist' in changes) {
        this._getStorage().then((config) => {
          this._setEnabled(this._computeEnabled(config), config);
        });
      }
      // 启用状态下，密码助手开关的实时切换
      if (this._enabled && 'passwordQuickView' in changes && this.passwordHelper) {
        if (changes.passwordQuickView.newValue === false) {
          this.passwordHelper.disable();
        } else {
          this.passwordHelper.enable();
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
    // 扩展重载后上下文失效，chrome.runtime.id 变为 undefined，直接退出避免后续 API 调用报错
    if (!chrome.runtime?.id) return;
    // 本站未启用（全局禁用或加入了本站禁用列表），完全不处理
    if (!this._enabled) return;

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
    let storage;
    try {
      storage = await chrome.storage.sync.get(['ctrlCopy']);
    } catch (err) {
      return; // 上下文失效的竞态情况
    }
    // 当前聚焦的元素是否属于富文本编辑器的一部分
    const activeElementIsRichTextEditor = isRichTextEditor();
    // 开启了"按住 Ctrl 键才复制"，但未按下 Ctrl 键
    // ctrlKeyOverride 用于捕获 mousedown 时的 Ctrl 状态，避免用户在松开鼠标前已释放 Ctrl 导致误判
    const hasCtrlKey = ctrlKeyOverride !== undefined ? ctrlKeyOverride : e?.ctrlKey;
    if (storage.ctrlCopy === 'on' && !hasCtrlKey) return;
    // 选择的是输入框内容，但没有按下 ctrl 键（Mac 上为 command 键），不复制
    if (e && !e.metaKey && (isInputActive || activeElementIsRichTextEditor))
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
   *   listener 始终绑定，内部按 _enabled 判断是否生效
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
    document.addEventListener('selectstart', (e) => {
      if (!this._enabled) return;
      e.stopImmediatePropagation();
    }, true);
    // document.execCommand("copy") 会触发copy事件，某些站点针对oncopy事件return false，因此需手动setData
    document.addEventListener('copy', (e) => {
      if (!this._enabled) return;
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

class PasswordHelper {
  constructor(autoClipboard) {
    this.autoClipboard = autoClipboard;
    this.ICON_SIZE = 24;
    this.ICON_SIZE_MIN = 18;
    // input -> { icon, host, originalType, listeners }
    this.bindings = new WeakMap();
    // 维护已绑定 input 的强引用集合，便于卸载时清理
    this.boundInputs = new Set();
    this.enabled = false;
    this.mutationObserver = null;
    this.resizeRaf = null;
    this._onScrollOrResize = this._onScrollOrResize.bind(this);
    // 启停完全由 AutoClipboard._activate / _deactivate 控制
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    const run = () => {
      this._scan();
      this._observeMutations();
      this._observeResize();
      this._startTrackingLoop();
      window.addEventListener("scroll", this._onScrollOrResize, true);
      window.addEventListener("resize", this._onScrollOrResize);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this._stopTrackingLoop();
    window.removeEventListener("scroll", this._onScrollOrResize, true);
    window.removeEventListener("resize", this._onScrollOrResize);
    this.boundInputs.forEach((input) => this._unbind(input));
    this.boundInputs.clear();
  }

  _scan(root = document) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    const inputs = root.querySelectorAll('input[type="password"]');
    inputs.forEach((input) => this._bind(input));
  }

  _observeMutations() {
    if (this.mutationObserver) return;
    this.mutationObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          m.addedNodes.forEach((node) => {
            if (node.nodeType !== 1) return;
            if (node.matches && node.matches('input[type="password"]')) {
              this._bind(node);
            }
            this._scan(node);
          });
          m.removedNodes.forEach((node) => {
            if (node.nodeType !== 1) return;
            if (node.matches && node.matches('input[type="password"]')) {
              this._unbind(node);
            }
            if (node.querySelectorAll) {
              node.querySelectorAll('input[type="password"]').forEach((n) => this._unbind(n));
            }
          });
        } else if (m.type === "attributes" && m.attributeName === "type") {
          const target = m.target;
          if (target.tagName !== "INPUT") continue;
          // 仅处理"出现新的 password input"场景；hover 时我们会临时把 type 切到 text，
          // 不能据此 unbind（MutationObserver 异步触发，无法可靠通过同步标志位区分）。
          if (target.type === "password" && !this.bindings.has(target)) {
            this._bind(target);
          }
        }
      }
    });
    this.mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["type"],
    });
  }

  _bind(input) {
    if (!input || this.bindings.has(input)) return;
    if (input.type !== "password") return;

    const host = document.createElement("div");
    host.setAttribute("data-ac-password-icon", "");
    host.style.cssText =
      "position:absolute;z-index:2147483647;width:0;height:0;pointer-events:none;top:0;left:0;";
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      .ac-pwd-icon {
        position: fixed;
        box-sizing: border-box;
        width: ${this.ICON_SIZE}px;
        height: ${this.ICON_SIZE}px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ffffff;
        border: 1px solid rgba(0,0,0,0.14);
        border-radius: 6px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.06);
        cursor: pointer;
        pointer-events: auto;
        color: #4b5563;
        transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
      }
      .ac-pwd-icon:hover {
        background: #eff6ff;
        color: #2563eb;
        border-color: #93c5fd;
        transform: scale(1.06);
        box-shadow: 0 2px 6px rgba(37,99,235,0.18), 0 4px 12px rgba(37,99,235,0.12);
      }
      .ac-pwd-icon:active {
        transform: scale(0.96);
      }
      .ac-pwd-icon svg {
        width: 64%;
        height: 64%;
        display: block;
        pointer-events: none;
        overflow: visible;
      }
      .ac-pwd-icon .ac-pwd-eye {
        stroke: currentColor;
        stroke-width: 1.6;
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
      }
      .ac-pwd-icon .ac-pwd-pupil {
        fill: currentColor;
      }
      .ac-pwd-icon .ac-pwd-copy-bg {
        fill: #ffffff;
      }
      .ac-pwd-icon .ac-pwd-copy {
        stroke: currentColor;
        stroke-width: 1.4;
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
      }
      @media (prefers-color-scheme: dark) {
        .ac-pwd-icon {
          background: #2b2f36;
          border-color: rgba(255,255,255,0.15);
          color: #d1d5db;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        }
        .ac-pwd-icon:hover {
          background: #1e3a5f;
          color: #93c5fd;
          border-color: rgba(147,197,253,0.45);
        }
        .ac-pwd-icon .ac-pwd-copy-bg {
          fill: #2b2f36;
        }
      }
      .ac-pwd-tip {
        position: fixed;
        max-width: 320px;
        padding: 6px 10px;
        background: #1f2329;
        color: #fff;
        font-size: 12px;
        line-height: 1.4;
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        white-space: pre-wrap;
        word-break: break-all;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        pointer-events: none;
        visibility: hidden;
        opacity: 0;
        top: 0;
        left: 0;
        transform: translateY(calc(-100% - 8px));
      }
      .ac-pwd-tip.visible {
        visibility: visible;
        opacity: 1;
      }
      .ac-pwd-tip::after {
        content: "";
        position: absolute;
        left: 14px;
        bottom: -6px;
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid #1f2329;
      }
    `;
    const button = document.createElement("div");
    button.className = "ac-pwd-icon";
    button.title = chrome.i18n.getMessage("copyPassword") || "Copy password";
    button.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path class="ac-pwd-eye" d="M2.5 12C4.5 7.5 8 5.5 12 5.5C16 5.5 19.5 7.5 21.5 12C19.5 16.5 16 18.5 12 18.5C8 18.5 4.5 16.5 2.5 12Z"/>
        <circle class="ac-pwd-pupil" cx="12" cy="12" r="2.6"/>
        <rect class="ac-pwd-copy-bg" x="13" y="13" width="11" height="11" rx="2.5"/>
        <rect class="ac-pwd-copy" x="14.5" y="14.5" width="6.5" height="7.5" rx="1.2"/>
        <path class="ac-pwd-copy" d="M16.5 14.5V13.2C16.5 12.5 17 12 17.7 12H22.3C23 12 23.5 12.5 23.5 13.2V18.5"/>
      </svg>
    `;
    const tip = document.createElement("div");
    tip.className = "ac-pwd-tip";
    shadow.appendChild(style);
    shadow.appendChild(button);
    shadow.appendChild(tip);
    (document.body || document.documentElement).appendChild(host);

    const binding = {
      icon: host,
      button,
      tip,
    };

    const positionTip = () => {
      const inputRect = input.getBoundingClientRect();
      // 水平方向：tooltip 左边缘对齐 input 左边缘
      let left = inputRect.left;
      left = Math.max(4, Math.min(left, document.documentElement.clientWidth - 24));
      // 垂直方向：top 指向 input 顶部，CSS 的 translateY(calc(-100% - 8px))
      // 会自动把 tooltip 抬到 input 上方，无需测量 tooltip 自身高度，
      // 因此首次 hover（display 切换前）也能可靠定位。
      tip.style.top = `${inputRect.top}px`;
      tip.style.left = `${left}px`;
    };

    const handleEnter = () => {
      const value = input.value || "";
      // value 为空时不弹 tooltip——可能是用户没填密码（不该打扰），也可能是
      // Chrome 对 autofill 的隐私限制。两者从脚本侧无法区分，留给 click 处理。
      if (!value) return;
      tip.textContent = value;
      positionTip();
      tip.classList.add("visible");
    };
    const handleLeave = () => {
      tip.classList.remove("visible");
    };
    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 真实 click 是 trusted user gesture，能解锁 autofill 填充的 password value。
      // 这里在点击瞬间读 value：哪怕 hover 时还是空的，点击后通常已可用。
      const value = input.value || "";
      if (!value) {
        const hint = chrome.i18n.getMessage("passwordEmptyHint") || "Password is empty";
        if (this.autoClipboard && typeof this.autoClipboard._showMessageWithText === "function") {
          this.autoClipboard._showMessageWithText(hint, "error");
        }
        return;
      }
      // 点击后立即把 tooltip 切到明文，给用户视觉确认
      tip.textContent = value;
      positionTip();
      tip.classList.add("visible");
      // 故意不写入剪切板历史：密码属于敏感数据，写入 chrome.storage.local 后会在 popup
      // 的历史记录中以明文长期驻留，存在泄露风险（共用设备、导出等）。
      const writeOk = () => {
        const msg = chrome.i18n.getMessage("passwordCopied") || "Password copied!";
        if (this.autoClipboard && typeof this.autoClipboard._showMessageWithText === "function") {
          this.autoClipboard._showMessageWithText(msg);
        }
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(value).then(writeOk).catch(() => {});
      } else {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
          writeOk();
        } catch (_) {}
        document.body.removeChild(ta);
      }
    };

    button.addEventListener("mouseenter", handleEnter);
    button.addEventListener("mouseleave", handleLeave);
    button.addEventListener("click", handleClick);

    binding.listeners = { handleEnter, handleLeave, handleClick };

    this.bindings.set(input, binding);
    this.boundInputs.add(input);
    if (this.resizeObserver) {
      try { this.resizeObserver.observe(input); } catch (_) {}
    }
    this._position(input, binding);
  }

  _unbind(input) {
    const binding = this.bindings.get(input);
    if (!binding) return;
    const { handleEnter, handleLeave, handleClick } = binding.listeners || {};
    if (binding.button) {
      binding.button.removeEventListener("mouseenter", handleEnter);
      binding.button.removeEventListener("mouseleave", handleLeave);
      binding.button.removeEventListener("click", handleClick);
    }
    if (binding.icon && binding.icon.parentNode) {
      binding.icon.parentNode.removeChild(binding.icon);
    }
    if (this.resizeObserver) {
      try { this.resizeObserver.unobserve(input); } catch (_) {}
    }
    this.bindings.delete(input);
    this.boundInputs.delete(input);
  }

  _calcIconSize(inputHeight) {
    // input 高度 ≥ 28 时用默认 22；高度受限时按 input 高度收缩，保留 ~4px 内边距
    const fit = Math.floor(inputHeight - 4);
    return Math.max(this.ICON_SIZE_MIN, Math.min(this.ICON_SIZE, fit));
  }

  _position(input, binding, force = false) {
    if (!input || !binding || !binding.button) return;
    const button = binding.button;
    if (!document.contains(input)) {
      this._unbind(input);
      return;
    }
    const rect = input.getBoundingClientRect();
    // input 不可见时隐藏
    const visible = rect.width > 0 && rect.height > 0 && input.offsetParent !== null;
    if (!visible) {
      if (binding._lastVisible !== false) {
        button.style.display = "none";
        binding._lastVisible = false;
      }
      return;
    }
    // 缓存比对：rect 没变就跳过 DOM 写入，省 reflow
    const last = binding._lastRect;
    if (
      !force &&
      binding._lastVisible === true &&
      last &&
      last.top === rect.top &&
      last.left === rect.left &&
      last.right === rect.right &&
      last.bottom === rect.bottom
    ) {
      return;
    }
    button.style.display = "flex";
    const iconSize = this._calcIconSize(rect.height);
    if (binding._lastIconSize !== iconSize) {
      button.style.width = `${iconSize}px`;
      button.style.height = `${iconSize}px`;
      binding._lastIconSize = iconSize;
    }
    // 严格按 input 垂直中心对齐：图标比 input 高时允许 top 为负，避免任何场景下偏离居中
    const top = rect.top + (rect.height - iconSize) / 2;
    const left = rect.right - iconSize - 8;
    button.style.top = `${top}px`;
    button.style.left = `${Math.max(0, left)}px`;
    binding._lastRect = { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom };
    binding._lastVisible = true;
  }

  _observeResize() {
    if (this.resizeObserver || typeof ResizeObserver === "undefined") return;
    this.resizeObserver = new ResizeObserver(() => {
      this.boundInputs.forEach((input) => {
        const binding = this.bindings.get(input);
        if (binding) this._position(input, binding);
      });
    });
    // 已经绑定过的 input 也注册一下
    this.boundInputs.forEach((input) => {
      try { this.resizeObserver.observe(input); } catch (_) {}
    });
  }

  // 兜底：每帧检查所有 input 的位置是否变化（容器内滚动 / 弹窗动画 / 字体加载回流等
  // 不会触发 window scroll/resize 也不会触发 ResizeObserver 的场景）。
  // 因为 _position 内部缓存了 rect，没有变化就只读一次 getBoundingClientRect，开销可控。
  _startTrackingLoop() {
    if (this.trackingRaf) return;
    const tick = () => {
      if (!this.enabled) {
        this.trackingRaf = null;
        return;
      }
      this.boundInputs.forEach((input) => {
        const binding = this.bindings.get(input);
        if (binding) this._position(input, binding);
      });
      this.trackingRaf = requestAnimationFrame(tick);
    };
    this.trackingRaf = requestAnimationFrame(tick);
  }

  _stopTrackingLoop() {
    if (this.trackingRaf) {
      cancelAnimationFrame(this.trackingRaf);
      this.trackingRaf = null;
    }
  }

  _onScrollOrResize() {
    if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
    this.resizeRaf = requestAnimationFrame(() => {
      this.boundInputs.forEach((input) => {
        const binding = this.bindings.get(input);
        if (binding) this._position(input, binding);
      });
      this.resizeRaf = null;
    });
  }
}

new AutoClipboard();
