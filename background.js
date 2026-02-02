// Background service worker for Tab Volume Mixer
console.log('Tab Volume Mixer: Background service worker loaded');

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_TAB_ID' && sender.tab) {
    sendResponse(sender.tab.id);
  }
  return true;
});

// Clean up storage when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove([
    'volume_' + tabId,
    'muted_' + tabId
  ]);
});
