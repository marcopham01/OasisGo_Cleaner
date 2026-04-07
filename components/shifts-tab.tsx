import { useCallback, useEffect, useMemo, useState } from 'react';
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
  getMyAttendanceLogs,
  getMyAttendanceLogsPaginated,
  getMyCleaningTasks,
  getMyShiftAssignments,
} from '@/services/cleaner-dashboard.service';
import type {
  CleaningTask,
  StaffAttendanceLog,
  StaffAttendanceLogListResponse,
  StaffShiftAssignment,
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
  return new Date().toISOString().split('T')[0];
}

function shiftLabel(assignment: StaffShiftAssignment) {
  return String(
    assignment.shift?.shift_name || assignment.shift?.name || 'Chưa rõ ca',
  );
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
  return message.toLowerCase().includes('không có quyền');
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

function taskLabel(task: CleaningTask) {
  const id = String(task.id || task._id || '').trim();
  const status = String(task.status || 'UNKNOWN').toUpperCase();
  const pod = String(task.pod_id || '-').trim();
  return `${id || '(khong co id)'} | ${status} | Pod ${pod}`;
}

function confirmCheckoutWithPendingTasks(pendingTasks: CleaningTask[]) {
  if (pendingTasks.length === 0) {
    return confirmShiftAction('checkout');
  }

  const preview = pendingTasks.slice(0, 6).map((task, index) => `${index + 1}. ${taskLabel(task)}`);
  const extra = pendingTasks.length > 6 ? `\n... va ${pendingTasks.length - 6} task khac` : '';
  const message =
    `Hom nay ban con ${pendingTasks.length} task chua xong:\n\n${preview.join('\n')}${extra}\n\nBan van muon tan ca?`;

  if (Platform.OS === 'web') {
    const confirmed = window.confirm(`Canh bao task chua xong\n\n${message}`);
    return Promise.resolve(Boolean(confirmed));
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert('Canh bao task chua xong', message, [
      {
        text: 'Quay lai task',
        style: 'cancel',
        onPress: () => resolve(false),
      },
      {
        text: 'Van tan ca',
        style: 'destructive',
        onPress: () => resolve(true),
      },
    ]);
  });
}

export default function ShiftsTab({
  token,
  isDark,
  palette,
  onLoadingChange,
  onErrorChange,
}: ShiftsTabProps) {
  const [assignments, setAssignments] = useState<StaffShiftAssignment[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<StaffAttendanceLog[]>([]);
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

      acc[assignmentId(assignment)] = {
        checkin_at: String(latestCheckin?.created_at || '').trim() || undefined,
        checkout_at: String(latestCheckout?.created_at || '').trim() || undefined,
      };

      return acc;
    }, {});
  }, [assignments, attendanceLogs]);

  const loadShifts = useCallback(async () => {
    setLoading(true);
    setError(null);
    onLoadingChange?.(true);

    try {
      let assignmentData = await getMyShiftAssignments(token, {
        from_date: shiftDate,
        to_date: shiftDate,
      });

      if (assignmentData.length === 0) {
        const unfilteredAssignments = await getMyShiftAssignments(token);
        assignmentData = unfilteredAssignments.filter((assignment) =>
          assignmentOverlapsDate(assignment, shiftDate),
        );
      }

      let myAttendanceLogs: StaffAttendanceLog[] = [];

      if (assignmentData.length > 0) {
        try {
          const logsByAssignment = await Promise.all(
            assignmentData.map(async (assignment) => {
              const id = assignmentId(assignment);
              if (!id) return [] as StaffAttendanceLog[];

              try {
                return await getMyAttendanceLogs(token, {
                  shift_assignment_id: id,
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
      onLoadingChange?.(false);
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
        await checkinShift(token, targetId);
      } else {
        await checkoutShift(token, targetId);
      }
      await loadShifts();
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
      setActionLoading(null);
    }
  };

  const disableAllActions = loading || actionLoading !== null;

  useEffect(() => {
    void loadShifts();
  }, [loadShifts]);

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
        setHistoryError(getErrorMessage(err));
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

        {loading ? (
          <ActivityIndicator color={palette.primary} style={styles.loader} />
        ) : assignments.length === 0 ? (
          <Text style={[styles.emptyText, { color: palette.textMuted }]}>Không có ca làm việc nào.</Text>
        ) : (
          assignments.map((assignment) => {
            const attendanceState = attendanceByAssignmentId[assignmentId(assignment)];
            const status = displayStatus(assignment, attendanceState);
            const statusBadge = statusBadgeMeta(status, isDark);
            const key = assignmentId(assignment);
            const checkinDisabled = disableAllActions || !canCheckin(assignment, attendanceState);
            const checkoutDisabled = disableAllActions || !canCheckout(assignment, attendanceState);

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

                <Text style={[styles.meta, { color: statusColor(status, isDark) }]}>Trạng thái hệ thống: {status}</Text>

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
