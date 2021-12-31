const i18n = key => chrome.i18n.getMessage(key);

class AutoClipboard {
  constructor(){
    this.message = null;
    this.selectedText = '';
    this._init();
  }
  /**
   * 初始化提示语颜色
   */
  _init(){
    this._getStorage().then(config => {
      this.message = this._createMessage(config.background, config.color);
    })
    this._addActionListener();
  }
  
  /**
   * 获取配置
   * @returns Promise 
   */
  _getStorage(){
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get(['background', 'color'], config => {
        config ? resolve(config) : reject({})
      })
    })
  }
  /**
   * 复制选中的文本
   * @returns Promise
   */ 
  _copySelectedText() {
    const selectedText = window.getSelection().toString()

    if(!selectedText || selectedText?.length === 0)return Promise.reject();
    this.selectedText = selectedText;
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
  _createMessage(background = "#51b362", color = "white"){
    const message = document.createElement('div');
    message.id = 'autoClipboardMessage';
    message.setAttribute('style', `
      width: 100px;
      height: 30px;
      text-align: center;
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 9999999;
      border-radius: 4px;
      font-size: 14px;
      line-height: 30px;
      margin: 0;
      padding: 0;
      background: ${background};
      color: ${color};
    `)
    message.innerText = i18n("copySuccess");
    message.style.display = 'none';
    document.body && document.body.appendChild(message);
    return message;
  }
  /**
   * 更新Message样式
   * @style CSSStyleDeclaration
   */
  _updateMessageStyle(style){
    if(!this.message)return;
    Object.keys(style).forEach(key => {
      if(key in this.message.style){
        this.message.style[key] = style[key];
      }
    })
  }
  /**
   * 监听事件回调
   */
  _handleAction(e){
    // 要复制输入框内容，需按下ctrl键（Mac上为command键）
    if(e && !e.metaKey && ['input', 'textarea'].includes(document.activeElement.nodeName.toLowerCase()))return;
    this._copySelectedText().then(() => {
      chrome.storage.sync.get(['background', 'color'], results => {
        this._updateMessageStyle({
          ...results,
          display: 'block'
        })
        setTimeout(() => {
          this._updateMessageStyle({
            display: 'none'
          })
        }, 2000) 
      })
      
    }).catch(() => { }) 
  }
  /**
   * 组合键
   * @event Event 事件对象
   */
  _combinationKey(event){
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    const actionKey = event.key;

    // 按住shift组合键和上下左右或Home或End键，来选择文本
    if(event.shiftKey && keys.includes(actionKey)){
      this._handleAction(event);
    }
  }
  /**
   * 事件绑定
   */
  _addActionListener(){
    document.addEventListener('dblclick', this._handleAction.bind(this));
    document.addEventListener('keyup', this._combinationKey.bind(this));
    document.addEventListener('mouseup', (e) => {
      setTimeout(this._handleAction.bind(this, e), 0);
    });
  }
}

new AutoClipboard();

