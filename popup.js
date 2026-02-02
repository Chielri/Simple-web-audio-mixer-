// Utility: Sanitize HTML to prevent XSS
function sanitizeHTML(str) {
  const temp = document.createElement('div');
  temp.textContent = str;
  return temp.innerHTML;
}

// Utility: Validate and sanitize URL
function sanitizeURL(url) {
  if (!url || typeof url !== 'string') return null;
  
  // Only allow http, https, and chrome-extension data URLs
  if (url.startsWith('http://') || url.startsWith('https://') || 
      url.startsWith('chrome-extension://') || url.startsWith('data:image/')) {
    return url;
  }
  
  return null;
}

// Utility: Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Get all tabs and populate the mixer
async function loadTabs() {
  const channelsContainer = document.getElementById('channels');
  const tabs = await chrome.tabs.query({});
  
  // Filter tabs that can play audio (have http/https URLs)
  const audioTabs = tabs.filter(tab => 
    tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
  );

  if (audioTabs.length === 0) {
    showEmptyState('No active tabs with audio detected.<br>Open some tabs with media to control their volume.');
    return;
  }

  // Check each tab for media elements
  const tabsWithMedia = [];
  for (const tab of audioTabs) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'CHECK_MEDIA' });
      if (response && response.hasMedia) {
        tabsWithMedia.push({
          tab: tab,
          isPlaying: response.isPlaying,
          mediaCount: response.mediaCount
        });
      }
    } catch (error) {
      // Tab doesn't have content script or doesn't respond - skip it
      console.log('Could not check media for tab:', tab.id);
    }
  }

  if (tabsWithMedia.length === 0) {
    showEmptyState('No tabs with media elements found.<br>Play a video or audio to see volume controls.');
    return;
  }

  channelsContainer.innerHTML = '';

  for (const {tab, isPlaying} of tabsWithMedia) {
    const channel = await createChannel(tab, isPlaying);
    channelsContainer.appendChild(channel);
  }
}

// Show empty state message
function showEmptyState(message) {
  const channelsContainer = document.getElementById('channels');
  const emptyState = document.createElement('div');
  emptyState.className = 'empty-state';
  emptyState.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/>
    </svg>
    <p>${message}</p>
  `;
  channelsContainer.innerHTML = '';
  channelsContainer.appendChild(emptyState);
}

// Create a channel element for a tab - SECURE VERSION
async function createChannel(tab, isPlaying = false) {
  const channel = document.createElement('div');
  channel.className = 'channel';
  if (isPlaying) {
    channel.classList.add('playing');
  }
  channel.dataset.tabId = tab.id;

  // Get saved volume or default to 100
  const savedVolume = await getTabVolume(tab.id);
  const volume = savedVolume !== null ? savedVolume : 100;

  // Validate volume is in range
  const validVolume = Math.max(0, Math.min(100, volume));

  // Get mute state
  const isMuted = await getTabMuteState(tab.id);

  // SECURITY FIX: Sanitize favicon URL
  const rawFavicon = tab.favIconUrl;
  const favicon = sanitizeURL(rawFavicon) || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%238b9bb4" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>';
  
  // SECURITY FIX: Sanitize title
  const title = sanitizeHTML(tab.title || 'Untitled');

  // Create icon container
  const iconContainer = document.createElement('div');
  iconContainer.className = 'channel-icon';
  
  const iconImg = document.createElement('img');
  iconImg.src = favicon;
  iconImg.alt = '';
  iconImg.style.width = '100%';
  iconImg.style.height = '100%';
  iconImg.style.objectFit = 'contain';
  iconImg.onerror = function() {
    // Fallback if icon fails to load
    this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%238b9bb4" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>';
  };
  iconContainer.appendChild(iconImg);

  // Create channel info
  const channelInfo = document.createElement('div');
  channelInfo.className = 'channel-info';

  const channelTitle = document.createElement('div');
  channelTitle.className = 'channel-title';
  
  // Add playing indicator if media is playing
  if (isPlaying) {
    const playingIndicator = document.createElement('span');
    playingIndicator.className = 'playing-indicator';
    playingIndicator.innerHTML = '▶';
    playingIndicator.title = 'Playing';
    channelTitle.appendChild(playingIndicator);
  }
  
  const titleText = document.createElement('span');
  titleText.textContent = tab.title || 'Untitled';
  channelTitle.appendChild(titleText);

  const volumeControl = document.createElement('div');
  volumeControl.className = 'volume-control';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'volume-slider';
  slider.min = '0';
  slider.max = '100';
  slider.value = validVolume;
  slider.dataset.tabId = tab.id;

  const volumeValue = document.createElement('span');
  volumeValue.className = 'volume-value';
  volumeValue.textContent = `${validVolume}%`;

  volumeControl.appendChild(slider);
  volumeControl.appendChild(volumeValue);

  channelInfo.appendChild(channelTitle);
  channelInfo.appendChild(volumeControl);

  // Create mute button
  const muteBtn = document.createElement('button');
  muteBtn.className = `channel-mute ${isMuted ? 'active' : ''}`;
  muteBtn.dataset.tabId = tab.id;
  muteBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" fill="currentColor"/>
    </svg>
  `;

  // Assemble channel
  channel.appendChild(iconContainer);
  channel.appendChild(channelInfo);
  channel.appendChild(muteBtn);

  if (isMuted) {
    channel.classList.add('muted');
  }

  // PERFORMANCE FIX: Debounce volume changes
  const debouncedVolumeUpdate = debounce(async (tabId, newVolume) => {
    await setTabVolume(tabId, newVolume);
  }, 150); // Wait 150ms after user stops moving slider

  // Add volume slider event
  slider.addEventListener('input', (e) => {
    const newVolume = parseInt(e.target.value);
    volumeValue.textContent = `${newVolume}%`;
    debouncedVolumeUpdate(tab.id, newVolume);
  });

  // Add mute button event
  muteBtn.addEventListener('click', async () => {
    const currentMuted = muteBtn.classList.contains('active');
    const newMuted = !currentMuted;
    
    muteBtn.classList.toggle('active');
    channel.classList.toggle('muted');
    
    await setTabMuteState(tab.id, newMuted);
  });

  return channel;
}

