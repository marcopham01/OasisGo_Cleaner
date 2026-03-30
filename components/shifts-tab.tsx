import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  getMyShiftAssignments,
  getStaffWorkRosters,
} from '@/services/cleaner-dashboard.service';
import type { StaffShiftAssignment, StaffWorkRoster } from '@/types/cleaner-dashboard';
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

function statusColor(status: string | undefined, isDark: boolean) {
  const normalized = (status || '').toUpperCase();
  if (normalized === 'CHECKED_IN') return isDark ? '#fbbf24' : '#d97706';
  if (normalized === 'COMPLETED') return isDark ? '#34d399' : '#10b981';
  if (normalized === 'ASSIGNED') return isDark ? '#60a5fa' : '#2563eb';
  if (normalized === 'ABSENT') return isDark ? '#fb7185' : '#e11d48';
  return isDark ? '#94a3b8' : '#64748b';
}

function assignmentId(assignment: StaffShiftAssignment) {
  return String(assignment.assignment_id || assignment.id || assignment.shift_assignment_id || '');
}

function todayDateInput() {
  return new Date().toISOString().split('T')[0];
}

function weekdayLabel(value: number) {
  const labels = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  return labels[value] || `Thứ ${value}`;
}

function shiftLabel(assignment: StaffShiftAssignment) {
  return String(
    assignment.shift?.shift_name || assignment.shift?.name || 'Chưa rõ ca',
  );
}

function displayStatus(assignment: StaffShiftAssignment) {
  if (assignment.checkout_at) return 'COMPLETED';
  if (assignment.checkin_at) return 'CHECKED_IN';
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

function canCheckin(assignment: StaffShiftAssignment) {
  const status = String(assignment.status || '').toUpperCase();
  if (status === 'ABSENT' || status === 'COMPLETED') return false;
  if (assignment.checkin_at) return false;
  if (assignment.checkout_at) return false;
  return true;
}

function canCheckout(assignment: StaffShiftAssignment) {
  const status = String(assignment.status || '').toUpperCase();
  if (status === 'ABSENT' || status === 'COMPLETED') return false;
  if (!assignment.checkin_at) return false;
  if (assignment.checkout_at) return false;
  return true;
}

function shouldHidePermissionMessage(message: string) {
  return message.toLowerCase().includes('không có quyền');
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
  const [rosters, setRosters] = useState<StaffWorkRoster[]>([]);
  const [shiftDate, setShiftDate] = useState(todayDateInput());
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locationShiftNameMap = assignments.reduce<Record<string, string>>((acc, assignment) => {
    const key = String(assignment.location_shift_id || '').trim();
    if (!key) return acc;

    const locationName = String(assignment.location?.name || '').trim();
    const assignmentShiftName = String(
      assignment.shift?.shift_name || assignment.shift?.name || '',
    ).trim();

    if (locationName && assignmentShiftName) {
      acc[key] = `${locationName} - ${assignmentShiftName}`;
      return acc;
    }

    if (locationName) {
      acc[key] = locationName;
      return acc;
    }

    if (assignmentShiftName) {
      acc[key] = assignmentShiftName;
    }

    return acc;
  }, {});

  const loadShifts = useCallback(async () => {
    setLoading(true);
    setError(null);
    onLoadingChange?.(true);

    try {
      const assignmentData = await getMyShiftAssignments(token, { work_date: shiftDate });
      let rosterData: StaffWorkRoster[] = [];

      if (userId) {
        try {
          rosterData = await getStaffWorkRosters(token, {
            staff_id: userId,
            is_active: true,
          });
        } catch (rosterErr) {
          // Log roster loading errors for debugging permission issues
          const rosterErrorMsg = getErrorMessage(rosterErr);
          if (__DEV__) {
            console.warn('[Shifts] Roster API call failed:', rosterErrorMsg);
            console.warn('[Shifts] This usually means cleaner does not have permission to access /api/staff-work-rosters');
            console.warn('[Shifts] Backend authorization needs to include "cleaner" role.');
          }
          // Ignore roster loading errors so shifts still display
        }
      }

      setAssignments(assignmentData);
      setRosters(rosterData);
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
  }, [token, userId, shiftDate, onLoadingChange, onErrorChange]);

  const handleAction = async (action: 'checkin' | 'checkout', assignment: StaffShiftAssignment) => {
    setError(null);
    onErrorChange?.(null);
    setActionLoading(`${assignmentId(assignment)}-${action}`);

    const targetId = assignmentId(assignment);
    if (!targetId) {
      setError('Không xác định được shift_assignment_id');
      setActionLoading(null);
      return;
    }

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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: palette.text }]}>Lịch làm việc của tôi</Text>

        <TextInput
          style={[
            styles.input,
            { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
          ]}
          value={shiftDate}
          onChangeText={setShiftDate}
          placeholder="work_date (YYYY-MM-DD)"
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

        <View style={[styles.rosterBox, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Phân ca cố định (Roster)</Text>

          {!userId ? (
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>Không xác định được user hiện tại.</Text>
          ) : rosters.length === 0 ? (
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>Không có dữ liệu roster cho tài khoản này.</Text>
          ) : (
            rosters
              .slice()
              .sort((a, b) => Number(a.day_of_week ?? 0) - Number(b.day_of_week ?? 0))
              .map((roster) => {
                const rosterKey = String(roster.id || roster._id || Math.random());
                return (
                  <View
                    key={rosterKey}
                    style={[styles.rosterItem, { borderColor: palette.border, backgroundColor: palette.surface }]}>
                    <Text style={[styles.meta, { color: palette.text }]}>Ngày: {weekdayLabel(Number(roster.day_of_week))}</Text>
                    <Text style={[styles.meta, { color: palette.textMuted }]}>
                      Ca trực: {locationShiftNameMap[String(roster.location_shift_id || '')] || 'Chưa có tên ca'}
                    </Text>
                    <Text style={[styles.meta, { color: palette.textMuted }]}>
                      Trạng thái: {roster.is_active ? 'Đang bật' : 'Đã tắt'}
                    </Text>
                  </View>
                );
              })
          )}
        </View>

        {loading ? (
          <ActivityIndicator color={palette.primary} style={styles.loader} />
        ) : assignments.length === 0 ? (
          <Text style={[styles.emptyText, { color: palette.textMuted }]}>Không có ca làm việc nào.</Text>
        ) : (
          assignments.map((assignment) => {
            const status = displayStatus(assignment);
            const key = assignmentId(assignment);
            const checkinDisabled = disableAllActions || !canCheckin(assignment);
            const checkoutDisabled = disableAllActions || !canCheckout(assignment);

            return (
              <View
                key={key}
                style={[
                  styles.card,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: palette.text }]}>{shiftLabel(assignment)}</Text>
                  <Text style={[styles.status, { color: statusColor(status, isDark) }]}>{status}</Text>
                </View>

                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Ngày: {assignmentDateLabel(assignment)}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Shift: {shiftLabel(assignment)}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Location: {String(assignment.location?.name || '-')}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Check-in: {formatDateTime(assignment.checkin_at || undefined)}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Check-out: {formatDateTime(assignment.checkout_at || undefined)}
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
                      Check-in
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
                      Check-out
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>
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
  sectionTitle: {
    fontSize: 14,
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
  rosterBox: {
    borderWidth: 1,
    borderRadius: radius._12,
    padding: spacingX._12,
    gap: spacingY._7,
  },
  rosterItem: {
    borderWidth: 1,
    borderRadius: radius._10,
    padding: spacingX._10,
    gap: spacingY._5,
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
  status: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.mono,
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
});
