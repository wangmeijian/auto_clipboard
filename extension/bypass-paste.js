/**
 * 强力粘贴：在 document_start 阶段运行在页面主世界（world: "MAIN"）
 * 仅在设置里开启"强力粘贴"时才会被 background.js 注册，默认不生效
 * 与 bypass.js 相同的思路：劫持页面用来阻止粘贴的 preventDefault 调用
 */
(function() {
  var noop = function() {};

  function isPasteShortcut(e) {
    var key = e.key ? e.key.toLowerCase() : '';
    return (key === 'v' || e.code === 'KeyV') && (e.ctrlKey || e.metaKey) && !e.altKey;
  }

  function wrapHandler(type, fn) {
    var _fn = fn;
    return function(e) {
      // 仅处理粘贴事件本身，以及按下粘贴快捷键的按键事件
      if (type !== 'paste' && !isPasteShortcut(e)) {
        return _fn.call(this, e);
      }
      var _pd = e.preventDefault;
      e.preventDefault = noop;
      try { _fn.call(this, e); } finally { e.preventDefault = _pd; }
    };
  }

  // 需要突破的事件：阻止页面通过 preventDefault 来禁止粘贴
  var bypassEvents = ['paste', 'keydown', 'keypress'];

  // 1. 劫持 addEventListener：包裹 handler，使针对粘贴的 preventDefault 失效
  var _origAEL = EventTarget.prototype.addEventListener;
  // 原始 handler -> 包裹后的 handler，供 removeEventListener 找到真正注册过的函数
  var wrapped = new WeakMap();
  EventTarget.prototype.addEventListener = function(type, fn, options) {
    if (bypassEvents.indexOf(type) !== -1 && typeof fn === 'function') {
      var _fn = fn;
      fn = wrapHandler(type, fn);
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

  // 2. 劫持 on* 属性赋值（如 input.onpaste = fn）
  function patchOnHandler(proto, eventName) {
    var prop = 'on' + eventName;
    var desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc || !desc.set) return;
    Object.defineProperty(proto, prop, {
      configurable: true,
      get: desc.get,
      set: function(fn) {
        if (typeof fn === 'function') {
          fn = wrapHandler(eventName, fn);
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
})();
