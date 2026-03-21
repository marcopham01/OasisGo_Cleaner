export interface LoginRequest {
  email: string;
  password: string;
  fcmToken?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  authProvider: string;
  fcmToken?: string | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}
