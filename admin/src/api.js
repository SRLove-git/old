// 管理后台即使部署在 /admin/ 子目录，业务接口仍统一位于站点根路径 /api。
// 使用 BASE_URL 会在生产构建后错误地请求 /admin/api，导致页面设置看似保存、实际未落库。
const BASE = "/api";
const TOKEN_KEY = "suiyueli_admin_token";
const ACCOUNT_KEY = "suiyueli_admin_account";
const REQUEST_TIMEOUT_MS = 15000;

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getAccount() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "null");
  } catch {
    return null;
  }
}

export function setAccount(account) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account || null));
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
}

export function isAuthed() {
  return !!getToken();
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );
  try {
    const res = await fetch(BASE + path, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": getToken(),
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : { code: res.ok ? 0 : res.status };
    } catch {
      throw new Error(`服务响应格式异常(${res.status})`);
    }
    if (!res.ok || json.code !== 0) {
      if (res.status === 401) clearToken();
      const error = new Error(json.message || `请求失败(${res.status})`);
      error.status = res.status;
      error.code = json.code;
      throw error;
    }
    return json.data;
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error("请求超时，请检查网络后重试");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const api = {
  get: (p) => request(p),
  post: (p, body) =>
    request(p, { method: "POST", body: JSON.stringify(body || {}) }),
  put: (p, body) =>
    request(p, { method: "PUT", body: JSON.stringify(body || {}) }),
  del: (p) => request(p, { method: "DELETE" }),
  login: (username, password) =>
    request("/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
};
