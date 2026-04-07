import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import {
    checkinBookingWithCleanerKey,
    createCleaningPhoto,
    createDamageReport,
    createOperationalIncident,
    getBookingById,
    getCleaningPhotos,
    getCleaningTaskById,
    getDamageReportItems,
    getIncidentsByCleaningTaskId,
    getMyCleanerKeyByBookingId,
    getPodById,
    updateCleaningTask,
} from '@/services/cleaner-dashboard.service';
import type {
    CleanerOnlineKey,
    CleanerTaskAction,
    CleaningPhoto,
    CleaningPhotoType,
    CleaningTask,
    DamageReportItem,
    Incident,
    IncidentSeverity,
} from '@/types/cleaner-dashboard';
import { getErrorMessage, validateRejectionReason } from '@/utils/validation';

interface TaskDetailTabProps {
  token: string;
  taskId: string | null;
  isDark: boolean;
  palette: typeof Colors.light;
  onClose: () => void;
  onTaskUpdated?: (task: CleaningTask) => void;
  onErrorChange?: (error: string | null) => void;
}

type BookingTimeWindow = {
  start_time?: string;
  end_time?: string;
};

function formatDateTime(dateText?: string) {
  if (!dateText) return '-';
  const parsed = new Date(dateText);
  return Number.isNaN(parsed.getTime())
    ? dateText
    : parsed.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function formatVnd(value?: number | null) {
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('vi-VN').format(Number(value)) + ' VND';
}

function parsePositiveInteger(value: string, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseNonNegativeAmount(value: string, fallback = 0) {
  const normalized = value.replace(/[^\d]/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function taskActionPayload(action: CleanerTaskAction, rejectionReason: string) {
  const now = new Date().toISOString();

  switch (action) {
    case 'accept':
      return { status: 'ACCEPTED' as const, accepted_at: now };
    case 'start':
      return { status: 'IN_PROGRESS' as const, start_time: now };
    case 'complete':
      return { status: 'DONE' as const, end_time: now };
    case 'reject':
      return {
        status: 'CANCELLED' as const,
        rejection_reason: rejectionReason.trim() || 'Cleaner từ chối nhiệm vụ',
      };
    default:
      return {};
  }
}

function getActionLabel(action: CleanerTaskAction): string {
  const labels: Record<CleanerTaskAction, string> = {
    accept: 'Nhận việc',
    start: 'Bắt đầu dọn',
    complete: 'Hoàn tất',
    reject: 'Từ chối',
  };
  return labels[action];
}

function getActionColor(action: CleanerTaskAction, palette: typeof Colors.light): string {
  const colors: Record<CleanerTaskAction, string> = {
    accept: palette.secondary,
    start: '#f59e0b',
    complete: palette.success,
    reject: palette.error,
  };
  return colors[action];
}

function progressStepState(status: string | undefined) {
  const normalized = String(status || '').toUpperCase();
  const order = ['ASSIGNED', 'NOTIFIED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'DONE'];
  const rank = order.indexOf(normalized);

  return {
    accepted: rank >= 2,
    started: rank >= 4,
    completed: rank >= 5,
  };
}

const INCIDENT_SEVERITY_OPTIONS: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function shouldHidePermissionMessage(message: string) {
  return message.toLowerCase().includes('không có quyền');
}

function resolveStartActionError(err: any) {
  const status = err?.response?.status || err?.statusCode;

  if (status === 401) {
    return {
      title: 'Chưa đăng nhập',
      message: 'Vui lòng đăng nhập lại để tiếp tục.',
    };
  }

  if (status === 403) {
    return {
      title: 'Không có quyền',
      message: 'Chủ nhân phòng chưa cho phép truy cập làm vệ sinh hoặc chưa tới giờ làm vệ sinh.',
    };
  }

  if (status === 404) {
    return {
      title: 'Không tìm thấy booking/key',
      message: 'Không tìm thấy booking hoặc bạn chưa được cấp cleaner key cho booking này.',
    };
  }

  return {
    title: 'Lỗi',
    message: getErrorMessage(err),
  };
}

function taskPodDisplayName(task: CleaningTask) {
  const podRecord = task.pod as { name?: string; code?: string } | undefined;
  return String(task.pod_name || podRecord?.name || task.pod_code || podRecord?.code || '').trim();
}

function taskBookingDisplayName(task: CleaningTask) {
  const bookingRecord = task.booking as { order_id?: string; id?: string } | undefined;
  return String(task.booking_order_id || bookingRecord?.order_id || bookingRecord?.id || '').trim();
}

function taskBookingWindow(task: CleaningTask) {
  const bookingRecord = task.booking as { start_time?: string; end_time?: string } | undefined;

  return {
    start_time: String(task.booking_start_time || bookingRecord?.start_time || '').trim() || undefined,
    end_time: String(task.booking_end_time || bookingRecord?.end_time || '').trim() || undefined,
  };
}

function normalizeId(value: unknown): string {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  const lower = normalized.toLowerCase();
  if (lower === 'undefined' || lower === 'null') {
    return '';
  }

  return normalized;
}

function maskKeyToken(keyToken?: string) {
  const token = String(keyToken || '').trim();
  if (!token) return '-';
  if (token.length <= 10) return token;
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function resolveOnlineKeyValidation(key: CleanerOnlineKey | null) {
  if (!key?.key_token) {
    return { status: 'MISSING', label: 'Chưa có key', detail: 'Chưa được cấp online key cho booking này.' };
  }

  if (key.is_revoked) {
    return { status: 'REVOKED', label: 'Đã thu hồi', detail: 'Online key đã bị thu hồi.' };
  }

  const nowTime = Date.now();
  const fromTime = key.valid_from ? new Date(key.valid_from).getTime() : Number.NaN;
  const toTime = key.valid_to ? new Date(key.valid_to).getTime() : Number.NaN;

  if (Number.isFinite(fromTime) && fromTime > nowTime) {
    return { status: 'NOT_YET_VALID', label: 'Chưa tới hiệu lực', detail: 'Bạn chưa thể dùng key trước thời gian hiệu lực.' };
  }

  if (Number.isFinite(toTime) && toTime < nowTime) {
    return { status: 'EXPIRED', label: 'Hết hạn', detail: 'Online key đã hết hạn.' };
  }

  return { status: 'VALID', label: 'Hợp lệ', detail: 'Online key đang trong thời gian hiệu lực.' };
}

function resolveOnlineKeyValidationWithAccess(
  key: CleanerOnlineKey | null,
  accessState: 'UNKNOWN' | 'OK' | 'FORBIDDEN' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'NO_BOOKING' | 'ERROR',
) {
  if (accessState === 'NO_BOOKING') {
    return {
      status: 'NO_BOOKING',
      label: 'Không có booking',
      detail: 'Task này không gắn booking nên không có online key.',
    };
  }

  if (accessState === 'FORBIDDEN') {
    return {
      status: 'FORBIDDEN',
      label: 'Chưa được phép xem',
      detail: 'Bạn chưa được phép xem online key của booking này.',
    };
  }

  if (accessState === 'UNAUTHORIZED') {
    return {
      status: 'UNAUTHORIZED',
      label: 'Chưa đăng nhập',
      detail: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
    };
  }

  if (accessState === 'NOT_FOUND') {
    return {
      status: 'NOT_FOUND',
      label: 'Không tìm thấy booking/key',
      detail: 'Không tìm thấy booking hoặc chưa được cấp online key.',
    };
  }

  if (accessState === 'ERROR') {
    return {
      status: 'ERROR',
      label: 'Lỗi tải key',
      detail: 'Không thể tải thông tin online key lúc này.',
    };
  }

  return resolveOnlineKeyValidation(key);
}

function resolveOnlineKeyAccessState(err: any) {
  const status = err?.response?.status || err?.statusCode;
  if (status === 401) return 'UNAUTHORIZED' as const;
  if (status === 403) return 'FORBIDDEN' as const;
  if (status === 404) return 'NOT_FOUND' as const;
  return 'ERROR' as const;
}

export default function TaskDetailTab({
  token,
  taskId,
  isDark,
  palette,
  onClose,
  onTaskUpdated,
  onErrorChange,
}: TaskDetailTabProps) {
  const [task, setTask] = useState<CleaningTask | null>(null);
  const [photos, setPhotos] = useState<CleaningPhoto[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [damageItems, setDamageItems] = useState<DamageReportItem[]>([]);
  const [podName, setPodName] = useState<string | null>(null);
  const [bookingName, setBookingName] = useState<string | null>(null);
  const [bookingWindowOverride, setBookingWindowOverride] = useState<BookingTimeWindow | null>(null);
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [libraryPermission, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCleanerKey, setLastCleanerKey] = useState<CleanerOnlineKey | null>(null);
  const [onlineKeyNotice, setOnlineKeyNotice] = useState<string | null>(null);
  const [onlineKeyAccessState, setOnlineKeyAccessState] = useState<
    'UNKNOWN' | 'OK' | 'FORBIDDEN' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'NO_BOOKING' | 'ERROR'
  >('UNKNOWN');

  const [capturedPhotoUris, setCapturedPhotoUris] = useState<string[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [photoType, setPhotoType] = useState<CleaningPhotoType>('BEFORE');
  const [captureMode, setCaptureMode] = useState<'CLEANING' | 'OPERATIONAL_INCIDENT' | 'DAMAGE_REPORT'>('CLEANING');
  
  // Operational Incident State (báo cáo sự cố chung)
  const [operationalIncidentDescription, setOperationalIncidentDescription] = useState('');
  const [operationalIncidentSeverity, setOperationalIncidentSeverity] = useState<IncidentSeverity>('MEDIUM');
  
  // Damage Report State (báo cáo hư hại vật tư)
  const [damageDescription, setDamageDescription] = useState('');
  const [damageSeverity, setDamageSeverity] = useState<IncidentSeverity>('MEDIUM');
  const [damageItemId, setDamageItemId] = useState('');
  const [damageQuantityText, setDamageQuantityText] = useState('1');
  const [damageServiceFeeText, setDamageServiceFeeText] = useState('0');
  
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const taskStatus = String(task?.status || '').toUpperCase();
  const isOperationalMode = captureMode === 'OPERATIONAL_INCIDENT';
  const isDamageReportMode = captureMode === 'DAMAGE_REPORT';
  const isIncidentMode = isOperationalMode || isDamageReportMode;
  const canReportIncident = taskStatus === 'IN_PROGRESS';
  const canAccessPhotoFlow =
    taskStatus === 'ACCEPTED' ||
    taskStatus === 'ARRIVED' ||
    taskStatus === 'IN_PROGRESS' ||
    taskStatus === 'DONE';
  const canCaptureCleaningPhotos = canAccessPhotoFlow && taskStatus !== 'DONE' && !isIncidentMode;
  const canCaptureIncidentPhotos = isIncidentMode && canReportIncident;
  const canCaptureNewPhotos = canCaptureCleaningPhotos || canCaptureIncidentPhotos;
  const selectedDamageItem = damageItems.find((item) => String(item.id || '') === damageItemId) || null;
  const damageQuantity = parsePositiveInteger(damageQuantityText, 1);
  const damageServiceFee = parseNonNegativeAmount(damageServiceFeeText, 0);
  const selectedUnitCost = Number(selectedDamageItem?.unit_cost) || 0;
  const previewItemValue = selectedUnitCost * damageQuantity;
  const previewPenaltyValue = previewItemValue + damageServiceFee;

  const openCamera = async () => {
    if (!task || !canCaptureNewPhotos) {
      Alert.alert(
        'Chưa thể chụp ảnh',
        isIncidentMode
          ? 'Chỉ có thể báo cáo hư hại khi nhiệm vụ đang ở trạng thái IN_PROGRESS.'
          : 'Bạn cần bấm "Bắt đầu dọn" trước khi chụp ảnh nhiệm vụ.',
      );
      return;
    }

    if (!cameraPermission?.granted) {
      const permissionResult = await requestCameraPermission();
      if (!permissionResult.granted) {
        Alert.alert('Không thể mở camera', 'Vui lòng cấp quyền camera để chụp ảnh.');
        return;
      }
    }

    setIsCameraOpen(true);
  };

  const handleCapturePhoto = async () => {
    if (!cameraRef.current) {
      return;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.75,
      });

      if (!photo?.uri) {
        Alert.alert('Lỗi', 'Không chụp được ảnh, vui lòng thử lại.');
        return;
      }

      setCapturedPhotoUris((prev) => [...prev, photo.uri]);
    } catch {
      Alert.alert('Lỗi', 'Không thể chụp ảnh, vui lòng thử lại.');
    }
  };

  const pickPhotoFromLibrary = async () => {
    if (!task || !canCaptureNewPhotos) {
      Alert.alert(
        'Chưa thể thêm ảnh',
        isIncidentMode
          ? 'Chỉ có thể báo cáo hư hại khi nhiệm vụ đang ở trạng thái IN_PROGRESS.'
          : 'Bạn cần bấm "Bắt đầu dọn" trước khi thêm ảnh nhiệm vụ.',
      );
      return;
    }

    if (!libraryPermission?.granted) {
      const permissionResult = await requestLibraryPermission();
      if (!permissionResult.granted) {
        Alert.alert('Không thể mở thư viện', 'Vui lòng cấp quyền thư viện để chọn ảnh.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      allowsEditing: false,
      selectionLimit: 1,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const selectedUri = result.assets[0]?.uri;
    if (!selectedUri) {
      Alert.alert('Lỗi', 'Không đọc được ảnh đã chọn.');
      return;
    }

    setCapturedPhotoUris((prev) => [...prev, selectedUri]);
  };

  const removeCapturedPhoto = (indexToRemove: number) => {
    setCapturedPhotoUris((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  useEffect(() => {
    if (!canCaptureNewPhotos) {
      setIsCameraOpen(false);
      setCapturedPhotoUris([]);
    }
  }, [canCaptureNewPhotos]);

  useEffect(() => {
    if (!canReportIncident && isIncidentMode) {
      setCaptureMode('CLEANING');
      setOperationalIncidentDescription('');
      setOperationalIncidentSeverity('MEDIUM');
      setDamageDescription('');
      setDamageSeverity('MEDIUM');
      setDamageItemId('');
      setDamageQuantityText('1');
      setDamageServiceFeeText('0');
      setCapturedPhotoUris([]);
      setIsCameraOpen(false);
    }
  }, [canReportIncident, isIncidentMode]);

  const loadDetail = useCallback(async () => {
    if (!taskId || !token) return;

    setLoading(true);
    setError(null);
    onErrorChange?.(null);

    try {
      const [taskData, photosData, incidentsData] = await Promise.all([
        getCleaningTaskById(token, taskId),
        getCleaningPhotos(token, taskId),
        getIncidentsByCleaningTaskId(token, taskId),
      ]);

      setTask(taskData);
      setPhotos(photosData);
      setIncidents(incidentsData);
      setPodName(taskPodDisplayName(taskData) || null);
      setBookingName(taskBookingDisplayName(taskData) || null);
      setBookingWindowOverride(taskBookingWindow(taskData));
      setLastCleanerKey(null);
      setOnlineKeyNotice(null);
      setOnlineKeyAccessState('UNKNOWN');

      if (damageItems.length === 0) {
        try {
          const items = await getDamageReportItems(token);
          setDamageItems(items.filter((item) => String(item.id || '').trim()));
        } catch {
          // Keep UI usable even if item list endpoint is unavailable.
          setDamageItems([]);
        }
      }

      const podId = String(taskData.pod_id || '').trim();
      const bookingId = normalizeId(taskData.booking_id);

      if (podId) {
        try {
          const pod = await getPodById(token, podId);
          if (pod) {
            setPodName(String(pod.name || pod.code || '').trim() || null);
          }
        } catch {
          // Keep existing pod name resolved from task payload.
        }
      }

      if (bookingId) {
        try {
          const booking = await getBookingById(token, bookingId);
          setBookingName(String(booking.order_id || booking.id || '').trim() || null);
          setBookingWindowOverride((prev) => {
            const nextStart = String(booking.start_time || '').trim();
            const nextEnd = String(booking.end_time || '').trim();

            return {
              start_time: nextStart || prev?.start_time,
              end_time: nextEnd || prev?.end_time,
            };
          });
        } catch {
          // Keep existing booking name resolved from task payload.
        }

        try {
          const cleanerKeyResult = await getMyCleanerKeyByBookingId(token, bookingId);
          const resolvedKey = cleanerKeyResult.online_key || null;
          setLastCleanerKey(resolvedKey);
          setOnlineKeyAccessState('OK');

          if (!resolvedKey?.key_token) {
            setOnlineKeyNotice('Chưa được cấp online key cho booking này.');
          }
        } catch (err: any) {
          setLastCleanerKey(null);
          setOnlineKeyAccessState(resolveOnlineKeyAccessState(err));
          setOnlineKeyNotice(resolveStartActionError(err).message);
        }
      } else {
        setBookingWindowOverride(null);
        setLastCleanerKey(null);
        setOnlineKeyAccessState('NO_BOOKING');
        setOnlineKeyNotice('Task này không có booking nên không có online key.');
      }

      onErrorChange?.(null);
    } catch (err) {
      const msg = getErrorMessage(err);
      if (shouldHidePermissionMessage(msg)) {
        setError(null);
        onErrorChange?.(null);
      } else {
        setError(msg);
        onErrorChange?.(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [taskId, token, onErrorChange, damageItems.length]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleAction = async (action: CleanerTaskAction) => {
    if (!task || !taskId) return;

    if (action === 'reject') {
      const validation = validateRejectionReason(rejectionReason);
      if (!validation.valid) {
        Alert.alert('Lỗi', validation.error || 'Lý do từ chối không hợp lệ');
        return;
      }
    }

    setActionLoading(true);
    setError(null);
    onErrorChange?.(null);

    try {
      if (action === 'start') {
        const bookingId = normalizeId(task.booking_id);

        if (bookingId) {
          try {
            const cleanerKeyResult = await getMyCleanerKeyByBookingId(token, bookingId);
            const keyToken = String(cleanerKeyResult.online_key?.key_token || '').trim();

            if (!keyToken) {
              setLastCleanerKey(cleanerKeyResult.online_key || null);
              setOnlineKeyAccessState('OK');
              setOnlineKeyNotice('Chưa được cấp online key cho booking này.');
              Alert.alert('Không tìm thấy key', 'Bạn chưa được cấp cleaner key cho booking này. Hãy liên hệ quản lý hoặc thử lại sau.');
              setActionLoading(false);
              return;
            }

            try {
              await checkinBookingWithCleanerKey(token, keyToken);
              setLastCleanerKey(cleanerKeyResult.online_key || null);
              setOnlineKeyAccessState('OK');
              setOnlineKeyNotice(null);
            } catch (err: any) {
              const errorInfo = resolveStartActionError(err);
              setError(errorInfo.message);
              onErrorChange?.(errorInfo.message);
              setOnlineKeyAccessState(resolveOnlineKeyAccessState(err));
              setOnlineKeyNotice(errorInfo.message);
              Alert.alert(errorInfo.title, errorInfo.message);
              setActionLoading(false);
              return;
            }
          } catch (err: any) {
            const errorInfo = resolveStartActionError(err);
            setError(errorInfo.message);
            onErrorChange?.(errorInfo.message);
            setOnlineKeyAccessState(resolveOnlineKeyAccessState(err));
            setOnlineKeyNotice(errorInfo.message);
            Alert.alert(errorInfo.title, errorInfo.message);
            setActionLoading(false);
            return;
          }
        }
      }

      const payload = taskActionPayload(action, rejectionReason);
      const updated = await updateCleaningTask(token, taskId, payload);

      setTask(updated);
      setRejectionReason('');
      onTaskUpdated?.(updated);
      onErrorChange?.(null);

      Alert.alert('Thành công', `${getActionLabel(action)} thành công`);
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      onErrorChange?.(msg);
      Alert.alert('Lỗi', msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUploadPhoto = async () => {
    if (!taskId || capturedPhotoUris.length === 0) {
      Alert.alert('Lỗi', 'Vui lòng chụp ít nhất một ảnh trước khi lưu.');
      return;
    }

    setUploadingPhoto(true);
    setError(null);
    onErrorChange?.(null);

    try {
      if (isOperationalMode) {
        // OPERATIONAL INCIDENT: báo cáo sự cố chung
        const normalizedDescription = operationalIncidentDescription.trim();
        if (!normalizedDescription) {
          Alert.alert('Thiếu thông tin', 'Vui lòng nhập mô tả sự cố trước khi gửi báo cáo.');
          setUploadingPhoto(false);
          return;
        }

        await createOperationalIncident(token, {
          cleaning_task_id: taskId,
          description: normalizedDescription,
          severity: operationalIncidentSeverity,
          local_uris: capturedPhotoUris,
        });

        const updatedIncidents = await getIncidentsByCleaningTaskId(token, taskId);
        setIncidents(updatedIncidents);

        setCapturedPhotoUris([]);
        setOperationalIncidentDescription('');
        setOperationalIncidentSeverity('MEDIUM');
        setCaptureMode('CLEANING');
        setIsCameraOpen(false);
        onErrorChange?.(null);

        Alert.alert('Thành công', 'Đã gửi báo cáo sự cố cho nhiệm vụ này.');
      } else if (isDamageReportMode) {
        // DAMAGE REPORT: báo cáo hư hại vật tư có tính tiền
        const normalizedDescription = damageDescription.trim();
        if (!normalizedDescription) {
          Alert.alert('Thiếu thông tin', 'Vui lòng nhập mô tả hư hại trước khi gửi báo cáo.');
          setUploadingPhoto(false);
          return;
        }

        const normalizedDamageItemId = damageItemId.trim();
        if (!normalizedDamageItemId) {
          Alert.alert('Thiếu thông tin', 'Vui lòng chọn món đồ bị hư hại.');
          setUploadingPhoto(false);
          return;
        }

        await createDamageReport(token, {
          cleaning_task_id: taskId,
          description: normalizedDescription,
          damaged_items: [
            {
              item_id: normalizedDamageItemId,
              quantity_damaged: damageQuantity,
              damage_type: 'BROKEN',
            },
          ],
          estimated_service_fee: damageServiceFee,
          severity: damageSeverity,
          local_uris: capturedPhotoUris,
        });

        const updatedIncidents = await getIncidentsByCleaningTaskId(token, taskId);
        setIncidents(updatedIncidents);

        setCapturedPhotoUris([]);
        setDamageDescription('');
        setDamageSeverity('MEDIUM');
        setDamageItemId('');
        setDamageQuantityText('1');
        setDamageServiceFeeText('0');
        setCaptureMode('CLEANING');
        setIsCameraOpen(false);
        onErrorChange?.(null);

        Alert.alert('Thành công', 'Đã gửi báo cáo hư hại cho nhiệm vụ này.');
      } else {
        // CLEANING PHOTOS: lưu ảnh BEFORE/AFTER
        for (const uri of capturedPhotoUris) {
          await createCleaningPhoto(token, {
            cleaning_task_id: taskId,
            local_uri: uri,
            type: photoType,
          });
        }

        setCapturedPhotoUris([]);
        const updated = await getCleaningPhotos(token, taskId);
        setPhotos(updated);
        onErrorChange?.(null);

        Alert.alert('Thành công', `Đã lưu ${capturedPhotoUris.length} ảnh cho task.`);
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      if (shouldHidePermissionMessage(msg)) {
        setError(null);
        onErrorChange?.(null);
      } else {
        setError(msg);
        onErrorChange?.(msg);
      }
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (!taskId) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: palette.background }]}>
        <Text style={[styles.emptyText, { color: palette.textMuted }]}>
          Chọn một task để xem chi tiết
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: palette.background }]}>
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: palette.background }]}>
        <Text style={[styles.emptyText, { color: palette.error }]}>
          Không tìm thấy task
        </Text>
      </View>
    );
  }

  const canAccept = task.status === 'ASSIGNED' || task.status === 'NOTIFIED';
  const canStart = task.status === 'ACCEPTED' || task.status === 'ARRIVED';
  const canComplete = task.status === 'IN_PROGRESS';
  const canReject = ['ASSIGNED', 'NOTIFIED', 'ACCEPTED'].includes(String(task.status || ''));
  const progress = progressStepState(task.status);
  const bookingWindow = bookingWindowOverride || taskBookingWindow(task);
  const onlineKeyValidation = resolveOnlineKeyValidationWithAccess(lastCleanerKey, onlineKeyAccessState);
  const onlineKeyStatusColor =
    onlineKeyValidation.status === 'VALID'
      ? palette.success
      : onlineKeyValidation.status === 'NOT_YET_VALID'
        ? '#d97706'
        : onlineKeyValidation.status === 'MISSING' || onlineKeyValidation.status === 'NO_BOOKING'
          ? palette.textMuted
          : palette.error;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.text }]}>Chi tiết nhiệm vụ</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={[styles.closeButtonText, { color: palette.text }]}>✕</Text>
          </Pressable>
        </View>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: palette.card, borderColor: palette.error }]}>
            <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
          </View>
        )}

        {/* Task Info */}
        <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Thông tin task</Text>
          <Text style={[styles.info, { color: palette.textMuted }]}>Trạng thái: {task.status}</Text>
          <Text style={[styles.info, { color: palette.textMuted }]}>Pod: {podName || '-'}</Text>
          <Text style={[styles.info, { color: palette.textMuted }]}>
            Đặt chỗ: {bookingName || '-'}
          </Text>
          <Text style={[styles.info, { color: palette.textMuted }]}>
            Nguồn yêu cầu: {String(task.request_source || '-')}
          </Text>
          <Text style={[styles.info, { color: palette.textMuted }]}>
            Hạn chót: {formatDateTime(task.due_at || undefined)}
          </Text>
          <Text style={[styles.info, { color: palette.textMuted }]}>
            Thời gian ở của khách: {`${formatDateTime(bookingWindow.start_time)} - ${formatDateTime(bookingWindow.end_time)}`}
          </Text>
        </View>

        <View style={[styles.section, styles.onlineKeySection, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={styles.onlineKeyHeaderRow}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Online key</Text>
            <View style={[styles.onlineKeyBadge, { backgroundColor: `${onlineKeyStatusColor}22`, borderColor: onlineKeyStatusColor }]}>
              <Text style={[styles.onlineKeyBadgeText, { color: onlineKeyStatusColor }]}>{onlineKeyValidation.label}</Text>
            </View>
          </View>

          <View style={[styles.onlineKeyCodeBox, { borderColor: palette.border, backgroundColor: palette.surface }]}>
            <Text style={[styles.onlineKeyCodeLabel, { color: palette.textMuted }]}>Mã key</Text>
            <Text style={[styles.onlineKeyCodeText, { color: palette.text }]}>{maskKeyToken(lastCleanerKey?.key_token)}</Text>
          </View>

          <View style={styles.onlineKeyMetaGrid}>
            <View style={[styles.onlineKeyMetaCard, { borderColor: palette.border, backgroundColor: palette.surface }]}>
              <Text style={[styles.onlineKeyMetaLabel, { color: palette.textMuted }]}>Hiệu lực từ</Text>
              <Text style={[styles.onlineKeyMetaValue, { color: palette.text }]}>{formatDateTime(lastCleanerKey?.valid_from)}</Text>
            </View>
            <View style={[styles.onlineKeyMetaCard, { borderColor: palette.border, backgroundColor: palette.surface }]}>
              <Text style={[styles.onlineKeyMetaLabel, { color: palette.textMuted }]}>Hiệu lực đến</Text>
              <Text style={[styles.onlineKeyMetaValue, { color: palette.text }]}>{formatDateTime(lastCleanerKey?.valid_to)}</Text>
            </View>
          </View>

          <View style={[styles.onlineKeyValidationBox, { borderColor: palette.border, backgroundColor: palette.surface }]}>
            <Text style={[styles.onlineKeyValidationLabel, { color: palette.textMuted }]}>Xác thực</Text>
            <Text style={[styles.onlineKeyValidationValue, { color: palette.text }]}>{onlineKeyValidation.detail}</Text>
          </View>

          {onlineKeyNotice ? (
            <Text style={[styles.onlineKeyNotice, { color: palette.error }]}>{onlineKeyNotice}</Text>
          ) : null}
        </View>

        {/* Incidents Section */}
        {incidents.length > 0 && (
          <View style={[styles.section, { backgroundColor: `${palette.error}12`, borderColor: palette.error }]}>
            <Text style={[styles.sectionTitle, { color: palette.error }]}>Báo cáo ({incidents.length})</Text>
            {incidents.map((incident) => {
              const severityColor = {
                LOW: palette.success,
                MEDIUM: '#f59e0b',
                HIGH: palette.error,
                CRITICAL: palette.error,
              }[String(incident.severity || 'MEDIUM')] || palette.textMuted;

              const incidentTypeLabel = incident.incident_type === 'DAMAGE_REPORT' ? 'Hư hại vật tư' : 'Sự cố chung';
              const incidentTypeColor =
                incident.incident_type === 'DAMAGE_REPORT' ? palette.error : palette.secondary;

              return (
                <View
                  key={String(incident.id || Math.random())}
                  style={[styles.incidentItem, { borderColor: severityColor }]}>
                  <View style={styles.incidentHeader}>
                    <View>
                      <Text style={[styles.incidentSeverity, { color: severityColor }]}>
                        {String(incident.severity || 'MEDIUM')}
                      </Text>
                      <Text
                        style={[
                          styles.incidentStatus,
                          { color: incidentTypeColor, fontSize: 11, marginTop: 2 },
                        ]}>
                        {incidentTypeLabel}
                      </Text>
                    </View>
                    <Text style={[styles.incidentStatus, { color: palette.textMuted }]}>
                      {String(incident.status || 'PENDING')}
                    </Text>
                  </View>
                  <Text style={[styles.incidentDescription, { color: palette.text }]}>
                    {String(incident.description || '-')}
                  </Text>
                  {incident.item_name_snapshot || incident.estimated_total_value !== undefined ? (
                    <View
                      style={[
                        styles.incidentPricingBox,
                        { backgroundColor: palette.surface, borderColor: palette.border },
                      ]}>
                      <Text style={[styles.incidentPricingText, { color: palette.text }]}>
                        Món đồ: {String(incident.item_name_snapshot || incident.item_id || '-')}
                      </Text>
                      <Text style={[styles.incidentPricingText, { color: palette.textMuted }]}> 
                        Giá gốc snapshot: {formatVnd(incident.unit_cost_snapshot as number | null | undefined)}
                      </Text>
                      <Text style={[styles.incidentPricingText, { color: palette.textMuted }]}> 
                        Số lượng: {Number(incident.quantity_affected) || 1}
                      </Text>
                      <Text style={[styles.incidentPricingText, { color: palette.textMuted }]}> 
                        Giá trị vật tư: {formatVnd(incident.estimated_item_value as number | null | undefined)}
                      </Text>
                      <Text style={[styles.incidentPricingText, { color: palette.textMuted }]}> 
                        Phí dịch vụ: {formatVnd(incident.estimated_service_fee as number | null | undefined)}
                      </Text>
                      <Text style={[styles.incidentPricingTotal, { color: palette.error }]}>
                        Penalty ước tính: {formatVnd(incident.estimated_total_value as number | null | undefined)}
                      </Text>
                    </View>
                  ) : null}
                  {incident.photo_urls && incident.photo_urls.length > 0 && (
                    <ScrollView horizontal style={styles.incidentPhotosScroll}>
                      {incident.photo_urls.map((photoUrl, idx) => (
                        <Image
                          key={`${incident.id}_${idx}`}
                          source={{ uri: String(photoUrl) }}
                          style={styles.incidentPhotoThumb}
                          resizeMode="cover"
                        />
                      ))}
                    </ScrollView>
                  )}
                  <Text style={[styles.incidentTime, { color: palette.textMuted }]}>
                    {formatDateTime(String(incident.created_at || ''))}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Actions */}
        <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Hành động</Text>

          <View style={styles.progressRow}>
            <View
              style={[
                styles.progressStep,
                {
                  borderColor: progress.accepted ? palette.success : palette.border,
                  backgroundColor: progress.accepted ? `${palette.success}22` : palette.surface,
                },
              ]}>
              <Text style={[styles.progressLabel, { color: palette.text }]}>1. Nhận việc</Text>
            </View>
            <View
              style={[
                styles.progressStep,
                {
                  borderColor: progress.started ? palette.success : palette.border,
                  backgroundColor: progress.started ? `${palette.success}22` : palette.surface,
                },
              ]}>
              <Text style={[styles.progressLabel, { color: palette.text }]}>2. Bắt đầu</Text>
            </View>
            <View
              style={[
                styles.progressStep,
                {
                  borderColor: progress.completed ? palette.success : palette.border,
                  backgroundColor: progress.completed ? `${palette.success}22` : palette.surface,
                },
              ]}>
              <Text style={[styles.progressLabel, { color: palette.text }]}>3. Hoàn tất</Text>
            </View>
          </View>

          <View style={styles.actionGrid}>
            {canAccept && (
              <Pressable
                style={[styles.actionButton, { backgroundColor: getActionColor('accept', palette) }]}
                disabled={actionLoading}
                onPress={() => void handleAction('accept')}>
                <Text style={[styles.actionButtonText, { color: palette.primaryDark }]}>
                  {getActionLabel('accept')}
                </Text>
              </Pressable>
            )}

            {canStart && (
              <Pressable
                style={[styles.actionButton, { backgroundColor: getActionColor('start', palette) }]}
                disabled={actionLoading}
                onPress={() => void handleAction('start')}>
                <Text style={[styles.actionButtonText, { color: palette.white }]}>
                  {getActionLabel('start')}
                </Text>
              </Pressable>
            )}

            {canComplete && (
              <Pressable
                style={[styles.actionButton, { backgroundColor: getActionColor('complete', palette) }]}
                disabled={actionLoading}
                onPress={() => void handleAction('complete')}>
                <Text style={[styles.actionButtonText, { color: palette.white }]}>
                  {getActionLabel('complete')}
                </Text>
              </Pressable>
            )}

            {canReject && (
              <Pressable
                style={[styles.actionButton, { backgroundColor: getActionColor('reject', palette) }]}
                disabled={actionLoading}
                onPress={() => void handleAction('reject')}>
                <Text style={[styles.actionButtonText, { color: palette.white }]}>
                  {getActionLabel('reject')}
                </Text>
              </Pressable>
            )}

            {!isIncidentMode && (
              <>
                {/* Báo cáo sự cố chung (OPERATIONAL) */}
                <Pressable
                  style={[
                    styles.actionButton,
                    { backgroundColor: canReportIncident ? palette.secondary : palette.neutral400 },
                  ]}
                  disabled={actionLoading || uploadingPhoto || !canReportIncident}
                  onPress={() => {
                    if (!canReportIncident) {
                      Alert.alert(
                        'Chưa thể báo cáo',
                        'Báo cáo sự cố sẽ mở khi nhiệm vụ ở trạng thái IN_PROGRESS.',
                      );
                      return;
                    }

                    setCaptureMode('OPERATIONAL_INCIDENT');
                    setOperationalIncidentDescription('');
                    setOperationalIncidentSeverity('MEDIUM');
                    setPhotoType('BEFORE');
                    setCapturedPhotoUris([]);
                    setIsCameraOpen(false);
                  }}>
                  <Text style={[styles.actionButtonText, { color: palette.white }]}>
                    {canReportIncident ? 'Báo cáo sự cố' : 'Báo cáo sự cố (chờ IN_PROGRESS)'}
                  </Text>
                </Pressable>

                {/* Báo cáo hư hại vật tư (DAMAGE_REPORT) */}
                <Pressable
                  style={[
                    styles.actionButton,
                    { backgroundColor: canReportIncident ? palette.error : palette.neutral400 },
                  ]}
                  disabled={actionLoading || uploadingPhoto || !canReportIncident}
                  onPress={() => {
                    if (!canReportIncident) {
                      Alert.alert(
                        'Chưa thể báo cáo',
                        'Báo cáo hư hại sẽ mở khi nhiệm vụ ở trạng thái IN_PROGRESS.',
                      );
                      return;
                    }

                    setCaptureMode('DAMAGE_REPORT');
                    setDamageDescription('');
                    setDamageSeverity('MEDIUM');
                    setDamageItemId('');
                    setDamageQuantityText('1');
                    setDamageServiceFeeText('0');
                    setPhotoType('BEFORE');
                    setCapturedPhotoUris([]);
                    setIsCameraOpen(false);
                  }}>
                  <Text style={[styles.actionButtonText, { color: palette.white }]}>
                    {canReportIncident ? 'Báo cáo hư hại' : 'Báo cáo hư hại (chờ IN_PROGRESS)'}
                  </Text>
                </Pressable>
              </>
            )}

            {isIncidentMode && (
              <Pressable
                style={[styles.actionButton, { backgroundColor: palette.neutral400 }]}
                disabled={actionLoading || uploadingPhoto}
                onPress={() => {
                  setCaptureMode('CLEANING');
                  setOperationalIncidentDescription('');
                  setOperationalIncidentSeverity('MEDIUM');
                  setDamageDescription('');
                  setDamageSeverity('MEDIUM');
                  setDamageItemId('');
                  setDamageQuantityText('1');
                  setDamageServiceFeeText('0');
                  setCapturedPhotoUris([]);
                  setIsCameraOpen(false);
                }}>
                <Text style={[styles.actionButtonText, { color: palette.white }]}>Hủy báo cáo</Text>
              </Pressable>
            )}
          </View>

          {!canReportIncident && !isIncidentMode && (
            <Text style={[styles.info, { color: palette.textMuted }]}>
              Luồng báo cáo hư hại chỉ khả dụng sau khi bấm "Bắt đầu dọn" (task chuyển IN_PROGRESS).
            </Text>
          )}

          {canReject && (
            <TextInput
              style={[
                styles.input,
                { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
              ]}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              placeholder="Lý do từ chối (tuỳ chọn)"
              placeholderTextColor={palette.neutral500}
              editable={!actionLoading}
            />
          )}
        </View>

        {/* Photos */}
        {canAccessPhotoFlow ? (
          <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              Ảnh BEFORE/AFTER ({photos.length})
            </Text>

            {isOperationalMode && (
              <View style={[styles.incidentModeBox, { backgroundColor: `${palette.secondary}14`, borderColor: palette.secondary }]}>
                <Text style={[styles.incidentModeTitle, { color: palette.secondary }]}>Chế độ báo cáo sự cố chung</Text>
                <Text style={[styles.incidentModeText, { color: palette.textMuted }]}>
                  Ảnh mới sẽ được gửi vào Incident (OPERATIONAL), không lưu vào bộ ảnh cleaning BEFORE/AFTER.
                </Text>
              </View>
            )}

            {isDamageReportMode && (
              <View style={[styles.incidentModeBox, { backgroundColor: `${palette.error}14`, borderColor: palette.error }]}>
                <Text style={[styles.incidentModeTitle, { color: palette.error }]}>Chế độ báo cáo hư hại vật tư</Text>
                <Text style={[styles.incidentModeText, { color: palette.textMuted }]}>
                  Ảnh mới sẽ được gửi vào Incident (DAMAGE_REPORT) với snapshot giá, không lưu vào bộ ảnh cleaning BEFORE/AFTER.
                </Text>
              </View>
            )}

            {photos.length === 0 ? (
              <Text style={[styles.emptyText, { color: palette.textMuted }]}>Chưa có ảnh</Text>
            ) : (
              photos.map((photo) => (
                <View
                  key={String(photo.id || Math.random())}
                  style={[styles.photoItem, { borderColor: palette.border }]}>
                  <View style={styles.photoHeader}>
                    <Text style={[styles.photoType, { color: palette.text }]}>{photo.type}</Text>
                  </View>
                  <Text
                    style={[styles.photoUrl, { color: palette.textMuted }]}
                    numberOfLines={2}>
                    {photo.photo_url}
                  </Text>
                  <Image source={{ uri: photo.photo_url }} style={styles.photoPreview} resizeMode="contain" />
                </View>
              ))
            )}

            {canCaptureNewPhotos ? (
              <>
                <Text style={[styles.subsectionTitle, { color: palette.text }]}>Chụp ảnh mới</Text>

                {isOperationalMode ? (
                  <>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          borderColor: palette.border,
                          color: palette.text,
                          backgroundColor: palette.surface,
                          minHeight: 86,
                          textAlignVertical: 'top',
                        },
                      ]}
                      value={operationalIncidentDescription}
                      onChangeText={setOperationalIncidentDescription}
                      placeholder="Mô tả sự cố (bắt buộc)"
                      placeholderTextColor={palette.neutral500}
                      multiline
                    />

                    <View style={styles.photoTypeSelector}>
                      <Text style={[styles.subsectionTitle, { color: palette.text }]}>Mức độ nghiêm trọng</Text>
                      {INCIDENT_SEVERITY_OPTIONS.map((severity) => {
                        const selected = operationalIncidentSeverity === severity;
                        return (
                          <Pressable
                            key={severity}
                            style={[
                              styles.typeButton,
                              selected
                                ? { backgroundColor: palette.secondary }
                                : {
                                    backgroundColor: palette.surface,
                                    borderColor: palette.border,
                                    borderWidth: 1,
                                  },
                            ]}
                            onPress={() => setOperationalIncidentSeverity(severity)}>
                            <Text
                              style={[
                                styles.typeButtonText,
                                { color: selected ? palette.white : palette.text },
                              ]}>
                              {severity}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : isDamageReportMode ? (
                  <>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          borderColor: palette.border,
                          color: palette.text,
                          backgroundColor: palette.surface,
                          minHeight: 86,
                          textAlignVertical: 'top',
                        },
                      ]}
                      value={damageDescription}
                      onChangeText={setDamageDescription}
                      placeholder="Mô tả hư hại (bắt buộc)"
                      placeholderTextColor={palette.neutral500}
                      multiline
                    />

                    {damageItems.length > 0 ? (
                      <>
                        <Text style={[styles.subsectionTitle, { color: palette.text }]}>Món đồ hư hại</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View style={styles.damageItemRow}>
                            {damageItems.map((item) => {
                              const itemId = String(item.id || '').trim();
                              if (!itemId) return null;

                              const selected = damageItemId === itemId;
                              return (
                                <Pressable
                                  key={itemId}
                                  style={[
                                    styles.damageItemChip,
                                    selected
                                      ? { backgroundColor: palette.error }
                                      : {
                                          backgroundColor: palette.surface,
                                          borderColor: palette.border,
                                          borderWidth: 1,
                                        },
                                  ]}
                                  onPress={() => setDamageItemId(itemId)}>
                                  <Text
                                    style={[
                                      styles.damageItemName,
                                      { color: selected ? palette.white : palette.text },
                                    ]}
                                    numberOfLines={1}>
                                    {String(item.name || itemId)}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.damageItemCost,
                                      { color: selected ? palette.white : palette.textMuted },
                                    ]}>
                                    {formatVnd(Number(item.unit_cost) || 0)}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </ScrollView>
                      </>
                    ) : (
                      <TextInput
                        style={[
                          styles.input,
                          {
                            borderColor: palette.border,
                            color: palette.text,
                            backgroundColor: palette.surface,
                          },
                        ]}
                        value={damageItemId}
                        onChangeText={setDamageItemId}
                        placeholder="Nhập item_id bị hư hại"
                        placeholderTextColor={palette.neutral500}
                      />
                    )}

                    <View style={styles.damageNumericRow}>
                      <View style={styles.damageNumericCol}>
                        <Text style={[styles.damageInputLabel, { color: palette.textMuted }]}>Số lượng</Text>
                        <TextInput
                          style={[
                            styles.input,
                            styles.damageInput,
                            {
                              borderColor: palette.border,
                              color: palette.text,
                              backgroundColor: palette.surface,
                            },
                          ]}
                          value={damageQuantityText}
                          onChangeText={setDamageQuantityText}
                          keyboardType="number-pad"
                          placeholder="1"
                          placeholderTextColor={palette.neutral500}
                        />
                      </View>
                      <View style={styles.damageNumericCol}>
                        <Text style={[styles.damageInputLabel, { color: palette.textMuted }]}>Phí dịch vụ (VND)</Text>
                        <TextInput
                          style={[
                            styles.input,
                            styles.damageInput,
                            {
                              borderColor: palette.border,
                              color: palette.text,
                              backgroundColor: palette.surface,
                            },
                          ]}
                          value={damageServiceFeeText}
                          onChangeText={setDamageServiceFeeText}
                          keyboardType="number-pad"
                          placeholder="0"
                          placeholderTextColor={palette.neutral500}
                        />
                      </View>
                    </View>

                    <View
                      style={[
                        styles.incidentPricingBox,
                        { backgroundColor: palette.surface, borderColor: palette.border },
                      ]}>
                      <Text style={[styles.incidentPricingText, { color: palette.textMuted }]}>
                        Giá gốc snapshot: {formatVnd(selectedUnitCost)}
                      </Text>
                      <Text style={[styles.incidentPricingText, { color: palette.textMuted }]}>
                        Giá trị vật tư: {formatVnd(previewItemValue)}
                      </Text>
                      <Text style={[styles.incidentPricingText, { color: palette.textMuted }]}>
                        Phí dịch vụ: {formatVnd(damageServiceFee)}
                      </Text>
                      <Text style={[styles.incidentPricingTotal, { color: palette.error }]}>
                        Penalty dự kiến: {formatVnd(previewPenaltyValue)}
                      </Text>
                    </View>

                    <View style={styles.photoTypeSelector}>
                      <Text style={[styles.subsectionTitle, { color: palette.text }]}>Mức độ nghiêm trọng</Text>
                      {INCIDENT_SEVERITY_OPTIONS.map((severity) => {
                        const selected = damageSeverity === severity;
                        return (
                          <Pressable
                            key={severity}
                            style={[
                              styles.typeButton,
                              selected
                                ? { backgroundColor: palette.error }
                                : {
                                    backgroundColor: palette.surface,
                                    borderColor: palette.border,
                                    borderWidth: 1,
                                  },
                            ]}
                            onPress={() => setDamageSeverity(severity)}>
                            <Text
                              style={[
                                styles.typeButtonText,
                                { color: selected ? palette.white : palette.text },
                              ]}>
                              {severity}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <View style={styles.photoTypeSelector}>
                    <Pressable
                      style={[
                        styles.typeButton,
                        photoType === 'BEFORE'
                          ? { backgroundColor: palette.primary }
                          : { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 },
                      ]}
                      onPress={() => {
                        setPhotoType('BEFORE');
                        if (!isCameraOpen) {
                          void openCamera();
                        }
                      }}>
                      <Text
                        style={[
                          styles.typeButtonText,
                          { color: photoType === 'BEFORE' ? palette.white : palette.text },
                        ]}>
                        BEFORE
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[
                        styles.typeButton,
                        photoType === 'AFTER'
                          ? { backgroundColor: palette.primary }
                          : { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 },
                      ]}
                      onPress={() => {
                        setPhotoType('AFTER');
                        if (!isCameraOpen) {
                          void openCamera();
                        }
                      }}>
                      <Text
                        style={[
                          styles.typeButtonText,
                          { color: photoType === 'AFTER' ? palette.white : palette.text },
                        ]}>
                        AFTER
                      </Text>
                    </Pressable>
                  </View>
                )}

                <View style={styles.sourceActionRow}>
                  <Pressable
                    style={[styles.sourceButton, { backgroundColor: palette.primary }]}
                    disabled={uploadingPhoto}
                    onPress={() => void openCamera()}>
                    <Text style={[styles.sourceButtonText, { color: palette.white }]}>Chụp ảnh</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.sourceButton, { backgroundColor: palette.secondary }]}
                    disabled={uploadingPhoto}
                    onPress={() => void pickPhotoFromLibrary()}>
                    <Text style={[styles.sourceButtonText, { color: palette.primaryDark }]}>Chọn từ máy</Text>
                  </Pressable>
                </View>

                {isCameraOpen ? (
                  <View style={styles.cameraBox}>
                    <CameraView style={styles.cameraView} facing="back" ref={cameraRef} />
                    <View style={styles.cameraActions}>
                      <Pressable
                        style={[styles.cameraButton, { backgroundColor: palette.neutral500 }]}
                        onPress={() => setIsCameraOpen(false)}>
                        <Text style={[styles.cameraButtonText, { color: palette.white }]}>Xong</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.cameraButton, { backgroundColor: palette.primary }]}
                        onPress={() => void handleCapturePhoto()}>
                        <Text style={[styles.cameraButtonText, { color: palette.white }]}>Chụp hình</Text>
                      </Pressable>
                    </View>
                    {capturedPhotoUris.length > 0 && (
                      <Text style={[styles.cameraHint, { color: palette.textMuted }]}> 
                        Đã chụp {capturedPhotoUris.length} ảnh. Bấm {'"Chụp hình"'} để chụp thêm.
                      </Text>
                    )}
                  </View>
                ) : (
                  <Text style={[styles.emptyText, { color: palette.textMuted }]}>Chưa mở camera</Text>
                )}

                {capturedPhotoUris.length > 0 ? (
                  <View style={styles.capturedBox}>
                    <Text style={[styles.capturedTitle, { color: palette.text }]}>Ảnh chờ lưu ({capturedPhotoUris.length})</Text>
                    {capturedPhotoUris.map((uri, index) => (
                      <View key={`${uri}_${index}`} style={styles.pendingPhotoItem}>
                        <Image source={{ uri }} style={styles.capturedImage} resizeMode="contain" />
                        <Pressable
                          style={[styles.removePhotoButton, { backgroundColor: palette.error }]}
                          onPress={() => removeCapturedPhoto(index)}>
                          <Text style={[styles.removePhotoText, { color: palette.white }]}>Xóa ảnh này</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.emptyText, { color: palette.textMuted }]}>Chưa chụp ảnh mới</Text>
                )}

                <Pressable
                  style={[
                    styles.uploadButton,
                    {
                      backgroundColor: isOperationalMode
                        ? palette.secondary
                        : isDamageReportMode
                          ? palette.error
                          : palette.success,
                    },
                  ]}
                  disabled={uploadingPhoto || capturedPhotoUris.length === 0}
                  onPress={() => void handleUploadPhoto()}>
                  {uploadingPhoto ? (
                    <ActivityIndicator color={palette.white} />
                  ) : (
                    <Text style={[styles.uploadButtonText, { color: palette.white }]}>
                      {isOperationalMode
                        ? 'Gửi báo cáo sự cố'
                        : isDamageReportMode
                          ? 'Gửi báo cáo hư hại'
                          : 'Lưu tất cả ảnh vào nhiệm vụ'}
                    </Text>
                  )}
                </Pressable>
              </>
            ) : (
              <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                {isIncidentMode
                  ? 'Chế độ báo cáo hư hại chỉ khả dụng khi nhiệm vụ ở trạng thái IN_PROGRESS.'
                  : 'Nhiệm vụ đã hoàn tất, không thể chụp hoặc thêm ảnh mới.'}
              </Text>
            )}
          </View>
        ) : (
          <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Ảnh BEFORE/AFTER</Text>
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>
              Ảnh chỉ hiển thị và chụp được sau khi nhiệm vụ chuyển sang bước {'"Bắt đầu dọn"'}.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._15,
    gap: spacingY._15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: '700',
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: radius._10,
    padding: spacingX._12,
  },
  errorText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacingX._20,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  section: {
    borderWidth: 1,
    borderRadius: radius._12,
    padding: spacingX._12,
    gap: spacingY._10,
  },
  onlineKeySection: {
    gap: spacingY._7,
  },
  onlineKeyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._10,
  },
  onlineKeyBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._5,
  },
  onlineKeyBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  onlineKeyCodeBox: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
    gap: spacingY._5,
  },
  onlineKeyCodeLabel: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  onlineKeyCodeText: {
    fontSize: 16,
    fontFamily: Fonts.mono,
    fontWeight: '700',
  },
  onlineKeyMetaGrid: {
    flexDirection: 'row',
    gap: spacingX._7,
  },
  onlineKeyMetaCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
    gap: spacingY._5,
  },
  onlineKeyMetaLabel: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  onlineKeyMetaValue: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    fontWeight: '700',
  },
  onlineKeyValidationBox: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
    gap: spacingY._5,
  },
  onlineKeyValidationLabel: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  onlineKeyValidationValue: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  onlineKeyNotice: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  incidentModeBox: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._10,
    gap: spacingY._5,
  },
  incidentModeTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  incidentModeText: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.sans,
    marginTop: spacingY._5,
  },
  info: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  progressRow: {
    gap: spacingY._7,
  },
  progressStep: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
  },
  progressLabel: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingX._7,
  },
  actionButton: {
    flex: 1,
    minWidth: '45%',
    borderRadius: radius._10,
    paddingVertical: spacingY._12,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  photoItem: {
    borderWidth: 1,
    borderRadius: radius._10,
    padding: spacingX._10,
    gap: spacingY._5,
  },
  photoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoType: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.mono,
  },
  photoUrl: {
    fontSize: 12,
    fontFamily: Fonts.mono,
  },
  photoPreview: {
    height: 160,
    borderRadius: radius._10,
    width: '100%',
    backgroundColor: '#00000018',
  },
  photoTypeSelector: {
    flexDirection: 'row',
    gap: spacingX._7,
  },
  typeButton: {
    flex: 1,
    borderRadius: radius._10,
    paddingVertical: spacingY._10,
    alignItems: 'center',
  },
  typeButtonText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  uploadButton: {
    borderRadius: radius._10,
    paddingVertical: spacingY._12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  sourceActionRow: {
    flexDirection: 'row',
    gap: spacingX._7,
  },
  sourceButton: {
    flex: 1,
    borderRadius: radius._10,
    paddingVertical: spacingY._10,
    alignItems: 'center',
  },
  sourceButtonText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  cameraBox: {
    gap: spacingY._10,
  },
  cameraView: {
    width: '100%',
    height: 260,
    borderRadius: radius._10,
    overflow: 'hidden',
  },
  cameraActions: {
    flexDirection: 'row',
    gap: spacingX._7,
  },
  cameraButton: {
    flex: 1,
    borderRadius: radius._10,
    paddingVertical: spacingY._10,
    alignItems: 'center',
  },
  cameraButtonText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  cameraHint: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  capturedBox: {
    gap: spacingY._7,
    padding: spacingX._10,
    borderRadius: radius._10,
    borderWidth: 1,
    borderColor: '#00000018',
  },
  capturedTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  capturedImage: {
    width: '100%',
    height: 220,
    borderRadius: radius._10,
    backgroundColor: '#00000018',
  },
  pendingPhotoItem: {
    gap: spacingY._7,
  },
  removePhotoButton: {
    borderRadius: radius._10,
    paddingVertical: spacingY._7,
    alignItems: 'center',
  },
  removePhotoText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  incidentItem: {
    borderWidth: 1,
    borderRadius: radius._10,
    padding: spacingX._10,
    gap: spacingY._7,
    marginBottom: spacingY._7,
  },
  incidentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  incidentSeverity: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.mono,
  },
  incidentStatus: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },
  incidentDescription: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    lineHeight: 18,
  },
  incidentPricingBox: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
    gap: spacingY._5,
  },
  incidentPricingText: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  incidentPricingTotal: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    fontWeight: '700',
  },
  incidentPhotosScroll: {
    gap: spacingX._7,
  },
  incidentPhotoThumb: {
    width: 80,
    height: 80,
    borderRadius: radius._10,
    marginRight: spacingX._7,
  },
  incidentTime: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },
  damageItemRow: {
    flexDirection: 'row',
    gap: spacingX._7,
  },
  damageItemChip: {
    minWidth: 150,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
    gap: spacingY._5,
  },
  damageItemName: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  damageItemCost: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },
  damageNumericRow: {
    flexDirection: 'row',
    gap: spacingX._10,
  },
  damageNumericCol: {
    flex: 1,
    gap: spacingY._5,
  },
  damageInputLabel: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  damageInput: {
    minHeight: 44,
  },
});

