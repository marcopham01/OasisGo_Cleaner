import { AxiosError } from 'axios';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { apiClient } from '@/services/api';
import type {
    BookingDetails,
    CleanerMarkAllReadResponse,
    CleanerNotification,
    CleanerNotificationListResponse,
    CleanerNotificationQuery,
    CleanerUnreadCountResponse,
    CleaningPhoto,
    CleaningPhotoType,
    CleaningTask,
    CleaningTaskQuery,
    CreateCleaningPhotoUploadPayload,
    CreateDamageReportPayload,
    CreateIncidentFromCleaningTaskPayload,
    CreateLostFoundItemPayload,
    DamageReportItem,
    DamageReportListResponse,
    DamageReportResponse,
    Incident,
    IncidentQuery,
    IncidentStatus,
    LostFoundItem,
    LostFoundQuery,
    LostFoundStatus,
    MyCleanerKeyByBookingData,
    PodDetails,
    StaffAttendanceLog,
    StaffAttendanceLogListResponse,
    StaffAttendanceLogQuery,
    StaffShiftAssignment,
    StaffShiftAssignmentQuery,
    StaffWorkRoster,
    StaffWorkRosterQuery,
    UpdateCleaningPhotoPayload,
    UpdateCleaningTaskPayload,
} from '@/types/cleaner-dashboard';
import { normalizeBackendMessage } from '@/utils/validation';

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

  const serverMessage = axiosError.response?.data?.message;
  if (serverMessage) {
    return normalizeBackendMessage(serverMessage);
  }

  if (error instanceof Error && error.message) {
    return normalizeBackendMessage(error.message);
  }

  return 'Không thể tải dữ liệu dashboard';
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

function toJpegFileName(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, '.jpg');
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

    // Convert to JPEG on web to avoid large PNG uploads that can trigger server timeout.
    const targetMimeType = 'image/jpeg';
    const compressedBlob = await compressWebImageBlob(blob, targetMimeType);
    const normalizedFileName = toJpegFileName(fileName);
    const file = new File([compressedBlob], normalizedFileName, { type: targetMimeType });
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

