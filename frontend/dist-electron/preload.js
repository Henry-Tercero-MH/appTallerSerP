import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("api", {
  getProducts: () => ipcRenderer.invoke("get-products"),
  searchProducts: (query) => ipcRenderer.invoke("search-products", query),
  createSale: (saleData) => ipcRenderer.invoke("create-sale", saleData)
});
