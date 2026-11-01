import { createContext, useContext, useEffect, useState } from "react";
import { api, setAccessToken, setCsrfToken } from "../../services/api";
const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const csrfResponse = await api.get("/auth/csrf");
        setCsrfToken(csrfResponse.data.csrfToken);
        const response = await api.post("/auth/refresh");
        if (active) {
          setAccessToken(response.data.accessToken);
          setUser(response.data.user);
        }
      } catch (error) {
        const code = error.response?.data?.code;
        if (!active || code === "MISSING_REFRESH_TOKEN") return;
        if (error.response?.status !== 401 && error.response?.status !== 429) {
          console.error("Unable to restore the authentication session.", error);
        }
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const login = async (credentials) => {
    const { data } = await api.post("/auth/login", credentials);
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  };
  const register = async (values) => {
    const { data } = await api.post("/auth/register", values);
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  };
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };
  const logoutAll = async () => {
    await api.post("/auth/logout-all");
    setAccessToken(null);
    setUser(null);
  };
  return (
    <Ctx.Provider
      value={{ user, ready, login, register, logout, logoutAll }}
    >
      {children}
    </Ctx.Provider>
  );
}
