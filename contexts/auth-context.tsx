import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { AuthResponse, AuthUser } from '@/types/auth';

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  signIn: (auth: AuthResponse) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const signIn = (auth: AuthResponse) => {
    setUser(auth.user);
    setToken(auth.token);
  };

  const signOut = () => {
    setUser(null);
    setToken(null);
  };

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token),
      signIn,
      signOut,
    }),
    [user, token],
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
