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
    search: (query) => electron.ipcRenderer.invoke("products:search", query),
    getById: (id) => electron.ipcRenderer.invoke("products:get-by-id", id)
  },
  customers: {
    list: (opts) => electron.ipcRenderer.invoke("customers:list", opts),
    search: (query, opts) => electron.ipcRenderer.invoke("customers:search", query, opts),
    getById: (id) => electron.ipcRenderer.invoke("customers:get-by-id", id),
    create: (input) => electron.ipcRenderer.invoke("customers:create", input),
    update: (id, patch) => electron.ipcRenderer.invoke("customers:update", id, patch),
    setActive: (id, active) => electron.ipcRenderer.invoke("customers:set-active", id, active)
  },
  sales: {
    create: (saleData) => electron.ipcRenderer.invoke("sales:create", saleData),
    getById: (id) => electron.ipcRenderer.invoke("sales:get-by-id", id),
    list: (opts) => electron.ipcRenderer.invoke("sales:list", opts)
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
