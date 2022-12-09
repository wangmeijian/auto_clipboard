(() => {
  // 设置全局样式
  const setGlobalStylesheet = () => {
    const globalStyle = document.createElement("style");
    globalStyle.innerText = `
      * {
        user-select: auto !important;
        -webkit-user-select: auto !important;
      }
    `;
    document.head && document.head.appendChild(globalStyle);
  };
  setGlobalStylesheet();
})();
