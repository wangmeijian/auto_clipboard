/**
 * 在 document_start 阶段直接运行在页面主世界（world: "MAIN"）
 * 在页面任何脚本运行之前完成对受限事件的劫持
 * 无需创建 <script> 标签注入，不触发页面 CSP 告警
 */
(function() {
  // 需要突破的事件：阻止页面通过 preventDefault 来禁止这些操作
  var bypassEvents = ['selectstart', 'copy', 'cut', 'dragstart'];

  // 包裹 handler 并让 preventDefault 失效。
  // 例外：copy/cut 事件里 handler 若通过 clipboardData 写入了内容（Google Docs/Sheets 等
  // 在线编辑器的做法），其 preventDefault 是「用我写入的内容覆盖浏览器默认复制」的必要信号，
  // 必须保留，否则浏览器会用（空的）原生选区覆盖写入内容，导致粘贴为空白。
  function runNeutralized(self, _fn, e) {
    var _pd = e.preventDefault;
    var isClip = (e.type === 'copy' || e.type === 'cut') && e.clipboardData;
    var wrote = false, prevented = false;
    var dt = isClip ? e.clipboardData : null;
    var _set = null, _items = null;
    if (dt) {
      try {
        _set = dt.setData;
        dt.setData = function() { wrote = true; return _set.apply(dt, arguments); };
      } catch (err) {}
      try {
        _items = dt.items && dt.items.add;
        if (_items) dt.items.add = function() { wrote = true; return _items.apply(dt.items, arguments); };
      } catch (err) {}
    }
    e.preventDefault = function() { prevented = true; };
    try { _fn.call(self, e); } finally {
      e.preventDefault = _pd;
      if (dt) {
        try { if (_set) delete dt.setData; } catch (err) {}
        try { if (_items) delete dt.items.add; } catch (err) {}
      }
      if (prevented && wrote) _pd.call(e);
    }
  }

  // 1. 劫持 addEventListener：包裹 handler，使 preventDefault 失效
  var _origAEL = EventTarget.prototype.addEventListener;
  // 原始 handler -> 包裹后的 handler，供 removeEventListener 找到真正注册过的函数
  var wrapped = new WeakMap();
  // 文档被 Permissions Policy 明确禁止 unload 时，页面注册的 unload 监听本就不会触发，
  // 直接跳过注册，避免浏览器把违规日志的堆栈记在本脚本头上。
  // 仅当浏览器认识 unload 这个 feature 且当前文档不允许时才跳过，其余情况原样放行。
  function isUnloadDisallowed() {
    try {
      var pp = document.permissionsPolicy || document.featurePolicy;
      return !!pp && pp.features().indexOf('unload') !== -1 && !pp.allowsFeature('unload');
    } catch (err) {
      return false;
    }
  }

  EventTarget.prototype.addEventListener = function(type, fn, options) {
    if (type === 'unload' && isUnloadDisallowed()) return;
    if (bypassEvents.indexOf(type) !== -1 && typeof fn === 'function') {
      var _fn = fn;
      fn = function(e) {
        // 视频/音频元素上的事件不劫持 preventDefault，避免影响浏览器原生功能（如画中画）
        var t = e && e.target;
        if (t && (t.tagName === 'VIDEO' || t.tagName === 'AUDIO' || (t.closest && (t.closest('video') || t.closest('audio'))))) {
          return _fn.call(this, e);
        }
        runNeutralized(this, _fn, e);
      };
      wrapped.set(_fn, fn);
    }
    return _origAEL.call(this, type, fn, options);
  };

  // removeEventListener 也需要对应处理
  var _origREL = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.removeEventListener = function(type, fn, options) {
    if (bypassEvents.indexOf(type) !== -1 && typeof fn === 'function' && wrapped.has(fn)) {
      return _origREL.call(this, type, wrapped.get(fn), options);
    }
    return _origREL.call(this, type, fn, options);
  };

  // 2. 劫持 on* 属性赋值（如 document.onselectstart = fn）
  function patchOnHandler(proto, eventName) {
    var prop = 'on' + eventName;
    var desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc || !desc.set) return;
    Object.defineProperty(proto, prop, {
      configurable: true,
      get: desc.get,
      set: function(fn) {
        if (typeof fn === 'function') {
          var _fn = fn;
          fn = function(e) {
            // 视频/音频元素上的事件不劫持 preventDefault，避免影响浏览器原生功能（如画中画）
            var t = e && e.target;
            if (t && (t.tagName === 'VIDEO' || t.tagName === 'AUDIO' || (t.closest && (t.closest('video') || t.closest('audio'))))) {
              return _fn.call(this, e);
            }
            runNeutralized(this, _fn, e);
          };
        }
        desc.set.call(this, fn);
      }
    });
  }

  bypassEvents.forEach(function(ev) {
    [HTMLElement.prototype, Document.prototype, Window.prototype].forEach(function(proto) {
      try { patchOnHandler(proto, ev); } catch (err) {}
    });
  });

  // 3. 防止页面在复制后用 Clipboard API 追加版权尾巴
  //    典型做法：copy 事件后 setTimeout 调 navigator.clipboard.writeText(选中内容 + 尾巴)
  //    仅在复制后很短的时间窗口内、写入内容以选中内容开头并更长时，改为只写入选中内容
  //    复制后用户又点击了页面（如站点自带的「复制代码」「复制链接」按钮）则视为正常写入，不处理
  var COPY_WINDOW_MS = 1000;
  var lastCopy = { text: '', time: 0 };
  _origAEL.call(window, 'copy', function() {
    var selection = window.getSelection();
    lastCopy = { text: selection ? selection.toString().trim() : '', time: Date.now() };
  }, true);
  _origAEL.call(window, 'pointerdown', function() {
    lastCopy = { text: '', time: 0 };
  }, true);

  function stripAppended(text) {
    if (typeof text !== 'string' || !lastCopy.text) return text;
    if (Date.now() - lastCopy.time > COPY_WINDOW_MS) return text;
    var appended = text.length > lastCopy.text.length && text.trim().indexOf(lastCopy.text) === 0;
    if (!appended) return text;
    var result = lastCopy.text;
    // 只拦截一次
    lastCopy = { text: '', time: 0 };
    return result;
  }

  if (typeof Clipboard !== 'undefined' && Clipboard.prototype.writeText) {
    var _origWriteText = Clipboard.prototype.writeText;
    Clipboard.prototype.writeText = function(text) {
      return _origWriteText.call(this, stripAppended(text));
    };
  }
})();
