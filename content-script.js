const i18n = key => chrome.i18n.getMessage(key);
class AutoClipboard {
  constructor(){
    this.message = this._createMessage();
    this._addActionListener();
  }
  // 复制选中的文本
  _copySelectedText() {
    const selectedText = window.getSelection().toString()

    if(!selectedText || selectedText?.length === 0)return Promise.reject();
    try {
      navigator.clipboard.writeText(selectedText);
      return Promise.resolve(selectedText);
    } catch (err) {
      console.error(i18n("copyError"), err);
      return Promise.reject();
    }
  }
  // 提示框
  _createMessage(){
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
    message.innerText = i18n("copySuccess");
    message.style.display = 'none';
    document.body.appendChild(message);
    return message;
  }
  // 监听事件回调
  _handleAction(){
    this._copySelectedText().then((copySelectedText) => {
      this.message.style.display = 'block';
      setTimeout(() => {
        this.message.style.display = 'none';
      }, 1000)
    }).catch(() => { }) 
  }
  // 事件绑定
  _addActionListener(){
    const events = ['dblclick', 'keyup', 'mouseup', 'unload'];

    events.forEach(item => {
      document.addEventListener(item, this._handleAction.bind(this))  
    })
  }
}

new AutoClipboard();

