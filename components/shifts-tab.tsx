import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import {
    checkinShift,
    checkoutShift,
    getMyAssignmentAttendanceStatus,
    getMyAttendanceLogs,
    getMyAttendanceLogsPaginated,
    getMyCleaningTasks,
    getMyShiftAssignments,
    getMyTodayAttendanceStatus,
} from '@/services/cleaner-dashboard.service';
import { subscribeCleanerRealtimeEvent } from '@/services/cleaner-realtime-bus';
import type {
    CleanerRealtimeNotification,
    CleaningTask,
    StaffAttendanceLog,
    StaffAttendanceLogListResponse,
    StaffShiftAssignment,
    StaffTodayAttendanceStatus,
} from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

interface ShiftsTabProps {
  token: string;
  userId?: string | null;
  isDark: boolean;
  palette: typeof Colors.light;
  onLoadingChange?: (loading: boolean) => void;
  onErrorChange?: (error: string | null) => void;
}

function formatDate(dateText?: string) {
  if (!dateText) return '-';
  const parsed = new Date(dateText);
  return Number.isNaN(parsed.getTime())
    ? dateText
    : parsed.toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateTime(dateText?: string) {
  if (!dateText) return '-';
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return dateText;

  const time = parsed.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const date = parsed.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return `${time} ${date}`;
}

function statusColor(status: string | undefined, isDark: boolean) {
  const normalized = (status || '').toUpperCase();
  if (normalized === 'CHECKED_IN') return isDark ? '#fbbf24' : '#d97706';
  if (normalized === 'COMPLETED') return isDark ? '#34d399' : '#10b981';
  if (normalized === 'ASSIGNED') return isDark ? '#60a5fa' : '#2563eb';
  if (normalized === 'ABSENT') return isDark ? '#fb7185' : '#e11d48';
  return isDark ? '#94a3b8' : '#64748b';
}

function assignmentId(assignment: StaffShiftAssignment) {
  return String(
    assignment.assignment_id || assignment.id || assignment.shift_assignment_id || assignment._id || '',
  );
}

function collectAssignmentIds(assignment: StaffShiftAssignment) {
  return [assignment.assignment_id, assignment.id, assignment.shift_assignment_id, assignment._id]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function toTimestamp(value?: string | null) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayDateInput() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function shiftLabel(assignment: StaffShiftAssignment) {
  return String(
    assignment.shift?.shift_name || assignment.shift?.name || 'Chưa rõ ca',
  );
}

function hasClearShiftAssignment(assignment: StaffShiftAssignment) {
  const shiftName = String(assignment.shift?.shift_name || assignment.shift?.name || '').trim();
  const startTime = String(assignment.start_time || assignment.shift?.start_time || '').trim();
  const endTime = String(assignment.end_time || assignment.shift?.end_time || '').trim();

  if (shiftName) return true;
  return Boolean(startTime && endTime);
}

function displayStatus(assignment: StaffShiftAssignment, attendance?: AssignmentAttendanceState) {
  if (assignment.checkout_at || attendance?.checkout_at) return 'COMPLETED';
  if (assignment.checkin_at || attendance?.checkin_at) return 'CHECKED_IN';
  return String(assignment.status || 'UNKNOWN').toUpperCase();
}

function assignmentDateLabel(assignment: StaffShiftAssignment) {
  const workDate = assignment.work_date;
  const startDate = assignment.start_date;
  const endDate = assignment.end_date;

  if (workDate) {
    return formatDate(workDate);
  }

  if (startDate && endDate) {
    const start = formatDate(startDate);
    const end = formatDate(endDate);
    return start === end ? start : `${start} - ${end}`;
  }

  if (startDate) return formatDate(startDate);
  if (endDate) return formatDate(endDate);
  return '-';
}

function assignmentDateWithCurrentLabel(assignment: StaffShiftAssignment, shiftDate: string) {
  const current = formatDate(shiftDate);
  const range = assignmentDateLabel(assignment);
  return `${current} (${range})`;
}

function assignmentStatusRank(status: string) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'CHECKED_IN') return 0;
  if (normalized === 'ASSIGNED') return 1;
  if (normalized === 'COMPLETED') return 2;
  if (normalized === 'ABSENT') return 3;
  return 4;
}

function assignmentDateSortValue(assignment: StaffShiftAssignment, fallbackDate?: string) {
  const dateText = String(
    assignment.work_date || assignment.start_date || assignment.end_date || fallbackDate || '',
  ).trim();
  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) return Number.MAX_SAFE_INTEGER;

  parsed.setHours(0, 0, 0, 0);
  return parsed.getTime();
}

function assignmentStartMinutes(assignment: StaffShiftAssignment) {
  const timeText = String(assignment.start_time || assignment.shift?.start_time || '').trim();
  const parts = parseTimeParts(timeText);
  if (!parts) return Number.MAX_SAFE_INTEGER;
  return parts.hours * 60 + parts.minutes;
}

type AssignmentAttendanceState = {
  checkin_at?: string;
  checkout_at?: string;
};

