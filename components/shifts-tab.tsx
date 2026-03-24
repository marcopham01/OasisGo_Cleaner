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
} from '@/services/cleaner-dashboard.service';
import type { StaffShiftAssignment } from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

interface ShiftsTabProps {
  token: string;
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

export default function ShiftsTab({
  token,
  isDark,
  palette,
  onLoadingChange,
  onErrorChange,
}: ShiftsTabProps) {
  const [assignments, setAssignments] = useState<StaffShiftAssignment[]>([]);
  const [shiftDate, setShiftDate] = useState(todayDateInput());
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadShifts = useCallback(async () => {
    setLoading(true);
    setError(null);
    onLoadingChange?.(true);

    try {
      const data = await getMyShiftAssignments(token, { work_date: shiftDate });
      setAssignments(data);
      onErrorChange?.(null);
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      onErrorChange?.(msg);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }, [token, shiftDate, onLoadingChange, onErrorChange]);

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
      setError(msg);
      onErrorChange?.(msg);
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

        {loading ? (
          <ActivityIndicator color={palette.primary} style={styles.loader} />
        ) : assignments.length === 0 ? (
          <Text style={[styles.emptyText, { color: palette.textMuted }]}>Không có ca làm việc nào.</Text>
        ) : (
          assignments.map((assignment) => {
            const status = String(assignment.status || 'UNKNOWN');
            const key = assignmentId(assignment);

            return (
              <View
                key={key}
                style={[
                  styles.card,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: palette.text }]}>Ca #{key || '-'}</Text>
                  <Text style={[styles.status, { color: statusColor(status, isDark) }]}>{status}</Text>
                </View>

                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Ngày: {formatDate(assignment.work_date)}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Shift: {String(assignment.shift?.name || assignment.shift?.id || '-')}
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
                    disabled={disableAllActions}
                    onPress={() => void handleAction('checkin', assignment)}>
                    <Text style={[styles.actionButtonText, { color: palette.primaryDark }]}>
                      Check-in
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionButton, { backgroundColor: palette.primaryDark }]}
                    disabled={disableAllActions}
                    onPress={() => void handleAction('checkout', assignment)}>
                    <Text style={[styles.actionButtonText, { color: palette.white }]}>
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
