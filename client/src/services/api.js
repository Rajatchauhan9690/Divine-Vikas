import axios from "axios";

const configuredApiUrl =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "/api" : "http://localhost:5000/api");

const normalizedApiUrl = configuredApiUrl.replace(/\/+$/, "");
const apiBaseUrl =
  normalizedApiUrl && !/\/api$/i.test(normalizedApiUrl)
    ? `${normalizedApiUrl}/api`
    : normalizedApiUrl;
export const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  timeout: 12000,
});
const getCache = new Map();
const getCacheTtl = 30_000;
const getCacheLimit = 100;
const uncachedGetUrl =
  /(?:^|\/)(?:csrf|attempt)(?:\/|$)|payment|couriers/i;

function clearGetCache() {
  getCache.clear();
}

function getCacheKey(url, config = {}) {
  if (config.cache === false || uncachedGetUrl.test(url)) return null;
  return JSON.stringify([
    apiBaseUrl,
    url,
    config.params || {},
    accessToken,
  ]);
}

function readGetCache(key) {
  const cached = getCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    getCache.delete(key);
    return null;
  }
  getCache.delete(key);
  getCache.set(key, cached);
  return cached.response;
}

function saveGetCache(key, response) {
  getCache.delete(key);
  getCache.set(key, {
    response,
    expiresAt: Date.now() + getCacheTtl,
  });
  if (getCache.size > getCacheLimit)
    getCache.delete(getCache.keys().next().value);
}

const requestGet = api.get.bind(api);
api.get = (url, config = {}) => {
  const cacheKey = getCacheKey(url, config);
  const cachedResponse = cacheKey && readGetCache(cacheKey);
  if (cachedResponse) {
    return Promise.resolve({
      ...cachedResponse,
      config: {
        ...cachedResponse.config,
        ...config,
        baseURL: config.baseURL || apiBaseUrl,
        method: "get",
        url,
      },
    });
  }
  return requestGet(url, config).then((response) => {
    if (cacheKey && !config.signal?.aborted)
      saveGetCache(cacheKey, response);
    return response;
  });
};
let accessToken = null;
let csrfToken = null;
let refreshing = null;
export const setAccessToken = (token) => {
  if (accessToken !== token) clearGetCache();
  accessToken = token;
};
export const setCsrfToken = (token) => {
  csrfToken = token;
};
api.interceptors.request.use(async (config) => {
  const method = (config.method || "get").toLowerCase();
  if (!["get", "head", "options"].includes(method)) clearGetCache();
  if (
    !["get", "head", "options"].includes(method) &&
    !csrfToken &&
    !config.url?.includes("/auth/csrf")
  ) {
    const response = await api.get("/auth/csrf");
    setCsrfToken(response.data.csrfToken);
  }
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (!["get", "head", "options"].includes(method) && csrfToken)
    config.headers["X-CSRF-Token"] = csrfToken;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      !original?._retried &&
      !original?.url?.includes("/auth/refresh") &&
      !original?.url?.includes("/auth/login")
    ) {
      original._retried = true;
      try {
        refreshing ||= api
          .post("/auth/refresh")
          .then((response) => {
            setAccessToken(response.data.accessToken);
            return response.data.accessToken;
          })
          .finally(() => {
            refreshing = null;
          });
        const token = await refreshing;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        setAccessToken(null);
      }
    }
    return Promise.reject(error);
  },
);