async function toUploadFile(uri: string) {
  const fileName = getFileNameFromUri(uri);

  if (Platform.OS === 'web') {
    let blob: Blob;

    if (uri.startsWith('data:image/')) {
      blob = dataUriToBlob(uri);
    } else {
      const response = await fetch(uri);
      blob = await response.blob();
    }

    // Keep upload payload small on web by forcing JPEG output.
    const targetMimeType = 'image/jpeg';
    const compressedBlob = await compressWebImageBlob(blob, targetMimeType);
    const normalizedFileName = toJpegFileName(fileName);
    const file = new File([compressedBlob], normalizedFileName, { type: targetMimeType });
    return file;
  }

  let normalizedUri = uri;
  let normalizedMimeType = getMimeTypeFromUri(uri);
  try {
    const manipulated = await manipulateAsync(uri, [], {
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

  return {
    uri: normalizedUri,
    name: normalizedFileName,
    type: normalizedMimeType,
  } as unknown as Blob;
}

async function buildIncidentFormData(payload: CreateIncidentFromCleaningTaskPayload) {
  const formData = new FormData();
  formData.append('cleaning_task_id', payload.cleaning_task_id);
  formData.append('description', payload.description);
  formData.append('severity', payload.severity || 'MEDIUM');

  const validUris = payload.local_uris.filter(Boolean);
  for (let i = 0; i < validUris.length; i += 1) {
    const uri = validUris[i];
    const uploadFile = await toUploadFile(uri);
    formData.append('photos', uploadFile);
  }

  return formData;
}

async function buildDamageReportFormData(payload: CreateDamageReportPayload) {
  const formData = new FormData();

  if (payload.cleaning_task_id) {
    formData.append('cleaning_task_id', payload.cleaning_task_id);
  }

  if (payload.pod_id) {
    formData.append('pod_id', payload.pod_id);
  }

  if (payload.booking_id) {
    formData.append('booking_id', payload.booking_id);
  }

  formData.append('description', payload.description);
  formData.append('severity', payload.severity || 'MEDIUM');
  formData.append('estimated_service_fee', String(payload.estimated_service_fee ?? 0));

  if (Array.isArray(payload.damaged_items) && payload.damaged_items.length > 0) {
    formData.append('damaged_items', JSON.stringify(payload.damaged_items));
  } else {
    // Backward-compatible fallback accepted by backend.
    if (payload.item_id) {
      formData.append('item_id', payload.item_id);
    }

    if (payload.quantity_damaged !== undefined) {
      formData.append('quantity_damaged', String(payload.quantity_damaged));
    } else {
      formData.append('quantity_affected', String(payload.quantity_affected ?? 1));
    }

    if (payload.damage_type) {
      formData.append('damage_type', payload.damage_type);
    }

    if (payload.note) {
      formData.append('note', payload.note);
    }
  }

  const validUris = payload.local_uris.filter(Boolean);
  for (let i = 0; i < validUris.length; i += 1) {
    const uri = validUris[i];
    const uploadFile = await toUploadFile(uri);
    formData.append('photos', uploadFile);
  }

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

export async function getStaffWorkRosters(token: string, query: StaffWorkRosterQuery = {}) {
  try {
    const response = await apiClient.get<ApiEnvelope<StaffWorkRoster[]>>('/staff-work-rosters', {
      headers: authHeader(token),
      params: compactParams(query),
    });

    return toArray<StaffWorkRoster>(response.data?.data ?? response.data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function checkinShift(token: string, shiftAssignmentId: string) {
  try {
    const response = await apiClient.post<ApiEnvelope<StaffAttendanceLog>>(
      '/staff-attendance-logs/checkin',
      { shift_assignment_id: shiftAssignmentId },
      {
        headers: authHeader(token),
      },
    );

    const item = extractData<StaffAttendanceLog>(response.data?.data ?? response.data);
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
    const response = await apiClient.post<ApiEnvelope<StaffAttendanceLog>>(
      '/staff-attendance-logs/checkout',
      { shift_assignment_id: shiftAssignmentId },
      {
        headers: authHeader(token),
      },
    );

    const item = extractData<StaffAttendanceLog>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Check-out không thành công');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getMyAttendanceLogs(token: string, query: StaffAttendanceLogQuery = {}) {
  try {
    const response = await apiClient.get<ApiEnvelope<StaffAttendanceLog[]>>('/staff-attendance-logs/me', {
      headers: authHeader(token),
      params: compactParams(query),
    });

    return toArray<StaffAttendanceLog>(response.data?.data ?? response.data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getMyAttendanceLogsPaginated(
  token: string,
  query: StaffAttendanceLogQuery = {},
): Promise<StaffAttendanceLogListResponse> {
  try {
    const response = await apiClient.get<
      ApiEnvelope<StaffAttendanceLog[]> & {
        pagination?: StaffAttendanceLogListResponse['pagination'];
      }
    >('/staff-attendance-logs/me', {
      headers: authHeader(token),
      params: compactParams(query),
    });

    return {
      data: toArray<StaffAttendanceLog>(response.data?.data ?? response.data),
      pagination: response.data?.pagination ?? null,
    };
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

export async function createOperationalIncident(
  token: string,
  payload: CreateIncidentFromCleaningTaskPayload,
) {
  try {
    const formData = await buildIncidentFormData(payload);
    const baseUrl = apiClient.defaults.baseURL;
    if (!baseUrl) {
      throw new Error('Không xác định được địa chỉ backend. Vui lòng cấu hình EXPO_PUBLIC_API_URL.');
    }

    const uploadResponse = await fetch(`${baseUrl}/incidents/cleaning-task`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const responseBody = (await uploadResponse.json()) as ApiEnvelope<Incident>;
    if (!uploadResponse.ok) {
      const error = new Error(responseBody.message || 'Tạo báo cáo sự cố thất bại') as Error & {
        statusCode?: number;
        responseData?: { message?: string };
      };
      error.statusCode = uploadResponse.status;
      error.responseData = {
        message: responseBody.message,
      };
      throw error;
    }

    const item = extractData<Incident>(responseBody?.data ?? responseBody);
    if (!item) {
      throw new Error('Tạo báo cáo sự cố thất bại');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * @deprecated Use createOperationalIncident instead.
 * Backward compatibility wrapper.
 */
export async function createIncidentFromCleaningTask(
  token: string,
  payload: CreateIncidentFromCleaningTaskPayload,
) {
  return createOperationalIncident(token, payload);
}

export async function getDamageReportItems(token: string) {
  try {
    const response = await apiClient.get<ApiEnvelope<DamageReportItem[]>>('/items', {
      headers: authHeader(token),
    });

    return toArray<DamageReportItem>(response.data?.data ?? response.data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function createDamageReport(token: string, payload: CreateDamageReportPayload) {
  try {
    const formData = await buildDamageReportFormData(payload);
    const baseUrl = apiClient.defaults.baseURL;
    if (!baseUrl) {
      throw new Error('Không xác định được địa chỉ backend. Vui lòng cấu hình EXPO_PUBLIC_API_URL.');
    }

    const uploadResponse = await fetch(`${baseUrl}/incidents/damage-report`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const responseBody = (await uploadResponse.json()) as ApiEnvelope<DamageReportResponse>;
    if (!uploadResponse.ok) {
      const error = new Error(responseBody.message || 'Tạo báo cáo hư hại thất bại') as Error & {
        statusCode?: number;
        responseData?: { message?: string };
      };
      error.statusCode = uploadResponse.status;
      error.responseData = {
        message: responseBody.message,
      };
      throw error;
    }

    const item = extractData<DamageReportResponse>(responseBody?.data ?? responseBody);
    if (!item) {
      throw new Error('Tạo báo cáo hư hại thất bại');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getIncidents(token: string, query: IncidentQuery = {}) {
  try {
    const response = await apiClient.get<ApiEnvelope<Incident[]>>('/incidents', {
      headers: authHeader(token),
      params: compactParams(query),
    });

    return toArray<Incident>(response.data?.data ?? response.data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getDamageReports(token: string, query: IncidentQuery = {}) {
  try {
    const response = await apiClient.get<
      ApiEnvelope<DamageReportResponse[]> & { pagination?: DamageReportListResponse['pagination'] }
    >('/incidents/damage-reports', {
      headers: authHeader(token),
      params: compactParams(query),
    });

    return {
      items: toArray<DamageReportResponse>(response.data?.data ?? response.data),
      pagination: response.data?.pagination ?? null,
    } satisfies DamageReportListResponse;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getIncidentById(token: string, incidentId: string) {
  try {
    const response = await apiClient.get<ApiEnvelope<Incident>>(`/incidents/${incidentId}`, {
      headers: authHeader(token),
    });

    const item = extractData<Incident>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Không tìm thấy incident');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function updateIncidentStatus(
  token: string,
  incidentId: string,
  status: IncidentStatus,
) {
  try {
    const response = await apiClient.patch<ApiEnvelope<Incident>>(
      `/incidents/${incidentId}/status`,
      { status },
      {
        headers: authHeader(token),
      },
    );

    const item = extractData<Incident>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Cập nhật trạng thái incident thất bại');
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
      validateStatus: (status) => status < 500,
    });

    if (response.status === 403 || response.status === 404) {
      return null;
    }

    const item = extractData<PodDetails>(response.data?.data ?? response.data);
    if (!item) {
      return null;
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

export async function getMyCleanerKeyByBookingId(token: string, bookingId: string) {
  try {
    const response = await apiClient.get<ApiEnvelope<MyCleanerKeyByBookingData>>(
      `/bookings/${bookingId}/my-cleaner-key`,
      {
        headers: authHeader(token),
      },
    );

    const item = extractData<MyCleanerKeyByBookingData>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Không lấy được cleaner key cho booking');
    }

    return item;
  } catch (error: any) {
    const normalizedError = new Error(getErrorMessage(error)) as Error & { statusCode?: number };
    normalizedError.statusCode = error?.response?.status || error?.statusCode;
    throw normalizedError;
  }
}

export async function checkinBookingWithCleanerKey(token: string, keyToken: string) {
  try {
    const payload = {
      key_token: keyToken,
    };

    const response = await apiClient.post<ApiEnvelope<BookingDetails>>('/bookings/checkin', payload, {
      headers: authHeader(token),
    });

    const item = extractData<BookingDetails>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Không thể check-in pod bằng cleaner key');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getIncidentsByCleaningTaskId(token: string, cleaningTaskId: string) {
  return getIncidents(token, { cleaning_task_id: cleaningTaskId });
}

export async function getLostFoundItems(token: string, query: LostFoundQuery = {}) {
  try {
    const response = await apiClient.get<ApiEnvelope<LostFoundItem[]>>('/lost-found-items', {
      headers: authHeader(token),
      params: compactParams(query),
    });

    return toArray<LostFoundItem>(response.data?.data ?? response.data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getLostFoundItemById(token: string, itemId: string) {
  try {
    const response = await apiClient.get<ApiEnvelope<LostFoundItem>>(`/lost-found-items/${itemId}`, {
      headers: authHeader(token),
    });

    const item = extractData<LostFoundItem>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Không tìm thấy item thất lạc');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function createLostFoundItem(token: string, payload: CreateLostFoundItemPayload) {
  try {
    const response = await apiClient.post<ApiEnvelope<LostFoundItem>>('/lost-found-items', payload, {
      headers: authHeader(token),
    });

    const item = extractData<LostFoundItem>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Tạo item thất lạc thất bại');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function updateLostFoundStatus(
  token: string,
  itemId: string,
  status: LostFoundStatus,
) {
  try {
    const response = await apiClient.patch<ApiEnvelope<LostFoundItem>>(
      `/lost-found-items/${itemId}/status`,
      { status },
      {
        headers: authHeader(token),
      },
    );

    const item = extractData<LostFoundItem>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Cập nhật trạng thái item thất lạc thất bại');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getMyNotifications(
  token: string,
  query: CleanerNotificationQuery = {},
): Promise<CleanerNotificationListResponse> {
  try {
    const response = await apiClient.get<
      ApiEnvelope<CleanerNotification[]> & { pagination?: CleanerNotificationListResponse['pagination'] }
    >('/notifications/me', {
      headers: authHeader(token),
      params: compactParams(query),
    });

    return {
      data: toArray<CleanerNotification>(response.data?.data ?? response.data),
      pagination: response.data?.pagination,
    };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getMyUnreadNotificationCount(token: string): Promise<number> {
  try {
    const response = await apiClient.get<ApiEnvelope<CleanerUnreadCountResponse>>(
      '/notifications/me/unread-count',
      {
        headers: authHeader(token),
      },
    );

    const payload = extractData<CleanerUnreadCountResponse>(response.data?.data ?? response.data);
    return Number(payload?.unread_count || 0);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function markNotificationAsRead(token: string, notificationId: string) {
  try {
    const response = await apiClient.patch<ApiEnvelope<CleanerNotification>>(
      `/notifications/${notificationId}/read`,
      {},
      {
        headers: authHeader(token),
      },
    );

    const item = extractData<CleanerNotification>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Đánh dấu thông báo đã đọc thất bại');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function markAllNotificationsAsRead(
  token: string,
): Promise<CleanerMarkAllReadResponse> {
  try {
    const response = await apiClient.patch<ApiEnvelope<CleanerMarkAllReadResponse>>(
      '/notifications/me/read-all',
      {},
      {
        headers: authHeader(token),
      },
    );

    const payload = extractData<CleanerMarkAllReadResponse>(response.data?.data ?? response.data);
    return {
      matched_count: Number(payload?.matched_count || 0),
      modified_count: Number(payload?.modified_count || 0),
    };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
