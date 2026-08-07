console.log("service worker");

// Firefox exposes the WebExtension APIs as `browser`, Chrome as `chrome`.
let extApi = globalThis.browser ?? globalThis.chrome;

extApi.action.onClicked.addListener((tab) => {
  tab.url &&
    tab.url.includes("http") &&
    extApi.tabs.sendMessage(tab.id, { message: "actionButtonClicked" });
});
