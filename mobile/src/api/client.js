import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const API_BASE = Constants.expoConfig?.extra?.apiBase || 'https://api.venn.lu/api';
if (!__DEV__ && !API_BASE.startsWith('https://')) {
  throw new Error('API base must use HTTPS in production');
}
const ACCESS_KEY = 'vn_access_token';
const REFRESH_KEY = 'vn_refresh_token';
const LEGACY_TOKEN_KEY = 'vn_session_token';
const REQUEST_TIMEOUT = 15000;

// Paths that must NOT trigger a refresh on 401. Everything else (including
// /auth/me, /auth/profile, etc.) is refreshable.
const NO_REFRESH_PATHS = new Set([
  '/auth/register',
  '/auth/login',
  '/auth/token',
  '/auth/token/refresh',
  '/auth/social',
  '/auth/social-web',
  '/auth/logout',
  '/auth/forgot-password',
  '/auth/reset-password',
]);

// Global 401 listener — AuthContext hooks into this to force logout
let _onUnauthorized = null;
export function setOnUnauthorized(fn) { _onUnauthorized = fn; }

async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_KEY).catch(() => null);
}

async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_KEY).catch(() => null);
}

export async function storeTokens(access, refresh) {
  await Promise.all([
    access ? SecureStore.setItemAsync(ACCESS_KEY, access).catch(() => {}) : Promise.resolve(),
    refresh ? SecureStore.setItemAsync(REFRESH_KEY, refresh).catch(() => {}) : Promise.resolve(),
  ]);
}

// Keep for backward compat during migration
export async function storeToken(token) {
  if (token) {
    await SecureStore.setItemAsync(LEGACY_TOKEN_KEY, token).catch((e) => {
      console.warn('SecureStore write failed:', e);
    });
  }
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY).catch(() => {}),
  ]);
}

// Refresh mutex to prevent concurrent refresh attempts
let _refreshPromise = null;

async function refreshTokens() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    try {
      const refresh = await getRefreshToken();
      if (!refresh) return false;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      try {
        const res = await fetch(`${API_BASE}/auth/token/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) return false;
        const data = await res.json();
        await storeTokens(data.access_token, data.refresh_token);
        return true;
      } catch {
        return false;
      }
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

async function request(path, options = {}) {
  const token = await getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  // On 401, try refresh once. Skip refresh only for endpoints that issue or
  // revoke tokens themselves — refreshing those would either loop or be
  // meaningless. All other /auth/* paths (e.g. /auth/me, /auth/profile) MUST
  // be refreshable, otherwise the user gets silently logged out every 15min.
  if (res.status === 401) {
    const skipRefresh = NO_REFRESH_PATHS.has(path);
    if (!skipRefresh && token) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        // Retry with new token
        const newToken = await getAccessToken();
        const retryController = new AbortController();
        const retryTimeout = setTimeout(() => retryController.abort(), REQUEST_TIMEOUT);
        try {
          res = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers: {
              ...headers,
              Authorization: `Bearer ${newToken}`,
            },
            signal: retryController.signal,
          });
        } catch (err) {
          if (err.name === 'AbortError') throw new Error('Request timed out');
          throw err;
        } finally {
          clearTimeout(retryTimeout);
        }
      }
    }

    if (res.status === 401) {
      const body = await res.json().catch(() => ({}));
      const detail = typeof body.detail === 'string' ? body.detail : 'Unauthorized';
      if (!skipRefresh) {
        await clearSession();
        const reason = detail === 'Logged in on another device' ? 'another_device' : 'session_expired';
        _onUnauthorized?.(reason);
      }
      throw new Error(detail);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.detail;
    const message = Array.isArray(detail)
      ? detail.map((e) => {
          const field = e.loc?.[e.loc.length - 1];
          const label = field === 'username' ? 'Email' : field === 'display_name' ? 'Name' : field;
          const msg = (e.msg || '').replace(/^Value error, /i, '');
          return label ? `${label}: ${msg}` : msg;
        }).join('\n')
      : typeof detail === 'string'
      ? detail
      : `Request failed: ${res.status}`;
    throw new Error(message);
  }

  if (res.status === 204) return null;
  return res.json();
}

const client = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  put: (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data) }),
};

export default client;
