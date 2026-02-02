// Content script to control audio/video volume in the page - OPTIMIZED VERSION

let tabVolume = 1.0;
let masterVolume = 1.0;
let isMuted = false;

// PERFORMANCE FIX: Cache media elements
let mediaCache = new Set();
let lastUpdateTime = 0;
const UPDATE_THROTTLE = 50; // ms

// PERFORMANCE FIX: Throttled update function
function updateMediaVolume() {
  const now = Date.now();
  if (now - lastUpdateTime < UPDATE_THROTTLE) {
    return; // Skip if updated recently
  }
  lastUpdateTime = now;
  
  const finalVolume = isMuted ? 0 : (tabVolume * masterVolume);
  
  // Update cached elements
  mediaCache.forEach(media => {
    if (!document.contains(media)) {
      // Element was removed, remove from cache
      mediaCache.delete(media);
      return;
    }
    
    // Store original volume if not already stored
    if (!media.dataset.originalVolume) {
      media.dataset.originalVolume = media.volume;
    }
    
    // Apply the volume
    const originalVolume = parseFloat(media.dataset.originalVolume);
    media.volume = Math.min(Math.max(originalVolume * finalVolume, 0), 1.0);
  });
}

// PERFORMANCE FIX: Debounced version for rapid changes
let updateTimeout;
function scheduleUpdate() {
  if (updateTimeout) return; // Update already scheduled
  
  updateTimeout = setTimeout(() => {
    updateMediaVolume();
    updateTimeout = null;
  }, 16); // ~60fps
}

// Function to add media element to cache and apply volume
function trackMediaElement(media) {
  if (!mediaCache.has(media)) {
    mediaCache.add(media);
    
    // Set initial volume
    if (!media.dataset.originalVolume) {
      media.dataset.originalVolume = media.volume;
    }
    
    const finalVolume = isMuted ? 0 : (tabVolume * masterVolume);
    const originalVolume = parseFloat(media.dataset.originalVolume);
    media.volume = Math.min(Math.max(originalVolume * finalVolume, 0), 1.0);
  }
}

// PERFORMANCE FIX: More targeted mutation observer
const observer = new MutationObserver((mutations) => {
  let foundNewMedia = false;
  
  for (const mutation of mutations) {
    // Only check added nodes
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue; // Skip non-elements
      
      // Check if it's a media element
      if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
        trackMediaElement(node);
        foundNewMedia = true;
      } else if (node.querySelectorAll) {
        // Check for media elements inside
        const mediaElements = node.querySelectorAll('audio, video');
        if (mediaElements.length > 0) {
          mediaElements.forEach(trackMediaElement);
          foundNewMedia = true;
        }
      }
    }
  }
  
  // Only update if we found new media
  if (foundNewMedia) {
    scheduleUpdate();
  }
});

// PERFORMANCE FIX: Observe only body, not whole document
function startObserving() {
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  } else {
    // If body doesn't exist yet, wait for it
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }
}

// Initial scan for existing media elements
function initialScan() {
  const mediaElements = document.querySelectorAll('audio, video');
  mediaElements.forEach(trackMediaElement);
}

// Start observing
startObserving();
initialScan();

// PERFORMANCE FIX: Debounced message handler
let messageUpdateTimeout;
function handleVolumeMessage(message) {
  if (message.type === 'SET_VOLUME') {
    // SECURITY FIX: Validate volume
    const volume = parseFloat(message.volume);
    if (isNaN(volume) || volume < 0 || volume > 1) {
      return { success: false, error: 'Invalid volume' };
    }
    
    tabVolume = volume;
    scheduleUpdate();
    return { success: true };
    
  } else if (message.type === 'SET_MASTER_VOLUME') {
    // SECURITY FIX: Validate volume
    const volume = parseFloat(message.volume);
    if (isNaN(volume) || volume < 0 || volume > 1) {
      return { success: false, error: 'Invalid volume' };
    }
    
    masterVolume = volume;
    scheduleUpdate();
    return { success: true };
    
  } else if (message.type === 'SET_MUTE') {
    isMuted = Boolean(message.muted);
    scheduleUpdate();
    return { success: true };
  }
  
  return { success: false, error: 'Unknown message type' };
}

// Listen for volume changes from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Check if tab has media elements
  if (message.type === 'CHECK_MEDIA') {
    const hasMedia = mediaCache.size > 0 || document.querySelectorAll('audio, video').length > 0;
    const isPlaying = Array.from(mediaCache).some(media => !media.paused);
    sendResponse({ 
      hasMedia: hasMedia,
      isPlaying: isPlaying,
      mediaCount: mediaCache.size
    });
    return true;
  }
  
  const result = handleVolumeMessage(message);
  sendResponse(result);
  return true;
});

// Load saved settings when page loads
(async () => {
  try {
    const tabId = await chrome.runtime.sendMessage({ type: 'GET_TAB_ID' });
    
    const settings = await chrome.storage.local.get([
      `volume_${tabId}`,
      `muted_${tabId}`,
      'masterVolume'
    ]);
    
    // SECURITY FIX: Validate all retrieved values
    const savedTabVolume = settings[`volume_${tabId}`];
    if (typeof savedTabVolume === 'number' && savedTabVolume >= 0 && savedTabVolume <= 100) {
      tabVolume = savedTabVolume / 100;
    }
    
    isMuted = Boolean(settings[`muted_${tabId}`]);
    
    const savedMasterVolume = settings.masterVolume;
    if (typeof savedMasterVolume === 'number' && savedMasterVolume >= 0 && savedMasterVolume <= 100) {
      masterVolume = savedMasterVolume / 100;
    }
    
    updateMediaVolume();
  } catch (error) {
    console.error('Failed to load volume settings:', error);
  }
})();

// Listen for play events to ensure volume is set
document.addEventListener('play', (e) => {
  if (e.target.tagName === 'AUDIO' || e.target.tagName === 'VIDEO') {
    trackMediaElement(e.target);
    scheduleUpdate();
  }
}, true);

// PERFORMANCE FIX: Clean up when page unloads
window.addEventListener('beforeunload', () => {
  observer.disconnect();
  mediaCache.clear();
});

// PERFORMANCE FIX: Periodic cleanup of removed elements
setInterval(() => {
  const elementsToRemove = [];
  
  mediaCache.forEach(media => {
    if (!document.contains(media)) {
      elementsToRemove.push(media);
    }
  });
  
  elementsToRemove.forEach(media => mediaCache.delete(media));
}, 5000); // Clean up every 5 seconds
