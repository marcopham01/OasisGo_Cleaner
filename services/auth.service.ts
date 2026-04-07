import { AxiosError } from 'axios';

import { apiClient } from '@/services/api';
import type { AuthResponse, LoginRequest } from '@/types/auth';
import { normalizeBackendMessage } from '@/utils/validation';

type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data?: T;
};

export async function loginWithEmail(payload: LoginRequest): Promise<AuthResponse> {
  const hasBaseUrl = Boolean(apiClient.defaults.baseURL);
  if (!hasBaseUrl) {
    throw new Error('Không xác định được địa chỉ backend. Vui lòng cấu hình EXPO_PUBLIC_API_URL.');
  }

  try {
    const response = await apiClient.post<ApiEnvelope<AuthResponse>>('/auth/login', payload);
    const body = response.data;

    if (!body.success || !body.data) {
      throw new Error(normalizeBackendMessage(body.message || 'Đăng nhập thất bại'));
    }

    return body.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    const serverMessage = axiosError.response?.data?.message;

    throw new Error(normalizeBackendMessage(serverMessage || 'Không thể kết nối server, vui lòng thử lại.'));
  }
}
