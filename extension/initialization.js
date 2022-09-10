(() => {
  const setGlobalStylesheet = () => {
    const globalStyle = document.createElement("style");
    globalStyle.innerText = `
      * {
        user-select: auto !important;
        -webkit-user-select: auto !important;
      }
    `;
    document.head.appendChild(globalStyle);
  };

  // 监听DOM变化，移除指定属性
  const removeAttribute = () => {
    const attributes = [
      "oncopy",
      "unselectable",
      "onmouseup",
      "selectstart",
      "dragstart",
    ];
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const node = mutation.target;

        if (node instanceof HTMLElement) {
          attributes.forEach((attr) => node.removeAttribute(attr));
        }
      }
    });

    // 开始监听
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  };

  setGlobalStylesheet();
  removeAttribute();
})();
