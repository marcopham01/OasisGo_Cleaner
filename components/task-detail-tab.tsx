import MaterialIcons from '@expo/vector-icons/MaterialIcons';
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
    getDamageServiceCatalogs,
    getIncidentsByCleaningTaskId,
    getMyCleanerKeyByBookingId,
    getMyCleanerKeyByTaskId,
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
    DamageServiceCatalogItem,
    Incident,
    IncidentSeverity,
} from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

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

function requestSourceLabel(source?: string) {
  const normalized = String(source || '').toUpperCase();
  if (normalized === 'USER_REQUEST') return 'Yêu cầu từ khách';
  if (normalized === 'AUTO_AFTER_CHECKOUT') return 'Dọn dẹp sau checkout';
  if (normalized === 'SYSTEM_RETRY') return 'Hệ thống thử lại';
  if (!normalized) return '-';
  return normalized.replace(/_/g, ' ');
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
const CLEANING_CHECKLIST_ITEMS = [
  'Change bed linens & pillowcases',
  'Sanitize control panel & buttons',
  'Wipe down ventilation vents',
  'Check for left-behind items',
  'Vacuum floor mat',
  'Spray air freshener',
];

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

function taskClusterDisplayName(task: CleaningTask) {
  const clusterRecord = task.cluster as { name?: string; code?: string } | undefined;
  const podRecord = task.pod as {
    pod_cluster_name?: string;
    cluster_name?: string;
    cluster?: { name?: string; code?: string };
  } | undefined;

  return String(
    task.pod_cluster_name ||
      task.cluster_name ||
      clusterRecord?.name ||
      clusterRecord?.code ||
      podRecord?.pod_cluster_name ||
      podRecord?.cluster_name ||
      podRecord?.cluster?.name ||
      podRecord?.cluster?.code ||
      '',
  ).trim();
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

function detailQuantityKey(type: 'ITEM' | 'SERVICE', id: string) {
  return `${type}:${String(id || '').trim()}`;
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
  const [damageServiceCatalogs, setDamageServiceCatalogs] = useState<DamageServiceCatalogItem[]>([]);
  const [podName, setPodName] = useState<string | null>(null);
  const [clusterName, setClusterName] = useState<string | null>(null);
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
  const [isAnytimeIncidentFlow, setIsAnytimeIncidentFlow] = useState(false);
  
  // Operational Incident State (báo cáo sự cố chung)
  const [operationalIncidentDescription, setOperationalIncidentDescription] = useState('');
  const [operationalIncidentSeverity, setOperationalIncidentSeverity] = useState<IncidentSeverity>('MEDIUM');
  
  // Damage Report State (báo cáo hư hại vật tư)
  const [damageDescription, setDamageDescription] = useState('');
  const [damageSeverity, setDamageSeverity] = useState<IncidentSeverity>('MEDIUM');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [detailQuantityById, setDetailQuantityById] = useState<Record<string, string>>({});
  const [detailNote, setDetailNote] = useState('');
  
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [completedChecklistItems, setCompletedChecklistItems] = useState<string[]>([]);

  const [actionLoading, setActionLoading] = useState(false);

  const taskStatus = String(task?.status || '').toUpperCase();
  const isOperationalMode = captureMode === 'OPERATIONAL_INCIDENT';
  const isDamageReportMode = captureMode === 'DAMAGE_REPORT';
  const isIncidentMode = isOperationalMode || isDamageReportMode;
  const canReportIncident = taskStatus === 'IN_PROGRESS';
  const canReportIncidentAnytime = Boolean(normalizeId(task?.pod_id));
  const canUseAnytimeIncidentForm = isIncidentMode && isAnytimeIncidentFlow;
  const canAccessPhotoFlow =
    taskStatus === 'ACCEPTED' ||
    taskStatus === 'ARRIVED' ||
    taskStatus === 'IN_PROGRESS' ||
    taskStatus === 'DONE' ||
    canUseAnytimeIncidentForm;
  const canCaptureCleaningPhotos = canAccessPhotoFlow && taskStatus !== 'DONE' && !isIncidentMode;
  const canCaptureIncidentPhotos = isIncidentMode && (canReportIncident || isAnytimeIncidentFlow);
  const canCaptureNewPhotos = canCaptureCleaningPhotos || canCaptureIncidentPhotos;
  const selectedItemEntries = damageItems.filter((item) =>
    selectedItemIds.includes(String(item.id || '').trim()),
  );
  const selectedServiceEntries = damageServiceCatalogs.filter((service) =>
    selectedServiceIds.includes(String(service.id || '').trim()),
  );
  const selectedDetailCount = selectedItemIds.length + selectedServiceIds.length;

  const getSelectedDetailQuantity = useCallback(
    (type: 'ITEM' | 'SERVICE', id: string) =>
      parsePositiveInteger(detailQuantityById[detailQuantityKey(type, id)] ?? '1', 1),
    [detailQuantityById],
  );

  const previewItemValue = selectedItemEntries.reduce((sum, item) => {
    const entryId = String(item.id || '').trim();
    return sum + (Number(item.unit_cost) || 0) * getSelectedDetailQuantity('ITEM', entryId);
  }, 0);
  const previewServiceValue = selectedServiceEntries.reduce((sum, service) => {
    const entryId = String(service.id || '').trim();
    return sum + (Number(service.base_price) || 0) * getSelectedDetailQuantity('SERVICE', entryId);
  }, 0);
  const previewPenaltyValue = previewItemValue + previewServiceValue;

  const openCamera = async () => {
    if (!task || !canCaptureNewPhotos) {
      Alert.alert(
        'Chưa thể chụp ảnh',
        isIncidentMode
          ? 'Chỉ có thể báo cáo khi task IN_PROGRESS hoặc khi dùng chế độ báo incident mọi lúc.'
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
          ? 'Chỉ có thể báo cáo khi task IN_PROGRESS hoặc khi dùng chế độ báo incident mọi lúc.'
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

  const toggleDetailSelection = (type: 'ITEM' | 'SERVICE', id: string) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return;

    const quantityKey = detailQuantityKey(type, normalizedId);

    const updateSelection = (prev: string[]) => {
      const exists = prev.includes(normalizedId);

      setDetailQuantityById((quantityMap) => {
        if (exists) {
          const { [quantityKey]: _removed, ...rest } = quantityMap;
          return rest;
        }

        return {
          ...quantityMap,
          [quantityKey]: quantityMap[quantityKey] || '1',
        };
      });

      return exists ? prev.filter((entryId) => entryId !== normalizedId) : [...prev, normalizedId];
    };

    if (type === 'ITEM') {
      setSelectedItemIds(updateSelection);
      return;
    }

    setSelectedServiceIds(updateSelection);
  };

  const adjustDetailQuantity = (type: 'ITEM' | 'SERVICE', id: string, delta: number) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return;

    const quantityKey = detailQuantityKey(type, normalizedId);

    setDetailQuantityById((prev) => {
      const current = parsePositiveInteger(prev[quantityKey] ?? '1', 1);
      const next = Math.max(1, current + delta);
      return {
        ...prev,
        [quantityKey]: String(next),
      };
    });
  };

  const toggleChecklistItem = (item: string) => {
    setCompletedChecklistItems((prev) =>
      prev.includes(item) ? prev.filter((current) => current !== item) : [...prev, item],
    );
  };

  useEffect(() => {
    if (!canCaptureNewPhotos) {
      setIsCameraOpen(false);
      setCapturedPhotoUris([]);
    }
  }, [canCaptureNewPhotos]);

  useEffect(() => {
    if (!canReportIncident && isIncidentMode && !isAnytimeIncidentFlow) {
      setCaptureMode('CLEANING');
      setIsAnytimeIncidentFlow(false);
      setOperationalIncidentDescription('');
      setOperationalIncidentSeverity('MEDIUM');
      setDamageDescription('');
      setDamageSeverity('MEDIUM');
      setSelectedItemIds([]);
      setSelectedServiceIds([]);
      setDetailQuantityById({});
      setDetailNote('');
      setCapturedPhotoUris([]);
      setIsCameraOpen(false);
    }
  }, [canReportIncident, isIncidentMode, isAnytimeIncidentFlow]);

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
      setClusterName(taskClusterDisplayName(taskData) || null);
      setBookingWindowOverride(taskBookingWindow(taskData));
      setLastCleanerKey(null);
      setOnlineKeyNotice(null);
      setOnlineKeyAccessState('UNKNOWN');

      if (damageItems.length === 0 || damageServiceCatalogs.length === 0) {
        const [itemCatalogResult, serviceCatalogResult] = await Promise.allSettled([
          getDamageReportItems(token),
          getDamageServiceCatalogs(token),
        ]);

        if (itemCatalogResult.status === 'fulfilled') {
          setDamageItems(itemCatalogResult.value.filter((item) => String(item.id || '').trim()));
        } else {
          setDamageItems([]);
        }

        if (serviceCatalogResult.status === 'fulfilled') {
          setDamageServiceCatalogs(
            serviceCatalogResult.value.filter((service) => String(service.id || '').trim()),
          );
        } else {
          setDamageServiceCatalogs([]);
        }
      }

      const podId = String(taskData.pod_id || '').trim();
      const bookingId = normalizeId(taskData.booking_id);
      const resolvedTaskPodName = String(taskPodDisplayName(taskData) || '').trim();

      if (podId && !resolvedTaskPodName) {
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
  }, [taskId, token, onErrorChange, damageItems.length, damageServiceCatalogs.length]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleAction = async (action: CleanerTaskAction) => {
    if (!task || !taskId) return;

    setActionLoading(true);
    setError(null);
    onErrorChange?.(null);

    try {
      if (action === 'start') {
        if (taskId) {
          try {
            const bookingId = normalizeId(task.booking_id);
            const cleanerKeyResult = bookingId
              ? await getMyCleanerKeyByBookingId(token, bookingId)
              : await getMyCleanerKeyByTaskId(token, taskId);
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

      const payload = taskActionPayload(action, '');
      const updated = await updateCleaningTask(token, taskId, payload);

      setTask(updated);
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
      const resolvedPodId = normalizeId(task?.pod_id);
      const resolvedBookingId = normalizeId(task?.booking_id);
      const useTaskContext = canReportIncident && !isAnytimeIncidentFlow;

      if (isOperationalMode) {
        // OPERATIONAL INCIDENT: báo cáo sự cố chung
        const normalizedDescription = operationalIncidentDescription.trim();
        if (!normalizedDescription) {
          Alert.alert('Thiếu thông tin', 'Vui lòng nhập mô tả sự cố trước khi gửi báo cáo.');
          setUploadingPhoto(false);
          return;
        }

        await createOperationalIncident(token, {
          cleaning_task_id: useTaskContext ? taskId : undefined,
          pod_id: useTaskContext ? undefined : resolvedPodId,
          booking_id: useTaskContext ? undefined : resolvedBookingId,
          description: normalizedDescription,
          severity: operationalIncidentSeverity,
          local_uris: capturedPhotoUris,
        });

        const updatedIncidents = await getIncidentsByCleaningTaskId(token, taskId);
        setIncidents(updatedIncidents);

        setCapturedPhotoUris([]);
        setIsAnytimeIncidentFlow(false);
        setOperationalIncidentDescription('');
        setOperationalIncidentSeverity('MEDIUM');
        setCaptureMode('CLEANING');
        setIsCameraOpen(false);
        onErrorChange?.(null);

        Alert.alert('Thành công', 'Đã gửi báo cáo sự cố cho nhiệm vụ này.');
      } else if (isDamageReportMode) {
        // DAMAGE REPORT: báo cáo incident với detail type ITEM hoặc SERVICE
        const normalizedDescription = damageDescription.trim();
        if (!normalizedDescription) {
          Alert.alert('Thiếu thông tin', 'Vui lòng nhập mô tả hư hại trước khi gửi báo cáo.');
          setUploadingPhoto(false);
          return;
        }

        if (selectedDetailCount === 0) {
          Alert.alert('Thiếu thông tin', 'Vui lòng chọn ít nhất một dòng chi tiết incident.');
          setUploadingPhoto(false);
          return;
        }

        const normalizedNote = detailNote.trim();

        const itemDetails = selectedItemIds.map((itemId) => ({
          type: 'ITEM' as const,
          item_id: itemId,
          quantity: getSelectedDetailQuantity('ITEM', itemId),
          note: normalizedNote || undefined,
        }));

        const serviceDetails = selectedServiceIds.map((serviceCatalogId) => ({
          type: 'SERVICE' as const,
          service_catalog_id: serviceCatalogId,
          quantity: getSelectedDetailQuantity('SERVICE', serviceCatalogId),
          note: normalizedNote || undefined,
        }));

        const details = [...itemDetails, ...serviceDetails];

        const estimatedServiceFee = selectedServiceEntries.reduce((sum, service) => {
          const serviceId = String(service.id || '').trim();
          return sum + (Number(service.base_price) || 0) * getSelectedDetailQuantity('SERVICE', serviceId);
        }, 0);

        await createDamageReport(token, {
          cleaning_task_id: useTaskContext ? taskId : undefined,
          pod_id: useTaskContext ? undefined : resolvedPodId,
          booking_id: useTaskContext ? undefined : resolvedBookingId,
          description: normalizedDescription,
          details,
          estimated_service_fee: estimatedServiceFee,
          severity: damageSeverity,
          local_uris: capturedPhotoUris,
        });

        const updatedIncidents = await getIncidentsByCleaningTaskId(token, taskId);
        setIncidents(updatedIncidents);

        setCapturedPhotoUris([]);
        setIsAnytimeIncidentFlow(false);
        setDamageDescription('');
        setDamageSeverity('MEDIUM');
        setSelectedItemIds([]);
        setSelectedServiceIds([]);
        setDetailQuantityById({});
        setDetailNote('');
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
  const canComplete = taskStatus === 'IN_PROGRESS';
  const canReject = ['ASSIGNED', 'NOTIFIED', 'ACCEPTED', 'ARRIVED'].includes(taskStatus);
  const hasStartedCleaning = taskStatus === 'IN_PROGRESS' || taskStatus === 'DONE';
  const needsAssignment = !['ASSIGNED', 'NOTIFIED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'DONE'].includes(taskStatus);
  const progress = progressStepState(taskStatus);
  const showReadyAction = canAccept || canStart;
  const bookingWindow = bookingWindowOverride || taskBookingWindow(task);
  const estimatedTimeRangeText = `${formatDateTime(task.estimated_start_time || undefined)} - ${formatDateTime(task.due_at || undefined)}`;
  const onlineKeyValidation = resolveOnlineKeyValidationWithAccess(lastCleanerKey, onlineKeyAccessState);
  const onlineKeyStatusColor =
    onlineKeyValidation.status === 'VALID'
      ? palette.success
      : onlineKeyValidation.status === 'NOT_YET_VALID'
        ? '#d97706'
        : onlineKeyValidation.status === 'MISSING' || onlineKeyValidation.status === 'NO_BOOKING'
          ? palette.textMuted
          : palette.error;
  const displayPodName = podName || taskPodDisplayName(task) || 'Pod tieu chuan - A03U';
  const displayClusterName = clusterName || taskClusterDisplayName(task) || 'Cum Pod A - Khu vuc Ga Quoc noi T1';
  const requiredAfterPhotos = photos.filter((photo) => String(photo.type || '').toUpperCase() === 'AFTER');

  const handleStartCleaning = async () => {
    if (canAccept) {
      await handleAction('accept');
      return;
    }

    if (canStart) {
      await handleAction('start');
      return;
    }
  };

  const actionButtonLabel = canAccept
    ? 'CHẤP NHẬN NHIỆM VỤ'
    : canStart
      ? 'BẮT ĐẦU DỌN'
      : taskStatus === 'IN_PROGRESS'
        ? 'ĐANG DỌN DẸP'
        : 'ĐÃ HOÀN TẤT';

  const readyTitleText = canAccept ? 'Sẵn sàng nhận nhiệm vụ?' : 'Sẵn sàng dọn phòng?';

  const actionHintText = canAccept
    ? 'Nhận việc để bắt đầu quy trình dọn dẹp.'
    : canStart
      ? 'Sẵn sàng bắt đầu dọn dẹp cho task này.'
      : taskStatus === 'IN_PROGRESS'
        ? 'Task đang được thực hiện. Bạn có thể cập nhật ảnh tại đây.'
        : 'Task đã hoàn tất hoặc không khả dụng để bắt đầu.';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={palette.text} />
          </Pressable>
          <Text style={[styles.title, { color: palette.text }]}>Chi tiết nhiệm vụ</Text>
          <View style={styles.headerSpacer} />
        </View>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: palette.card, borderColor: palette.error }]}>
            <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
          </View>
        )}

        {/* Task Info */}
        <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Thông tin nhiệm vụ</Text>
          <View style={styles.infoRow}>
            <MaterialIcons name="meeting-room" size={17} color={palette.neutral500} />
            <Text style={[styles.infoLabel, { color: palette.textMuted }]}>Tên pod:</Text>
            <Text style={[styles.infoValue, { color: palette.text }]}>{displayPodName}</Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="apartment" size={17} color={palette.neutral500} />
            <Text style={[styles.infoLabel, { color: palette.textMuted }]}>Khu vực:</Text>
            <Text style={[styles.infoValue, { color: palette.text }]}>{displayClusterName}</Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="local-offer" size={17} color={palette.neutral500} />
            <Text style={[styles.infoLabel, { color: palette.textMuted }]}>Trạng thái:</Text>
            <Text style={[styles.infoValue, { color: palette.text }]}>{task.status || 'ASSIGNED'}</Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="event" size={17} color={palette.neutral500} />
            <Text style={[styles.infoLabel, { color: palette.textMuted }]}>Thời gian phải hoàn thành nhiệm vụ:</Text>
            <Text style={[styles.infoValue, { color: palette.text }]}>
              {formatDateTime(task.due_at || bookingWindow.end_time || '2026-04-01T23:30:00.000Z')}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="schedule" size={17} color={palette.neutral500} />
            <Text style={[styles.infoLabel, { color: palette.textMuted }]}>Thời gian dự kiến:</Text>
            <Text style={[styles.infoValue, { color: palette.text }]}>
              {estimatedTimeRangeText}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="label-outline" size={17} color={palette.neutral500} />
            <Text style={[styles.infoLabel, { color: palette.textMuted }]}>Nguồn yêu cầu:</Text>
            <Text style={[styles.infoValue, { color: palette.text }]}>{requestSourceLabel(String(task.request_source || ''))}</Text>
          </View>
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
              const detailLines = Array.isArray(incident.details) ? incident.details : [];
              const itemLines = detailLines.filter((line) => String(line.type || '').toUpperCase() === 'ITEM');
              const serviceLines = detailLines.filter(
                (line) => String(line.type || '').toUpperCase() === 'SERVICE',
              );
              const fallbackItemValue = Number(incident.estimated_item_value) || 0;
              const fallbackServiceFee = Number(incident.estimated_service_fee) || 0;
              const computedItemValue =
                itemLines.reduce((sum, line) => sum + (Number(line.total_cost) || 0), 0) || fallbackItemValue;
              const computedServiceFee =
                serviceLines.reduce((sum, line) => sum + (Number(line.total_cost) || 0), 0) || fallbackServiceFee;
              const computedTotalValue =
                Number(incident.estimated_total_value) || computedItemValue + computedServiceFee;
              const primaryItem = itemLines[0];
              const showPricing =
                detailLines.length > 0 ||
                Boolean(incident.item_name_snapshot) ||
                incident.estimated_total_value !== undefined;

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
                  {showPricing ? (
                    <View
                      style={[
                        styles.incidentPricingBox,
                        { backgroundColor: palette.surface, borderColor: palette.border },
                      ]}>
                      <Text style={[styles.incidentPricingText, { color: palette.text }]}>
                        Món đồ: {String(primaryItem?.name_snapshot || incident.item_name_snapshot || incident.item_id || '-')}
                      </Text>
                      <Text style={[styles.incidentPricingText, { color: palette.textMuted }]}> 
                        Giá gốc snapshot: {formatVnd((primaryItem?.unit_cost_snapshot ?? incident.unit_cost_snapshot) as number | null | undefined)}
                      </Text>
                      <Text style={[styles.incidentPricingText, { color: palette.textMuted }]}> 
                        Số lượng: {Number(primaryItem?.quantity) || Number(incident.quantity_affected) || 1}
                      </Text>
                      <Text style={[styles.incidentPricingText, { color: palette.textMuted }]}> 
                        Giá trị vật tư: {formatVnd(computedItemValue)}
                      </Text>
                      <Text style={[styles.incidentPricingText, { color: palette.textMuted }]}> 
                        Phí dịch vụ: {formatVnd(computedServiceFee)}
                      </Text>
                      <Text style={[styles.incidentPricingTotal, { color: palette.error }]}>
                        Penalty ước tính: {formatVnd(computedTotalValue)}
                      </Text>
                      {detailLines.length > 1 ? (
                        <Text style={[styles.incidentPricingText, { color: palette.textMuted }]}> 
                          Chi tiết dòng: {detailLines.length}
                        </Text>
                      ) : null}
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

        {/* Ready Card */}
        {showReadyAction && (
          <View style={styles.readySection}>
            <View style={[styles.readyIconWrap, { backgroundColor: palette.primaryLight }]}> 
              <MaterialIcons name="auto-awesome" size={32} color={palette.primary} />
            </View>
            <Text style={[styles.readyTitle, { color: palette.text }]}>{readyTitleText}</Text>
            <Text style={[styles.readyDescription, { color: palette.textMuted }]}>{actionHintText}</Text>
            <Pressable
              style={[
                styles.readyButton,
                {
                  backgroundColor: canAccept || canStart ? '#2f64da' : palette.neutral400,
                },
              ]}
              disabled={actionLoading || (!canAccept && !canStart)}
              onPress={() => void handleStartCleaning()}>
              {actionLoading ? (
                <ActivityIndicator color={palette.white} />
              ) : (
                <View style={styles.readyButtonInner}>
                  <MaterialIcons name="play-arrow" size={20} color={palette.white} />
                  <Text style={[styles.readyButtonText, { color: palette.white }]}>{actionButtonLabel}</Text>
                </View>
              )}
            </Pressable>
          </View>
        )}

        {needsAssignment && (
          <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}> 
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>
              Task này chưa được phân công cho bạn. Vui lòng yêu cầu phân công trước khi bắt đầu dọn dẹp.
            </Text>
          </View>
        )}

        {/* Cleaning Checklist */}
        {hasStartedCleaning && (
          <>
            <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}> 
              <View style={styles.checklistHeader}>
                <MaterialIcons name="check-box" size={20} color={palette.primary} />
                <Text style={[styles.sectionTitle, { color: palette.text }]}>Cleaning Checklist</Text>
              </View>
              {CLEANING_CHECKLIST_ITEMS.map((item) => {
                const isCompleted = completedChecklistItems.includes(item);
                return (
                  <Pressable
                    key={item}
                    style={[styles.checklistItem, { borderTopColor: palette.border }]}
                    onPress={() => toggleChecklistItem(item)}>
                    <View
                      style={[
                        styles.checkIconWrap,
                        {
                          backgroundColor: isCompleted ? '#3d7ce8' : 'transparent',
                          borderColor: isCompleted ? '#3d7ce8' : '#b9c7da',
                        },
                      ]}>
                      {isCompleted && <MaterialIcons name="check" size={14} color={palette.white} />}
                    </View>
                    <Text
                      style={[
                        styles.checklistText,
                        {
                          color: isCompleted ? palette.textMuted : palette.text,
                          textDecorationLine: isCompleted ? 'line-through' : 'none',
                        },
                      ]}>
                      {item}
                    </Text>
                  </Pressable>
                );
              })}

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
                      'Báo cáo incident sẽ mở khi nhiệm vụ ở trạng thái IN_PROGRESS.',
                    );
                    return;
                  }

                  setCaptureMode('DAMAGE_REPORT');
                  setIsAnytimeIncidentFlow(false);
                  setDamageDescription('');
                  setDamageSeverity('MEDIUM');
                  setSelectedItemIds([]);
                  setSelectedServiceIds([]);
                  setDetailQuantityById({});
                  setDetailNote('');
                  setPhotoType('BEFORE');
                  setCapturedPhotoUris([]);
                  setIsCameraOpen(false);
                }}>
                <Text style={[styles.actionButtonText, { color: palette.white }]}>Báo cáo incident</Text>
              </Pressable>
            )}

            {isIncidentMode && (
              <Pressable
                style={[styles.actionButton, { backgroundColor: palette.neutral400 }]}
                disabled={actionLoading || uploadingPhoto}
                onPress={() => {
                  setCaptureMode('CLEANING');
                  setIsAnytimeIncidentFlow(false);
                  setOperationalIncidentDescription('');
                  setOperationalIncidentSeverity('MEDIUM');
                  setDamageDescription('');
                  setDamageSeverity('MEDIUM');
                  setSelectedItemIds([]);
                  setSelectedServiceIds([]);
                  setDetailQuantityById({});
                  setDetailNote('');
                  setCapturedPhotoUris([]);
                  setIsCameraOpen(false);
                }}>
                <Text style={[styles.actionButtonText, { color: palette.white }]}>Hủy báo cáo</Text>
              </Pressable>
            )}
            </View>

            {!canReportIncident && !isIncidentMode && (
              <Text style={[styles.info, { color: palette.textMuted }]}>
                Luồng báo cáo trong khu action này chỉ khả dụng sau khi task chuyển IN_PROGRESS.
              </Text>
            )}
          </>
        )}

        <View
          style={[
            styles.section,
            {
              backgroundColor: `${palette.secondary}12`,
              borderColor: palette.secondary,
            },
          ]}>
          <Text style={[styles.sectionTitle, { color: palette.secondary }]}>Khu riêng: Báo incident mọi lúc</Text>
          <Text style={[styles.info, { color: palette.textMuted, marginBottom: spacingY._7 }]}> 
            Khu này độc lập với tiến độ cleaning. Hệ thống sẽ gửi incident theo Pod hiện tại của task.
          </Text>

          {isIncidentMode && isAnytimeIncidentFlow ? (
            <View style={styles.actionGrid}>
              <Pressable
                style={[styles.actionButton, { backgroundColor: palette.neutral400 }]}
                disabled={actionLoading || uploadingPhoto}
                onPress={() => {
                  setCaptureMode('CLEANING');
                  setIsAnytimeIncidentFlow(false);
                  setOperationalIncidentDescription('');
                  setOperationalIncidentSeverity('MEDIUM');
                  setDamageDescription('');
                  setDamageSeverity('MEDIUM');
                  setSelectedItemIds([]);
                  setSelectedServiceIds([]);
                  setDetailQuantityById({});
                  setDetailNote('');
                  setCapturedPhotoUris([]);
                  setIsCameraOpen(false);
                }}>
                <Text style={[styles.actionButtonText, { color: palette.white }]}>Thoát chế độ mọi lúc</Text>
              </Pressable>
            </View>
          ) : !isIncidentMode ? (
            <View style={styles.actionGrid}>
              <Pressable
                style={[
                  styles.actionButton,
                  { backgroundColor: canReportIncidentAnytime ? palette.error : palette.neutral400 },
                ]}
                disabled={actionLoading || uploadingPhoto || !canReportIncidentAnytime}
                onPress={() => {
                  if (!canReportIncidentAnytime) {
                    Alert.alert('Thiếu thông tin', 'Task này chưa có pod_id để gửi incident mọi lúc.');
                    return;
                  }

                  setCaptureMode('DAMAGE_REPORT');
                  setIsAnytimeIncidentFlow(true);
                  setDamageDescription('');
                  setDamageSeverity('MEDIUM');
                  setSelectedItemIds([]);
                  setSelectedServiceIds([]);
                  setDetailQuantityById({});
                  setDetailNote('');
                  setCapturedPhotoUris([]);
                  setIsCameraOpen(false);
                }}>
                <Text style={[styles.actionButtonText, { color: palette.white }]}>Báo cáo incident (mọi lúc)</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.info, { color: palette.textMuted }]}> 
              Bạn đang ở chế độ báo incident theo luồng task IN_PROGRESS.
            </Text>
          )}
        </View>

        {/* Photos */}
        {canAccessPhotoFlow ? (
          <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text
              style={[
                styles.sectionTitle,
                isDamageReportMode
                  ? [styles.damageReportHeaderTitle, { color: palette.error }]
                  : { color: palette.text },
              ]}>
              {isDamageReportMode ? 'Báo cáo hư hại vật tư' : 'Required Photos'}
            </Text>

            {isOperationalMode && (
              <View style={[styles.incidentModeBox, { backgroundColor: `${palette.error}14`, borderColor: palette.error }]}>
                <Text style={[styles.incidentModeTitle, { color: palette.error }]}>Chế độ báo cáo sự cố chung</Text>
                <Text style={[styles.incidentModeText, { color: palette.textMuted }]}>
                  Ảnh mới sẽ được gửi vào Incident (OPERATIONAL), không lưu vào bộ ảnh cleaning BEFORE/AFTER.
                  {isAnytimeIncidentFlow ? ' Báo cáo này đang dùng ngữ cảnh Pod (mọi lúc).' : ''}
                </Text>
              </View>
            )}

            {canCaptureNewPhotos ? (
              <>
                {!isDamageReportMode ? (
                  <Text style={[styles.subsectionTitle, { color: palette.text }]}>After Clean</Text>
                ) : null}

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

                    <View style={styles.photoTypeSelector}>
                      <View
                        style={[
                          styles.incidentModeBox,
                          { backgroundColor: `${palette.error}14`, borderColor: palette.error },
                        ]}>
                        <Text style={[styles.incidentModeTitle, { color: palette.error }]}>Chế độ báo cáo hư hại vật tư</Text>
                        <Text style={[styles.incidentModeText, { color: palette.textMuted }]}>
                          Ảnh mới sẽ được gửi vào Incident (DAMAGE_REPORT) với snapshot giá, không lưu vào bộ ảnh cleaning BEFORE/AFTER.
                          {isAnytimeIncidentFlow ? ' Báo cáo này đang dùng ngữ cảnh Pod (mọi lúc).' : ''}
                        </Text>
                      </View>

                      <Pressable
                        style={[styles.requiredCaptureTile, { borderColor: '#c4d2e5', backgroundColor: '#f8fbff' }]}
                        disabled={uploadingPhoto}
                        onPress={() => {
                          void openCamera();
                        }}>
                        <MaterialIcons name="photo-camera" size={26} color="#8aa0bc" />
                        <Text style={styles.requiredCaptureLabel}>Chụp ảnh incident</Text>
                      </Pressable>

                      <Pressable
                        style={[styles.requiredCaptureTile, { borderColor: '#c4d2e5', backgroundColor: '#f8fbff' }]}
                        disabled={uploadingPhoto}
                        onPress={() => {
                          void pickPhotoFromLibrary();
                        }}>
                        <MaterialIcons name="photo-library" size={26} color="#8aa0bc" />
                        <Text style={styles.requiredCaptureLabel}>Chọn từ thư viện</Text>
                      </Pressable>

                      {capturedPhotoUris.map((uri, index) => (
                        <View key={`${uri}_${index}`} style={styles.requiredThumbWrap}>
                          <Image source={{ uri }} style={styles.requiredThumb} resizeMode="cover" />
                          <Pressable
                            style={[styles.requiredRemoveIcon, { backgroundColor: '#00000085' }]}
                            onPress={() => removeCapturedPhoto(index)}>
                            <MaterialIcons name="close" size={14} color={palette.white} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </>
                ) : isDamageReportMode ? (
                  <>
                    <View style={[styles.incidentDraftCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
                      <Text style={[styles.incidentDraftTitle, { color: palette.text }]}>Thông tin báo cáo hư hại</Text>
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
                    </View>

                    <View style={[styles.incidentDraftCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
                      <Text style={[styles.subsectionTitle, { color: palette.text }]}>Chọn những món đồ bị hư (ITEM)</Text>
                      {damageItems.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View style={styles.damageItemRow}>
                            {damageItems.map((entry) => {
                              const entryId = String(entry.id || '').trim();
                              if (!entryId) return null;

                              const selected = selectedItemIds.includes(entryId);
                              const amount = formatVnd(Number(entry.unit_cost) || 0);

                              return (
                                <Pressable
                                  key={`item_${entryId}`}
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
                                  onPress={() => toggleDetailSelection('ITEM', entryId)}>
                                  <Text
                                    style={[
                                      styles.damageItemName,
                                      { color: selected ? palette.white : palette.text },
                                    ]}
                                    numberOfLines={1}>
                                    {String(entry.name || entryId)}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.damageItemCost,
                                      { color: selected ? palette.white : palette.textMuted },
                                    ]}>
                                    {amount}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </ScrollView>
                      ) : (
                        <Text style={[styles.info, { color: palette.textMuted }]}>Chưa có dữ liệu ITEM.</Text>
                      )}

                      <Text style={[styles.subsectionTitle, { color: palette.text }]}>Chọn Vi phạm Quy chuẩn Dịch vụ</Text>
                      {damageServiceCatalogs.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View style={styles.damageItemRow}>
                            {damageServiceCatalogs.map((entry) => {
                              const entryId = String(entry.id || '').trim();
                              if (!entryId) return null;

                              const selected = selectedServiceIds.includes(entryId);
                              const amount = formatVnd(Number(entry.base_price) || 0);

                              return (
                                <Pressable
                                  key={`service_${entryId}`}
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
                                  onPress={() => toggleDetailSelection('SERVICE', entryId)}>
                                  <Text
                                    style={[
                                      styles.damageItemName,
                                      { color: selected ? palette.white : palette.text },
                                    ]}
                                    numberOfLines={1}>
                                    {String(entry.name || entryId)}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.damageItemCost,
                                      { color: selected ? palette.white : palette.textMuted },
                                    ]}>
                                    {amount}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.damageItemCost,
                                      { color: selected ? palette.white : palette.textMuted },
                                    ]}
                                    numberOfLines={1}>
                                    {String(entry.category || 'SERVICE')}
                                    {String(entry.unit_name || '').trim() ? ` • ${String(entry.unit_name)}` : ''}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </ScrollView>
                      ) : (
                        <Text style={[styles.info, { color: palette.textMuted }]}>Chưa có dữ liệu SERVICE.</Text>
                      )}

                      <Text style={[styles.info, { color: palette.textMuted }]}>Đã chọn: {selectedDetailCount} dòng</Text>
                    </View>

                    {selectedDetailCount > 0 ? (
                      <View style={[styles.incidentDraftCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
                        <Text style={[styles.incidentDraftTitle, { color: palette.text }]}>Chi tiết đã chọn</Text>
                        <View style={styles.detailSelectionList}>
                          {[...selectedItemIds.map((id) => ({ type: 'ITEM' as const, id })), ...selectedServiceIds.map((id) => ({ type: 'SERVICE' as const, id }))].map((entry) => {
                            const matchedEntry =
                              entry.type === 'ITEM'
                                ? damageItems.find((item) => String(item.id || '').trim() === entry.id)
                                : damageServiceCatalogs.find(
                                    (service) => String(service.id || '').trim() === entry.id,
                                  );

                            const label = `${entry.type} • ${String(matchedEntry?.name || entry.id)}`;
                            const amount =
                              entry.type === 'ITEM'
                                ? formatVnd(Number((matchedEntry as DamageReportItem | undefined)?.unit_cost) || 0)
                                : formatVnd(Number((matchedEntry as DamageServiceCatalogItem | undefined)?.base_price) || 0);
                            const quantity = getSelectedDetailQuantity(entry.type, entry.id);

                            return (
                              <View
                                key={`selected_${entry.type}_${entry.id}`}
                                style={[
                                  styles.detailSelectionRow,
                                  { borderColor: palette.border, backgroundColor: palette.surface },
                                ]}>
                                <View style={styles.detailSelectionInfo}>
                                  <Text style={[styles.damageItemName, { color: palette.text }]} numberOfLines={1}>
                                    {label}
                                  </Text>
                                  <Text style={[styles.damageItemCost, { color: palette.textMuted }]}>{amount}</Text>
                                </View>
                                <View style={styles.detailSelectionQtyWrap}>
                                  <View
                                    style={[
                                      styles.detailSelectionQtyStepper,
                                      { borderColor: palette.border, backgroundColor: palette.card },
                                    ]}>
                                    <Pressable
                                      style={styles.detailSelectionQtyButton}
                                      disabled={quantity <= 1}
                                      onPress={() => adjustDetailQuantity(entry.type, entry.id, -1)}>
                                      <MaterialIcons
                                        name="remove"
                                        size={18}
                                        color={quantity <= 1 ? palette.textMuted : palette.text}
                                      />
                                    </Pressable>

                                    <Text style={[styles.detailSelectionQtyValue, { color: palette.text }]}>
                                      {quantity}
                                    </Text>

                                    <Pressable
                                      style={styles.detailSelectionQtyButton}
                                      onPress={() => adjustDetailQuantity(entry.type, entry.id, 1)}>
                                      <MaterialIcons name="add" size={18} color={palette.text} />
                                    </Pressable>
                                  </View>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}

                    <View style={[styles.incidentDraftCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
                      <View style={styles.damageNumericRow}>
                        <View style={styles.damageNumericCol}>
                          <Text style={[styles.damageInputLabel, { color: palette.textMuted }]}>Ghi chú (tuỳ chọn)</Text>
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
                            value={detailNote}
                            onChangeText={setDetailNote}
                            placeholder="Ví dụ: vỡ do va chạm"
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
                          Giá trị vật tư: {formatVnd(previewItemValue)}
                        </Text>
                        <Text style={[styles.incidentPricingText, { color: palette.textMuted }]}>
                          Phí dịch vụ: {formatVnd(previewServiceValue)}
                        </Text>
                        <Text style={[styles.incidentPricingTotal, { color: palette.error }]}>
                          Penalty dự kiến: {formatVnd(previewPenaltyValue)}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.incidentPhotoSection, { backgroundColor: palette.card, borderColor: palette.border }]}>
                      <Text style={[styles.subsectionTitle, { color: palette.text }]}>Mức độ nghiêm trọng</Text>
                      <View style={styles.photoTypeSelector}>
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

                      <Text style={[styles.incidentPhotoTitle, { color: palette.text }]}>Ảnh incident</Text>

                      <View style={[styles.incidentModeBox, { backgroundColor: `${palette.error}14`, borderColor: palette.error }]}>
                        <Text style={[styles.incidentModeTitle, { color: palette.error }]}>Chế độ báo cáo hư hại vật tư</Text>
                        <Text style={[styles.incidentModeText, { color: palette.textMuted }]}>
                          Ảnh mới sẽ được gửi vào Incident (DAMAGE_REPORT) với snapshot giá, không lưu vào bộ ảnh cleaning BEFORE/AFTER.
                          {isAnytimeIncidentFlow ? ' Báo cáo này đang dùng ngữ cảnh Pod (mọi lúc).' : ''}
                        </Text>
                      </View>

                      <View style={styles.incidentPhotoActionRow}>
                        <Pressable
                          style={[
                            styles.requiredCaptureTile,
                            styles.incidentPhotoActionTile,
                            { borderColor: '#1f7aed', backgroundColor: '#1f7aed' },
                          ]}
                          disabled={uploadingPhoto}
                          onPress={() => {
                            void openCamera();
                          }}>
                          <MaterialIcons name="photo-camera" size={26} color={palette.white} />
                          <Text style={[styles.requiredCaptureLabel, styles.incidentPhotoActionLabel]}>Chụp ảnh incident</Text>
                        </Pressable>

                        <Pressable
                          style={[
                            styles.requiredCaptureTile,
                            styles.incidentPhotoActionTile,
                            { borderColor: '#1f7aed', backgroundColor: '#1f7aed' },
                          ]}
                          disabled={uploadingPhoto}
                          onPress={() => {
                            void pickPhotoFromLibrary();
                          }}>
                          <MaterialIcons name="photo-library" size={26} color={palette.white} />
                          <Text style={[styles.requiredCaptureLabel, styles.incidentPhotoActionLabel]}>Chọn từ thư viện</Text>
                        </Pressable>
                      </View>

                      <View style={styles.requiredPhotosRow}>
                        {capturedPhotoUris.map((uri, index) => (
                          <View key={`${uri}_${index}`} style={styles.requiredThumbWrap}>
                            <Image source={{ uri }} style={styles.requiredThumb} resizeMode="cover" />
                            <Pressable
                              style={[styles.requiredRemoveIcon, { backgroundColor: '#00000085' }]}
                              onPress={() => removeCapturedPhoto(index)}>
                              <MaterialIcons name="close" size={14} color={palette.white} />
                            </Pressable>
                          </View>
                        ))}
                      </View>

                      {capturedPhotoUris.length === 0 ? (
                        <Text style={[styles.emptyText, { color: palette.textMuted }]}>Chưa có ảnh incident</Text>
                      ) : null}
                    </View>
                  </>
                ) : (
                  <View style={styles.photoTypeSelector}>
                    <Pressable
                      style={[styles.requiredCaptureTile, { borderColor: '#c4d2e5', backgroundColor: '#f8fbff' }]}
                      disabled={uploadingPhoto}
                      onPress={() => {
                        setPhotoType('AFTER');
                        void openCamera();
                      }}>
                      <MaterialIcons name="photo-camera" size={26} color="#8aa0bc" />
                      <Text style={styles.requiredCaptureLabel}>After Clean</Text>
                    </Pressable>

                    {requiredAfterPhotos.map((photo) => (
                      <View key={String(photo.id || Math.random())} style={styles.requiredThumbWrap}>
                        <Image
                          source={{ uri: String(photo.photo_url || '') }}
                          style={styles.requiredThumb}
                          resizeMode="cover"
                        />
                        <View style={styles.requiredDoneIcon}>
                          <MaterialIcons name="check-circle" size={20} color="#22c55e" />
                        </View>
                      </View>
                    ))}

                    {capturedPhotoUris.map((uri, index) => (
                      <View key={`${uri}_${index}`} style={styles.requiredThumbWrap}>
                        <Image source={{ uri }} style={styles.requiredThumb} resizeMode="cover" />
                        <Pressable
                          style={[styles.requiredRemoveIcon, { backgroundColor: '#00000085' }]}
                          onPress={() => removeCapturedPhoto(index)}>
                          <MaterialIcons name="close" size={14} color={palette.white} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}

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
    paddingTop: spacingY._25,
    paddingBottom: spacingY._15,
    gap: spacingY._15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    flex: 1,
    marginLeft: spacingX._7,
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
  readySection: {
    marginTop: spacingY._5,
    marginBottom: spacingY._5,
    padding: spacingX._15,
    alignItems: 'center',
    gap: spacingY._12,
  },
  readyIconWrap: {
    width: 92,
    height: 92,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyTitle: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    textAlign: 'center',
  },
  readyDescription: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: Fonts.sans,
    textAlign: 'center',
    paddingHorizontal: spacingX._10,
  },
  readyButton: {
    width: '100%',
    borderRadius: radius._15,
    paddingVertical: spacingY._12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 3,
  },
  readyButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._5,
  },
  readyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    letterSpacing: 0.5,
  },
  checklistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._7,
  },
  checklistItem: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._10,
    borderTopWidth: 1,
    paddingHorizontal: spacingX._3,
  },
  checkIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '500',
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
  incidentDraftCard: {
    borderWidth: 1,
    borderRadius: radius._12,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    gap: spacingY._7,
  },
  incidentDraftTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  incidentPhotoSection: {
    borderWidth: 1,
    borderRadius: radius._12,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    gap: spacingY._10,
  },
  incidentPhotoTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.sans,
    marginTop: spacingY._5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._7,
    flexWrap: 'wrap',
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.sans,
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
  damageReportHeaderTitle: {
    width: '100%',
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
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
  requiredPhotosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingX._10,
  },
  incidentPhotoActionRow: {
    flexDirection: 'row',
    gap: spacingX._10,
  },
  incidentPhotoActionTile: {
    flex: 1,
    width: undefined,
    minHeight: 96,
    paddingHorizontal: spacingX._7,
    borderStyle: 'solid',
  },
  incidentPhotoActionLabel: {
    color: '#ffffff',
    fontWeight: '700',
  },
  requiredCaptureTile: {
    width: 96,
    height: 96,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius._10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingY._5,
  },
  requiredCaptureLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8aa0bc',
    fontFamily: Fonts.sans,
  },
  requiredThumbWrap: {
    width: 96,
    height: 96,
    borderRadius: radius._10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#dbe3ef',
  },
  requiredThumb: {
    width: '100%',
    height: '100%',
  },
  requiredDoneIcon: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    backgroundColor: '#ffffffd6',
    borderRadius: radius.full,
  },
  requiredRemoveIcon: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
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
  detailSelectionList: {
    gap: spacingY._7,
  },
  detailSelectionRow: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._7,
    paddingVertical: spacingY._5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._7,
  },
  detailSelectionInfo: {
    flex: 1,
    gap: 2,
  },
  detailSelectionQtyWrap: {
    width: 92,
  },
  detailSelectionQtyStepper: {
    minHeight: 32,
    borderWidth: 1,
    borderRadius: radius._10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  detailSelectionQtyButton: {
    width: 28,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailSelectionQtyValue: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    includeFontPadding: false,
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

