import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { getMyCleaningTasks } from '@/services/cleaner-dashboard.service';
import { subscribeCleanerRealtimeEvent } from '@/services/cleaner-realtime-bus';
import { getMyCleanerIncidents } from '@/services/incident.service';
import type { CleanerIncident, CleanerRealtimeNotification, CleaningRequestSource, CleaningTask, CleaningTaskStatus } from '@/types/cleaner-dashboard';
import {
  CLEANING_REQUEST_SOURCES,
} from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

type BookingTimeWindow = {
  start_time?: string;
  end_time?: string;
};

interface TasksTabProps {
  token: string;
  userId?: string | null;
  isDark: boolean;
  palette: typeof Colors.light;
  onLoadingChange?: (loading: boolean) => void;
  onErrorChange?: (error: string | null) => void;
  onCountsChange?: (done: number, pending: number) => void;
}

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

function formatCompactTime(dateText?: string) {
  if (!dateText) return '-';
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return '-';
  const hh = String(parsed.getHours()).padStart(2, '0');
  const mm = String(parsed.getMinutes()).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  const mo = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${hh}:${mm} ${dd}/${mo}`;
}

function statusColor(status: string | undefined, isDark: boolean) {
  const normalized = (status || '').toUpperCase();
  if (normalized === 'DONE') return isDark ? '#34d399' : '#10b981';
  if (normalized === 'IN_PROGRESS') return isDark ? '#fbbf24' : '#d97706';
  if (normalized === 'ACCEPTED') return isDark ? '#93c5fd' : '#1d4ed8';
  if (normalized === 'ASSIGNED') return isDark ? '#60a5fa' : '#2563eb';
  if (normalized === 'CANCELLED' || normalized === 'MISSED') return isDark ? '#fb7185' : '#e11d48';
  return isDark ? '#94a3b8' : '#64748b';
}

function taskId(task: CleaningTask) {
  return String(task.id || task._id || '');
}

function shouldHidePermissionMessage(message: string) {
  return message.toLowerCase().includes('không có quyền');
}

function isInvalidStatusErrorMessage(message: string) {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('invalid status') || normalized.includes('must be one of');
}

function isTerminalStatus(status: string | undefined) {
  if (!status) return false;
  return TERMINAL_TASK_STATUSES.has(status.toUpperCase() as CleaningTaskStatus);
}

function isApiCleaningTaskStatus(status: string | undefined): status is ApiCleaningTaskStatus {
  if (!status) return false;
  return (API_CLEANING_TASK_STATUSES as readonly string[]).includes(status);
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

function taskBookingDisplayName(task: CleaningTask) {
  const bookingRecord = task.booking as { order_id?: string; id?: string } | undefined;
  return String(task.booking_order_id || bookingRecord?.order_id || bookingRecord?.id || '').trim();
}

function taskUserDisplayName(task: CleaningTask) {
  const bookingRecord = task.booking as {
    user_name?: string;
    guest_name?: string;
    customer_name?: string;
    full_name?: string;
    user?: { name?: string; full_name?: string };
  } | undefined;

  return String(
    task.user_name ||
      task.booking_user_name ||
      task.booking_guest_name ||
      bookingRecord?.user_name ||
      bookingRecord?.guest_name ||
      bookingRecord?.customer_name ||
      bookingRecord?.full_name ||
      bookingRecord?.user?.name ||
      bookingRecord?.user?.full_name ||
      '',
  ).trim();
}

function taskBookingWindow(task: CleaningTask, bookingTimeMap: Record<string, BookingTimeWindow>) {
  const bookingRecord = task.booking as { start_time?: string; end_time?: string } | undefined;
  const bookingId = String(task.booking_id || '').trim();
  const bookingWindow = bookingTimeMap[bookingId];

  return {
    start_time:
      String(
        task.booking_start_time ||
          bookingRecord?.start_time ||
          bookingWindow?.start_time ||
          '',
      ).trim() || undefined,
    end_time:
      String(
        task.booking_end_time ||
          bookingRecord?.end_time ||
          bookingWindow?.end_time ||
          '',
      ).trim() || undefined,
  };
}

function taskLocationDisplayName(task: CleaningTask) {
  return String(task.location_name || '').trim();
}

function resolvedPodLabel(task: CleaningTask, podNameMap: Record<string, string>) {
  const podId = String(task.pod_id || '').trim();
  const value = String(podNameMap[podId] || taskPodDisplayName(task) || '').trim();
  if (value) return value;
  if (podId) return `Pod ${podId}`;
  return 'Pod chưa xác định';
}

function resolvedClusterOrLocationLabel(
  task: CleaningTask,
  podClusterNameMap: Record<string, string>,
) {
  const podId = String(task.pod_id || '').trim();
  const clusterName = String(
    podClusterNameMap[podId] || taskClusterDisplayName(task) || taskLocationDisplayName(task) || '',
  ).trim();
  if (clusterName) return clusterName;

  const locationId = String(task.location_id || '').trim();
  if (locationId) return `Vị trí ${locationId}`;
  return 'Chưa có cụm/vị trí';
}

function resolvedBookingLabel(task: CleaningTask, bookingNameMap: Record<string, string>) {
  const bookingId = String(task.booking_id || '').trim();
  const value = String(
    taskUserDisplayName(task) ||
      bookingNameMap[bookingId] ||
      taskBookingDisplayName(task) ||
      task.booking_guest_name ||
      '',
  ).trim();

  if (value) return value;
  if (bookingId) return `Booking ${bookingId}`;
  return 'Không có booking';
}

function resolvedDueText(task: CleaningTask, bookingWindow: BookingTimeWindow) {
  return String(
    task.due_at ||
    bookingWindow.end_time ||
    task.booking_end_time ||
    task.assigned_at ||
    task.created_at ||
    ''
  );
}

function resolvedEstimatedStartText(task: CleaningTask, bookingWindow: BookingTimeWindow) {
  return String(
    task.estimated_start_time ||
      task.start_time ||
      task.booking_start_time ||
      bookingWindow.start_time ||
      task.assigned_at ||
      task.created_at ||
      '',
  );
}

const TASKS_PAGE_SIZE = 8;
const LOAD_MORE_TRIGGER_PX = 160;
const API_CLEANING_TASK_STATUSES = [
  'ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
  'DONE',
  'CANCELLED',
  'MISSED',
] as const;
type ApiCleaningTaskStatus = (typeof API_CLEANING_TASK_STATUSES)[number];
const TERMINAL_TASK_STATUSES = new Set<CleaningTaskStatus>(['DONE', 'CANCELLED', 'MISSED']);
const DEFAULT_NON_TERMINAL_FETCH_STATUSES = API_CLEANING_TASK_STATUSES.filter(
  (status) => !TERMINAL_TASK_STATUSES.has(status),
);
const UTC_PLUS_7_OFFSET_MINUTES = 7 * 60;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
type TaskWindowMode = 'TODAY' | 'WEEK_WINDOW';

function toUtcPlus7DayRange(dayOffset = 0, baseDate = new Date()) {
  const offsetMs = UTC_PLUS_7_OFFSET_MINUTES * 60 * 1000;
  const shiftedDate = new Date(baseDate.getTime() + offsetMs + dayOffset * ONE_DAY_MS);

  const year = shiftedDate.getUTCFullYear();
  const month = shiftedDate.getUTCMonth();
  const day = shiftedDate.getUTCDate();

  const startUtcMs = Date.UTC(year, month, day, 0, 0, 0, 0) - offsetMs;
  const endUtcMs = Date.UTC(year, month, day, 23, 59, 59, 999) - offsetMs;

  return {
    start: new Date(startUtcMs),
    end: new Date(endUtcMs),
  };
}

function toUtcPlus7DateKey(value?: string) {
  if (!value) return '';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const shiftedDate = new Date(parsed.getTime() + UTC_PLUS_7_OFFSET_MINUTES * 60 * 1000);
  const year = shiftedDate.getUTCFullYear();
  const month = String(shiftedDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shiftedDate.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatUtcPlus7DateLabel(baseDate = new Date()) {
  const shiftedDate = new Date(baseDate.getTime() + UTC_PLUS_7_OFFSET_MINUTES * 60 * 1000);
  const day = String(shiftedDate.getUTCDate()).padStart(2, '0');
  const month = String(shiftedDate.getUTCMonth() + 1).padStart(2, '0');
  const year = shiftedDate.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function dateKey(value?: string) {
  return toUtcPlus7DateKey(value);
}

function resolveTaskDateTime(task: CleaningTask) {
  return String(
    task.estimated_start_time ||
      task.due_at ||
      task.booking_end_time ||
      task.booking_start_time ||
      task.assigned_at ||
      task.created_at ||
      '',
  ).trim();
}

function isTaskToday(task: CleaningTask) {
  return dateKey(resolveTaskDateTime(task)) === dateKey(new Date().toISOString());
}

function statusBadgeBackground(status: string, isDark: boolean) {
  const normalized = status.toUpperCase();
  if (normalized === 'ACCEPTED') return isDark ? '#1e40af' : '#1d4ed8';
  if (normalized === 'IN_PROGRESS') return isDark ? '#1d4ed8' : '#dbeafe';
  if (normalized === 'ASSIGNED' || normalized === 'NOTIFIED') return isDark ? '#92400e' : '#fef3c7';
  if (normalized === 'DONE') return isDark ? '#065f46' : '#d1fae5';
  if (normalized === 'CANCELLED' || normalized === 'MISSED') return isDark ? '#881337' : '#ffe4e6';
  return isDark ? '#334155' : '#e2e8f0';
}

function statusBadgeText(status: string, isDark: boolean) {
  const normalized = status.toUpperCase();
  if (normalized === 'ACCEPTED') return isDark ? '#bfdbfe' : '#dbeafe';
  if (normalized === 'IN_PROGRESS') return isDark ? '#bfdbfe' : '#1d4ed8';
  if (normalized === 'ASSIGNED' || normalized === 'NOTIFIED') return isDark ? '#fcd34d' : '#b45309';
  if (normalized === 'DONE') return isDark ? '#6ee7b7' : '#047857';
  if (normalized === 'CANCELLED' || normalized === 'MISSED') return isDark ? '#fda4af' : '#be123c';
  return isDark ? '#cbd5e1' : '#475569';
}

function statusLabel(status: string) {
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

function requestSourceLabel(source?: string) {
  const normalized = String(source || '').toUpperCase();
  if (normalized === 'USER_REQUEST') return 'Yêu cầu từ khách';
  if (normalized === 'AUTO_AFTER_CHECKOUT') return 'Dọn dẹp sau checkout';
  if (normalized === 'SYSTEM_RETRY') return 'Hệ thống thử lại';
  if (normalized === 'ROOM_CHANGE_VACATED') return 'Đổi phòng – phòng vừa trả';
  if (!normalized) return '-';
  return normalized.replace(/_/g, ' ');
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

const KNOWN_BOOKING_STATUSES = ['BOOKED', 'IN_USE', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;

function bookingStatusFilterLabel(status: string) {
  if (status === 'ALL') return 'Tất cả';
  return bookingStatusLabel(status) || status.replace(/_/g, ' ');
}

function clusterFilterLabel(clusterName: string) {
  if (clusterName === 'ALL') return 'Tất cả';
  return clusterName;
}

function taskClusterFilterValue(task: CleaningTask, podClusterNameMap: Record<string, string>) {
  const podId = String(task.pod_id || '').trim();
  return String(podClusterNameMap[podId] || taskClusterDisplayName(task) || '').trim();
}

function taskTodayPriority(task: CleaningTask) {
  const source = String(task.request_source || '').trim().toUpperCase();
  if (source === 'USER_REQUEST') return 0;

  const bookingStatus = String(task.booking_status || '').trim().toUpperCase();
  if (bookingStatus === 'COMPLETED' || bookingStatus === 'CHECKOUT' || bookingStatus === 'CHECKED_OUT') {
    return 1;
  }

  return 2;
}

function estimatedStartMs(task: CleaningTask, bookingTimeMap: Record<string, BookingTimeWindow>) {
  const estimatedStart = resolvedEstimatedStartText(task, taskBookingWindow(task, bookingTimeMap));
  const estimatedTime = new Date(estimatedStart).getTime();
  if (!Number.isNaN(estimatedTime)) return estimatedTime;

  const fallbackTime = new Date(resolveTaskDateTime(task)).getTime();
  return Number.isNaN(fallbackTime) ? 0 : fallbackTime;
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

function incidentSeverityConfig(s?: string): { color: string; icon: keyof typeof MaterialIcons.glyphMap } {
  const v = String(s || '').toUpperCase();
  if (v === 'CRITICAL') return { color: '#dc2626', icon: 'warning' };
  if (v === 'HIGH') return { color: '#f43f5e', icon: 'error-outline' };
  if (v === 'MEDIUM') return { color: '#f59e0b', icon: 'report-problem' };
  return { color: '#10b981', icon: 'info-outline' };
}

function incidentSeverityLabel(s?: string) {
  const v = String(s || '').toUpperCase();
  if (v === 'LOW') return 'Thấp';
  if (v === 'MEDIUM') return 'Trung bình';
  if (v === 'HIGH') return 'Cao';
  if (v === 'CRITICAL') return 'Nghiêm trọng';
  return s || '-';
}

function incidentStatusConfig(s?: string): { label: string; color: string; bg: string; icon: keyof typeof MaterialIcons.glyphMap } {
  const v = String(s || '').toUpperCase();
  if (v === 'PENDING') return { label: 'Chờ xử lý', color: '#d97706', bg: '#fef3c7', icon: 'hourglass-empty' };
  if (v === 'PROCESSING') return { label: 'Đang xử lý', color: '#2563eb', bg: '#dbeafe', icon: 'build' };
  if (v === 'COMPLETED') return { label: 'Hoàn thành', color: '#059669', bg: '#d1fae5', icon: 'check-circle' };
  if (v === 'RESOLVED') return { label: 'Đã giải quyết', color: '#059669', bg: '#d1fae5', icon: 'verified' };
  if (v === 'DISMISSED') return { label: 'Đã hủy', color: '#6b7280', bg: '#f3f4f6', icon: 'cancel' };
  return { label: s || '-', color: '#6b7280', bg: '#f3f4f6', icon: 'help-outline' };
}

function incidentFormatTime(dateText?: string) {
  if (!dateText) return '-';
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return dateText;
  return parsed.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function shouldRefreshTasksFromEvent(event: CleanerRealtimeNotification) {
  const eventCode = String(event.event || '').trim().toUpperCase();
  const payload = (event.payload || {}) as Record<string, unknown>;
  const payloadEvent = String(payload.event_code || payload.event || '').trim().toUpperCase();
  const mergedCode = eventCode || payloadEvent;

  if (!mergedCode) {
    return true;
  }

  if (
    mergedCode.startsWith('CLEANING_TASK_') ||
    mergedCode === 'SUPPORT_CLEANING_REQUEST' ||
    mergedCode.startsWith('SHIFT_')
  ) {
    return true;
  }

  return false;
}

export default function TasksTab({
  token,
  userId,
  isDark,
  palette,
  onLoadingChange,
  onErrorChange,
  onCountsChange,
}: TasksTabProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneTodayCount, setDoneTodayCount] = useState(0);
  const [urgentIncidents, setUrgentIncidents] = useState<CleanerIncident[]>([]);
  const [urgentLoading, setUrgentLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<CleaningTaskStatus | 'ALL'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<CleaningRequestSource | 'ALL'>('ALL');
  const [sortFilter, setSortFilter] = useState<'newest' | 'oldest'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [draftStatusFilter, setDraftStatusFilter] = useState<CleaningTaskStatus | 'ALL'>('ALL');
  const [draftSourceFilter, setDraftSourceFilter] = useState<CleaningRequestSource | 'ALL'>('ALL');
  const [draftSortFilter, setDraftSortFilter] = useState<'newest' | 'oldest'>('newest');
  const [clusterFilter, setClusterFilter] = useState<string[]>(['ALL']);
  const [draftClusterFilter, setDraftClusterFilter] = useState<string[]>(['ALL']);
  const [bookingStatusFilter, setBookingStatusFilter] = useState<string[]>(['ALL']);
  const [draftBookingStatusFilter, setDraftBookingStatusFilter] = useState<string[]>(['ALL']);
  const [taskWindowMode, setTaskWindowMode] = useState<TaskWindowMode>('TODAY');
  const [includeTerminalStatuses] = useState(false);
  const [visibleTaskLimit, setVisibleTaskLimit] = useState(TASKS_PAGE_SIZE);
  const searchAnimation = useRef(new Animated.Value(0)).current;
  const realtimeReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsupportedStatusesRef = useRef<Set<string>>(new Set());
  const lastLoadMoreAtRef = useRef(0);

  const taskWindowRange = useMemo(() => {
    if (taskWindowMode === 'WEEK_WINDOW') {
      // Start from beginning of today, extend 7 days into the future only
      const from = toUtcPlus7DayRange(0).start;
      const to = toUtcPlus7DayRange(7).end;

      return {
        dueFrom: from.toISOString(),
        dueTo: to.toISOString(),
        label: `${formatUtcPlus7DateLabel(from)} - ${formatUtcPlus7DateLabel(to)}`,
      };
    }

    const todayRange = toUtcPlus7DayRange(0);
    // Extend dueTo to the start of tomorrow so that tasks with due_at = 00:00 next day
    // (i.e. tasks that START today but end exactly at midnight) are returned by the backend.
    // The client-side normalizedTasks filter then keeps only tasks whose start time is today.
    const tomorrowStart = toUtcPlus7DayRange(1).start;
    return {
      dueFrom: todayRange.start.toISOString(),
      dueTo: tomorrowStart.toISOString(),
      label: formatUtcPlus7DateLabel(todayRange.start),
    };
  }, [taskWindowMode]);

  const bookingStatusOptions = useMemo(() => {
    const dynamicStatuses = [
      ...new Set(
        tasks
          .map((task) => String(task.booking_status || '').trim().toUpperCase())
          .filter(Boolean),
      ),
    ];

    const knownSet = new Set(KNOWN_BOOKING_STATUSES);
    const extraStatuses = dynamicStatuses.filter((status) => !knownSet.has(status as typeof KNOWN_BOOKING_STATUSES[number]));

    return ['ALL', ...KNOWN_BOOKING_STATUSES, ...extraStatuses];
  }, [tasks]);

  const podNameMap = useMemo<Record<string, string>>(() => {
    return Object.fromEntries(
      tasks
        .map((task) => [String(task.pod_id || '').trim(), taskPodDisplayName(task)] as const)
        .filter(([id, label]) => Boolean(id && label)),
    );
  }, [tasks]);

  const podClusterNameMap = useMemo<Record<string, string>>(() => {
    return Object.fromEntries(
      tasks
        .map((task) => [String(task.pod_id || '').trim(), taskClusterDisplayName(task)] as const)
        .filter(([id, label]) => Boolean(id && label)),
    );
  }, [tasks]);

  const bookingNameMap = useMemo<Record<string, string>>(() => {
    return Object.fromEntries(
      tasks
        .map(
          (task) =>
            [
              String(task.booking_id || '').trim(),
              taskUserDisplayName(task) || taskBookingDisplayName(task),
            ] as const,
        )
        .filter(([id, label]) => Boolean(id && label)),
    );
  }, [tasks]);

  const bookingTimeMap = useMemo<Record<string, BookingTimeWindow>>(() => {
    return Object.fromEntries(
      tasks
        .map((task) => {
          const booking = task.booking as { start_time?: string; end_time?: string } | undefined;
          const bookingId = String(task.booking_id || '').trim();

          if (!bookingId) {
            return null;
          }

          const start = String(task.booking_start_time || booking?.start_time || '').trim();
          const end = String(task.booking_end_time || booking?.end_time || '').trim();

          if (!start && !end) {
            return null;
          }

          return [bookingId, { start_time: start || undefined, end_time: end || undefined }] as const;
        })
        .filter(Boolean) as Array<readonly [string, BookingTimeWindow]>,
    );
  }, [tasks]);

  const clusterOptions = useMemo(() => {
    const labels = [
      ...new Set(
        tasks
          .map((task) => taskClusterFilterValue(task, podClusterNameMap))
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, 'vi'));

    return ['ALL', ...labels];
  }, [tasks, podClusterNameMap]);

  const filteredTasks = useMemo<CleaningTask[]>(() => {
    const search = searchQuery.trim().toLowerCase();
    const byWindowMode = tasks.filter((task) => {
      if (taskWindowMode !== 'WEEK_WINDOW') return true;
      return String(task.status || '').trim().toUpperCase() !== 'CANCELLED';
    });

    const byBookingStatus = byWindowMode.filter((task) => {
      if (bookingStatusFilter.includes('ALL')) return true;
      const taskBookingStatus = String(task.booking_status || '').trim().toUpperCase();
      return bookingStatusFilter.includes(taskBookingStatus);
    });

    const byCluster = byBookingStatus.filter((task) => {
      if (clusterFilter.includes('ALL')) return true;
      const clusterValue = taskClusterFilterValue(task, podClusterNameMap);
      return clusterFilter.includes(clusterValue);
    });

    const bySearch = byCluster.filter((task) => {
      if (!search) return true;

      const podDisplay = String(
        podNameMap[String(task.pod_id || '')] || taskPodDisplayName(task) || '',
      ).toLowerCase();
      const bookingDisplay = String(
        taskUserDisplayName(task) ||
          bookingNameMap[String(task.booking_id || '')] ||
          taskBookingDisplayName(task) ||
          '',
      ).toLowerCase();
      const clusterDisplay = String(
        podClusterNameMap[String(task.pod_id || '')] ||
          taskClusterDisplayName(task) ||
          taskLocationDisplayName(task) ||
          '',
      ).toLowerCase();
      const bookingGuestDisplay = String(task.booking_guest_name || '').toLowerCase();
      const locationDisplay = String(task.location_name || '').toLowerCase();

      return (
        podDisplay.includes(search) ||
        clusterDisplay.includes(search) ||
        bookingDisplay.includes(search) ||
        bookingGuestDisplay.includes(search) ||
        locationDisplay.includes(search) ||
        String(task.pod_id || '').toLowerCase().includes(search) ||
        String(task.booking_id || '').toLowerCase().includes(search) ||
        String(task.status || '').toLowerCase().includes(search)
      );
    });

    return [...bySearch].sort((a, b) => {
      if (taskWindowMode === 'TODAY') {
        const priorityDiff = taskTodayPriority(a) - taskTodayPriority(b);
        if (priorityDiff !== 0) return priorityDiff;

        const startDiff = estimatedStartMs(a, bookingTimeMap) - estimatedStartMs(b, bookingTimeMap);
        if (startDiff !== 0) return startDiff;

        const aTime = new Date(resolveTaskDateTime(a)).getTime() || 0;
        const bTime = new Date(resolveTaskDateTime(b)).getTime() || 0;
        if (aTime !== bTime) return aTime - bTime;

        return taskId(a).localeCompare(taskId(b));
      }

      const aIsToday = isTaskToday(a);
      const bIsToday = isTaskToday(b);

      if (aIsToday !== bIsToday) {
        return aIsToday ? -1 : 1;
      }

      const aTime = new Date(resolveTaskDateTime(a)).getTime() || 0;
      const bTime = new Date(resolveTaskDateTime(b)).getTime() || 0;
      return sortFilter === 'newest' ? bTime - aTime : aTime - bTime;
    });
  }, [
    tasks,
    searchQuery,
    sortFilter,
    clusterFilter,
    bookingStatusFilter,
    podNameMap,
    podClusterNameMap,
    bookingNameMap,
    taskWindowMode,
    bookingTimeMap,
  ]);

  const visibleTasks = useMemo(() => {
    return filteredTasks;
  }, [filteredTasks]);

  const displayedTasks = useMemo(() => {
    return visibleTasks.slice(0, visibleTaskLimit);
  }, [visibleTasks, visibleTaskLimit]);

  const hasMoreToDisplay = displayedTasks.length < visibleTasks.length;

  const todayTaskCount = useMemo(() => {
    return tasks.filter((task) => {
      if (!isTaskToday(task)) return false;
      const status = String(task.status || '').toUpperCase();
      return status !== 'DONE' && status !== 'CANCELLED' && status !== 'MISSED';
    }).length;
  }, [tasks]);

  const todayDateLabel = useMemo(() => {
    return formatUtcPlus7DateLabel();
  }, []);

  const loadTasks = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      onLoadingChange?.(true);
    }
    setError(null);

    try {
      const todayRange = toUtcPlus7DayRange(0);
      const doneCountPromise = getMyCleaningTasks(token, {
        status: 'DONE',
        request_source: sourceFilter === 'ALL' ? undefined : sourceFilter,
        due_from: todayRange.start.toISOString(),
        due_to: todayRange.end.toISOString(),
      })
        .then((doneTasks) => doneTasks.length)
        .catch((error) => {
          const message = getErrorMessage(error);
          if (shouldHidePermissionMessage(message) || isInvalidStatusErrorMessage(message)) {
            return 0;
          }
          return null;
        });

      const commonQuery = {
        request_source: sourceFilter === 'ALL' ? undefined : sourceFilter,
        due_from: taskWindowRange.dueFrom,
        due_to: taskWindowRange.dueTo,
      };

      let data: CleaningTask[] = [];
      const selectedStatus = statusFilter === 'ALL' ? undefined : statusFilter;
      const selectedApiStatus = isApiCleaningTaskStatus(selectedStatus) ? selectedStatus : undefined;
      const shouldFetchAllStatusesForWeekWindow = taskWindowMode === 'WEEK_WINDOW' && statusFilter === 'ALL';

      if (shouldFetchAllStatusesForWeekWindow) {
        data = await getMyCleaningTasks(token, {
          ...commonQuery,
        });
      } else if (selectedApiStatus) {
        data = await getMyCleaningTasks(token, {
          ...commonQuery,
          status: selectedApiStatus,
        });
      } else if (includeTerminalStatuses) {
        data = await getMyCleaningTasks(token, {
          ...commonQuery,
        });
      } else {
        const statusesToFetch = DEFAULT_NON_TERMINAL_FETCH_STATUSES.filter(
          (status) => !unsupportedStatusesRef.current.has(status),
        );

        const settledResults = await Promise.allSettled(
          statusesToFetch.map((status) =>
            getMyCleaningTasks(token, {
              ...commonQuery,
              status,
            }),
          ),
        );

        const mergedTasks: CleaningTask[] = [];
        let firstFatalError: unknown = null;

        settledResults.forEach((result, index) => {
          const requestStatus = statusesToFetch[index];

          if (result.status === 'fulfilled') {
            mergedTasks.push(...result.value);
            return;
          }

          const message = getErrorMessage(result.reason);
          if (isInvalidStatusErrorMessage(message)) {
            unsupportedStatusesRef.current.add(requestStatus);
            return;
          }

          if (!firstFatalError) {
            firstFatalError = result.reason;
          }
        });

        if (firstFatalError) {
          throw firstFatalError;
        }

        const uniqueTaskMap = new Map<string, CleaningTask>();
        mergedTasks.forEach((task, index) => {
          const key = taskId(task) || `fallback-${index}`;
          if (!uniqueTaskMap.has(key)) {
            uniqueTaskMap.set(key, task);
          }
        });

        data = Array.from(uniqueTaskMap.values());
      }

      // In TODAY mode, client-side filter by actual start time.
      // taskWindowRange.dueTo is extended to tomorrow's start so the backend returns tasks
      // that start today but have due_at = 00:00 next day (cross-midnight tasks).
      // We then keep only tasks whose estimated_start_time / booking_start_time falls on today
      // and drop any genuine next-day tasks that the wider window pulled in.
      const todayDateKey = toUtcPlus7DateKey(todayRange.start.toISOString());
      const normalizedTasks =
        taskWindowMode === 'WEEK_WINDOW'
          ? data.filter((task) => String(task.status || '').trim().toUpperCase() !== 'CANCELLED')
          : data.filter((task) => {
              const startTimeStr = String(
                task.estimated_start_time || task.booking_start_time || '',
              ).trim();
              if (!startTimeStr) return true; // no start-time info – keep as-is
              return toUtcPlus7DateKey(startTimeStr) === todayDateKey;
            });

      setTasks(normalizedTasks);
      const nextDoneTodayCount = await doneCountPromise;
      if (nextDoneTodayCount !== null) {
        setDoneTodayCount(nextDoneTodayCount);
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
        onLoadingChange?.(false);
      }
    }
  }, [
    token,
    statusFilter,
    sourceFilter,
    includeTerminalStatuses,
    taskWindowMode,
    taskWindowRange.dueFrom,
    taskWindowRange.dueTo,
    onLoadingChange,
    onErrorChange,
  ]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const unsubscribe = subscribeCleanerRealtimeEvent((event) => {
      if (!shouldRefreshTasksFromEvent(event)) {
        return;
      }

      if (realtimeReloadTimer.current) {
        clearTimeout(realtimeReloadTimer.current);
      }
      realtimeReloadTimer.current = setTimeout(() => {
        realtimeReloadTimer.current = null;
        void loadTasks(true);
      }, 350);
    });

    return () => {
      if (realtimeReloadTimer.current) {
        clearTimeout(realtimeReloadTimer.current);
        realtimeReloadTimer.current = null;
      }

      unsubscribe();
    };
  }, [loadTasks, token]);

  useEffect(() => {
    Animated.timing(searchAnimation, {
      toValue: isSearchOpen ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [isSearchOpen, searchAnimation]);

  useEffect(() => {
    setVisibleTaskLimit(TASKS_PAGE_SIZE);
  }, [searchQuery, statusFilter, sourceFilter, sortFilter, clusterFilter, bookingStatusFilter, taskWindowMode, includeTerminalStatuses]);

  useEffect(() => {
    setVisibleTaskLimit((prev) => {
      const nextMax = Math.max(TASKS_PAGE_SIZE, visibleTasks.length);
      return Math.min(prev, nextMax);
    });
  }, [visibleTasks.length]);

  useEffect(() => {
    unsupportedStatusesRef.current.clear();
  }, [token]);

  useEffect(() => {
    onCountsChange?.(doneTodayCount, todayTaskCount);
  }, [doneTodayCount, todayTaskCount, onCountsChange]);

  const loadUrgentIncidents = useCallback(async () => {
    if (!token) return;
    setUrgentLoading(true);
    try {
      const all = await getMyCleanerIncidents(token, { incident_type: 'REPLENISHMENT_REQUEST' });
      const urgent = all.filter(
        (inc) => String(inc['replenishment_status'] || '').toUpperCase() === 'NOT_REPLENISHED',
      );
      setUrgentIncidents(urgent);
    } catch {
      // silent – not critical
    } finally {
      setUrgentLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadUrgentIncidents();
  }, [loadUrgentIncidents]);

  const loadMoreDisplayedTasks = useCallback(() => {
    setVisibleTaskLimit((prev) => {
      if (prev >= visibleTasks.length) {
        return prev;
      }
      return Math.min(prev + TASKS_PAGE_SIZE, visibleTasks.length);
    });
  }, [visibleTasks.length]);

  const handleTaskListScroll = useCallback(
    (event: any) => {
      if (loading || !hasMoreToDisplay) {
        return;
      }

      const nativeEvent = event?.nativeEvent;
      if (!nativeEvent) {
        return;
      }

      const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
      const distanceToBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);

      if (distanceToBottom > LOAD_MORE_TRIGGER_PX) {
        return;
      }

      const now = Date.now();
      if (now - lastLoadMoreAtRef.current < 300) {
        return;
      }

      lastLoadMoreAtRef.current = now;
      loadMoreDisplayedTasks();
    },
    [hasMoreToDisplay, loadMoreDisplayedTasks, loading],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadTasks(), loadUrgentIncidents()]);
    setRefreshing(false);
  };

  const openFilterModal = () => {
    setDraftStatusFilter(statusFilter);
    setDraftSourceFilter(sourceFilter);
    setDraftSortFilter(sortFilter);
    setDraftClusterFilter([...clusterFilter]);
    setDraftBookingStatusFilter([...bookingStatusFilter]);
    setIsFilterModalOpen(true);
  };

  const applyFilterModal = () => {
    setStatusFilter(draftStatusFilter);
    setSourceFilter(draftSourceFilter);
    setSortFilter(draftSortFilter);
    setClusterFilter(draftClusterFilter.length > 0 ? [...draftClusterFilter] : ['ALL']);
    setBookingStatusFilter(draftBookingStatusFilter.length > 0 ? [...draftBookingStatusFilter] : ['ALL']);
    setIsFilterModalOpen(false);
  };

  const resetFilterModal = () => {
    setDraftStatusFilter('ALL');
    setDraftSourceFilter('ALL');
    setDraftSortFilter('newest');
    setDraftClusterFilter(['ALL']);
    setDraftBookingStatusFilter(['ALL']);
  };

  const toggleDraftCluster = (clusterName: string) => {
    setDraftClusterFilter((prev) => {
      if (clusterName === 'ALL') {
        return ['ALL'];
      }

      const withoutAll = prev.filter((item) => item !== 'ALL');
      const exists = withoutAll.includes(clusterName);
      const next = exists ? withoutAll.filter((item) => item !== clusterName) : [...withoutAll, clusterName];

      return next.length > 0 ? next : ['ALL'];
    });
  };

  const toggleDraftBookingStatus = (status: string) => {
    setDraftBookingStatusFilter((prev) => {
      if (status === 'ALL') {
        return ['ALL'];
      }

      const withoutAll = prev.filter((item) => item !== 'ALL');
      const exists = withoutAll.includes(status);
      const next = exists ? withoutAll.filter((item) => item !== status) : [...withoutAll, status];

      return next.length > 0 ? next : ['ALL'];
    });
  };

  const searchContainerHeight = searchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 52],
  });

  const searchContainerOpacity = searchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const searchContainerTranslateY = searchAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [-10, 0],
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      onScroll={handleTaskListScroll}
      scrollEventThrottle={16}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
      <View style={styles.container}>
        {/* --- Urgent Incidents Section (REPLENISHMENT_REQUEST / NOT_REPLENISHED) --- */}
        {urgentLoading ? (
          <View style={styles.urgentLoadingRow}>
            <ActivityIndicator size="small" color="#dc2626" />
            <Text style={[styles.urgentLoadingText, { color: palette.textMuted }]}>Đang tải sự cố...</Text>
          </View>
        ) : urgentIncidents.length > 0 ? (
          <View style={[styles.urgentSection, { backgroundColor: isDark ? '#1a0a0a' : '#fff5f5', borderColor: isDark ? '#7f1d1d' : '#fecaca' }]}>
            <View style={styles.urgentHeader}>
              <MaterialIcons name="warning" size={15} color="#dc2626" />
              <Text style={[styles.urgentHeaderText, { color: '#dc2626' }]}>Sự cố cần xử lý gấp</Text>
              <View style={[styles.urgentBadge, { backgroundColor: '#dc2626' }]}>
                <Text style={styles.urgentBadgeText}>{urgentIncidents.length}</Text>
              </View>
            </View>
            {urgentIncidents.map((incident, index) => {
              const incidentId = String(incident.id || index);
              const cleaningTaskId = String(incident.cleaning_task_id || '').trim();
              const podName = String(incident.pod_name || (incident.cleaning_task as Record<string, unknown> | null)?.['pod_name'] || 'Pod').trim();
              const sv = incidentSeverityConfig(String(incident.severity || ''));
              const st = incidentStatusConfig(String(incident.status || ''));
              const detailCount = Array.isArray(incident.details) ? incident.details.length : 0;

              return (
                <Pressable
                  key={incidentId}
                  style={({ pressed }) => [
                    styles.urgentCard,
                    { backgroundColor: isDark ? '#1e1010' : '#ffffff', borderColor: isDark ? '#7f1d1d' : '#fecaca', opacity: pressed ? 0.92 : 1 },
                  ]}
                  onPress={() => {
                    if (!incidentId) return;
                    const qs = new URLSearchParams({ incidentId });
                    if (cleaningTaskId) qs.set('cleaningTaskId', cleaningTaskId);
                    router.push(`/incident/${encodeURIComponent(incidentId)}?${qs.toString()}` as never);
                  }}>
                  {/* Accent bar */}
                  <View style={[styles.urgentAccent, { backgroundColor: sv.color }]} />

                  <View style={styles.urgentCardInner}>
                    {/* Row 1: type pill + status pill */}
                    <View style={styles.urgentTopRow}>
                      <View style={[styles.urgentTypePill, { backgroundColor: isDark ? '#1e293b' : '#fef2f2' }]}>
                        <MaterialIcons name="build" size={10} color="#dc2626" />
                        <Text style={[styles.urgentTypePillText, { color: '#dc2626' }]}>Bổ sung vật tư</Text>
                      </View>
                      <View style={[styles.urgentStatusPill, { backgroundColor: st.bg }]}>
                        <MaterialIcons name={st.icon} size={11} color={st.color} />
                        <Text style={[styles.urgentStatusPillText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    </View>

                    {/* Row 2: pod + severity */}
                    <View style={styles.urgentPodRow}>
                      <MaterialIcons name="place" size={13} color={sv.color} />
                      <Text style={[styles.urgentPodName, { color: palette.text }]} numberOfLines={1}>{podName}</Text>
                      <View style={[styles.urgentSeverityChip, { backgroundColor: `${sv.color}18`, borderColor: `${sv.color}40` }]}>
                        <MaterialIcons name={sv.icon} size={10} color={sv.color} />
                        <Text style={[styles.urgentSeverityText, { color: sv.color }]}>{incidentSeverityLabel(String(incident.severity || ''))}</Text>
                      </View>
                    </View>

                    {/* Row 3: description */}
                    <Text style={[styles.urgentDesc, { color: palette.textMuted }]} numberOfLines={2}>
                      {String(incident.description || 'Không có mô tả')}
                    </Text>

                    {/* Footer */}
                    <View style={styles.urgentFooter}>
                      <View style={styles.urgentFooterLeft}>
                        {detailCount > 0 ? (
                          <View style={styles.urgentFooterChip}>
                            <MaterialIcons name="list-alt" size={11} color={palette.textMuted} />
                            <Text style={[styles.urgentFooterChipText, { color: palette.textMuted }]}>{detailCount} hạng mục</Text>
                          </View>
                        ) : null}
                        <View style={styles.urgentFooterChip}>
                          <MaterialIcons name="access-time" size={11} color={palette.textMuted} />
                          <Text style={[styles.urgentFooterChipText, { color: palette.textMuted }]}>{incidentFormatTime(String(incident.created_at || ''))}</Text>
                        </View>
                      </View>
                      <View style={[styles.urgentArrow, { backgroundColor: '#fee2e2' }]}>
                        <MaterialIcons name="arrow-forward-ios" size={11} color="#dc2626" />
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={[styles.segmentControl, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Pressable
            style={[styles.segmentItem, taskWindowMode === 'TODAY' && { backgroundColor: palette.primaryDark }]}
            onPress={() => setTaskWindowMode('TODAY')}>
            <MaterialIcons name="today" size={15} color={taskWindowMode === 'TODAY' ? palette.white : palette.textMuted} />
            <Text style={[styles.segmentText, { color: taskWindowMode === 'TODAY' ? palette.white : palette.textMuted }]}>
              Hôm nay
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segmentItem, taskWindowMode === 'WEEK_WINDOW' && { backgroundColor: palette.primaryDark }]}
            onPress={() => setTaskWindowMode('WEEK_WINDOW')}>
            <MaterialIcons name="date-range" size={15} color={taskWindowMode === 'WEEK_WINDOW' ? palette.white : palette.textMuted} />
            <Text style={[styles.segmentText, { color: taskWindowMode === 'WEEK_WINDOW' ? palette.white : palette.textMuted }]}>
              Tuần này
            </Text>
          </Pressable>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            style={[
              styles.iconButton,
              {
                backgroundColor: isSearchOpen ? palette.primaryBg : palette.surface,
                borderColor: isSearchOpen ? palette.primary : palette.border,
              },
            ]}
            onPress={() => setIsSearchOpen((prev) => !prev)}>
            <MaterialIcons name={isSearchOpen ? 'close' : 'search'} size={15} color={isSearchOpen ? palette.primary : palette.text} />
            <Text style={[styles.iconButtonText, { color: isSearchOpen ? palette.primary : palette.text }]}>Tìm kiếm</Text>
          </Pressable>

          <Pressable
            style={[styles.iconButton, { backgroundColor: palette.surface, borderColor: palette.border }]}
            onPress={openFilterModal}>
            <MaterialIcons name="tune" size={15} color={palette.text} />
            <Text style={[styles.iconButtonText, { color: palette.text }]}>Bộ lọc</Text>
          </Pressable>
        </View>

        <Animated.View
          style={[
            styles.searchAnimatedWrap,
            {
              height: searchContainerHeight,
              opacity: searchContainerOpacity,
              transform: [{ translateY: searchContainerTranslateY }],
              pointerEvents: isSearchOpen ? 'auto' : 'none',
            },
          ]}
          >
          <TextInput
            style={[
              styles.input,
              { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
            ]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Tìm theo pod, booking, trạng thái..."
            placeholderTextColor={palette.neutral500}
            autoCapitalize="none"
          />
        </Animated.View>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: palette.card, borderColor: palette.error }]}>
            <MaterialIcons name="error-outline" size={16} color={palette.error} />
            <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
          </View>
        )}

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={palette.primary} size="large" />
            <Text style={[styles.loadingText, { color: palette.textMuted }]}>Đang tải nhiệm vụ...</Text>
          </View>
        ) : visibleTasks.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIconCircle, { backgroundColor: palette.primaryBg }]}>
              <MaterialIcons name="assignment-turned-in" size={36} color={palette.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: palette.text }]}>Không có nhiệm vụ</Text>
            <Text style={[styles.emptySubtitle, { color: palette.textMuted }]}>
              {taskWindowMode === 'TODAY'
                ? 'Hôm nay bạn không có nhiệm vụ nào.'
                : 'Không có task nào trong khoảng ±1 tuần.'}
            </Text>
          </View>
        ) : (
          displayedTasks.map((task) => {
            const status = String(task.status || 'UNKNOWN');
            const key = taskId(task);
            const bookingWindow = taskBookingWindow(task, bookingTimeMap);
            const podLabel = resolvedPodLabel(task, podNameMap);
            const clusterOrLocationLabel = resolvedClusterOrLocationLabel(task, podClusterNameMap);
            const bookingLabel = resolvedBookingLabel(task, bookingNameMap);
            const estimatedStartText = resolvedEstimatedStartText(task, bookingWindow);
            const dueText = resolvedDueText(task, bookingWindow);

            const accentColor = statusColor(status, isDark);

            return (
              <Pressable
                key={key}
                onPress={() => {
                  if (String(task.status || '').toUpperCase() === 'DONE') {
                    router.push({ pathname: '/task/summary', params: { taskId: key } });
                  } else {
                    router.push({ pathname: '/task/[id]', params: { id: key } });
                  }
                }}
                style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
                <View style={[styles.cardAccent, { backgroundColor: accentColor }]} />
                <View style={styles.cardInner}>
                  <View style={styles.cardTopRow}>
                    <View style={[styles.statusPill, { backgroundColor: statusBadgeBackground(status, isDark) }]}>
                      <Text style={[styles.statusPillText, { color: statusBadgeText(status, isDark) }]}>
                        {statusLabel(status)}
                      </Text>
                    </View>
                    {task.request_source ? (
                      <View style={[styles.sourcePill, { backgroundColor: palette.secondaryBg, maxWidth: '55%' }]}>
                        <Text style={[styles.sourcePillText, { color: palette.secondaryDark }]} numberOfLines={1}>
                          {requestSourceLabel(String(task.request_source))}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={2}>
                    {podLabel}
                  </Text>

                  <View style={styles.metaBlock}>
                    <View style={styles.metaLine}>
                      <MaterialIcons name="apartment" size={14} color={palette.neutral500} />
                      <Text style={[styles.meta, { color: palette.textMuted }]} numberOfLines={1}>
                        {clusterOrLocationLabel}
                      </Text>
                    </View>
                    <View style={styles.metaLine}>
                      <MaterialIcons name="person-outline" size={14} color={palette.neutral500} />
                      <Text style={[styles.meta, { color: palette.textMuted }]} numberOfLines={1}>
                        {bookingLabel}
                      </Text>
                    </View>
                    <View style={styles.metaLine}>
                      <MaterialIcons name="schedule" size={14} color={palette.neutral500} />
                      <Text style={[styles.meta, { color: palette.textMuted }]} numberOfLines={1}>
                        {formatCompactTime(estimatedStartText)} – {formatCompactTime(dueText)}
                      </Text>
                    </View>
                  </View>

                  {(task.booking_status || task.pod_status) ? (
                    <View style={styles.chipRow}>
                      {task.booking_status ? (
                        <View style={[styles.chip, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                          <MaterialIcons name="book-online" size={11} color="#2563EB" />
                          <Text style={[styles.chipText, { color: '#2563EB' }]} numberOfLines={1}>
                            Đơn đặt pod: {bookingStatusLabel(String(task.booking_status))}
                          </Text>
                        </View>
                      ) : <View />}
                      {task.pod_status ? (
                        <View style={[styles.chip, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA', flexShrink: 1 }]}>
                          <MaterialIcons name="meeting-room" size={11} color="#EA580C" />
                          <Text style={[styles.chipText, { color: '#EA580C' }]} numberOfLines={1}>
                            Pod: {podStatusLabel(String(task.pod_status))}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        )}

        {!loading && visibleTasks.length > 0 ? (
          <View style={styles.paginationRow}>
            {hasMoreToDisplay ? (
              <>
                <MaterialIcons name="keyboard-arrow-down" size={14} color={palette.textMuted} />
                <Text style={[styles.pageText, { color: palette.textMuted }]}>
                  {`${displayedTasks.length}/${visibleTasks.length} — Kéo xuống để xem thêm`}
                </Text>
              </>
            ) : (
              <>
                <MaterialIcons name="check-circle" size={14} color={palette.success} />
                <Text style={[styles.pageText, { color: palette.textMuted }]}>
                  {`Đã hiển thị tất cả ${visibleTasks.length} nhiệm vụ`}
                </Text>
              </>
            )}
          </View>
        ) : null}
      </View>

      <Modal visible={isFilterModalOpen} transparent animationType="fade" onRequestClose={() => setIsFilterModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Bộ lọc nhiệm vụ</Text>
              <Pressable onPress={() => setIsFilterModalOpen(false)}>
                <MaterialIcons name="close" size={20} color={palette.textMuted} />
              </Pressable>
            </View>

            <Text style={[styles.filterLabel, { color: palette.textMuted }]}>Trạng thái</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {(['ALL', ...API_CLEANING_TASK_STATUSES] as const).map((status) => {
                const active = draftStatusFilter === status;
                return (
                  <Pressable
                    key={status}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active ? palette.primary : palette.surface,
                        borderColor: active ? palette.primary : palette.border,
                      },
                    ]}
                    onPress={() => setDraftStatusFilter(status)}>
                    <Text style={[styles.filterChipText, { color: active ? palette.white : palette.text }]}>
                      {status === 'ALL' ? 'Tất cả' : statusLabel(status)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.filterLabel, { color: palette.textMuted }]}>Nguồn yêu cầu</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {(['ALL', ...CLEANING_REQUEST_SOURCES] as const).map((source) => {
                const active = draftSourceFilter === source;
                return (
                  <Pressable
                    key={source}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active ? palette.primary : palette.surface,
                        borderColor: active ? palette.primary : palette.border,
                      },
                    ]}
                    onPress={() => setDraftSourceFilter(source)}>
                    <Text style={[styles.filterChipText, { color: active ? palette.white : palette.text }]}>
                      {source === 'ALL' ? 'Tất cả' : requestSourceLabel(source)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.filterLabel, { color: palette.textMuted }]}>Trạng thái booking</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {bookingStatusOptions.map((opt) => {
                const active = draftBookingStatusFilter.includes(opt);
                return (
                  <Pressable
                    key={opt}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active ? palette.primary : palette.surface,
                        borderColor: active ? palette.primary : palette.border,
                      },
                    ]}
                    onPress={() => toggleDraftBookingStatus(opt)}>
                    <Text style={[styles.filterChipText, { color: active ? palette.white : palette.text }]}>
                      {bookingStatusFilterLabel(opt)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.filterLabel, { color: palette.textMuted }]}>Sắp xếp</Text>
            <View style={styles.sortRow}>
              <Pressable
                style={[
                  styles.sortButton,
                  {
                    backgroundColor: draftSortFilter === 'newest' ? palette.primary : palette.surface,
                    borderColor: draftSortFilter === 'newest' ? palette.primary : palette.border,
                  },
                ]}
                onPress={() => setDraftSortFilter('newest')}>
                <Text style={[styles.sortButtonText, { color: draftSortFilter === 'newest' ? palette.white : palette.text }]}>Mới nhất</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.sortButton,
                  {
                    backgroundColor: draftSortFilter === 'oldest' ? palette.primary : palette.surface,
                    borderColor: draftSortFilter === 'oldest' ? palette.primary : palette.border,
                  },
                ]}
                onPress={() => setDraftSortFilter('oldest')}>
                <Text style={[styles.sortButtonText, { color: draftSortFilter === 'oldest' ? palette.white : palette.text }]}>Cũ nhất</Text>
              </Pressable>
            </View>

            <View style={styles.modalActionRow}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: palette.neutral300 }]}
                onPress={resetFilterModal}>
                <Text style={[styles.modalButtonText, { color: palette.neutral800 }]}>Đặt lại</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, { backgroundColor: palette.primary }]}
                onPress={applyFilterModal}>
                <Text style={[styles.modalButtonText, { color: palette.white }]}>Áp dụng</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    gap: spacingY._7,
  },

  // --- Summary Card ---
  summaryCard: {
    borderWidth: 1,
    borderRadius: radius._20,
    padding: spacingX._15,
    gap: spacingY._10,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._5,
  },
  summaryDateText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Fonts.sans,
    letterSpacing: 0.3,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
    gap: spacingY._5,
  },
  summaryStatNum: {
    fontSize: 36,
    fontWeight: '800',
    fontFamily: Fonts.sans,
    lineHeight: 40,
  },
  summaryStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  summaryDivider: {
    width: 1,
    height: 44,
  },
  progressContainer: {
    gap: spacingY._5,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  progressText: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    fontWeight: '600',
    textAlign: 'right',
  },

  // --- Urgent Incidents ---
  urgentLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._7,
    paddingVertical: spacingY._7,
  },
  urgentLoadingText: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  urgentSection: {
    borderRadius: radius._12,
    borderWidth: 1,
    overflow: 'hidden',
    gap: spacingY._7,
    padding: spacingX._10,
  },
  urgentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._5,
  },
  urgentHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    flex: 1,
  },
  urgentBadge: {
    borderRadius: radius.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  urgentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    color: '#ffffff',
  },
  urgentCard: {
    borderRadius: radius._10,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  urgentAccent: {
    width: 3,
  },
  urgentCardInner: {
    flex: 1,
    padding: spacingX._10,
    gap: spacingY._5,
  },
  urgentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._5,
  },
  urgentTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacingX._5,
    paddingVertical: 2,
    borderRadius: radius._6,
  },
  urgentTypePillText: {
    fontSize: 10,
    fontFamily: Fonts.sans,
    fontWeight: '700',
  },
  urgentStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacingX._5,
    paddingVertical: 2,
    borderRadius: radius._6,
  },
  urgentStatusPillText: {
    fontSize: 10,
    fontFamily: Fonts.sans,
    fontWeight: '700',
  },
  urgentPodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._5,
  },
  urgentPodName: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    flex: 1,
  },
  urgentSeverityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacingX._5,
    paddingVertical: 2,
    borderRadius: radius._6,
    borderWidth: 1,
  },
  urgentSeverityText: {
    fontSize: 10,
    fontFamily: Fonts.sans,
    fontWeight: '700',
  },
  urgentDesc: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    lineHeight: 16,
  },
  urgentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  urgentFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._10,
    flex: 1,
  },
  urgentFooterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  urgentFooterChipText: {
    fontSize: 10,
    fontFamily: Fonts.sans,
  },
  urgentArrow: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- Segment Control ---
  segmentControl: {
    flexDirection: 'row',
    borderRadius: radius._6,
    borderWidth: 1,
    padding: 2,
    gap: 2,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingX._5,
    paddingVertical: 4,
    borderRadius: radius._6,
  },
  segmentText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },

  // --- Actions Row ---
  actionsRow: {
    flexDirection: 'row',
    gap: spacingX._7,
  },
  iconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingX._5,
    borderWidth: 1,
    borderRadius: radius._6,
    paddingVertical: 4,
    flex: 1,
  },
  iconButtonText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },

  // --- Search ---
  searchAnimatedWrap: {
    overflow: 'hidden',
  },
  input: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
    fontSize: 12,
    fontFamily: Fonts.sans,
  },

  // --- Error Box ---
  errorBox: {
    borderWidth: 1,
    borderRadius: radius._10,
    padding: spacingX._10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._5,
  },
  errorText: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    fontWeight: '600',
    flex: 1,
  },

  // --- Loading ---
  loaderWrap: {
    paddingVertical: spacingY._20,
    alignItems: 'center',
    gap: spacingY._7,
  },
  loadingText: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },

  // --- Empty State ---
  emptyWrap: {
    paddingVertical: spacingY._25,
    alignItems: 'center',
    gap: spacingY._7,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacingY._5,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  emptySubtitle: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    textAlign: 'center',
    paddingHorizontal: spacingX._15,
  },

  // --- Task Card ---
  card: {
    borderWidth: 1,
    borderRadius: radius._12,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  cardAccent: {
    width: 3,
  },
  cardInner: {
    flex: 1,
    padding: spacingX._10,
    gap: spacingY._5,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusPill: {
    borderRadius: radius.full,
    paddingHorizontal: spacingX._7,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    lineHeight: 18,
  },
  metaBlock: {
    gap: spacingY._5,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._5,
  },
  metaTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._5,
  },
  meta: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    flex: 1,
  },
  sourcePill: {
    borderRadius: radius.full,
    paddingHorizontal: spacingX._5,
    paddingVertical: 2,
  },
  sourcePillText: {
    fontSize: 9,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._5,
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacingX._5,
    paddingVertical: 2,
  },
  chipText: {
    fontSize: 9,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },

  // --- Pagination ---
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingX._5,
    paddingVertical: 3,
  },
  pageText: {
    fontSize: 10,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },

  // --- Filter Modal ---
  filterGroup: {
    gap: spacingY._5,
  },
  activeFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingX._7,
  },
  activeFilterText: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  filterRow: {
    gap: spacingX._5,
    paddingRight: spacingX._7,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._5,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  sortRow: {
    flexDirection: 'row',
    gap: spacingX._7,
  },
  sortButton: {
    flex: 1,
    borderRadius: radius._10,
    borderWidth: 1,
    paddingVertical: spacingY._7,
    alignItems: 'center',
  },
  sortButtonText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: spacingX._15,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: radius._12,
    padding: spacingX._12,
    gap: spacingY._7,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: spacingX._7,
    marginTop: spacingY._5,
  },
  modalButton: {
    flex: 1,
    borderRadius: radius._10,
    paddingVertical: spacingY._7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
});