// Set volume for a specific tab
async function setTabVolume(tabId, volume) {
  // SECURITY FIX: Validate volume
  const validVolume = Math.max(0, Math.min(100, parseInt(volume)));
  
  // Save the volume setting
  await chrome.storage.local.set({ [`volume_${tabId}`]: validVolume });
  
  // Send message to content script to update volume
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'SET_VOLUME',
      volume: validVolume / 100
    });
  } catch (error) {
    // Tab might not have content script loaded yet
    console.log('Could not send volume update:', error);
  }
}

// Get saved volume for a tab
async function getTabVolume(tabId) {
  const result = await chrome.storage.local.get(`volume_${tabId}`);
  const volume = result[`volume_${tabId}`];
  
  // SECURITY FIX: Validate retrieved value
  if (typeof volume === 'number' && volume >= 0 && volume <= 100) {
    return volume;
  }
  return null;
}

// Set mute state for a tab
async function setTabMuteState(tabId, muted) {
  // SECURITY FIX: Ensure boolean
  const validMuted = Boolean(muted);
  
  await chrome.storage.local.set({ [`muted_${tabId}`]: validMuted });
  
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'SET_MUTE',
      muted: validMuted
    });
  } catch (error) {
    console.log('Could not send mute update:', error);
  }
}

// Get saved mute state for a tab
async function getTabMuteState(tabId) {
  const result = await chrome.storage.local.get(`muted_${tabId}`);
  return Boolean(result[`muted_${tabId}`]);
}

// Master volume control
const masterSlider = document.getElementById('masterVolume');
const masterValue = document.getElementById('masterValue');

// PERFORMANCE FIX: Debounce master volume
const debouncedMasterUpdate = debounce(async (volume) => {
  const validVolume = Math.max(0, Math.min(100, parseInt(volume)));
  
  // Save master volume
  await chrome.storage.local.set({ masterVolume: validVolume });
  
  // Apply to all tabs
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'SET_MASTER_VOLUME',
          volume: validVolume / 100
        });
      } catch (error) {
        // Ignore errors for tabs without content script
      }
    }
  }
}, 150);

masterSlider.addEventListener('input', (e) => {
  const volume = parseInt(e.target.value);
  masterValue.textContent = `${volume}%`;
  debouncedMasterUpdate(volume);
});

// Load saved master volume
async function loadMasterVolume() {
  const result = await chrome.storage.local.get('masterVolume');
  const volume = result.masterVolume ?? 100;
  
  // SECURITY FIX: Validate
  const validVolume = Math.max(0, Math.min(100, parseInt(volume)));
  
  masterSlider.value = validVolume;
  masterValue.textContent = `${validVolume}%`;
}

// Master mute button
const masterMuteBtn = document.getElementById('masterMute');
let allMuted = false;

masterMuteBtn.addEventListener('click', async () => {
  allMuted = !allMuted;
  masterMuteBtn.classList.toggle('active');
  
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
      await setTabMuteState(tab.id, allMuted);
      
      // Update UI
      const channel = document.querySelector(`[data-tab-id="${tab.id}"]`);
      if (channel) {
        const muteBtn = channel.querySelector('.channel-mute');
        if (allMuted) {
          muteBtn.classList.add('active');
          channel.classList.add('muted');
        } else {
          muteBtn.classList.remove('active');
          channel.classList.remove('muted');
        }
      }
    }
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadMasterVolume();
  await loadTabs();
});

// Refresh button
const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) {
  refreshBtn.addEventListener('click', async () => {
    // Add spinning animation
    refreshBtn.style.transform = 'rotate(360deg)';
    refreshBtn.style.transition = 'transform 0.5s ease';
    
    await loadTabs();
    
    // Reset animation
    setTimeout(() => {
      refreshBtn.style.transform = 'rotate(0deg)';
      refreshBtn.style.transition = 'none';
    }, 500);
  });
}
