/**
 * 获取当前激活的Tab
 * @returns Promise<chrome.tabs.Tab[] | undefined>
 */
const getCurrentWindowTabs = () => {
  return new Promise((resolve, _reject)=>{
    chrome.tabs.query({currentWindow: true}, (tabs)=>{
      if(tabs.length)
        resolve(tabs);
      else
        resolve(undefined);
    });
  });
}

// 监听storage变化，实时更新提示语样式
chrome.storage.onChanged.addListener(function (changes) {
  const changeData = {};

  for (let [key, { newValue }] of Object.entries(changes)) {
    switch(key){
      case 'background':
      case 'color':
        changeData[key] = newValue;
        break;
    }
  }
  getCurrentWindowTabs().then(tabs => {
    console.log(tabs);
    if(tabs.length){
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'updateMessage',
          data: changeData
        });
      })
    }
  });
});