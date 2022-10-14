const i18n = key => chrome.i18n.getMessage(key);

// 默认颜色
const DEFAULT_COLOR = {
  background: "#51b362",
  color: "#FFFFFF",
};

const optionsHTML = `
  <div class="auto_clipboard_options">
    <form id="optionForm" name="optionForm">
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
      <div class="prview_wrap">
        <span class="preview_desc">${i18n("prview")}：</span>
        <span class="prview rightBottom" id="prview">${i18n(
          "copySuccess"
        )}</span>
      </div>
      <div class="form_submit">
        <button id="submit" type="button">${i18n("save")}</button>
        <button id="recover" type="reset">${i18n("reset")}</button>
        <span class="option_tips">${i18n("saveSuccess")}</span>
      </div>
    </form>
    
  </div>
`;
const optionsDOM = document.createElement('div')
optionsDOM.innerHTML = optionsHTML;
document.body.appendChild(optionsDOM)

const dq = selector => document.querySelector(selector);
const optionForm = dq('#optionForm');
const saveButton = dq("#submit");
const prview = dq('#prview');
const tips = dq('.option_tips');


// 更新预览
const updatePrviewStyle = (style) => {
  Object.keys(style).forEach(key => {
    prview.style[key] = style[key];
  })
}

// 初始化
const init = (colorConfig = DEFAULT_COLOR) => {
  // 数据回填表单
  document.optionForm.background.value = colorConfig.background;
  document.optionForm.color.value = colorConfig.color;
  // 更新预览
  updatePrviewStyle(colorConfig)
}
chrome.storage.sync.get(['background', 'color'], (results) => {
  init({
    ...DEFAULT_COLOR,
    ...(results||{})
  })
})

// 监听事件
saveButton.addEventListener('click', () => {
  const data = new FormData(optionForm)

  chrome.storage.sync.set({
    background: data.get('background'),
    color: data.get('color'),
  }, () => {
    tips.style.display = 'inline-block';
    setTimeout(() => {
      tips.style.display = 'none';
    }, 1500)
  })
})

optionForm.addEventListener('reset', () => {
  updatePrviewStyle(DEFAULT_COLOR)

  document.optionForm.background.value = DEFAULT_COLOR.background;
  document.optionForm.color.value = DEFAULT_COLOR.color;
})

optionForm.addEventListener('change', (e) => {
  const name = e.target.name;
  if(['background', 'color'].includes(name)){
    updatePrviewStyle({
      [name]: e.target.value
    })
  }
})

