/**
 * 页面内的剪切板历史面板，通过快捷键唤起
 *   - 搜索、↑↓ 选择、Enter 插入到唤起前聚焦的输入框
 *   - 唤起前没有聚焦可编辑元素时，改为复制到剪切板
 * 依赖 HistoryStore、ContentType、I18n，由 AutoClipboard 持有并控制
 */
class HistoryPanel {
  /**
   * @arg {object} options
   * @arg {(text: string) => void} options.onCopied 未插入、改为复制后的回调（用于提示）
   */
  constructor({ onCopied }) {
    this.onCopied = onCopied;
    this.MAX_PREVIEW_LENGTH = 200;
    this.host = null;
    this.refs = null;
    this.items = [];
    this.filtered = [];
    this.activeIndex = 0;
    // 唤起前的焦点与光标，用于关闭后恢复和插入
    this.savedTarget = null;
    this.savedSelection = null;
  }

  get isOpen() {
    return !!this.host;
  }

  /**
   * @desc 事件是否发生在面板内（closed shadow 下 composedPath 仍包含 host）
   */
  containsEvent(e) {
    return !!this.host && typeof e.composedPath === "function" && e.composedPath().includes(this.host);
  }

  toggle() {
    this.isOpen ? this.close({ restoreFocus: true }) : this.open();
  }

  async open() {
    if (this.isOpen) return;
    this._saveFocus();
    this._render();
    this.refs.input.focus({ preventScroll: true });
    this.items = await HistoryStore.getActive();
    if (!this.isOpen) return; // 读取期间已被关闭
    this._filter(this.refs.input.value);
  }

  close({ restoreFocus = false } = {}) {
    if (!this.host) return;
    const host = this.host;
    // 先置空再移除：移除时输入框可能同步触发 blur，再次进入 close
    this.host = null;
    this.refs = null;
    host.remove();
    if (restoreFocus) this._restoreFocus();
  }

  // ---------- 焦点与插入 ----------

