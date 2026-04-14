import { AxiosError } from 'axios';

import { apiClient } from '@/services/api';
import type { AuthResponse, LoginRequest } from '@/types/auth';
import { normalizeBackendMessage } from '@/utils/validation';

type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data?: T;
};

type PushTokenUpdateResponse = {
  token_field?: string;
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

export async function updateDevicePushToken(
  authToken: string,
  expoPushToken: string,
): Promise<PushTokenUpdateResponse> {
  const normalizedAuthToken = String(authToken || '').trim();
  const normalizedExpoPushToken = String(expoPushToken || '').trim();

  if (!normalizedAuthToken || !normalizedExpoPushToken) {
    throw new Error('Thiếu token xác thực hoặc Expo push token.');
  }

  const headers = {
    Authorization: `Bearer ${normalizedAuthToken}`,
  };

  try {
    const response = await apiClient.patch<ApiEnvelope<PushTokenUpdateResponse>>(
      '/auth/update-push-token',
      {
        expoPushToken: normalizedExpoPushToken,
      },
      {
        headers,
      },
    );

    return response.data?.data || {};
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    if (axiosError.response?.status !== 404) {
      throw new Error(
        normalizeBackendMessage(
          axiosError.response?.data?.message || 'Không thể cập nhật địa chỉ thiết bị.',
        ),
      );
    }

    // Backward-compatible fallback for older backend route.
    const fallbackResponse = await apiClient.patch<ApiEnvelope<PushTokenUpdateResponse>>(
      '/auth/update-fcm-token',
      {
        fcmToken: normalizedExpoPushToken,
      },
      {
        headers,
      },
    );

    return fallbackResponse.data?.data || {};
  }
}

export async function clearDevicePushToken(authToken: string): Promise<void> {
  const normalizedAuthToken = String(authToken || '').trim();
  if (!normalizedAuthToken) {
    return;
  }

  await apiClient.post(
    '/auth/reset-fcmToken',
    {},
    {
      headers: {
        Authorization: `Bearer ${normalizedAuthToken}`,
      },
    },
  );
}
