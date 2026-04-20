import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import {
    getBookingById,
    getCleaningTaskById,
    getIncidentsByCleaningTaskId,
    getMyCleanerKeyByBookingId,
    getMyCleanerKeyByTaskId,
    getPodById,
    updateCleaningTask,
} from '@/services/cleaner-dashboard.service';
import { subscribeCleanerRealtimeEvent } from '@/services/cleaner-realtime-bus';
import type {
    CleanerOnlineKey,
    CleanerRealtimeNotification,
    CleanerTaskAction,
    CleaningTask,
    Incident,
} from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

interface TaskDetailTabProps {
  token: string;
  userId?: string | null;
  taskId: string | null;
  isDark: boolean;
  palette: typeof Colors.light;
  onClose: () => void;
  onTaskUpdated?: (task: CleaningTask) => void;
  onErrorChange?: (error: string | null) => void;
  onStarted?: () => void;
  onViewSummary?: () => void;
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

function formatTimeOnly(dateText?: string) {
  if (!dateText) return '-';
  const parsed = new Date(dateText);
  return Number.isNaN(parsed.getTime())
    ? dateText
    : parsed.toLocaleTimeString('vi-VN', {
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

function taskStatusLabelVi(status?: string | null) {
  const s = String(status || '').toUpperCase();
  if (s === 'ASSIGNED') return 'Đã phân công';
  if (s === 'NOTIFIED') return 'Đã thông báo';
  if (s === 'ACCEPTED') return 'Đã nhận việc';
  if (s === 'ARRIVED') return 'Đã đến nơi';
  if (s === 'IN_PROGRESS') return 'Đang dọn';
  if (s === 'DONE') return 'Hoàn thành';
  if (s === 'CANCELLED') return 'Đã hủy';
  if (s === 'MISSED') return 'Bỏ lỡ';
  return s.replace(/_/g, ' ');
}

function bookingStatusLabel(status?: string | null) {
  const s = String(status || '').toUpperCase();
  if (s === 'IN_USE') return 'Đang sử dụng';
  if (s === 'COMPLETED') return 'Đã kết thúc';
  if (s === 'BOOKED') return 'Đã đặt';
  if (s === 'CANCELLED') return 'Đã hủy';
  if (s === 'NO_SHOW') return 'Không đến';
  if (!s) return null;
  return s.replace(/_/g, ' ');
}

function podStatusLabel(status?: string | null) {
  const s = String(status || '').toUpperCase();
  if (s === 'AVAILABLE') return 'Sẵn sàng';
  if (s === 'IN_USE') return 'Đang dùng';
  if (s === 'NEEDS_CLEANING') return 'Cần dọn';
  if (s === 'CLEANING') return 'Đang dọn';
  if (!s) return null;
  return s.replace(/_/g, ' ');
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
    complete: 'Hoàn thành',
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
      message: 'Khách đang ở Pod chưa cho phép truy cập làm vệ sinh hoặc chưa tới giờ làm vệ sinh.',
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
    return { status: 'MISSING', label: 'Chưa có key', detail: 'Chưa được cấp chìa khóa cửa cho booking này.' };
  }

  if (key.is_revoked) {
    return { status: 'REVOKED', label: 'Đã thu hồi', detail: 'Chìa khóa cửa đã bị thu hồi.' };
  }

  const nowTime = Date.now();
  const fromTime = key.valid_from ? new Date(key.valid_from).getTime() : Number.NaN;
  const toTime = key.valid_to ? new Date(key.valid_to).getTime() : Number.NaN;

  if (Number.isFinite(fromTime) && fromTime > nowTime) {
    return { status: 'NOT_YET_VALID', label: 'Chưa tới hiệu lực', detail: 'Bạn chưa thể dùng key trước thời gian hiệu lực.' };
  }

  if (Number.isFinite(toTime) && toTime < nowTime) {
    return { status: 'EXPIRED', label: 'Hết hạn', detail: 'Chìa khóa cửa đã hết hạn.' };
  }

  return { status: 'VALID', label: 'Hợp lệ', detail: 'Chìa khóa cửa đang trong thời gian hiệu lực.' };
}

function resolveOnlineKeyValidationWithAccess(
  key: CleanerOnlineKey | null,
  accessState: 'UNKNOWN' | 'OK' | 'FORBIDDEN' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'NO_BOOKING' | 'ERROR',
) {
  if (accessState === 'NO_BOOKING') {
    return {
      status: 'NO_BOOKING',
      label: 'Không có booking',
      detail: 'Task này không gắn booking nên không có chìa khóa cửa.',
    };
  }

  if (accessState === 'FORBIDDEN') {
    return {
      status: 'FORBIDDEN',
      label: 'Chưa được phép xem',
      detail: 'Bạn chưa được phép xem chìa khóa cửa của Pod này.',
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
      detail: 'Không tìm thấy booking hoặc chưa được cấp chìa khóa cửa.',
    };
  }

  if (accessState === 'ERROR') {
    return {
      status: 'ERROR',
      label: 'Lỗi tải key',
      detail: 'Không thể tải thông tin chìa khóa cửa lúc này.',
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

function resolveRealtimeTaskId(event: CleanerRealtimeNotification) {
  const payload = (event.payload || {}) as Record<string, unknown>;

  const candidate =
    event.task_id ||
    event.taskId ||
    event.cleaning_task_id ||
    event.entity_id ||
    payload.task_id ||
    payload.taskId ||
    payload.cleaning_task_id ||
    payload.entity_id;

  return normalizeId(candidate);
}

function shouldRefreshDetailFromEvent(event: CleanerRealtimeNotification, currentTaskId: string) {
  const eventCode = String(event.event || '').trim().toUpperCase();
  const payload = (event.payload || {}) as Record<string, unknown>;
  const payloadEvent = String(payload.event_code || payload.event || '').trim().toUpperCase();
  const mergedCode = eventCode || payloadEvent;

  if (!mergedCode) {
    return true;
  }

  if (!mergedCode.startsWith('CLEANING_TASK_') && mergedCode !== 'SUPPORT_CLEANING_REQUEST') {
    return false;
  }

  const eventTaskId = resolveRealtimeTaskId(event);
  if (!eventTaskId) {
    return true;
  }

  return eventTaskId === normalizeId(currentTaskId);
}

export default function TaskDetailTab({
  token,
  userId,
  taskId,
  isDark,
  palette,
  onClose,
  onTaskUpdated,
  onErrorChange,
  onStarted,
  onViewSummary,
}: TaskDetailTabProps) {
  const [task, setTask] = useState<CleaningTask | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [podName, setPodName] = useState<string | null>(null);
  const [clusterName, setClusterName] = useState<string | null>(null);
  const [bookingName, setBookingName] = useState<string | null>(null);
  const [bookingWindowOverride, setBookingWindowOverride] = useState<BookingTimeWindow | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCleanerKey, setLastCleanerKey] = useState<CleanerOnlineKey | null>(null);
  const [onlineKeyNotice, setOnlineKeyNotice] = useState<string | null>(null);
  const [onlineKeyAccessState, setOnlineKeyAccessState] = useState<
    'UNKNOWN' | 'OK' | 'FORBIDDEN' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'NO_BOOKING' | 'ERROR'
  >('UNKNOWN');

  const [actionLoading, setActionLoading] = useState(false);
  const realtimeReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const taskStatus = String(task?.status || '').toUpperCase();

  const loadDetail = useCallback(async (silent = false) => {
    if (!taskId || !token) return;

    if (!silent) {
      setLoading(true);
    }
    setError(null);
    onErrorChange?.(null);

    try {
      const [taskData, incidentsData] = await Promise.all([
        getCleaningTaskById(token, taskId),
        getIncidentsByCleaningTaskId(token, taskId),
      ]);

      setTask(taskData);
      setIncidents(incidentsData);
      setPodName(taskPodDisplayName(taskData) || null);
      setClusterName(taskClusterDisplayName(taskData) || null);
      setBookingWindowOverride(taskBookingWindow(taskData));
      setLastCleanerKey(null);
      setOnlineKeyNotice(null);
      setOnlineKeyAccessState('UNKNOWN');

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
          let cleanerKeyResult;
          try {
            cleanerKeyResult = await getMyCleanerKeyByTaskId(token, taskId);
          } catch (taskKeyError) {
            cleanerKeyResult = await getMyCleanerKeyByBookingId(token, bookingId);
          }
          const resolvedKey = cleanerKeyResult.online_key || null;
          setLastCleanerKey(resolvedKey);
          setOnlineKeyAccessState('OK');

          if (!resolvedKey?.key_token) {
            setOnlineKeyNotice('Chưa được cấp chìa khóa cửa cho booking này.');
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
        setOnlineKeyNotice('Task này không có booking nên không có chìa khóa cửa.');
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
      if (!silent) {
        setLoading(false);
      }
    }
  }, [taskId, token, onErrorChange]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    const normalizedTaskId = normalizeId(taskId);
    if (!token || !normalizedTaskId) {
      return;
    }

    const unsubscribe = subscribeCleanerRealtimeEvent((event) => {
      if (!shouldRefreshDetailFromEvent(event, normalizedTaskId)) {
        return;
      }

      if (realtimeReloadTimer.current) {
        clearTimeout(realtimeReloadTimer.current);
      }
      realtimeReloadTimer.current = setTimeout(() => {
        realtimeReloadTimer.current = null;
        void loadDetail(true);
      }, 350);
    });

    return () => {
      if (realtimeReloadTimer.current) {
        clearTimeout(realtimeReloadTimer.current);
        realtimeReloadTimer.current = null;
      }

      unsubscribe();
    };
  }, [loadDetail, taskId, token]);

  const handleAction = async (action: CleanerTaskAction) => {
    if (!task || !taskId) return;

    setActionLoading(true);
    setError(null);
    onErrorChange?.(null);

    try {
      if (action === 'start') {
        // TODO: [TEST ONLY] Bỏ qua validate online key để test - khôi phục lại sau khi test xong
        // if (taskId) { ... online key fetch & checkin ... }
      }

      const payload = taskActionPayload(action, '');
      const updated = await updateCleaningTask(token, taskId, payload);

      setTask(updated);
      onTaskUpdated?.(updated);
      onErrorChange?.(null);

      if (action === 'start') {
        onStarted?.();
      } else {
        Alert.alert('Thành công', `${getActionLabel(action)} thành công`);
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      onErrorChange?.(msg);
      Alert.alert('Lỗi', msg);
    } finally {
      setActionLoading(false);
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
  const needsAssignment = !['ASSIGNED', 'NOTIFIED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'DONE'].includes(taskStatus);
  const showReadyAction = canAccept || canStart;
  const bookingWindow = bookingWindowOverride || taskBookingWindow(task);
  function formatDateTimeNoYear(dateText?: string) {
    if (!dateText) return '-';
    const parsed = new Date(dateText);
    return Number.isNaN(parsed.getTime())
      ? dateText
      : parsed.toLocaleString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
  }
  const estimatedTimeRangeText = `${formatDateTimeNoYear(task.estimated_start_time || undefined)} - ${formatDateTimeNoYear(task.due_at || undefined)}`;
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
        : 'ĐÃ HOÀN THÀNH';

  const readyTitleText = canAccept ? 'Sẵn sàng nhận nhiệm vụ?' : 'Sẵn sàng dọn phòng?';

  const actionHintText = canAccept
    ? 'Nhận việc để bắt đầu quy trình dọn dẹp.'
    : canStart
      ? 'Sẵn sàng bắt đầu dọn dẹp cho task này.'
      : taskStatus === 'IN_PROGRESS'
        ? 'Task đang được thực hiện. Bạn có thể cập nhật ảnh tại đây.'
        : 'Task đã hoàn thành hoặc không khả dụng để bắt đầu.';

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
        <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 18, marginBottom: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1, borderWidth: 1, borderColor: '#F1F5F9', position: 'relative' }}>
          {/* Badge trạng thái góc phải trên */}
          <View style={{ position: 'absolute', top: 14, right: 18, zIndex: 2 }}>
            <View style={{ backgroundColor: '#EBFDED', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16 }}>
              <Text style={{ color: '#22C55E', fontWeight: 'bold', fontSize: 12 }}>{taskStatusLabelVi(task.status)}</Text>
            </View>
          </View>
          {/* Dòng 1: Tên pod */}
          <Text style={{ fontWeight: 'bold', fontSize: 15, color: '#1E293B', marginBottom: 2 }}>{displayPodName}</Text>
          {/* Dòng 2: Tên khách sạn */}
          <Text style={{ color: '#94A3B8', fontSize: 9, marginBottom: 14 }}>{displayClusterName}</Text>
          {/* Dòng 3: Thời gian */}
          <Text style={{ color: '#0EA5E9', fontSize: 13, fontWeight: '900' }}>{estimatedTimeRangeText}</Text>
          {/* Dòng 4: Trạng thái booking & pod */}
          {(task.booking_status || task.pod_status) ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {task.booking_status ? (
                <View style={{ backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                  <Text style={{ color: '#2563EB', fontSize: 11, fontWeight: '600' }}>
                    Booking: {bookingStatusLabel(String(task.booking_status))}
                  </Text>
                </View>
              ) : null}
              {task.pod_status ? (
                <View style={{ backgroundColor: '#FFF7ED', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                  <Text style={{ color: '#EA580C', fontSize: 11, fontWeight: '600' }}>
                    Pod: {podStatusLabel(String(task.pod_status))}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        </View>

        <View style={{
          backgroundColor: palette.card,
          borderColor: palette.border,
          borderWidth: 1,
          borderRadius: 16,
          padding: 14,
          marginBottom: 14,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.03,
          shadowRadius: 4,
          elevation: 1,
          alignSelf: 'center',
          width: '92%', // Giống card phía trên
          maxWidth: 420,
          gap: 10,
        }}>
          <View style={styles.onlineKeyHeaderRow}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Chìa khóa cửa</Text>
            <View style={[styles.onlineKeyBadge, { backgroundColor: `${onlineKeyStatusColor}22`, borderColor: onlineKeyStatusColor }]}>
              <Text style={[styles.onlineKeyBadgeText, { color: onlineKeyStatusColor }]}>{onlineKeyValidation.label}</Text>
            </View>
          </View>

          <View style={[styles.onlineKeyCodeBox, { borderColor: palette.border, backgroundColor: palette.surface }]}>
            <Text style={[styles.onlineKeyCodeLabel, { color: palette.textMuted }]}>Mã khóa</Text>
            <Text style={[styles.onlineKeyCodeText, { color: palette.text }]}>{maskKeyToken(lastCleanerKey?.key_token)}</Text>
          </View>

          <View style={styles.onlineKeyMetaGrid}>
            <View style={[styles.onlineKeyMetaCard, { borderColor: palette.border, backgroundColor: palette.surface }]}>
              <Text style={[styles.onlineKeyMetaLabel, { color: palette.textMuted }]}>Hiệu lực từ</Text>
              <Text style={[styles.onlineKeyMetaValue, { color: palette.text }]}>{formatTimeOnly(lastCleanerKey?.valid_from)}</Text>
            </View>
            <View style={[styles.onlineKeyMetaCard, { borderColor: palette.border, backgroundColor: palette.surface }]}>
              <Text style={[styles.onlineKeyMetaLabel, { color: palette.textMuted }]}>Hiệu lực đến</Text>
              <Text style={[styles.onlineKeyMetaValue, { color: palette.text }]}>{formatTimeOnly(lastCleanerKey?.valid_to)}</Text>
            </View>
          </View>

          <View style={[styles.onlineKeyValidationBox, { borderColor: palette.border, backgroundColor: palette.surface }]}>
            <Text style={[styles.onlineKeyValidationLabel, { color: palette.textMuted }]}>Xác thực</Text>
            <Text style={[styles.onlineKeyValidationValue, { color: palette.text }]}>{onlineKeyValidation.detail}</Text>
          </View>

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
              <MaterialIcons name="cleaning-services" size={38} color={palette.primary} />
            </View>
            <Text style={[styles.readyTitle, { color: palette.text }]}>{readyTitleText}</Text>
            {canAccept || canStart ? null : (
              <Text style={[styles.readyDescription, { color: palette.textMuted }]}>{actionHintText}</Text>
            )}
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

        {taskStatus === 'IN_PROGRESS' && (
          <View style={styles.readySection}>
            <View style={[styles.readyIconWrap, { backgroundColor: '#FFF3CD' }]}>
              <MaterialIcons name="cleaning-services" size={38} color="#F59E0B" />
            </View>
            <Text style={[styles.readyTitle, { color: palette.text }]}>Đang dọn dẹp</Text>
            <Text style={[styles.readyDescription, { color: palette.textMuted }]}>
              Tiếp tục quy trình chụp ảnh và checklist.
            </Text>
            <Pressable
              style={[styles.readyButton, { backgroundColor: '#F59E0B' }]}
              onPress={() => onStarted?.()}>
              <View style={styles.readyButtonInner}>
                <MaterialIcons name="arrow-forward" size={20} color="#fff" />
                <Text style={[styles.readyButtonText, { color: '#fff' }]}>TIẾP TỤC DỌN DẸP</Text>
              </View>
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

        {taskStatus === 'DONE' && (
          <View style={styles.readySection}>
            <View style={[styles.readyIconWrap, { backgroundColor: '#ECFDF5' }]}>
              <MaterialIcons name="check-circle" size={38} color="#22C55E" />
            </View>
            <Text style={[styles.readyTitle, { color: palette.text }]}>Đã hoàn thành</Text>
            <Text style={[styles.readyDescription, { color: palette.textMuted }]}>
              Nhiệm vụ dọn dẹp đã được hoàn thành. Xem kết quả để kiểm tra ảnh và báo cáo hư hại.
            </Text>
            <Pressable
              style={[styles.readyButton, { backgroundColor: palette.primary }]}
              onPress={() => onViewSummary?.()}>
              <View style={styles.readyButtonInner}>
                <MaterialIcons name="article" size={20} color="#fff" />
                <Text style={[styles.readyButtonText, { color: '#fff' }]}>XEM KẾT QUẢ DỌN DẸP</Text>
              </View>
            </Pressable>
          </View>
        )}

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
    paddingVertical: spacingY._10,
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
  cleaningPhotoSections: {
    gap: spacingY._20,
  },
  cleaningPhotoBlock: {
    gap: spacingY._12,
  },
  cleaningCaptureButton: {
    width: '100%',
    height: 42,
    borderRadius: radius._10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacingX._5,
    paddingHorizontal: spacingX._7,
  },
  cleaningCaptureButtonText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    textAlign: 'center',
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
  damageSeverityButtonText: {
    fontSize: 11,
    fontWeight: '600',
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
  cameraModalRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraModalView: {
    flex: 1,
  },
  cameraModalOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacingX._12,
    paddingBottom: spacingY._20,
    paddingTop: spacingY._10,
    backgroundColor: '#00000088',
    gap: spacingY._7,
  },
  cameraModalHint: {
    color: '#e2e8f0',
    textAlign: 'center',
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
    flexShrink: 1,
    minWidth: 0,
    gap: 2,
  },
  detailSelectionLabel: {
    flexShrink: 1,
  },
  detailSelectionQtyWrap: {
    width: 84,
    flexShrink: 0,
    alignSelf: 'center',
  },
  detailSelectionQtyStepper: {
    height: 34,
    borderWidth: 1,
    borderRadius: radius._10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingHorizontal: spacingX._5,
  },
  detailSelectionQtyButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailSelectionQtyValue: {
    minWidth: 18,
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

