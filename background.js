console.log("service worker");

let browserTabIds = [];

browser.action.onClicked.addListener((e) => {
    e.url &&
      e.url.includes("http") &&
      browser.tabs.sendMessage(e.id, { message: "actionButtonClicked" });
      browser.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      let tab = tabs[0];
      let id = tab.id;
      
      if(false) {
        chrome.scripting.executeScript({
          target: { tabId: id, allFrames: true },
          files: ["main.js"],
        });
        browserTabIds.push(id);
        console.log("executed");
      } else {
        console.log("already injected");
      }
    });
  });

