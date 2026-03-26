import { AxiosError } from 'axios';
import { Platform } from 'react-native';

import { apiClient } from '@/services/api';
import type {
    BookingDetails,
    CleaningPhoto,
    CleaningPhotoType,
    CleaningTask,
    CleaningTaskQuery,
    CreateCleaningPhotoUploadPayload,
    PodDetails,
    StaffShiftAssignment,
    StaffShiftAssignmentQuery,
    UpdateCleaningPhotoPayload,
    UpdateCleaningTaskPayload,
} from '@/types/cleaner-dashboard';

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T | { data?: T };
  count?: number;
};

function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    if (Array.isArray(record.data)) {
      return record.data as T[];
    }

    if (Array.isArray(record.items)) {
      return record.items as T[];
    }
  }

  return [];
}

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ message?: string }>;
  return axiosError.response?.data?.message || 'Không thể tải dữ liệu dashboard';
}

function extractData<T>(value: unknown): T | null {
  if (!value) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.data && typeof record.data === 'object') {
    return record.data as T;
  }

  return value as T;
}

function authHeader(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function compactParams<T extends object>(params: T) {
  const entries = Object.entries(params as Record<string, unknown>).filter(([, value]) => {
    return value !== undefined && value !== null && value !== '';
  });

  return Object.fromEntries(entries);
}

function getFileNameFromUri(uri: string) {
  const sanitizedUri = uri.split('?')[0];
  const last = sanitizedUri.split('/').pop();
  return last && last.includes('.') ? last : `cleaning-photo-${Date.now()}.jpg`;
}

function getMimeTypeFromUri(uri: string) {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function buildCleaningPhotoFormData(payload: CreateCleaningPhotoUploadPayload) {
  const formData = new FormData();
  formData.append('cleaning_task_id', payload.cleaning_task_id);
  formData.append('type', payload.type);

  const fileName = getFileNameFromUri(payload.local_uri);

  if (Platform.OS === 'web') {
    const response = await fetch(payload.local_uri);
    const blob = await response.blob();
    formData.append('photo', blob, fileName);
    return formData;
  }

  formData.append(
    'photo',
    {
      uri: payload.local_uri,
      name: fileName,
      type: getMimeTypeFromUri(payload.local_uri),
    } as unknown as Blob,
  );

  return formData;
}

export async function getMyShiftAssignments(token: string, query: StaffShiftAssignmentQuery = {}) {
  try {
    const response = await apiClient.get<ApiEnvelope<StaffShiftAssignment[]>>(
      '/staff-shift-assignments/me',
      {
        headers: authHeader(token),
        params: compactParams(query),
      },
    );

    return toArray<StaffShiftAssignment>(response.data?.data ?? response.data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function checkinShift(token: string, shiftAssignmentId: string) {
  try {
    const response = await apiClient.post<ApiEnvelope<StaffShiftAssignment>>(
      '/staff-shift-assignments/checkin',
      { shift_assignment_id: shiftAssignmentId },
      {
        headers: authHeader(token),
      },
    );

    const item = extractData<StaffShiftAssignment>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Check-in không thành công');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function checkoutShift(token: string, shiftAssignmentId: string) {
  try {
    const response = await apiClient.post<ApiEnvelope<StaffShiftAssignment>>(
      '/staff-shift-assignments/checkout',
      { shift_assignment_id: shiftAssignmentId },
      {
        headers: authHeader(token),
      },
    );

    const item = extractData<StaffShiftAssignment>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Check-out không thành công');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getMyCleaningTasks(token: string, query: CleaningTaskQuery = {}) {
  try {
    const response = await apiClient.get<ApiEnvelope<CleaningTask[]>>('/cleaning-tasks/me', {
      headers: authHeader(token),
      params: compactParams(query),
    });

    return toArray<CleaningTask>(response.data?.data ?? response.data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getCleaningTaskById(token: string, taskId: string) {
  try {
    const response = await apiClient.get<ApiEnvelope<CleaningTask>>(`/cleaning-tasks/${taskId}`, {
      headers: authHeader(token),
    });

    const item = extractData<CleaningTask>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Không tìm thấy task');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function updateCleaningTask(
  token: string,
  taskId: string,
  payload: UpdateCleaningTaskPayload,
) {
  try {
    const response = await apiClient.put<ApiEnvelope<CleaningTask>>(
      `/cleaning-tasks/${taskId}`,
      payload,
      {
        headers: authHeader(token),
      },
    );

    const item = extractData<CleaningTask>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Cập nhật task không thành công');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getCleaningPhotos(
  token: string,
  cleaningTaskId: string,
  type?: CleaningPhotoType,
) {
  try {
    const response = await apiClient.get<ApiEnvelope<CleaningPhoto[]>>('/cleaning-photos', {
      headers: authHeader(token),
      params: compactParams({
        cleaning_task_id: cleaningTaskId,
        type,
      }),
    });

    return toArray<CleaningPhoto>(response.data?.data ?? response.data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function createCleaningPhoto(token: string, payload: CreateCleaningPhotoUploadPayload) {
  try {
    const formData = await buildCleaningPhotoFormData(payload);
    const headers =
      Platform.OS === 'web'
        ? authHeader(token)
        : {
            ...authHeader(token),
            'Content-Type': 'multipart/form-data',
          };

    const response = await apiClient.post<ApiEnvelope<CleaningPhoto>>('/cleaning-photos', formData, {
      headers,
    });

    const item = extractData<CleaningPhoto>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Tạo ảnh thất bại');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function updateCleaningPhoto(
  token: string,
  photoId: string,
  payload: UpdateCleaningPhotoPayload,
) {
  try {
    const response = await apiClient.put<ApiEnvelope<CleaningPhoto>>(
      `/cleaning-photos/${photoId}`,
      payload,
      {
        headers: authHeader(token),
      },
    );

    const item = extractData<CleaningPhoto>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Sửa ảnh thất bại');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getPodById(token: string, podId: string) {
  try {
    const response = await apiClient.get<ApiEnvelope<PodDetails>>(`/pods/${podId}`, {
      headers: authHeader(token),
    });

    const item = extractData<PodDetails>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Không tìm thấy pod');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getBookingById(token: string, bookingId: string) {
  try {
    const response = await apiClient.get<ApiEnvelope<BookingDetails>>(`/bookings/${bookingId}`, {
      headers: authHeader(token),
    });

    const item = extractData<BookingDetails>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Không tìm thấy booking');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
