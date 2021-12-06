const i18n = key => chrome.i18n.getMessage(key);

class AutoClipboard {
  constructor(){
    this.message = this._createMessage();
    this._addActionListener();
  }
  /**
   * 复制选中的文本
   * @returns Promise
   */ 
  _copySelectedText() {
    const selectedText = window.getSelection().toString()

    if(!selectedText || selectedText?.length === 0)return Promise.reject();
    // 仅在https下可用
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(selectedText);
    } else {
      return new Promise((resolve, reject) => {
          document.execCommand('copy') ? resolve() : reject();
      });
    }
  }
  /**
   * 提示框
   * @returns HTMLElement
   */
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
      margin: 0;
      padding: 0;
    `)
    message.innerText = i18n("copySuccess");
    message.style.display = 'none';
    document.body.appendChild(message);
    return message;
  }
  /**
   * 监听事件回调
   */
  _handleAction(){
    this._copySelectedText().then(() => {
      this.message.style.display = 'block';
      setTimeout(() => {
        this.message.style.display = 'none';
      }, 1000) 
    }).catch(() => { }) 
  }
  /**
   * 事件绑定
   */
  _addActionListener(){
    const events = ['dblclick', 'keyup', 'mouseup'];

    events.forEach(item => {
      document.addEventListener(item, this._handleAction.bind(this))  
    })
  }
}

new AutoClipboard();

