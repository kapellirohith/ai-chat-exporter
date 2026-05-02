chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SEND_TO_AI') {
    const capsule = request.capsule;
    
    // Store it as active context and open the forward HTML page
    chrome.storage.local.set({ active_context: capsule }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('forward.html') });
    });
  }
});
