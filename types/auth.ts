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
  phone?: string | null;
  avatar?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  isVerified?: boolean;
  createdAt?: string;
  identityCardStatus?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface UpdateProfileRequest {
  name?: string;
  avatar?: string | null;
  phone?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
}
