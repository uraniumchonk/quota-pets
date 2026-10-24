const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('host', {
  init: () => ipcRenderer.invoke('init'),
  mask: (url) => ipcRenderer.invoke('mask', url),
  on: (ch, fn) => ipcRenderer.on(ch, (_e, v) => fn(v)),
  size: (w, h) => ipcRenderer.send('size', w, h),
  hit: (over) => ipcRenderer.send('hit', over),
  menu: () => ipcRenderer.send('menu'),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  save: (cfg, opts) => ipcRenderer.send('save', cfg, opts),
  edit: (on) => ipcRenderer.send('edit', on),
});
