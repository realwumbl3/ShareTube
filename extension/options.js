const DEFAULT_BACKEND = 'http://localhost:5100';

async function load() {
  const { newapp_backend } = await chrome.storage.sync.get(['newapp_backend']);
  document.getElementById('backend-url').value = newapp_backend || DEFAULT_BACKEND;
}

async function save() {
  const url = document.getElementById('backend-url').value.trim() || DEFAULT_BACKEND;
  await chrome.storage.sync.set({ newapp_backend: url });
  document.getElementById('status').textContent = 'Saved';
}

document.getElementById('save').addEventListener('click', save);
load();