function canCheckin(assignment: StaffShiftAssignment, attendance?: AssignmentAttendanceState) {
  const status = String(assignment.status || '').toUpperCase();
  if (status === 'ABSENT' || status === 'COMPLETED') return false;
  if (assignment.checkin_at || attendance?.checkin_at) return false;
  if (assignment.checkout_at || attendance?.checkout_at) return false;
  return true;
}

function canCheckout(assignment: StaffShiftAssignment, attendance?: AssignmentAttendanceState) {
  const status = String(assignment.status || '').toUpperCase();
  if (status === 'ABSENT' || status === 'COMPLETED') return false;
  if (!assignment.checkin_at && !attendance?.checkin_at) return false;
  if (assignment.checkout_at || attendance?.checkout_at) return false;
  return true;
}

function shouldHidePermissionMessage(message: string) {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('không có quyền') ||
    normalized.includes('khong co quyen') ||
    normalized.includes('not allowed')
  );
}

function isDuplicateAttendanceError(message: string) {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('already checked in') ||
    normalized.includes('already checked out') ||
    normalized.includes('đã vào ca') ||
    normalized.includes('đã tan ca') ||
    normalized.includes('ban da vao ca truoc do') ||
    normalized.includes('ban da tan ca truoc do')
  );
}

function localizeShiftErrorMessage(message: string) {
  const normalized = String(message || '').toLowerCase();

  if (normalized.includes('not authorized. please login to access this resource')) {
    return 'Bạn chưa đăng nhập. Vui lòng đăng nhập để tiếp tục';
  }
  if (normalized.includes('user not found. token is invalid')) {
    return 'Không tìm thấy người dùng. Token không hợp lệ';
  }
  if (normalized.includes('your account has been deactivated')) {
    return 'Tài khoản của bạn đã bị vô hiệu hóa';
  }
  if (normalized.includes('invalid token. please login again')) {
    return 'Token không hợp lệ. Vui lòng đăng nhập lại';
  }
  if (normalized.includes('token expired. please login again')) {
    return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại';
  }
  if (normalized.includes('is not authorized to access this route')) {
    return 'Vai trò tài khoản của bạn không có quyền truy cập chức năng này';
  }
  if (normalized.includes('server error during authentication')) {
    return 'Lỗi máy chủ trong quá trình xác thực';
  }

  const checkedInAtMatch = normalized.match(/ban da vao ca truoc do luc\s+(.+)$/i);
  if (checkedInAtMatch?.[1]) return `Bạn đã vào ca trước đó lúc ${checkedInAtMatch[1]}`;

  const checkedOutAtMatch = normalized.match(/ban da tan ca truoc do luc\s+(.+)$/i);
  if (checkedOutAtMatch?.[1]) return `Bạn đã tan ca trước đó lúc ${checkedOutAtMatch[1]}`;

  if (normalized.includes('already checked in')) return 'Bạn đã vào ca rồi';
  if (normalized.includes('already checked out')) return 'Bạn đã tan ca rồi';
  if (normalized.includes('ban da vao ca truoc do')) return 'Bạn đã vào ca trước đó';
  if (normalized.includes('ban da tan ca truoc do')) return 'Bạn đã tan ca trước đó';
  if (normalized.includes('ca lam viec chua duoc cau hinh gio bat dau/ket thuc')) {
    return 'Ca làm việc chưa được cấu hình giờ bắt đầu/kết thúc';
  }
  if (normalized.includes('thieu shift_assignment_id') || normalized.includes('shift_assignment_id is required')) {
    return 'Thiếu mã phân công ca (shift_assignment_id)';
  }
  if (normalized.includes('khong tim thay thong tin nguoi dung')) {
    return 'Không tìm thấy thông tin người dùng';
  }
  if (normalized.includes('khong xac dinh duoc id nguoi dung')) {
    return 'Không xác định được ID người dùng';
  }
  if (normalized.includes('action khong hop le')) {
    return 'Action không hợp lệ. Chỉ chấp nhận CHECKIN hoặc CHECKOUT';
  }
  if (normalized.includes('must check in before check out')) return 'Bạn cần vào ca trước khi tan ca';
  if (normalized.includes('ban can vao ca truoc khi tan ca')) return 'Bạn cần vào ca trước khi tan ca';
  const checkinStatusMatch = normalized.match(/cannot check in assignment with status\s+(.+)$/i);
  if (checkinStatusMatch?.[1]) {
    return `Không thể vào ca khi phân công đang ở trạng thái ${checkinStatusMatch[1].toUpperCase()}`;
  }
  const checkinStatusViMatch = normalized.match(/khong the vao ca khi phan cong dang o trang thai\s+(.+)$/i);
  if (checkinStatusViMatch?.[1]) {
    return `Không thể vào ca khi phân công đang ở trạng thái ${checkinStatusViMatch[1].toUpperCase()}`;
  }
  const checkoutStatusMatch = normalized.match(/cannot check out assignment with status\s+(.+)$/i);
  if (checkoutStatusMatch?.[1]) {
    return `Không thể tan ca khi phân công đang ở trạng thái ${checkoutStatusMatch[1].toUpperCase()}`;
  }
  const checkoutStatusViMatch = normalized.match(/khong the tan ca khi phan cong dang o trang thai\s+(.+)$/i);
  if (checkoutStatusViMatch?.[1]) {
    return `Không thể tan ca khi phân công đang ở trạng thái ${checkoutStatusViMatch[1].toUpperCase()}`;
  }
  if (normalized.includes('outside the allowed check-in/check-out window')) {
    return 'Hiện tại chưa nằm trong khung giờ cho phép chấm công';
  }
  if (normalized.includes('thoi diem hien tai nam ngoai khung gio cho phep vao ca/tan ca')) {
    return 'Hiện tại chưa nằm trong khung giờ cho phép chấm công';
  }
  if (normalized.includes('check-in is only allowed')) {
    return 'Chỉ được vào ca trong khoảng 30 phút trước giờ bắt đầu đến hết giờ kết thúc ca';
  }
  if (normalized.includes('chi duoc vao ca tu 30 phut truoc gio bat dau den het gio ket thuc ca')) {
    return 'Chỉ được vào ca trong khoảng 30 phút trước giờ bắt đầu đến hết giờ kết thúc ca';
  }
  if (normalized.includes('check-out is only allowed')) {
    return 'Chỉ được tan ca trong thời gian ca làm và tối đa 180 phút sau khi kết thúc ca';
  }
  if (normalized.includes('chi duoc tan ca trong thoi gian ca va toi da 180 phut sau khi ket thuc ca')) {
    return 'Chỉ được tan ca trong thời gian ca làm và tối đa 180 phút sau khi kết thúc ca';
  }
  if (normalized.includes('shift assignment not found')) return 'Không tìm thấy phân công ca';
  if (normalized.includes('khong tim thay phan cong ca')) return 'Không tìm thấy phân công ca';
  if (normalized.includes('date khong hop le')) return 'Ngày không hợp lệ, định dạng đúng là YYYY-MM-DD';
  if (normalized.includes('from_date khong hop le')) return 'from_date không hợp lệ, định dạng đúng là YYYY-MM-DD';
  if (normalized.includes('to_date khong hop le')) return 'to_date không hợp lệ, định dạng đúng là YYYY-MM-DD';
  if (normalized.includes('ngay ban dang thao tac') && normalized.includes('khong dung voi ngay co the cham cong hien tai')) {
    return 'Ngày bạn đang thao tác không khớp với ngày có thể chấm công tại thời điểm hiện tại';
  }
  if (normalized.includes('ban khong co quyen vao ca cho phan cong nay')) {
    return 'Bạn không có quyền vào ca cho phân công này';
  }
  if (normalized.includes('ban khong co quyen tan ca cho phan cong nay')) {
    return 'Bạn không có quyền tan ca cho phân công này';
  }
  if (normalized.includes('ban khong co quyen xem phan cong ca nay')) {
    return 'Bạn không có quyền xem phân công ca này';
  }
  if (normalized.includes('not allowed')) return 'Bạn không có quyền thao tác ca này';
  if (normalized.includes('khong co quyen')) return 'Bạn không có quyền thao tác ca này';
  if (normalized.includes('invalid attendance timeline')) return 'Mốc thời gian chấm công không hợp lệ';
  if (normalized.includes('du lieu cham cong khong hop le')) {
    return 'Dữ liệu chấm công không hợp lệ: tan ca không thể xảy ra trước vào ca';
  }

  return message;
}