  /**
   * @desc 取真正的焦点元素（穿透 open shadow root）
   */
  _deepActiveElement() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    return el;
  }

  _isTextField(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName !== "INPUT") return false;
    return ["text", "search", "url", "tel", "email", "password", ""].includes(
      (el.getAttribute("type") || "").toLowerCase()
    );
  }

  _isEditable(el) {
    if (!el) return false;
    if (this._isTextField(el)) return !el.readOnly && !el.disabled;
    return !!el.isContentEditable;
  }

  _saveFocus() {
    const target = this._deepActiveElement();
    this.savedTarget = this._isEditable(target) ? target : null;
    this.savedSelection = null;
    if (!this.savedTarget) return;
    if (this._isTextField(target)) {
      try {
        this.savedSelection = { start: target.selectionStart, end: target.selectionEnd };
      } catch (e) {
        // 部分 input 类型（如 email）不支持读取选区
        this.savedSelection = null;
      }
      return;
    }
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      this.savedSelection = { range: selection.getRangeAt(0).cloneRange() };
    }
  }

  _restoreFocus() {
    const target = this.savedTarget;
    if (!target || !target.isConnected) return false;
    target.focus({ preventScroll: true });
    const saved = this.savedSelection;
    if (!saved) return true;
    try {
      if (saved.range) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(saved.range);
      } else if (saved.start !== null && saved.start !== undefined) {
        target.setSelectionRange(saved.start, saved.end);
      }
    } catch (e) {
      // 部分 input 类型不支持 setSelectionRange，保留默认光标位置
    }
    return true;
  }

  /**
   * @desc 插入到唤起前的输入位置
   *   优先用 execCommand("insertText")：能触发 input 事件、兼容 React 等受控组件，且支持撤销
   * @returns {boolean} 是否插入成功
   */
  _insert(text) {
    if (!this._restoreFocus()) return false;
    const target = this.savedTarget;
    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, text);
    } catch (e) {
      inserted = false;
    }
    if (inserted || !this._isTextField(target)) return inserted;
    try {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? start;
      target.setRangeText(text, start, end, "end");
    } catch (e) {
      // 不支持选区的 input 类型，追加到末尾
      target.value += text;
    }
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    return true;
  }

  async _pick(item) {
    if (!item) return;
    this.close();
    if (!this._insert(item.value)) {
      try {
        await navigator.clipboard.writeText(item.value);
        this.onCopied(item.value);
      } catch (e) {
        // 页面失焦等情况下写入失败，忽略
      }
    }
    // 用过的记录提到前面
    HistoryStore.record(item.value, item.source);
  }

  // ---------- 渲染 ----------

  _filter(keyword) {
    this.filtered = this.items.filter((item) => HistoryStore.matchesKeyword(item, keyword));
    this.activeIndex = 0;
    this._renderList();
  }

  /**
   * @desc 只切换高亮项，不重建列表
   */
  _move(step) {
    if (this.filtered.length === 0 || !this.refs) return;
    const count = this.filtered.length;
    const items = this.refs.list.children;
    const previous = items[this.activeIndex];
    this.activeIndex = (this.activeIndex + step + count) % count;
    const next = items[this.activeIndex];
    if (previous) {
      previous.classList.remove("active");
      previous.setAttribute("aria-selected", "false");
    }
    if (next) {
      next.classList.add("active");
      next.setAttribute("aria-selected", "true");
      next.scrollIntoView({ block: "nearest" });
    }
  }

  _renderList() {
    if (!this.refs) return;
    const { list } = this.refs;
    list.textContent = "";
    if (this.filtered.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = I18n.t("historyEmpty");
      list.appendChild(empty);
      return;
    }
    this.filtered.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "item" + (index === this.activeIndex ? " active" : "") + (item.topping ? " pinned" : "");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(index === this.activeIndex));
      li.dataset.index = String(index);

      const value = document.createElement("div");
      value.className = "value";
      value.textContent = item.value.replace(/\s+/g, " ").trim().slice(0, this.MAX_PREVIEW_LENGTH);
      li.appendChild(value);

      const type = ContentType.detect(item.value);
      const metaParts = [
        type === "text" ? "" : I18n.t(`type_${type}`),
        item.source ? HistoryStore.getHostname(item.source.url) : "",
        HistoryStore.formatRelativeTime(item.time, I18n.getLocale()),
      ].filter(Boolean);
      if (metaParts.length) {
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = metaParts.join(" · ");
        if (item.source?.title) meta.title = item.source.title;
        li.appendChild(meta);
      }
      list.appendChild(li);
    });
    const active = list.querySelector(".item.active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  _render() {
    const host = document.createElement("div");
    host.setAttribute("data-ac-history-panel", "");
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>${HistoryPanel.STYLE}</style>
      <div class="overlay">
        <div class="panel" role="dialog" aria-label="${I18n.t("popupTitle")}">
          <input class="search" type="text" autocomplete="off" spellcheck="false" />
          <ul class="list" role="listbox"></ul>
          <div class="hint"></div>
        </div>
      </div>
    `;
    const refs = {
      overlay: shadow.querySelector(".overlay"),
      input: shadow.querySelector(".search"),
      list: shadow.querySelector(".list"),
    };
    refs.input.placeholder = I18n.t("searchHistory");
    shadow.querySelector(".hint").textContent = I18n.t("historyPanelHint");

    // 阻止键盘事件冒泡到页面，避免触发站点自己的快捷键
    ["keydown", "keyup", "keypress"].forEach((type) => {
      host.addEventListener(type, (e) => e.stopPropagation());
    });
    refs.input.addEventListener("input", () => this._filter(refs.input.value));
    refs.input.addEventListener("keydown", (e) => {
      if (e.isComposing) return; // 输入法组词中
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this._move(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this._move(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        this._pick(this.filtered[this.activeIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close({ restoreFocus: true });
      }
    });
    // 失焦（切到地址栏、点到页面其他位置）即关闭
    refs.input.addEventListener("blur", () => this.close());
    // mousedown 阻止默认行为，点击时输入框不失焦
    refs.overlay.addEventListener("mousedown", (e) => e.preventDefault());
    // 在 click（mouseup 之后）才选中 / 关闭：若在 mousedown 就关闭，随后的 mouseup 落到页面上，
    // 会被当成一次划词触发自动复制，覆盖刚写入剪切板的内容
    refs.overlay.addEventListener("click", (e) => {
      const itemEl = e.target.closest(".item");
      if (itemEl) {
        this._pick(this.filtered[Number(itemEl.dataset.index)]);
      } else if (!e.target.closest(".panel")) {
        this.close({ restoreFocus: true });
      }
    });

    (document.body || document.documentElement).appendChild(host);
    this.host = host;
    this.refs = refs;
  }
}

HistoryPanel.STYLE = `
  :host { all: initial; }
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 16vh;
    background: rgba(15, 23, 42, 0.18);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    animation: ac-fade 0.12s ease both;
  }
  .panel {
    width: min(560px, calc(100vw - 32px));
    max-height: min(480px, 70vh);
    display: flex;
    flex-direction: column;
    background: #ffffff;
    color: #1f2937;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 12px;
    box-shadow: 0 24px 48px -12px rgba(15, 23, 42, 0.28), 0 2px 6px rgba(15, 23, 42, 0.08);
    overflow: hidden;
    animation: ac-rise 0.18s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .search {
    flex-shrink: 0;
    box-sizing: border-box;
    width: 100%;
    height: 48px;
    padding: 0 16px;
    border: 0;
    border-bottom: 1px solid #eef0f3;
    outline: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 15px;
  }
  .search::placeholder { color: #9ca3af; }
  .list {
    list-style: none;
    margin: 0;
    padding: 6px;
    overflow-y: auto;
    flex: 1;
  }
  .item {
    position: relative;
    padding: 8px 12px 8px 14px;
    border-radius: 8px;
    cursor: pointer;
  }
  .item + .item { margin-top: 2px; }
  .item:hover { background: #f5f7f9; }
  .item.active { background: #eef8f0; }
  .item.active::before {
    content: "";
    position: absolute;
    left: 4px;
    top: 10px;
    bottom: 10px;
    width: 3px;
    border-radius: 2px;
    background: #51b362;
  }
  .value {
    font-size: 13px;
    line-height: 20px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item.pinned .value::before {
    content: "";
    display: inline-block;
    width: 6px;
    height: 6px;
    margin: 0 6px 1px 0;
    border-radius: 50%;
    background: #51b362;
    vertical-align: middle;
  }
  .meta {
    margin-top: 2px;
    font-size: 11px;
    line-height: 16px;
    color: #9ca3af;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .empty {
    padding: 32px 0;
    text-align: center;
    font-size: 13px;
    color: #9ca3af;
  }
  .hint {
    flex-shrink: 0;
    padding: 8px 16px;
    border-top: 1px solid #eef0f3;
    font-size: 11px;
    color: #9ca3af;
    letter-spacing: 0.02em;
  }
  @keyframes ac-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ac-rise {
    from { opacity: 0; transform: translateY(-8px) scale(0.98); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .overlay, .panel { animation: none; }
  }
  @media (prefers-color-scheme: dark) {
    .overlay { background: rgba(0, 0, 0, 0.4); }
    .panel {
      background: #1f2329;
      color: #e5e7eb;
      border-color: rgba(255, 255, 255, 0.08);
      box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.6);
    }
    .search, .hint { border-color: #2f343c; }
    .search::placeholder, .meta, .empty, .hint { color: #6b7280; }
    .item:hover { background: #2a2f37; }
    .item.active { background: #1f2e23; }
  }
`;
