// Default backend URL for the extension configuration page
const DEFAULT_BACKEND = 'https://sharetube.wumbl3.xyz';

// Initialize the options page with current backend setting
async function load() {
  const { newapp_backend } = await chrome.storage.sync.get(['newapp_backend']);
  document.getElementById('backend-url').value = newapp_backend || DEFAULT_BACKEND;
}

// Save the backend URL to chrome.storage.sync
async function save() {
  const url = document.getElementById('backend-url').value.trim() || DEFAULT_BACKEND;
  await chrome.storage.sync.set({ newapp_backend: url });
  document.getElementById('status').textContent = 'Saved';
}

// Bind save button and load initial state
document.getElementById('save').addEventListener('click', save);
load();


