const dq = selector => document.querySelector(selector);
const optionForm = dq('#optionForm');
const saveButton = dq('#submit');
const resetButton = dq('#recover');
const background = dq('input[name="background"]');
const color = dq('input[name="color"]');
const prview = dq('.prview');
const tips = dq('.option_tips');

// 默认颜色
const DEFAULT_COLOR = {
  background: '#51b362',
  color: '#ffffff',
}
// 更新预览
const updatePrviewStyle = (style) => {
  Object.keys(style).forEach(key => {
    prview.style[key] = style[key];
  })
}
// 更新配置
const updateStorage = style => {
  chrome.storage.sync.set({
    ...style
  }, () => {
    tips.style.display = 'inline-block';
    setTimeout(() => {
      tips.style.display = 'none';
    }, 1000)
  })
}
// 初始化
const init = (colorConfig = DEFAULT_COLOR) => {
  background.setAttribute('value', colorConfig.background)
  color.setAttribute('value', colorConfig.color)
  updatePrviewStyle(colorConfig)
}
chrome.storage.sync.get(['background', 'color'], (result) => {
  init({
    ...DEFAULT_COLOR,
    ...(result || {})
  })
})

saveButton.addEventListener('click', () => {
  const data = new FormData(optionForm)
  chrome.storage.sync.set({
    background: data.get('background'),
    color: data.get('color'),
  }, () => {
    tips.style.display = 'inline-block';
    setTimeout(() => {
      tips.style.display = 'none';
    }, 1000)
  })
})

optionForm.addEventListener('reset', () => {
  updatePrviewStyle(DEFAULT_COLOR)

  background.setAttribute('value', DEFAULT_COLOR.background)
  color.setAttribute('value', DEFAULT_COLOR.color)
})

background.addEventListener('change', (e) => {
  updatePrviewStyle({
    background: e.target.value
  })
})

color.addEventListener('change', (e) => {
  updatePrviewStyle({
    color: e.target.value
  })
})
