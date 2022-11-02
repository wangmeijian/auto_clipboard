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
    // 后续操作的都是this._history
    this._history = (historyStorage[storageKey] || []).map((item) =>
      // 增加置顶功能，将存储的数据格式从string改为object
      // string => { value: string, topping: boolean }
      typeof item === "string"
        ? {
            value: item,
            topping: false,
          }
        : item
    );

    const historyHTML = this._buildHistoryHTML();
    const popupPageHTML = `
      <div class="popup">
        <h1 class="popup_title">${i18n(
          "popupTitle"
        )}<span class="setting"></span></h1>
        <input class="search_history" id="searchHistory" placeholder="${i18n(
          "searchHistory"
        )}" />
        <div class="copy_history">
          ${historyHTML}
        </div>
        <div class="copy_success">${i18n("copySuccess")}</div>
      </div>
    `;
    const popupPageDOM = document.createElement("div");
    popupPageDOM.innerHTML = popupPageHTML;
    document.body.appendChild(popupPageDOM);

    this._initOptionsPage();
    this._addEventListener();
  }
  // 初始化配置页面
  _initOptionsPage() {
    const i18n = (key) => chrome.i18n.getMessage(key);

    // 默认颜色
    const DEFAULT_COLOR = {
      background: "#51b362",
      color: "#FFFFFF",
    };

    const optionsHTML = `
      <div class="auto_clipboard_options">
        <h1 class="popup_title"><span class="back" title="${i18n(
          "back"
        )}"></span>${i18n(
          "setting"
        )}</h1>
        <form id="optionForm" name="optionForm">
          <h3>一. 提示语颜色</h3>
          <div class="setting-color">
            <div class="setting-item">
              <div class="form_item">${i18n(
                "messageBackground"
              )}<label><input type="color" name="background" value="${
          DEFAULT_COLOR.background
        }" /></label></div>
              <div class="form_item">${i18n(
                "messageColor"
              )}<label><input type="color" name="color" value="${
          DEFAULT_COLOR.color
        }" /></label></div>
            </div>
            <div class="prview_wrap">
              <span class="preview_desc">${i18n("prview")}：</span>
              <span class="prview rightBottom" id="prview">${i18n(
                "copySuccess"
              )}</span>
            </div>
          </div>
          <div class="form_submit">
            <button id="submit" type="button">${i18n("save")}</button>
            <button id="recover" type="reset">${i18n("reset")}</button>
            <span class="option_tips">${i18n("saveSuccess")}</span>
          </div>
        </form>
      </div>
    `;
    const optionsDOM = document.createElement("div");
    optionsDOM.className = "options_wrapper";
    optionsDOM.setAttribute('tabindex', '-1');
    optionsDOM.innerHTML = optionsHTML;
    document.body.appendChild(optionsDOM);

    const dq = (selector) => document.querySelector(selector);
    const optionForm = dq("#optionForm");
    const saveButton = dq("#submit");
    const prview = dq("#prview");
    const tips = dq(".option_tips");

    // 更新预览
    const updatePrviewStyle = (style) => {
      Object.keys(style).forEach((key) => {
        prview.style[key] = style[key];
      });
    };

    // 初始化
    const init = (colorConfig = DEFAULT_COLOR) => {
      // 数据回填表单
      document.optionForm.background.value = colorConfig.background;
      document.optionForm.color.value = colorConfig.color;
      // 更新预览
      updatePrviewStyle(colorConfig);
    };
    chrome.storage.sync.get(["background", "color"], (results) => {
      init({
        ...DEFAULT_COLOR,
        ...(results || {}),
      });
    });

    // 监听事件
    saveButton.addEventListener("click", () => {
      const data = new FormData(optionForm);

      chrome.storage.sync.set(
        {
          background: data.get("background"),
          color: data.get("color"),
        },
        () => {
          tips.style.display = "inline-block";
          setTimeout(() => {
            tips.style.display = "none";
          }, 1500);
        }
      );
    });

    optionForm.addEventListener("reset", () => {
      updatePrviewStyle(DEFAULT_COLOR);

      document.optionForm.background.value = DEFAULT_COLOR.background;
      document.optionForm.color.value = DEFAULT_COLOR.color;
    });

    optionForm.addEventListener("change", (e) => {
      const name = e.target.name;
      if (["background", "color"].includes(name)) {
        updatePrviewStyle({
          [name]: e.target.value,
        });
      }
    });
  }
  /**
   * @desc 生成历史记录
   * @returns HTMLElement
   */
  _buildHistoryHTML(filterString = "") {
    if (this._history.length === 0)
      return `<div class="empty">${i18n("historyEmpty")}</div>`;
    filterString = filterString.trim().toLowerCase();
    const includeCode = /<[^>]+>/;

    return (
      this._history
        .map((item, index) => {
          // 固定index，即使过滤后也不会变
          item.index = index;
          return item;
        })
        .filter((item) => {
          return filterString.length > 0
            ? item.value.toLowerCase().includes(filterString)
            : true;
        })
        .map((item) => {
          const result = includeCode.test(item.value)
            ? this._renderCode(item.value)
            : `<a class="click_target" title="${item.value}" href="#">${item.value}</a>`;

          return `<span class="copy_item stick">
          <span class="action_item stick_item ${
            item.topping ? "topping" : ""
          }" title="${
            item.topping ? i18n("cancelStick") : i18n("stick")
          }" dindex="${item.index}"></span>
          ${result}
          <span class="action_item delete_item" title="${i18n(
            "delete"
          )}" dindex="${item.index}"></span>
        </span>`;
        })
        .join("") + `<div class="privacy">${i18n("privacy")}</div>`
    );
  }

  _renderCode(str = "") {
    let div = document.createElement("div");
    let textNode = document.createTextNode(str);
    div.append(textNode);

    return `
      <pre title=${div.innerHTML.replace(/\s/g, "&nbsp;")}>
        <code><a class="click_target" href="#">${div.innerHTML}</a></code>
      </pre>
    `;
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
      .catch(() => {});
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

    window.addEventListener(
      "click",
      (e) => {
        const classList = e.target.className.split(/\s+/);
        const filterString = document.querySelector("#searchHistory").value;

        // 删除记录
        const handleDelete = (e) => {
          const index = e.target.getAttribute("dindex");
          if (typeof index === "undefined") return;
          this._history.splice(index, 1);
          chrome.storage.local.set({
            [this._STORAGE_KEY]: this._history,
          });
          // 刷新页面
          this._reload(filterString);
        };
        // 置顶
        const handleTopping = (e) => {
          const index = e.target.getAttribute("dindex");
          if (typeof index === "undefined") return;

          // 置顶数据数量
          const toppingCount = this._history.filter(
            (item) => item.topping
          ).length;
          const isCurrentTopping = this._history[index].topping;
          const activeItem = this._history.splice(index, 1)[0];
          const insertIndex = isCurrentTopping ? toppingCount - 1 : 0;

          activeItem.topping = !activeItem.topping;
          this._history.splice(insertIndex, 0, activeItem);

          chrome.storage.local.set({
            [this._STORAGE_KEY]: this._history,
          });
          // 刷新页面
          this._reload(filterString);
        };
        // 显示配置项
        const openOptions = (open = true) => {
          const optionsWrap = document.querySelector('.options_wrapper');
          open ? (optionsWrap.classList.add('open'), optionsWrap.focus()) : optionsWrap.classList.remove('open');
        }

        if (classList.indexOf("delete_item") > -1) {
          handleDelete(e);
        } else if (classList.indexOf("stick_item") > -1) {
          handleTopping(e);
        } else if (classList.indexOf("setting") > -1) {
          openOptions(true);
        } else if (classList.indexOf("back") > -1) {
          openOptions(false);
        }
      },
      false
    );
    // 回车自动复制
    window.addEventListener("keyup", (e) => {
      const code = e.code || e.key;
      if (
        code === "Enter" &&
        e.target.className.split(/\s+/).indexOf("copy_item") > -1
      ) {
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
