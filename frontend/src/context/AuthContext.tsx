import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  apiGetMe,
  apiLogin,
  apiLogout,
  apiRefresh,
  apiSignup,
  setAuthToken,
  setOnAuthExpired,
} from "../api";
import type { User } from "../types";

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, role?: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    setUser(null);
    setAccessTokenState(null);
    setAuthToken(null);
  }, []);

  // Check auth session on startup via HttpOnly refresh cookie
  useEffect(() => {
    let active = true;

    setOnAuthExpired(() => {
      clearSession();
    });

    async function initAuth() {
      try {
        const refreshResult = await apiRefresh();
        if (!active) return;
        if (refreshResult?.access_token) {
          setAccessTokenState(refreshResult.access_token);
          setAuthToken(refreshResult.access_token);
          const currentUser = refreshResult.user || (await apiGetMe());
          if (active) {
            setUser(currentUser);
          }
        } else {
          clearSession();
        }
      } catch {
        if (active) {
          clearSession();
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    initAuth();

    return () => {
      active = false;
      setOnAuthExpired(null);
    };
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await apiLogin(email, password);
      setAccessTokenState(result.access_token);
      setAuthToken(result.access_token);
      const currentUser = result.user || (await apiGetMe());
      setUser(currentUser);
    } catch (err: unknown) {
      clearSession();
      const message = err instanceof Error ? err.message : "Failed to log in";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [clearSession]);

  const signup = useCallback(
    async (email: string, password: string, role?: string) => {
      setError(null);
      setIsLoading(true);
      try {
        const result = await apiSignup(email, password, role);
        setAccessTokenState(result.access_token);
        setAuthToken(result.access_token);
        const currentUser = result.user || (await apiGetMe());
        setUser(currentUser);
      } catch (err: unknown) {
        clearSession();
        const message = err instanceof Error ? err.message : "Failed to sign up";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [clearSession],
  );

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await apiLogout();
    } finally {
      clearSession();
      setIsLoading(false);
    }
  }, [clearSession]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: AuthContextType = {
    user,
    accessToken,
    isAuthenticated: Boolean(user && accessToken),
    isLoading,
    error,
    login,
    signup,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
