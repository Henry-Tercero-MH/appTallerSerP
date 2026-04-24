"use strict";
const electron = require("electron");
const api = {
  settings: {
    getAll: () => electron.ipcRenderer.invoke("settings:get-all"),
    get: (key) => electron.ipcRenderer.invoke("settings:get", key),
    set: (key, value) => electron.ipcRenderer.invoke("settings:set", key, value),
    getByCategory: (category) => electron.ipcRenderer.invoke("settings:get-by-category", category)
  },
  products: {
    list: () => electron.ipcRenderer.invoke("products:list"),
    search: (query) => electron.ipcRenderer.invoke("products:search", query)
  },
  sales: {
    create: (saleData) => electron.ipcRenderer.invoke("sales:create", saleData)
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