function statusBadgeMeta(status: string, isDark: boolean) {
  const normalized = status.toUpperCase();

  if (normalized === 'CHECKED_IN') {
    return {
      label: 'Đã vào ca',
      bg: isDark ? '#78350f' : '#fef3c7',
      text: isDark ? '#fde68a' : '#92400e',
    };
  }

  if (normalized === 'COMPLETED') {
    return {
      label: 'Đã tan ca',
      bg: isDark ? '#14532d' : '#dcfce7',
      text: isDark ? '#86efac' : '#166534',
    };
  }

  if (normalized === 'ASSIGNED') {
    return {
      label: 'Chờ vào ca',
      bg: isDark ? '#1e3a8a' : '#dbeafe',
      text: isDark ? '#bfdbfe' : '#1d4ed8',
    };
  }

  if (normalized === 'ABSENT') {
    return {
      label: 'Vắng mặt',
      bg: isDark ? '#881337' : '#ffe4e6',
      text: isDark ? '#fda4af' : '#be123c',
    };
  }

  return {
    label: normalized,
    bg: isDark ? '#334155' : '#e2e8f0',
    text: isDark ? '#cbd5e1' : '#475569',
  };
}

function systemStatusText(status: string) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'ASSIGNED') return 'Chưa chấm công';
  if (normalized === 'CHECKED_IN') return 'Đã vào ca';
  if (normalized === 'COMPLETED') return 'Đã tan ca';
  if (normalized === 'ABSENT') return 'Vắng mặt';
  if (!normalized) return 'Không xác định';
  return normalized;
}

