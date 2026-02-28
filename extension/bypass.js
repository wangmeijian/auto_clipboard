/**
 * 在 document_start 阶段直接运行在页面主世界（world: "MAIN"）
 * 在页面任何脚本运行之前完成对受限事件的劫持
 * 无需创建 <script> 标签注入，不触发页面 CSP 告警
 */
(function() {
  var noop = function() {};
  // 需要突破的事件：阻止页面通过 preventDefault 来禁止这些操作
  var bypassEvents = ['selectstart', 'contextmenu', 'copy', 'cut', 'dragstart'];

  // 1. 劫持 addEventListener：包裹 handler，使 preventDefault 失效
  var _origAEL = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, fn, options) {
    if (bypassEvents.indexOf(type) !== -1 && typeof fn === 'function') {
      var _fn = fn;
      fn = function(e) {
        var _pd = e.preventDefault;
        e.preventDefault = noop;
        try { _fn.call(this, e); } finally { e.preventDefault = _pd; }
      };
      // 保留原始 handler 引用，供 removeEventListener 使用
      fn._original = _fn;
    }
    return _origAEL.call(this, type, fn, options);
  };

  // removeEventListener 也需要对应处理
  var _origREL = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.removeEventListener = function(type, fn, options) {
    if (bypassEvents.indexOf(type) !== -1 && typeof fn === 'function' && fn._original) {
      return _origREL.call(this, type, fn._original, options);
    }
    return _origREL.call(this, type, fn, options);
  };

  // 2. 劫持 on* 属性赋值（如 document.onselectstart = fn、element.oncontextmenu = fn）
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
            var _pd = e.preventDefault;
            e.preventDefault = noop;
            try { _fn.call(this, e); } finally { e.preventDefault = _pd; }
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
})();
