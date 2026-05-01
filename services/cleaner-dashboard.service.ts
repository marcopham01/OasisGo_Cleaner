import { AxiosError } from 'axios';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { apiClient } from '@/services/api';
import type {
    BookingDetails,
    CheckoutChecklistData,
    CheckoutChecklistResult,
    CheckoutChecklistSubmitItem,
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
    DamageServiceCatalogItem,
    Incident,
    IncidentQuery,
    IncidentStatus,
    LostFoundItem,
    LostFoundQuery,
    LostFoundStatus,
    MyCleanerKeyByBookingData,
    MyCleanerKeyByTaskData,
    PodCluster,
    PodDetails,
    PodItemEntry,
    PodItemQuery,
    PodItemsByPodData,
    StaffAssignmentAttendanceStatus,
    StaffAttendanceLog,
    StaffAttendanceLogListResponse,
    StaffAttendanceLogQuery,
    StaffShiftAssignment,
    StaffShiftAssignmentQuery,
    StaffTodayAttendanceStatus,
    StaffWorkRoster,
    StaffWorkRosterQuery,
    UpdateCleaningPhotoPayload,
    UpdateCleaningTaskPayload,
    WarehouseListItem,
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

function withRawBackendMessage(error: unknown, fallbackMessage: string) {
  const axiosError = error as AxiosError<{ message?: string }>;
  const rawBackendMessage = String(axiosError.response?.data?.message || '').trim();
  const wrapped = new Error(fallbackMessage) as Error & { rawBackendMessage?: string };
  if (rawBackendMessage) {
    wrapped.rawBackendMessage = rawBackendMessage;
  }
  return wrapped;
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

function normalizePodItemEntries(items: unknown): PodItemEntry[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((raw) => {
    const item = raw as PodItemEntry;
    const itemRecord = (item.item && typeof item.item === 'object')
      ? (item.item as { name?: string; item_type?: string })
      : null;
    const normalizedItemName = String(item.item_name || itemRecord?.name || '').trim();
    const normalizedItemType = String(item.item_type || itemRecord?.item_type || '').trim();

    return {
      ...item,
      item_name: normalizedItemName || undefined,
      item_type: normalizedItemType || undefined,
    };
  });
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
  formData.append('media_type', payload.type);

  // Detect video by explicit flag or by URI extension
  const isVideo =
    payload.file_type === 'VIDEO' ||
    /\.(mp4|mov|avi|webm|mkv)$/i.test(payload.local_uri);

  if (isVideo) {
    // Video: upload as-is — no compression, let BE/Cloudinary handle it
    const fileName = getFileNameFromUri(payload.local_uri);
    // iOS records .mov, Android records .mp4 — normalise to mp4 mime unless obviously mov
    const mimeType = /\.mov$/i.test(payload.local_uri) ? 'video/quicktime' : 'video/mp4';

    if (Platform.OS === 'web') {
      const response = await fetch(payload.local_uri);
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: mimeType });
      formData.append('media', file);
    } else {
      formData.append(
        'media',
        {
          uri: payload.local_uri,
          name: fileName,
          type: mimeType,
        } as unknown as Blob,
      );
    }
    return formData;
  }

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
    formData.append('media', file);
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
    'media',
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

async function toUploadFileVideo(uri: string) {
  const fileName = getFileNameFromUri(uri);
  const mimeType = /\.mov$/i.test(uri) ? 'video/quicktime' : 'video/mp4';
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new File([blob], fileName, { type: mimeType });
  }
  return {
    uri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob;
}

async function buildIncidentFormData(payload: CreateIncidentFromCleaningTaskPayload) {
  const formData = new FormData();
  const normalizedTaskId = String(payload.cleaning_task_id || '').trim();
  const normalizedPodId = String(payload.pod_id || '').trim();
  const normalizedBookingId = String(payload.booking_id || '').trim();

  if (!normalizedTaskId && !normalizedPodId) {
    throw new Error('Thiếu ngữ cảnh báo cáo. Vui lòng chọn task hoặc pod để gửi incident.');
  }

  if (normalizedTaskId) {
    formData.append('cleaning_task_id', normalizedTaskId);
  }
  if (normalizedPodId) {
    formData.append('pod_id', normalizedPodId);
  }
  if (normalizedBookingId) {
    formData.append('booking_id', normalizedBookingId);
  }

  formData.append('description', payload.description);
  formData.append('severity', payload.severity || 'MEDIUM');
  // Canonical backend contract requires `details` with at least one line.
  formData.append(
    'details',
    JSON.stringify([
      {
        type: 'SERVICE',
        name_snapshot: 'Operational incident',
        unit_cost_snapshot: 0,
        quantity: 1,
      },
    ]),
  );

  const validUris = payload.local_uris.filter(Boolean);
  for (let i = 0; i < validUris.length; i += 1) {
    const uri = validUris[i];
    const uploadFile = await toUploadFile(uri);
    formData.append('media', uploadFile);
  }

  return formData;
}

async function buildDamageReportFormData(payload: CreateDamageReportPayload) {
  const formData = new FormData();
  let hasDetails = false;

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

  const normalizedDetails = Array.isArray(payload.details)
    ? payload.details.filter((entry) => entry && typeof entry === 'object')
    : [];

  if (normalizedDetails.length > 0) {
    formData.append('details', JSON.stringify(normalizedDetails));
    hasDetails = true;
  } else if (Array.isArray(payload.damaged_items) && payload.damaged_items.length > 0) {
    const mappedLegacyDetails = payload.damaged_items
      .filter((item) => String(item.item_id || '').trim())
      .map((item) => ({
        type: 'ITEM',
        item_id: String(item.item_id || '').trim(),
        quantity: Number(item.quantity_damaged ?? 1) || 1,
        note: item.note ? String(item.note).trim() : undefined,
      }));

    if (mappedLegacyDetails.length > 0) {
      formData.append('details', JSON.stringify(mappedLegacyDetails));
      hasDetails = true;
    }
  } else if (payload.item_id) {
    formData.append(
      'details',
      JSON.stringify([
        {
          type: 'ITEM',
          item_id: String(payload.item_id).trim(),
          quantity: Number(payload.quantity_damaged ?? payload.quantity_affected ?? 1) || 1,
          note: payload.note ? String(payload.note).trim() : undefined,
        },
      ]),
    );
    hasDetails = true;
  }

  if (!hasDetails) {
    throw new Error('Thiếu chi tiết hư hại. Vui lòng chọn ít nhất một mục bị ảnh hưởng.');
  }

  const mediaItems =
    Array.isArray(payload.local_media) && payload.local_media.length > 0
      ? payload.local_media
      : payload.local_uris.filter(Boolean).map((uri) => ({ uri, mediaType: 'IMAGE' as const }));

  for (let i = 0; i < mediaItems.length; i += 1) {
    const item = mediaItems[i];
    const isVideo =
      item.mediaType === 'VIDEO' || /\.(mp4|mov|avi|webm|mkv)$/i.test(item.uri);
    const uploadFile = isVideo
      ? await toUploadFileVideo(item.uri)
      : await toUploadFile(item.uri);
    formData.append('media', uploadFile);
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

export async function checkinShift(token: string) {
  try {
    const response = await apiClient.post<ApiEnvelope<StaffAttendanceLog>>(
      '/staff-attendance-logs/checkin',
      {},
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
    throw withRawBackendMessage(error, getErrorMessage(error));
  }
}

export async function checkoutShift(token: string) {
  try {
    const response = await apiClient.post<ApiEnvelope<StaffAttendanceLog>>(
      '/staff-attendance-logs/checkout',
      {},
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
    throw withRawBackendMessage(error, getErrorMessage(error));
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

export async function getMyAssignmentAttendanceStatus(
  token: string,
  query: { shift_assignment_id: string; date?: string },
): Promise<StaffAssignmentAttendanceStatus> {
  try {
    const response = await apiClient.get<ApiEnvelope<StaffAssignmentAttendanceStatus>>(
      '/staff-attendance-logs/me/status',
      {
        headers: authHeader(token),
        params: compactParams(query),
      },
    );

    const item = extractData<StaffAssignmentAttendanceStatus>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Không thể lấy trạng thái chấm công theo ca');
    }

    return item;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getMyTodayAttendanceStatus(
  token: string,
  date?: string,
): Promise<StaffTodayAttendanceStatus> {
  try {
    const response = await apiClient.get<ApiEnvelope<StaffTodayAttendanceStatus>>(
      '/staff-attendance-logs/me/today-status',
      {
        headers: authHeader(token),
        params: compactParams({ date }),
      },
    );

    const item = extractData<StaffTodayAttendanceStatus>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Không thể lấy trạng thái chấm công theo ngày');
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

export async function getCleaningMedia(
  token: string,
  cleaningTaskId: string,
  type?: CleaningPhotoType,
) {
  try {
    const response = await apiClient.get<ApiEnvelope<CleaningPhoto[]>>('/cleaning-media', {
      headers: authHeader(token),
      params: compactParams({
        cleaning_task_id: cleaningTaskId,
        media_type: type,
      }),
    });

    return toArray<CleaningPhoto>(response.data?.data ?? response.data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function createCleaningMedia(token: string, payload: CreateCleaningPhotoUploadPayload) {
  try {
    const formData = await buildCleaningPhotoFormData(payload);
    const baseUrl = apiClient.defaults.baseURL;
    if (!baseUrl) {
      throw new Error('Không xác định được địa chỉ backend. Vui lòng cấu hình EXPO_PUBLIC_API_URL.');
    }

    // Use fetch so browser/runtime can set multipart boundary automatically.
    const uploadResponse = await fetch(`${baseUrl}/cleaning-media`, {
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
      `/cleaning-media/${photoId}`,
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

    const uploadResponse = await fetch(`${baseUrl}/incidents`, {
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

export async function getDamageServiceCatalogs(token: string) {
  try {
    const response = await apiClient.get<ApiEnvelope<DamageServiceCatalogItem[]>>(
      '/damage-service-catalogs',
      {
        headers: authHeader(token),
        params: {
          is_active: true,
        },
      },
    );

    return toArray<DamageServiceCatalogItem>(response.data?.data ?? response.data).filter(
      (item) => String(item.id || '').trim(),
    );
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

    const uploadResponse = await fetch(`${baseUrl}/incidents`, {
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

export async function getMyCleanerKeyByTaskId(token: string, cleaningTaskId: string) {
  try {
    const response = await apiClient.get<ApiEnvelope<MyCleanerKeyByTaskData>>(
      `/cleaning-tasks/${cleaningTaskId}/my-key`,
      {
        headers: authHeader(token),
      },
    );

    const item = extractData<MyCleanerKeyByTaskData>(response.data?.data ?? response.data);
    if (!item) {
      throw new Error('Không lấy được cleaner key cho task');
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
  } catch (error: any) {
    const normalizedError = new Error(getErrorMessage(error)) as Error & { statusCode?: number };
    normalizedError.statusCode = error?.response?.status || error?.statusCode;
    throw normalizedError;
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
    // Normalise media list from new or legacy fields
    const mediaItems: Array<{ uri: string; fileType: 'IMAGE' | 'VIDEO' }> = [];
    if (payload.media_local_uris && payload.media_local_uris.length > 0) {
      mediaItems.push(...payload.media_local_uris);
    } else {
      const legacyUri = payload.media_local_uri || payload.photo_local_uri;
      if (legacyUri) {
        const isVideo =
          payload.media_file_type === 'VIDEO' || /\.(mp4|mov|avi|webm|mkv)$/i.test(legacyUri);
        mediaItems.push({ uri: legacyUri, fileType: isVideo ? 'VIDEO' : 'IMAGE' });
      }
    }

    if (mediaItems.length > 0) {
      const formData = new FormData();
      formData.append('item_name', payload.item_name);
      if (payload.description) formData.append('description', payload.description);
      if (payload.pod_id) formData.append('pod_id', payload.pod_id);
      if (payload.booking_id) formData.append('booking_id', payload.booking_id);
      if (payload.warehouse_id) formData.append('warehouse_id', payload.warehouse_id);
      if (payload.found_at) formData.append('found_at', payload.found_at);

      for (const { uri, fileType } of mediaItems) {
        const isVideo = fileType === 'VIDEO' || /\.(mp4|mov|avi|webm|mkv)$/i.test(uri);
        const mediaFile = isVideo
          ? await toUploadFileVideo(uri)
          : await toUploadFile(uri);
        formData.append('media', mediaFile);
      }

      const baseUrl = apiClient.defaults.baseURL;
      if (!baseUrl) {
        throw new Error('Không xác định được địa chỉ backend. Vui lòng cấu hình EXPO_PUBLIC_API_URL.');
      }

      // Use fetch so runtime sets multipart boundary automatically.
      const uploadResponse = await fetch(`${baseUrl}/lost-found-items`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const responseBody = (await uploadResponse.json()) as ApiEnvelope<LostFoundItem>;
      if (!uploadResponse.ok) {
        throw new Error((responseBody as { message?: string }).message || 'Tạo item thất lạc thất bại');
      }
      const item = extractData<LostFoundItem>(responseBody?.data ?? responseBody);
      if (!item) throw new Error('Tạo item thất lạc thất bại');
      return item;
    }

    const {
      photo_local_uri: _omit1,
      media_local_uri: _omit2,
      media_local_uris: _omit3,
      media_file_type: _omit4,
      ...jsonPayload
    } = payload;
    const response = await apiClient.post<ApiEnvelope<LostFoundItem>>('/lost-found-items', jsonPayload, {
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

export async function getMyLostFoundItems(token: string, query: LostFoundQuery = {}) {
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

export async function getPodItems(token: string, query: PodItemQuery = {}) {
  try {
    if (query.pod_id) {
      // Use the dedicated by-pod endpoint.
      const response = await apiClient.get<ApiEnvelope<PodItemsByPodData>>(`/pod-items/pod/${query.pod_id}`, {
        headers: authHeader(token),
      });
      const body = extractData<PodItemsByPodData>(response.data?.data ?? response.data);
      const items = normalizePodItemEntries(body?.items);
      return items;
    }

    const response = await apiClient.get<ApiEnvelope<PodItemEntry[]>>('/pod-items', {
      headers: authHeader(token),
      params: compactParams(query),
    });

    return toArray<PodItemEntry>(response.data?.data ?? response.data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getPodItemsByPodId(token: string, podId: string) {
  try {
    const response = await apiClient.get<ApiEnvelope<PodItemsByPodData>>(`/pod-items/pod/${encodeURIComponent(podId)}`, {
      headers: authHeader(token),
    });

    const body = extractData<PodItemsByPodData>(response.data?.data ?? response.data);
    return {
      pod_id: String(body?.pod_id || podId),
      pod_name: String(body?.pod_name || ''),
      pod_code: String(body?.pod_code || ''),
      count: Number(body?.count || 0),
      items: normalizePodItemEntries(body?.items),
    } as PodItemsByPodData;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getCheckoutChecklistItems(token: string, taskId: string): Promise<CheckoutChecklistData> {
  try {
    const response = await apiClient.get<ApiEnvelope<CheckoutChecklistData>>(
      `/cleaning-tasks/${encodeURIComponent(taskId)}/damage-report-items`,
      { headers: authHeader(token) },
    );
    const body = extractData<CheckoutChecklistData>(response.data?.data ?? response.data);
    return {
      booking_id: String(body?.booking_id || ''),
      pod_id: String(body?.pod_id || ''),
      items: Array.isArray(body?.items) ? body.items : [],
    };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function submitCheckoutChecklist(
  token: string,
  taskId: string,
  items: CheckoutChecklistSubmitItem[],
): Promise<CheckoutChecklistResult> {
  try {
    const response = await apiClient.post<ApiEnvelope<CheckoutChecklistResult>>(
      `/cleaning-tasks/${encodeURIComponent(taskId)}/damage-report`,
      { items },
      { headers: authHeader(token) },
    );
    const body = extractData<CheckoutChecklistResult>(response.data?.data ?? response.data);
    return body as CheckoutChecklistResult;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function getPodList(token: string) {
  try {
    const response = await apiClient.get<ApiEnvelope<PodDetails[]>>('/pods', {
      headers: authHeader(token),
      validateStatus: (status) => status < 500,
    });

    if ((response.status ?? 200) >= 400) {
      return [] as PodDetails[];
    }

    return toArray<PodDetails>(response.data?.data ?? response.data);
  } catch {
    return [] as PodDetails[];
  }
}

export async function getPodClusters(token: string, query: { location_id?: string } = {}) {
  try {
    const response = await apiClient.get<ApiEnvelope<PodCluster[]>>('/pod-clusters', {
      headers: authHeader(token),
      params: compactParams(query),
      validateStatus: (status) => status < 500,
    });

    if ((response.status ?? 200) >= 400) {
      return [] as PodCluster[];
    }

    return toArray<PodCluster>(response.data?.data ?? response.data);
  } catch {
    return [] as PodCluster[];
  }
}

export async function getPodsByClusterId(token: string, clusterId: string) {
  try {
    const response = await apiClient.get<ApiEnvelope<PodDetails[]>>('/pods', {
      headers: authHeader(token),
      params: { cluster_id: clusterId },
      validateStatus: (status) => status < 500,
    });

    if ((response.status ?? 200) >= 400) {
      // Fallback: try the cluster-specific route
      const encoded = encodeURIComponent(clusterId);
      const fallback = await apiClient.get<ApiEnvelope<PodDetails[]>>(`/pods/cluster/${encoded}`, {
        headers: authHeader(token),
        validateStatus: (s) => s < 500,
      });
      if ((fallback.status ?? 200) >= 400) return [] as PodDetails[];
      return toArray<PodDetails>(fallback.data?.data ?? fallback.data);
    }

    return toArray<PodDetails>(response.data?.data ?? response.data);
  } catch {
    return [] as PodDetails[];
  }
}

export async function getWarehouseList(token: string) {
  try {
    const response = await apiClient.get<ApiEnvelope<WarehouseListItem[]>>('/warehouses', {
      headers: authHeader(token),
      validateStatus: (status) => status < 500,
    });

    if ((response.status ?? 200) >= 400) {
      return [] as WarehouseListItem[];
    }

    return toArray<WarehouseListItem>(response.data?.data ?? response.data);
  } catch {
    return [] as WarehouseListItem[];
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


