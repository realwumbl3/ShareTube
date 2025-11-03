// Default backend URL used when user hasn't configured a custom one
const DEFAULT_BACKEND = "https://sharetube.wumbl3.xyz";

// Initialize popup UI with current settings/token status and log level
async function load() {
  const { backend_url } = await chrome.storage.sync.get(["backend_url"]);
  document.getElementById("backend-url").value = backend_url || DEFAULT_BACKEND;

  const { auth_token } = await chrome.storage.local.get(["auth_token"]);
  document.getElementById("status").textContent = auth_token ? "Signed in" : "Signed out";

  try {
    const { newapp_log_level } = await chrome.storage.sync.get(["newapp_log_level"]);
    const lvl = (newapp_log_level || "warn").toLowerCase();
    const sel = document.getElementById("log-level");
    if (sel) sel.value = ["silent","error","warn","info","debug","trace"].includes(lvl) ? lvl : "warn";
  } catch (e) {}
}

// Persist backend URL to synced storage
async function save() {
  const url = document.getElementById("backend-url").value.trim() || DEFAULT_BACKEND;
  await chrome.storage.sync.set({ backend_url: url });
  document.getElementById("status").textContent = "Saved";
}

// Persist logger verbosity level across extension contexts
async function saveLogLevel() {
  try {
    const sel = document.getElementById("log-level");
    const lvl = sel ? (sel.value || "warn") : "warn";
    await chrome.storage.sync.set({ newapp_log_level: String(lvl).toLowerCase() });
    document.getElementById("status").textContent = `Log level set to ${lvl}`;
  } catch (e) {}
}

// Helper to open a centered popup window for OAuth flows
function openCentered(url, w, h) {
  const left = Math.max(0, (screen.width - w) / 2);
  const top = Math.max(0, (screen.height - h) / 2);
  return window.open(url, "newapp_login", `width=${w},height=${h},left=${left},top=${top}`);
}

// Kick off Google OAuth by navigating to backend start URL
async function login() {
  const { backend_url } = await chrome.storage.sync.get(["backend_url"]);
  const base = backend_url || DEFAULT_BACKEND;
  openCentered(`${base}/auth/google/start`, 480, 640);
}

// Clear locally stored JWT to sign out
async function logout() {
  await chrome.storage.local.remove("auth_token");
  document.getElementById("status").textContent = "Signed out";
}

// Handle postMessage from OAuth popup containing the issued JWT
window.addEventListener("message", async (evt) => {
  const data = evt.data || {};
  if (data.type === "newapp_auth" && data.token) {
    await chrome.storage.local.set({ auth_token: data.token });
    document.getElementById("status").textContent = "Signed in";
  }
});

// Wire UI buttons to handlers
document.getElementById("save").addEventListener("click", save);
document.getElementById("save-log").addEventListener("click", saveLogLevel);
document.getElementById("login").addEventListener("click", login);
document.getElementById("logout").addEventListener("click", logout);

// Populate initial state on load
load();