function confirmShiftAction(action: 'checkin' | 'checkout') {
  const title = action === 'checkin' ? 'Xac nhan vao ca' : 'Xac nhan tan ca';
  const message =
    action === 'checkin'
      ? 'Ban muon vao ca cho lich nay?'
      : 'Ban muon tan ca? Sau khi tan ca, ban se khong the tiep tuc xu ly task neu BE yeu cau trang thai CHECKIN moi nhat.';

  if (Platform.OS === 'web') {
    const confirmed = window.confirm(`${title}\n\n${message}`);
    return Promise.resolve(Boolean(confirmed));
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      {
        text: 'Huy',
        style: 'cancel',
        onPress: () => resolve(false),
      },
      {
        text: action === 'checkin' ? 'Vao ca' : 'Tan ca',
        style: action === 'checkout' ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

const FINISHED_TASK_STATUSES = new Set(['DONE', 'CANCELLED', 'MISSED']);
// Temporary testing override: relax FE-side check-in/check-out gate.
const CHECKIN_EARLY_MINUTES = 24 * 60;
const CHECKOUT_LATE_MINUTES = 24 * 60;

function parseTimeParts(timeValue?: string) {
  const text = String(timeValue || '').trim();
  const match = text.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    Number.isNaN(seconds) ||
    hours > 23 ||
    minutes > 59 ||
    seconds > 59
  ) {
    return null;
  }

  return { hours, minutes, seconds };
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function withTime(baseDate: Date, parts: { hours: number; minutes: number; seconds: number }) {
  const date = new Date(baseDate);
  date.setHours(parts.hours, parts.minutes, parts.seconds, 0);
  return date;
}

function resolveActionableWorkDate(assignment: StaffShiftAssignment, now = new Date()) {
  const startParts = parseTimeParts(String(assignment.start_time || assignment.shift?.start_time || ''));
  const endParts = parseTimeParts(String(assignment.end_time || assignment.shift?.end_time || ''));
  const startDate = assignment.start_date ? new Date(String(assignment.start_date)) : null;
  const endDate = assignment.end_date ? new Date(String(assignment.end_date)) : null;

  if (!startParts || !endParts || !startDate || !endDate) return null;
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;

  const assignmentStart = startOfDay(startDate);
  const assignmentEnd = endOfDay(endDate);
  const today = startOfDay(now);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const candidates = [today, yesterday];

  for (const day of candidates) {
    if (day < assignmentStart || day > assignmentEnd) continue;

    const shiftStart = withTime(day, startParts);
    let shiftEnd = withTime(day, endParts);
    if (shiftEnd <= shiftStart) {
      shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    const gateStart = new Date(shiftStart.getTime() - CHECKIN_EARLY_MINUTES * 60 * 1000);
    const gateEnd = new Date(shiftEnd.getTime() + CHECKOUT_LATE_MINUTES * 60 * 1000);
    if (now >= gateStart && now <= gateEnd) {
      return toDateKey(shiftStart.toISOString());
    }
  }

  return null;
}

function toDateKey(value?: string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function taskDateValue(task: CleaningTask) {
  return String(
    task.due_at ||
      task.booking_end_time ||
      task.booking_start_time ||
      task.assigned_at ||
      task.created_at ||
      '',
  ).trim();
}

function pendingTaskStatusLabel(status: string) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'ASSIGNED') return 'Đã phân công';
  if (normalized === 'ACCEPTED') return 'Đã nhận';
  if (normalized === 'IN_PROGRESS') return 'Đang dọn';
  if (!normalized) return 'Không xác định';
  return normalized.replace(/_/g, ' ');
}

function confirmCheckoutWithPendingTasks(pendingTasks: CleaningTask[]) {
  if (pendingTasks.length === 0) {
    return confirmShiftAction('checkout');
  }

  const uniquePods = new Set(
    pendingTasks
      .map((task) => String(task.pod_id || '').trim())
      .filter(Boolean),
  ).size;

  const statusSummary = Object.entries(
    pendingTasks.reduce<Record<string, number>>((acc, task) => {
      const status = String(task.status || 'UNKNOWN').toUpperCase();
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `${pendingTaskStatusLabel(status)}: ${count}`)
    .join(', ');

  const message = [
    `Hôm nay bạn còn ${pendingTasks.length} task chưa hoàn thành${uniquePods > 0 ? ` tại ${uniquePods} pod` : ''}.`,
    statusSummary ? `Trạng thái hiện tại: ${statusSummary}.` : '',
    'Nếu tan ca lúc này, bạn có thể bỏ sót công việc.',
    'Bạn vẫn muốn tan ca?',
  ]
    .filter(Boolean)
    .join('\n\n');

  if (Platform.OS === 'web') {
    const confirmed = window.confirm(`Cảnh báo task chưa xong\n\n${message}`);
    return Promise.resolve(Boolean(confirmed));
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert('Cảnh báo task chưa xong', message, [
      {
        text: 'Quay lại task',
        style: 'cancel',
        onPress: () => resolve(false),
      },
      {
        text: 'Vẫn tan ca',
        style: 'destructive',
        onPress: () => resolve(true),
      },
    ]);
  });
}

function shouldRefreshShiftsFromEvent(event: CleanerRealtimeNotification) {
  const eventCode = String(event.event || '').trim().toUpperCase();
  const payload = (event.payload || {}) as Record<string, unknown>;
  const payloadEvent = String(payload.event_code || payload.event || '').trim().toUpperCase();
  const mergedCode = eventCode || payloadEvent;

  if (!mergedCode) {
    return true;
  }

  if (mergedCode.startsWith('SHIFT_') || mergedCode.startsWith('CLEANING_TASK_')) {
    return true;
  }

  return false;
}

export default function ShiftsTab({
  token,
  userId,
  isDark,
  palette,
  onLoadingChange,
  onErrorChange,
}: ShiftsTabProps) {
  const [assignments, setAssignments] = useState<StaffShiftAssignment[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<StaffAttendanceLog[]>([]);
  const [assignmentAttendanceMap, setAssignmentAttendanceMap] = useState<
    Record<string, AssignmentAttendanceState>
  >({});
  const [todayAttendanceStatus, setTodayAttendanceStatus] = useState<StaffTodayAttendanceStatus | null>(null);
  const [shiftDate, setShiftDate] = useState(todayDateInput());
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<StaffAttendanceLog[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const realtimeReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const assignmentOverlapsDate = useCallback((assignment: StaffShiftAssignment, dateText: string) => {
    const selectedDate = new Date(`${dateText}T00:00:00`);
    if (Number.isNaN(selectedDate.getTime())) return true;

    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);

    const start = assignment.start_date ? new Date(String(assignment.start_date)) : null;
    const end = assignment.end_date ? new Date(String(assignment.end_date)) : null;

    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return true;
    }

    return start <= dayEnd && end >= dayStart;
  }, []);

  const attendanceByAssignmentId = useMemo<Record<string, AssignmentAttendanceState>>(() => {
    return assignments.reduce<Record<string, AssignmentAttendanceState>>((acc, assignment) => {
      const id = assignmentId(assignment);
      const fromStatusApi = assignmentAttendanceMap[id];
      if (fromStatusApi?.checkin_at || fromStatusApi?.checkout_at) {
        acc[id] = fromStatusApi;
        return acc;
      }

      const ids = collectAssignmentIds(assignment);
      if (ids.length === 0) return acc;

      const logs = attendanceLogs.filter((log) => {
        const logAssignmentId = String(log.shift_assignment_id || '').trim();
        return logAssignmentId && ids.includes(logAssignmentId);
      });

      if (logs.length === 0) return acc;

      const latestCheckin = logs
        .filter((log) => String(log.action || '').toUpperCase() === 'CHECKIN')
        .sort((a, b) => toTimestamp(b.created_at as string | undefined) - toTimestamp(a.created_at as string | undefined))[0];

      const latestCheckout = logs
        .filter((log) => String(log.action || '').toUpperCase() === 'CHECKOUT')
        .sort((a, b) => toTimestamp(b.created_at as string | undefined) - toTimestamp(a.created_at as string | undefined))[0];

      acc[id] = {
        checkin_at: String(latestCheckin?.created_at || '').trim() || undefined,
        checkout_at: String(latestCheckout?.created_at || '').trim() || undefined,
      };

      return acc;
    }, {});
  }, [assignments, attendanceLogs, assignmentAttendanceMap]);

  const sortedAssignments = useMemo(() => {
    const next = [...assignments];

    next.sort((left, right) => {
      const leftAttendance = attendanceByAssignmentId[assignmentId(left)];
      const rightAttendance = attendanceByAssignmentId[assignmentId(right)];
      const leftStatus = displayStatus(left, leftAttendance);
      const rightStatus = displayStatus(right, rightAttendance);

      const statusDiff = assignmentStatusRank(leftStatus) - assignmentStatusRank(rightStatus);
      if (statusDiff !== 0) return statusDiff;

      const dateDiff =
        assignmentDateSortValue(left, shiftDate) - assignmentDateSortValue(right, shiftDate);
      if (dateDiff !== 0) return dateDiff;

      const timeDiff = assignmentStartMinutes(left) - assignmentStartMinutes(right);
      if (timeDiff !== 0) return timeDiff;

      return shiftLabel(left).localeCompare(shiftLabel(right), 'vi');
    });

    return next;
  }, [assignments, attendanceByAssignmentId, shiftDate]);

  const loadShifts = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      onLoadingChange?.(true);
    }
    setError(null);

    try {
      let dailyStatus: StaffTodayAttendanceStatus | null = null;
      try {
        dailyStatus = await getMyTodayAttendanceStatus(token, shiftDate);
      } catch {
        dailyStatus = null;
      }

      let assignmentData = await getMyShiftAssignments(token, {
        work_date: shiftDate,
      });

      if (assignmentData.length === 0) {
        const unfilteredAssignments = await getMyShiftAssignments(token);
        assignmentData = unfilteredAssignments.filter((assignment) =>
          assignmentOverlapsDate(assignment, shiftDate),
        );
      }

      assignmentData = assignmentData.filter(hasClearShiftAssignment);

      let myAttendanceLogs: StaffAttendanceLog[] = [];
      const byAssignmentStatus: Record<string, AssignmentAttendanceState> = {};

      if (assignmentData.length > 0) {
        try {
          const statusEntries = await Promise.all(
            assignmentData.map(async (assignment) => {
              const id = assignmentId(assignment);
              if (!id) return null;

              try {
                const status = await getMyAssignmentAttendanceStatus(token, {
                  shift_assignment_id: id,
                  date: shiftDate,
                });

                return {
                  id,
                  state: {
                    checkin_at: String(status.checkin_at || '').trim() || undefined,
                    checkout_at: String(status.checkout_at || '').trim() || undefined,
                  },
                };
              } catch {
                return null;
              }
            }),
          );

          statusEntries.forEach((entry) => {
            if (!entry) return;
            byAssignmentStatus[entry.id] = entry.state;
          });
        } catch {
          // Keep fallback based on /me logs.
        }

        try {
          const logsByAssignment = await Promise.all(
            assignmentData.map(async (assignment) => {
              const id = assignmentId(assignment);
              if (!id) return [] as StaffAttendanceLog[];

              try {
                return await getMyAttendanceLogs(token, {
                  shift_assignment_id: id,
                  from_date: shiftDate,
                  to_date: shiftDate,
                  limit: 50,
                });
              } catch {
                return [] as StaffAttendanceLog[];
              }
            }),
          );

          const merged = logsByAssignment.flat();
          const uniqueByKey = new Map<string, StaffAttendanceLog>();
          merged.forEach((log) => {
            const key = String(log.id || log._id || `${log.shift_assignment_id}-${log.action}-${log.created_at}`);
            uniqueByKey.set(key, log);
          });
          myAttendanceLogs = Array.from(uniqueByKey.values());
        } catch {
          myAttendanceLogs = [];
        }
      }

      setAssignments(assignmentData);
      setAttendanceLogs(myAttendanceLogs);
      setAssignmentAttendanceMap(byAssignmentStatus);
      setTodayAttendanceStatus(dailyStatus);
      onErrorChange?.(null);
    } catch (err) {
      const rawMsg = getErrorMessage(err);
      const msg = localizeShiftErrorMessage(rawMsg);
      if (shouldHidePermissionMessage(rawMsg)) {
        setError(null);
        onErrorChange?.(null);
      } else if (isDuplicateAttendanceError(rawMsg)) {
        setError(msg);
        onErrorChange?.(msg);
        await loadShifts();
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
  }, [token, shiftDate, onLoadingChange, onErrorChange, assignmentOverlapsDate]);

  const handleAction = async (action: 'checkin' | 'checkout', assignment: StaffShiftAssignment) => {
    setError(null);
    onErrorChange?.(null);

    const targetId = assignmentId(assignment);
    if (!targetId) {
      setError('Không xác định được shift_assignment_id');
      return;
    }

    let confirmed = false;
    if (action === 'checkout') {
      try {
        const allTasks = await getMyCleaningTasks(token);
        const pendingTodayTasks = allTasks.filter((task) => {
          const status = String(task.status || '').toUpperCase();
          const isPending = !FINISHED_TASK_STATUSES.has(status);
          const inShiftDate = toDateKey(taskDateValue(task)) === toDateKey(shiftDate);
          return isPending && inShiftDate;
        });

        confirmed = await confirmCheckoutWithPendingTasks(pendingTodayTasks);
      } catch {
        confirmed = await confirmShiftAction(action);
      }
    } else {
      confirmed = await confirmShiftAction(action);
    }

    if (!confirmed) {
      return;
    }

    setActionLoading(`${assignmentId(assignment)}-${action}`);

    try {
      if (action === 'checkin') {
        await checkinShift(token, targetId, shiftDate);
      } else {
        await checkoutShift(token, targetId, shiftDate);
      }
      await loadShifts(true);
    } catch (err) {
      const rawMsg = getErrorMessage(err);
      const msg = localizeShiftErrorMessage(rawMsg);
      if (shouldHidePermissionMessage(rawMsg)) {
        setError(null);
        onErrorChange?.(null);
      } else {
        setError(msg);
        onErrorChange?.(msg);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const disableAllActions = loading || actionLoading !== null;

  useEffect(() => {
    void loadShifts();
  }, [loadShifts]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const unsubscribe = subscribeCleanerRealtimeEvent((event) => {
      if (!shouldRefreshShiftsFromEvent(event)) {
        return;
      }

      if (realtimeReloadTimer.current) {
        clearTimeout(realtimeReloadTimer.current);
      }
      realtimeReloadTimer.current = setTimeout(() => {
        realtimeReloadTimer.current = null;
        void loadShifts(true);
      }, 350);
    });

    return () => {
      if (realtimeReloadTimer.current) {
        clearTimeout(realtimeReloadTimer.current);
        realtimeReloadTimer.current = null;
      }

      unsubscribe();
    };
  }, [loadShifts, token]);

  const loadHistoryPage = useCallback(
    async (page: number, append: boolean) => {
      if (append) {
        setHistoryLoadingMore(true);
      } else {
        setHistoryLoading(true);
      }

      try {
        const result: StaffAttendanceLogListResponse = await getMyAttendanceLogsPaginated(token, {
          page,
          limit: 10,
        });

        const nextLogs = result.data || [];
        setHistoryLogs((prev) => (append ? [...prev, ...nextLogs] : nextLogs));
        setHistoryPage(result.pagination?.page || page);
        setHistoryTotalPages(result.pagination?.pages || 1);
        setHistoryError(null);
      } catch (err) {
        setHistoryError(localizeShiftErrorMessage(getErrorMessage(err)));
      } finally {
        if (append) {
          setHistoryLoadingMore(false);
        } else {
          setHistoryLoading(false);
        }
      }
    },
    [token],
  );

  const openHistoryModal = useCallback(() => {
    setHistoryVisible(true);
    setHistoryPage(1);
    setHistoryTotalPages(1);
    void loadHistoryPage(1, false);
  }, [loadHistoryPage]);

  const canLoadMoreHistory = historyPage < historyTotalPages && !historyLoading && !historyLoadingMore;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={styles.container}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: palette.text }]}>Lịch làm việc của tôi</Text>
          <Pressable
            style={[styles.historyButton, { backgroundColor: palette.surface, borderColor: palette.border }]}
            onPress={openHistoryModal}>
            <Text style={[styles.historyButtonText, { color: palette.primary }]}>Lịch sử</Text>
          </Pressable>
        </View>

        <TextInput
          style={[
            styles.input,
            { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
          ]}
          value={shiftDate}
          onChangeText={setShiftDate}
          placeholder="ngày_làm_việc (YYYY-MM-DD)"
          placeholderTextColor={palette.neutral500}
          autoCapitalize="none"
        />

        <Pressable
          style={[styles.button, { backgroundColor: palette.primary }]}
          onPress={() => void loadShifts()}>
          <Text style={[styles.buttonText, { color: palette.white }]}>Tải dữ liệu</Text>
        </Pressable>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: palette.card, borderColor: palette.error }]}>
            <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
          </View>
        )}

        {todayAttendanceStatus && (
          <View style={[styles.summaryCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.summaryTitle, { color: palette.text }]}>Tổng quan chấm công ngày {formatDate(shiftDate)}</Text>
            <Text style={[styles.summaryText, { color: palette.textMuted }]}>Đã vào ca: {todayAttendanceStatus.checked_in_today ? 'Có' : 'Chưa'}</Text>
            <Text style={[styles.summaryText, { color: palette.textMuted }]}>Đã tan ca: {todayAttendanceStatus.checked_out_today ? 'Có' : 'Chưa'}</Text>
            <Text style={[styles.summaryText, { color: palette.textMuted }]}>Số lần check-in/check-out: {todayAttendanceStatus.checkin_count}/{todayAttendanceStatus.checkout_count}</Text>
            <Text style={[styles.summaryText, { color: palette.textMuted }]}>
              Mốc gần nhất: In {formatDateTime(todayAttendanceStatus.latest_checkin_at || '')} | Out {formatDateTime(todayAttendanceStatus.latest_checkout_at || '')}
            </Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={palette.primary} style={styles.loader} />
        ) : sortedAssignments.length === 0 ? (
          <Text style={[styles.emptyText, { color: palette.textMuted }]}>Không có ca làm việc nào.</Text>
        ) : (
          sortedAssignments.map((assignment) => {
            const attendanceState = attendanceByAssignmentId[assignmentId(assignment)];
            const status = displayStatus(assignment, attendanceState);
            const statusBadge = statusBadgeMeta(status, isDark);
            const key = assignmentId(assignment);
            const actionableWorkDate = resolveActionableWorkDate(assignment);
            const selectedDateKey = toDateKey(shiftDate);
            const isWrongSelectedDate =
              Boolean(actionableWorkDate) && selectedDateKey !== actionableWorkDate;
            const checkinDisabled =
              disableAllActions || isWrongSelectedDate || !canCheckin(assignment, attendanceState);
            const checkoutDisabled =
              disableAllActions || isWrongSelectedDate || !canCheckout(assignment, attendanceState);

            return (
              <View
                key={key}
                style={[
                  styles.card,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: palette.text }]}>{shiftLabel(assignment)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: statusBadge.text }]}>{statusBadge.label}</Text>
                  </View>
                </View>

                <Text style={[styles.meta, { color: statusColor(status, isDark) }]}>
                  Trạng thái hệ thống: {systemStatusText(status)}
                </Text>

                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Ngày: {assignmentDateWithCurrentLabel(assignment, shiftDate)}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Ca: {shiftLabel(assignment)}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Khu vực: {String(assignment.location?.name || '-')}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Giờ check-in: {formatDateTime(assignment.checkin_at || attendanceState?.checkin_at)}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Giờ check-out: {formatDateTime(assignment.checkout_at || attendanceState?.checkout_at)}
                </Text>

                {isWrongSelectedDate && (
                  <Text style={[styles.meta, { color: palette.warning || '#d97706' }]}>
                    Bạn đang xem ngày {formatDate(shiftDate)}. Hiện tại chỉ có thể chấm công cho ngày {formatDate(actionableWorkDate || '')}.
                  </Text>
                )}

                <View style={styles.buttonRow}>
                  <Pressable
                    style={[styles.actionButton, { backgroundColor: palette.secondary }]}
                    disabled={checkinDisabled}
                    onPress={() => void handleAction('checkin', assignment)}>
                    <Text
                      style={[
                        styles.actionButtonText,
                        { color: checkinDisabled ? palette.textMuted : palette.primaryDark },
                      ]}>
                      Vao ca
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, { backgroundColor: palette.primaryDark }]}
                    disabled={checkoutDisabled}
                    onPress={() => void handleAction('checkout', assignment)}>
                    <Text
                      style={[
                        styles.actionButtonText,
                        { color: checkoutDisabled ? palette.textMuted : palette.white },
                      ]}>
                      Tan ca
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>

      <Modal
        visible={historyVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setHistoryVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Lịch sử ca</Text>
              <Pressable onPress={() => setHistoryVisible(false)}>
                <Text style={[styles.closeText, { color: palette.textMuted }]}>Đóng</Text>
              </Pressable>
            </View>

            {historyError ? (
              <View style={[styles.errorBox, { backgroundColor: palette.card, borderColor: palette.error }]}>
                <Text style={[styles.errorText, { color: palette.error }]}>{historyError}</Text>
              </View>
            ) : null}

            {historyLoading ? (
              <ActivityIndicator color={palette.primary} style={styles.loader} />
            ) : historyLogs.length === 0 ? (
              <Text style={[styles.emptyText, { color: palette.textMuted }]}>Chưa có log check-in/check-out.</Text>
            ) : (
              <ScrollView style={styles.historyList}>
                {historyLogs.map((log) => {
                  const rowKey = String(
                    log.id || log._id || `${log.shift_assignment_id}-${log.action}-${log.created_at}`,
                  );
                  const action = String(log.action || '-').toUpperCase();
                  return (
                    <View
                      key={rowKey}
                      style={[styles.historyCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                      <View style={styles.historyRowTop}>
                        <Text style={[styles.historyAction, { color: palette.primaryDark }]}>{action}</Text>
                        <Text style={[styles.historyTime, { color: palette.textMuted }]}>
                          {formatDateTime(String(log.created_at || ''))}
                        </Text>
                      </View>
                      <Text style={[styles.historyMeta, { color: palette.textMuted }]}>Shift assignment: {String(log.shift_assignment_id || '-')}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.modalFooter}>
              <Pressable
                style={[
                  styles.moreButton,
                  {
                    backgroundColor: canLoadMoreHistory ? palette.primary : palette.neutral300,
                  },
                ]}
                disabled={!canLoadMoreHistory}
                onPress={() => {
                  void loadHistoryPage(historyPage + 1, true);
                }}>
                <Text style={[styles.moreButtonText, { color: canLoadMoreHistory ? palette.white : palette.textMuted }]}>
                  {historyLoadingMore ? 'Đang tải...' : 'Tải thêm log cũ hơn'}
                </Text>
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
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._15,
    gap: spacingY._12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._10,
  },
  historyButton: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._7,
  },
  historyButtonText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  button: {
    borderRadius: radius._10,
    paddingVertical: spacingY._12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  loader: {
    marginVertical: spacingY._20,
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
  summaryCard: {
    borderWidth: 1,
    borderRadius: radius._12,
    padding: spacingX._12,
    gap: spacingY._5,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  summaryText: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    paddingVertical: spacingY._15,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius._12,
    padding: spacingX._12,
    gap: spacingY._5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    flex: 1,
  },
  statusBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._5,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  meta: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacingX._10,
    marginTop: spacingY._7,
  },
  actionButton: {
    flex: 1,
    borderRadius: radius._10,
    paddingVertical: spacingY._10,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: spacingX._20,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: radius._15,
    padding: spacingX._15,
    gap: spacingY._10,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  closeText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  historyList: {
    maxHeight: 420,
  },
  historyCard: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
    gap: spacingY._5,
    marginBottom: spacingY._7,
  },
  historyRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._10,
  },
  historyAction: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  historyTime: {
    fontSize: 12,
    fontFamily: Fonts.mono,
  },
  historyMeta: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  modalFooter: {
    marginTop: spacingY._5,
  },
  moreButton: {
    borderRadius: radius._10,
    paddingVertical: spacingY._10,
    alignItems: 'center',
  },
  moreButtonText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
});
