import { AxiosError } from 'axios';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
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
  if (axiosError.response?.status === 413) {
    return 'Ảnh quá lớn, vui lòng chụp lại với độ phân giải thấp hơn.';
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

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
  if (!last || !last.includes('.')) {
    return `cleaning-photo-${Date.now()}.jpg`;
  }

  const dotIndex = last.lastIndexOf('.');
  const baseName = dotIndex > 0 ? last.slice(0, dotIndex) : `cleaning-photo-${Date.now()}`;
  const ext = last.slice(dotIndex + 1).toLowerCase();

  if (ext === 'heic' || ext === 'heif') {
    return `${baseName}.jpg`;
  }

  return last;
}

function getMimeTypeFromUri(uri: string) {
  if (uri.startsWith('data:image/png')) return 'image/png';
  if (uri.startsWith('data:image/webp')) return 'image/webp';
  if (uri.startsWith('data:image/jpeg') || uri.startsWith('data:image/jpg')) return 'image/jpeg';

  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function dataUriToBlob(dataUri: string) {
  const parts = dataUri.split(',');
  if (parts.length < 2) {
    throw new Error('Data URI không hợp lệ');
  }

  const mimeMatch = parts[0].match(/data:(.*?);base64/);
  const mimeType = mimeMatch?.[1] || 'image/jpeg';
  const byteString = atob(parts[1]);
  const bytes = new Uint8Array(byteString.length);

  for (let i = 0; i < byteString.length; i += 1) {
    bytes[i] = byteString.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

async function compressWebImageBlob(blob: Blob, mimeType: string) {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Không thể đọc ảnh để nén.'));
      img.src = objectUrl;
    });

    const maxDimension = 1280;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const targetWidth = Math.max(1, Math.round(image.width * scale));
    const targetHeight = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return blob;
    }

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mimeType, 0.65);
    });

    return compressedBlob || blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function buildCleaningPhotoFormData(payload: CreateCleaningPhotoUploadPayload) {
  const formData = new FormData();
  formData.append('cleaning_task_id', payload.cleaning_task_id);
  formData.append('type', payload.type);

  const fileName = getFileNameFromUri(payload.local_uri);

  if (Platform.OS === 'web') {
    let blob: Blob;

    if (payload.local_uri.startsWith('data:image/')) {
      blob = dataUriToBlob(payload.local_uri);
    } else {
      const response = await fetch(payload.local_uri);
      blob = await response.blob();
    }

    const fileType = blob.type || getMimeTypeFromUri(payload.local_uri);
    const compressedBlob = await compressWebImageBlob(blob, fileType);
    const file = new File([compressedBlob], fileName, { type: fileType });
    formData.append('photo', file);
    return formData;
  }

  // iOS may return HEIC/HEIF assets; convert to JPEG for Cloudinary allowed formats.
  let normalizedUri = payload.local_uri;
  let normalizedMimeType = getMimeTypeFromUri(payload.local_uri);
  try {
    const manipulated = await manipulateAsync(payload.local_uri, [], {
      compress: 0.75,
      format: SaveFormat.JPEG,
    });
    if (manipulated.uri) {
      normalizedUri = manipulated.uri;
      normalizedMimeType = 'image/jpeg';
    }
  } catch {
    // Keep original URI if conversion fails.
  }

  const normalizedFileName = getFileNameFromUri(normalizedUri).replace(/\.[^/.]+$/, '.jpg');

  formData.append(
    'photo',
    {
      uri: normalizedUri,
      name: normalizedFileName,
      type: normalizedMimeType,
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
    const baseUrl = apiClient.defaults.baseURL;
    if (!baseUrl) {
      throw new Error('Không xác định được địa chỉ backend. Vui lòng cấu hình EXPO_PUBLIC_API_URL.');
    }

    // Use fetch so browser/runtime can set multipart boundary automatically.
    const uploadResponse = await fetch(`${baseUrl}/cleaning-photos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const responseBody = (await uploadResponse.json()) as ApiEnvelope<CleaningPhoto>;
    if (!uploadResponse.ok) {
      const error = new Error(responseBody.message || 'Tạo ảnh thất bại') as Error & {
        statusCode?: number;
        responseData?: { message?: string; errors?: unknown };
      };
      error.statusCode = uploadResponse.status;
      error.responseData = {
        message: responseBody.message,
      };
      throw error;
    }

    const item = extractData<CleaningPhoto>(responseBody?.data ?? responseBody);
    if (!item) {
      throw new Error('Tạo ảnh thất bại');
    }

    return item;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string; errors?: unknown }>;
    const customError = error as Error & {
      statusCode?: number;
      responseData?: { message?: string; errors?: unknown };
    };
    const status = axiosError.response?.status ?? customError.statusCode;
    const responseData = axiosError.response?.data ?? customError.responseData;

    if (__DEV__) {
      console.error('[createCleaningPhoto] upload failed', {
        status,
        message: responseData?.message,
        errors: responseData?.errors,
        taskId: payload.cleaning_task_id,
        type: payload.type,
        uriPrefix: payload.local_uri.slice(0, 30),
      });

      const debugText = JSON.stringify(
        {
          status,
          message: responseData?.message,
          errors: responseData?.errors,
          taskId: payload.cleaning_task_id,
          type: payload.type,
          uriPrefix: payload.local_uri.slice(0, 80),
        },
        null,
        2,
      );
      console.error(`[createCleaningPhoto] details:\n${debugText}`);
    }

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
