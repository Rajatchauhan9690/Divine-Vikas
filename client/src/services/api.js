import axios from "axios";
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true,
  timeout: 12000,
});
let accessToken = null;
let csrfToken = null;
let refreshing = null;
export const setAccessToken = (token) => {
  accessToken = token;
};
export const setCsrfToken = (token) => {
  csrfToken = token;
};
api.interceptors.request.use(async (config) => {
  const method = (config.method || "get").toLowerCase();
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
