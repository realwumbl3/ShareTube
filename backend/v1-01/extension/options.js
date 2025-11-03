// Default backend URL for the extension configuration page
const DEFAULT_BACKEND = 'https://sharetube.wumbl3.xyz';

// Initialize the options page with current backend setting
async function load() {
  const { backend_url } = await chrome.storage.sync.get(['backend_url']);
  document.getElementById('backend-url').value = backend_url || DEFAULT_BACKEND;
}

// Save the backend URL to chrome.storage.sync
async function save() {
  const url = document.getElementById('backend-url').value.trim() || DEFAULT_BACKEND;
  await chrome.storage.sync.set({ backend_url: url });
  document.getElementById('status').textContent = 'Saved';
}

// Bind save button and load initial state
document.getElementById('save').addEventListener('click', save);
load();


