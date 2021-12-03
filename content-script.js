// 复制选中的文本
const copySelectedText = () => {
  const selectedText = window.getSelection().toString()

  if(!selectedText || selectedText?.length === 0)return Promise.reject();
  try {
    return navigator.clipboard.writeText(selectedText);
  } catch (err) {
    console.error(chrome.i18n.getMessage("copyError"), err);
    return Promise.reject();
  }
}
// 提示框
const createMessage = () => {
  const message = document.createElement('div');
  message.id = 'autoClipboardMessage';
  message.setAttribute('style', `
    width: 100px;
    height: 30px;
    background: orange;
    text-align: center;
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 99999;
    color: white;
    border-radius: 4px;
    font-size: 14px;
    line-height: 30px;
  `)
  message.innerText = 'Copy Success';
  message.style.display = 'none';
  document.body.appendChild(message);
  return message;
}

// 监听事件回调
const handleAction = () => {
  copySelectedText().then(() => {
    message.style.display = 'block';
    setTimeout(() => {
      message.style.display = 'none';
    }, 1000)
  }).catch(() => { }) 
}

const message = createMessage();

document.addEventListener('dblclick', handleAction)
document.addEventListener('keyup', handleAction)
document.addEventListener('mouseup', handleAction)