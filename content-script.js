
const copySelectedText = () => {
  console.log(document.getSelection());
}

document.addEventListener('dblclick', copySelectedText)