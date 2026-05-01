import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import {
    checkinShift,
    checkoutShift,
    getMyAttendanceLogsPaginated,
    getMyCleaningTasks,
    getMyTodayAttendanceStatus,
    getStaffWorkRosters,
} from '@/services/cleaner-dashboard.service';
import { subscribeCleanerRealtimeEvent } from '@/services/cleaner-realtime-bus';
import type {
    CleanerRealtimeNotification,
    CleaningTask,
    StaffAttendanceLog,
    StaffAttendanceLogListResponse,
    StaffTodayAttendanceStatus,
    StaffWorkRoster,
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

const DAY_OF_WEEK_LABELS = [
  'Chủ nhật',
  'Thứ hai',
  'Thứ ba',
  'Thứ tư',
  'Thứ năm',
  'Thứ sáu',
  'Thứ bảy',
];

function formatDateTime(dateText?: string | null) {
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

function todayDateLabel() {
  return new Date().toLocaleDateString('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function rosterShiftLabel(roster: StaffWorkRoster) {
  const raw = roster as Record<string, unknown>;
  const shift = ((raw.shift ?? raw.location_shift) as Record<string, unknown>) || null;
  return String(shift?.shift_name || shift?.name || '—');
}

function rosterTimeLabel(roster: StaffWorkRoster) {
  const raw = roster as Record<string, unknown>;
  const shift = ((raw.shift ?? raw.location_shift) as Record<string, unknown>) || null;
  const startTime = String(shift?.start_time || '');
  const endTime = String(shift?.end_time || '');
  if (startTime && endTime) return `${startTime} – ${endTime}`;
  return '';
}

function rosterLocationLabel(roster: StaffWorkRoster) {
  const raw = roster as Record<string, unknown>;
  const location = (raw.location as Record<string, unknown>) || null;
  return String(location?.name || '—');
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

  if (normalized.includes('ban da vao ca truoc do')) return 'Bạn đã vào ca trước đó';
  if (normalized.includes('ban da tan ca truoc do')) return 'Bạn đã tan ca trước đó';
  if (normalized.includes('ban khong co ca truc nao phu hop')) {
    return 'Bạn không có ca trực nào phù hợp vào thời điểm này';
  }
  if (normalized.includes('thoi diem hien tai nam ngoai khung gio cho phep vao ca/tan ca')) {
    return 'Hiện tại chưa nằm trong khung giờ cho phép chấm công';
  }
  if (normalized.includes('ban can vao ca truoc khi tan ca')) {
    return 'Bạn cần vào ca trước khi tan ca';
  }
  if (normalized.includes('ban chi co the tan ca sau khi ca truc ket thuc')) {
    return 'Bạn chỉ có thể tan ca sau khi ca trực kết thúc';
  }
  if (normalized.includes('vui long hoan thanh cong viec don dep dang dang do')) {
    return 'Vui lòng hoàn thành công việc dọn dẹp đang dang dở trước khi kết thúc ca';
  }
  if (normalized.includes('vui long ghi chu ban giao ca truoc khi tan ca')) {
    return 'Vui lòng ghi chú bàn giao ca trước khi tan ca';
  }
  if (normalized.includes('khong tim thay thong tin phan cong')) {
    return 'Không tìm thấy thông tin phân công (Roster)';
  }
  if (normalized.includes('khong tim thay thong tin ca lam viec')) {
    return 'Không tìm thấy thông tin ca làm việc';
  }
  if (normalized.includes('ca lam viec chua duoc cau hinh gio bat dau/ket thuc')) {
    return 'Ca làm việc chưa được cấu hình giờ bắt đầu/kết thúc';
  }
  if (normalized.includes('not allowed')) return 'Bạn không có quyền thao tác';
  if (normalized.includes('khong co quyen')) return 'Bạn không có quyền thao tác';
  if (normalized.includes('date khong hop le')) {
    return 'Ngày không hợp lệ, định dạng đúng là YYYY-MM-DD';
  }

  return message;
}

function confirmShiftAction(action: 'checkin' | 'checkout') {
  const title = action === 'checkin' ? 'Xác nhận vào ca' : 'Xác nhận tan ca';
  const message =
    action === 'checkin'
      ? 'Bạn muốn vào ca?'
      : 'Bạn muốn tan ca? Sau khi tan ca, bạn sẽ không thể tiếp tục xử lý task nếu yêu cầu trạng thái vào ca.';

  if (Platform.OS === 'web') {
    const confirmed = window.confirm(`${title}\n\n${message}`);
    return Promise.resolve(Boolean(confirmed));
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      {
        text: 'Hủy',
        style: 'cancel',
        onPress: () => resolve(false),
      },
      {
        text: action === 'checkin' ? 'Vào ca' : 'Tan ca',
        style: action === 'checkout' ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

const FINISHED_TASK_STATUSES = new Set(['DONE', 'CANCELLED', 'MISSED']);

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

function shouldRefreshFromEvent(event: CleanerRealtimeNotification) {
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
  isDark,
  palette,
  onLoadingChange,
  onErrorChange,
}: ShiftsTabProps) {
  const [rosters, setRosters] = useState<StaffWorkRoster[]>([]);
  const [todayStatus, setTodayStatus] = useState<StaffTodayAttendanceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<'checkin' | 'checkout' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<StaffAttendanceLog[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const realtimeReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const todayDow = new Date().getDay();
  const todayRosters = rosters.filter((r) => r.day_of_week === todayDow && r.is_active !== false);
  const canCheckin = todayStatus?.can_checkin === true && !todayStatus?.checked_in_today;
  const canCheckout = todayStatus?.checked_in_today === true && !todayStatus?.checked_out_today;

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        onLoadingChange?.(true);
      }
      setError(null);

      try {
        const [rosterResult, statusResult] = await Promise.allSettled([
          getStaffWorkRosters(token, { is_active: true }),
          getMyTodayAttendanceStatus(token),
        ]);

        setRosters(rosterResult.status === 'fulfilled' ? rosterResult.value : []);
        setTodayStatus(statusResult.status === 'fulfilled' ? statusResult.value : null);
        onErrorChange?.(null);
      } catch (err) {
        const rawMsg = getErrorMessage(err);
        const msg = localizeShiftErrorMessage(rawMsg);
        if (!shouldHidePermissionMessage(rawMsg)) {
          setError(msg);
          onErrorChange?.(msg);
        }
      } finally {
        if (!silent) {
          setLoading(false);
          onLoadingChange?.(false);
        }
      }
    },
    [token, onLoadingChange, onErrorChange],
  );

  const handleCheckin = async () => {
    setError(null);
    onErrorChange?.(null);

    const confirmed = await confirmShiftAction('checkin');
    if (!confirmed) return;

    setActionLoading('checkin');
    try {
      await checkinShift(token);
      await loadData(true);
    } catch (err) {
      const rawMsg = getErrorMessage(err);
      const msg = localizeShiftErrorMessage(rawMsg);
      if (isDuplicateAttendanceError(rawMsg)) {
        await loadData(true);
      }
      if (!shouldHidePermissionMessage(rawMsg)) {
        setError(msg);
        onErrorChange?.(msg);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckout = async () => {
    setError(null);
    onErrorChange?.(null);

    let confirmed = false;
    try {
      const allTasks = await getMyCleaningTasks(token);
      const pendingTasks = allTasks.filter((task) => {
        const status = String(task.status || '').toUpperCase();
        return !FINISHED_TASK_STATUSES.has(status);
      });
      confirmed = await confirmCheckoutWithPendingTasks(pendingTasks);
    } catch {
      confirmed = await confirmShiftAction('checkout');
    }

    if (!confirmed) return;

    setActionLoading('checkout');
    try {
      await checkoutShift(token);
      await loadData(true);
    } catch (err) {
      const rawMsg = getErrorMessage(err);
      const msg = localizeShiftErrorMessage(rawMsg);
      if (isDuplicateAttendanceError(rawMsg)) {
        await loadData(true);
      }
      if (!shouldHidePermissionMessage(rawMsg)) {
        setError(msg);
        onErrorChange?.(msg);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const disableAllActions = loading || actionLoading !== null;

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!token) return;

    const unsubscribe = subscribeCleanerRealtimeEvent((event) => {
      if (!shouldRefreshFromEvent(event)) return;

      if (realtimeReloadTimer.current) clearTimeout(realtimeReloadTimer.current);
      realtimeReloadTimer.current = setTimeout(() => {
        realtimeReloadTimer.current = null;
        void loadData(true);
      }, 350);
    });

    return () => {
      if (realtimeReloadTimer.current) {
        clearTimeout(realtimeReloadTimer.current);
        realtimeReloadTimer.current = null;
      }
      unsubscribe();
    };
  }, [loadData, token]);

  const loadHistoryPage = useCallback(
    async (page: number, append: boolean) => {
      if (append) setHistoryLoadingMore(true);
      else setHistoryLoading(true);

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
        if (append) setHistoryLoadingMore(false);
        else setHistoryLoading(false);
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

  const canLoadMoreHistory =
    historyPage < historyTotalPages && !historyLoading && !historyLoadingMore;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: palette.text }]}>Ca làm việc hôm nay</Text>
          <Pressable
            style={[
              styles.historyButton,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
            onPress={openHistoryModal}>
            <Text style={[styles.historyButtonText, { color: palette.primary }]}>Lịch sử</Text>
          </Pressable>
        </View>

        <Text style={[styles.todayLabel, { color: palette.textMuted }]}>{todayDateLabel()}</Text>

        <Pressable
          style={[styles.refreshButton, { backgroundColor: palette.primary }]}
          onPress={() => void loadData()}>
          <Text style={[styles.refreshButtonText, { color: palette.white }]}>Làm mới</Text>
        </Pressable>

        {/* Error */}
        {error ? (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: palette.card, borderColor: palette.error },
            ]}>
            <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={palette.primary} style={styles.loader} />
        ) : (
          <>
            {/* Attendance status card */}
            {todayStatus ? (
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}>
                <Text style={[styles.summaryTitle, { color: palette.text }]}>
                  Trạng thái chấm công
                </Text>
                {todayRosters.length > 0 ? (
                  <View style={styles.shiftTimeRow}>
                    {todayRosters.map((roster) => {
                      const timeLabel = rosterTimeLabel(roster);
                      const shiftName = rosterShiftLabel(roster);
                      if (!timeLabel) return null;
                      const key = String(roster.id || roster._id || roster.location_shift_id || '');
                      return (
                        <View key={key} style={styles.shiftTimeBadge}>
                          <Text style={[styles.shiftTimeName, { color: palette.primaryDark }]}>
                            {shiftName}
                          </Text>
                          <Text style={[styles.shiftTimeText, { color: palette.primaryDark }]}>
                            {timeLabel}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
                <Text style={[styles.summaryText, { color: palette.textMuted }]}>
                  Vào ca:{' '}
                  {todayStatus.checked_in_today
                    ? `✓ ${formatDateTime(todayStatus.latest_checkin_at)}`
                    : 'Chưa'}
                </Text>
                <Text style={[styles.summaryText, { color: palette.textMuted }]}>
                  Tan ca:{' '}
                  {todayStatus.checked_out_today
                    ? `✓ ${formatDateTime(todayStatus.latest_checkout_at)}`
                    : 'Chưa'}
                </Text>
                {!todayStatus.checked_in_today && !todayStatus.can_checkin ? (
                  <Text style={[styles.summaryText, { color: palette.warning }]}>
                    Hiện không nằm trong khung giờ cho phép chấm công
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Today's roster cards */}
            {todayRosters.length > 0 ? (
              <View style={styles.rosterSection}>
                <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>
                  Lịch phân công hôm nay
                </Text>
                {todayRosters.map((roster) => {
                  const key = String(roster.id || roster._id || roster.location_shift_id || '');
                  const timeLabel = rosterTimeLabel(roster);
                  return (
                    <View
                      key={key}
                      style={[
                        styles.card,
                        { backgroundColor: palette.surface, borderColor: palette.border },
                      ]}>
                      <Text style={[styles.cardTitle, { color: palette.text }]}>
                        {rosterShiftLabel(roster)}
                      </Text>
                      {timeLabel ? (
                        <Text style={[styles.meta, { color: palette.textMuted }]}>
                          Giờ ca: {timeLabel}
                        </Text>
                      ) : null}
                      <Text style={[styles.meta, { color: palette.textMuted }]}>
                        Khu vực: {rosterLocationLabel(roster)}
                      </Text>
                      <Text style={[styles.meta, { color: palette.textMuted }]}>
                        {DAY_OF_WEEK_LABELS[roster.day_of_week] ?? `Ngày ${roster.day_of_week}`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {rosters.length === 0 ? (
              <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                Bạn chưa có lịch phân công nào.
              </Text>
            ) : todayRosters.length === 0 ? (
              <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                Hôm nay bạn không có ca làm việc.
              </Text>
            ) : null}

            {/* Action buttons */}
            <View style={styles.actionRow}>
              <Pressable
                style={[
                  styles.actionButton,
                  {
                    backgroundColor:
                      canCheckin && !disableAllActions ? palette.secondary : palette.neutral300,
                  },
                ]}
                disabled={!canCheckin || disableAllActions}
                onPress={() => void handleCheckin()}>
                {actionLoading === 'checkin' ? (
                  <ActivityIndicator color={palette.primaryDark} size="small" />
                ) : (
                  <Text
                    style={[
                      styles.actionButtonText,
                      {
                        color:
                          canCheckin && !disableAllActions
                            ? palette.primaryDark
                            : palette.textMuted,
                      },
                    ]}>
                    Vào ca
                  </Text>
                )}
              </Pressable>

              <Pressable
                style={[
                  styles.actionButton,
                  {
                    backgroundColor:
                      canCheckout && !disableAllActions ? palette.primaryDark : palette.neutral300,
                  },
                ]}
                disabled={!canCheckout || disableAllActions}
                onPress={() => void handleCheckout()}>
                {actionLoading === 'checkout' ? (
                  <ActivityIndicator color={palette.white} size="small" />
                ) : (
                  <Text
                    style={[
                      styles.actionButtonText,
                      {
                        color:
                          canCheckout && !disableAllActions ? palette.white : palette.textMuted,
                      },
                    ]}>
                    Tan ca
                  </Text>
                )}
              </Pressable>
            </View>
          </>
        )}
      </View>

      {/* History modal */}
      <Modal
        visible={historyVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setHistoryVisible(false)}>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: palette.card, borderColor: palette.border },
            ]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Lịch sử chấm công</Text>
              <Pressable onPress={() => setHistoryVisible(false)}>
                <Text style={[styles.closeText, { color: palette.textMuted }]}>Đóng</Text>
              </Pressable>
            </View>

            {historyError ? (
              <View
                style={[
                  styles.errorBox,
                  { backgroundColor: palette.card, borderColor: palette.error },
                ]}>
                <Text style={[styles.errorText, { color: palette.error }]}>{historyError}</Text>
              </View>
            ) : null}

            {historyLoading ? (
              <ActivityIndicator color={palette.primary} style={styles.loader} />
            ) : historyLogs.length === 0 ? (
              <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                Chưa có log chấm công.
              </Text>
            ) : (
              <ScrollView style={styles.historyList}>
                {historyLogs.map((log) => {
                  const rowKey = String(
                    log.id ||
                      log._id ||
                      `${String(log.shift_id)}-${String(log.action)}-${String(log.created_at)}`,
                  );
                  const action = String(log.action || '-').toUpperCase();
                  const actionLabel =
                    action === 'CHECKIN' ? 'Vào ca' : action === 'CHECKOUT' ? 'Tan ca' : action;

                  return (
                    <View
                      key={rowKey}
                      style={[
                        styles.historyCard,
                        { backgroundColor: palette.surface, borderColor: palette.border },
                      ]}>
                      <View style={styles.historyRowTop}>
                        <Text style={[styles.historyAction, { color: palette.primaryDark }]}>
                          {actionLabel}
                        </Text>
                        <Text style={[styles.historyTime, { color: palette.textMuted }]}>
                          {formatDateTime(String(log.created_at || ''))}
                        </Text>
                      </View>
                      {log.work_date ? (
                        <Text style={[styles.historyMeta, { color: palette.textMuted }]}>
                          Ngày làm: {String(log.work_date).slice(0, 10)}
                        </Text>
                      ) : null}
                      {log.shift_id ? (
                        <Text style={[styles.historyMeta, { color: palette.textMuted }]}>
                          Ca: {String(log.shift_id)}
                        </Text>
                      ) : null}
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
                onPress={() => void loadHistoryPage(historyPage + 1, true)}>
                <Text
                  style={[
                    styles.moreButtonText,
                    { color: canLoadMoreHistory ? palette.white : palette.textMuted },
                  ]}>
                  {historyLoadingMore ? 'Đang tải...' : 'Tải thêm'}
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  todayLabel: {
    fontSize: 13,
    fontFamily: Fonts.sans,
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
  refreshButton: {
    borderRadius: radius._10,
    paddingVertical: spacingY._12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonText: {
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
  shiftTimeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingX._7,
    marginBottom: spacingY._5,
  },
  shiftTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._5,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: radius._6,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._5,
  },
  shiftTimeName: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  shiftTimeText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.mono,
  },
  rosterSection: {
    gap: spacingY._7,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
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
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  meta: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacingX._10,
    marginTop: spacingY._7,
  },
  actionButton: {
    flex: 1,
    borderRadius: radius._10,
    paddingVertical: spacingY._15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  actionButtonText: {
    fontSize: 15,
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
