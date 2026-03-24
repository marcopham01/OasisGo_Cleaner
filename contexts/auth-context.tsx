import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { AuthResponse, AuthUser } from '@/types/auth';

const AUTH_STORAGE_KEY = 'oasisgo_cleaner_auth';

type StoredAuth = {
  user: AuthUser;
  token: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  signIn: (auth: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const hydrateAuth = async () => {
      try {
        const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);

        if (!raw || !isMounted) {
          return;
        }

        const parsed = JSON.parse(raw) as StoredAuth;
        if (parsed?.token && parsed?.user) {
          setUser(parsed.user);
          setToken(parsed.token);
        }
      } catch {
        // Ignore malformed storage and continue with signed-out state.
      } finally {
        if (isMounted) {
          setIsHydrating(false);
        }
      }
    };

    hydrateAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const signIn = async (auth: AuthResponse) => {
    setUser(auth.user);
    setToken(auth.token);

    const storedAuth: StoredAuth = {
      user: auth.user,
      token: auth.token,
    };

    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedAuth));
  };

  const signOut = async () => {
    setUser(null);
    setToken(null);
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token),
      isHydrating,
      signIn,
      signOut,
    }),
    [user, token, isHydrating],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
