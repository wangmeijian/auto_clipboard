(() => {
  // 设置全局样式
  const setGlobalStylesheet = () => {
    const globalStyle = document.createElement("style");
    globalStyle.innerText = `
      * {
        user-select: text !important;
        -webkit-user-select: text !important;
      }
    `;
    document.head && document.head.appendChild(globalStyle);
  };
  setGlobalStylesheet();
})();
