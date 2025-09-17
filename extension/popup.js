const DEFAULT_BACKEND = "http://localhost:5100";

async function load() {
  const { newapp_backend } = await chrome.storage.sync.get(["newapp_backend"]);
  document.getElementById("backend-url").value = newapp_backend || DEFAULT_BACKEND;

  const { newapp_token } = await chrome.storage.local.get(["newapp_token"]);
  document.getElementById("status").textContent = newapp_token ? "Signed in" : "Signed out";
}

async function save() {
  const url = document.getElementById("backend-url").value.trim() || DEFAULT_BACKEND;
  await chrome.storage.sync.set({ newapp_backend: url });
  document.getElementById("status").textContent = "Saved";
}

function openCentered(url, w, h) {
  const left = Math.max(0, (screen.width - w) / 2);
  const top = Math.max(0, (screen.height - h) / 2);
  return window.open(url, "newapp_login", `width=${w},height=${h},left=${left},top=${top}`);
}

async function login() {
  const { newapp_backend } = await chrome.storage.sync.get(["newapp_backend"]);
  const base = newapp_backend || DEFAULT_BACKEND;
  openCentered(`${base}/auth/google/start`, 480, 640);
}

async function logout() {
  await chrome.storage.local.remove("newapp_token");
  document.getElementById("status").textContent = "Signed out";
}

window.addEventListener("message", async (evt) => {
  const data = evt.data || {};
  if (data.type === "newapp_auth" && data.token) {
    await chrome.storage.local.set({ newapp_token: data.token });
    document.getElementById("status").textContent = "Signed in";
  }
});

document.getElementById("save").addEventListener("click", save);
document.getElementById("login").addEventListener("click", login);
document.getElementById("logout").addEventListener("click", logout);

load();


