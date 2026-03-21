import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
    getMyCleaningTasks,
    getMyShiftAssignments,
} from '@/services/cleaner-dashboard.service';
import type { CleaningTask, StaffShiftAssignment } from '@/types/cleaner-dashboard';

function formatDate(dateText?: string) {
  if (!dateText) {
    return '-';
  }

  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) {
    return dateText;
  }

  return parsed.toLocaleDateString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatDateTime(dateText?: string) {
  if (!dateText) {
    return '-';
  }

  const parsed = new Date(dateText);
  if (Number.isNaN(parsed.getTime())) {
    return dateText;
  }

  return parsed.toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusColor(status: string | undefined, isDark: boolean) {
  const normalized = (status || '').toUpperCase();

  if (normalized === 'DONE' || normalized === 'COMPLETED') {
    return isDark ? '#34d399' : '#10b981';
  }

  if (normalized === 'IN_PROGRESS' || normalized === 'CHECKED_IN') {
    return isDark ? '#fbbf24' : '#d97706';
  }

  if (normalized === 'ASSIGNED') {
    return isDark ? '#60a5fa' : '#2563eb';
  }

  if (normalized === 'ABSENT' || normalized === 'CANCELLED') {
    return isDark ? '#fb7185' : '#e11d48';
  }

  return isDark ? '#94a3b8' : '#64748b';
}

function getId(item: StaffShiftAssignment | CleaningTask) {
  const value = item.id || item._id || item.shift_assignment_id;
  return String(value || Math.random());
}

export default function HomeScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const isDark = theme === 'dark';

  const { token, user, signOut } = useAuth();

  const [assignments, setAssignments] = useState<StaffShiftAssignment[]>([]);
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(
    async (silent = false) => {
      if (!token) {
        setError('Bạn chưa đăng nhập.');
        setLoading(false);
        return;
      }

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const [nextAssignments, nextTasks] = await Promise.all([
          getMyShiftAssignments(token),
          getMyCleaningTasks(token),
        ]);

        setAssignments(nextAssignments);
        setTasks(nextTasks);
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : 'Không thể tải dashboard';
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const shiftCountText = `${assignments.length} ca làm việc`;
  const taskCountText = `${tasks.length} công việc vệ sinh`;

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.background }]}> 
        <ActivityIndicator size="large" color={palette.primary} />
        <Text style={[styles.loadingText, { color: palette.textMuted }]}>Đang tải lịch làm việc...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}>
      <View
        style={[
          styles.headerCard,
          {
            backgroundColor: palette.primary,
            borderColor: palette.primaryDark,
          },
        ]}>
        <Text style={[styles.headerTitle, { color: palette.white }]}>Xin chào, {user?.name || 'Cleaner'}</Text>
        <Text style={[styles.headerSubtitle, { color: palette.primaryLight }]}>Hôm nay: {new Date().toLocaleDateString('vi-VN')}</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => loadData(true)}
            style={[styles.actionButton, { backgroundColor: palette.secondary }]}> 
            <Text style={[styles.actionButtonText, { color: palette.primaryDark }]}>Làm mới</Text>
          </Pressable>
          <Pressable
            onPress={signOut}
            style={[styles.actionButton, { backgroundColor: palette.primaryDark }]}> 
            <Text style={[styles.actionButtonText, { color: palette.white }]}>Đăng xuất</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={[styles.errorCard, { backgroundColor: palette.card, borderColor: palette.error }]}> 
          <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
        </View>
      ) : null}

      <View style={[styles.sectionCard, { backgroundColor: palette.card, borderColor: palette.border }]}> 
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Lịch làm việc (Staff Shift)</Text>
        <Text style={[styles.sectionCount, { color: palette.textMuted }]}>{shiftCountText}</Text>

        {assignments.length === 0 ? (
          <Text style={[styles.emptyText, { color: palette.textMuted }]}>Không có ca làm việc nào.</Text>
        ) : (
          assignments.map((assignment) => {
            const status = String(assignment.status || 'UNKNOWN');

            return (
              <View
                key={getId(assignment)}
                style={[styles.itemCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
                <View style={styles.itemTopRow}>
                  <Text style={[styles.itemTitle, { color: palette.text }]}>Ca #{assignment.id || assignment.shift_assignment_id || '-'}</Text>
                  <Text style={[styles.itemStatus, { color: statusColor(status, isDark) }]}>{status}</Text>
                </View>
                <Text style={[styles.itemMeta, { color: palette.textMuted }]}>Ngày làm: {formatDate(assignment.work_date as string | undefined)}</Text>
                <Text style={[styles.itemMeta, { color: palette.textMuted }]}>Shift: {String(assignment.shift_name || assignment.shift_id || '-')}</Text>
                <Text style={[styles.itemMeta, { color: palette.textMuted }]}>Check-in: {formatDateTime(assignment.checkin_time as string | undefined)}</Text>
                <Text style={[styles.itemMeta, { color: palette.textMuted }]}>Check-out: {formatDateTime(assignment.checkout_time as string | undefined)}</Text>
              </View>
            );
          })
        )}
      </View>

      <View style={[styles.sectionCard, { backgroundColor: palette.card, borderColor: palette.border }]}> 
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Lịch cleaning của tôi</Text>
        <Text style={[styles.sectionCount, { color: palette.textMuted }]}>{taskCountText}</Text>

        {tasks.length === 0 ? (
          <Text style={[styles.emptyText, { color: palette.textMuted }]}>Không có cleaning task nào.</Text>
        ) : (
          tasks.map((task) => {
            const status = String(task.status || 'UNKNOWN');

            return (
              <View
                key={getId(task)}
                style={[styles.itemCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
                <View style={styles.itemTopRow}>
                  <Text style={[styles.itemTitle, { color: palette.text }]}>Task #{task.id || task._id || '-'}</Text>
                  <Text style={[styles.itemStatus, { color: statusColor(status, isDark) }]}>{status}</Text>
                </View>
                <Text style={[styles.itemMeta, { color: palette.textMuted }]}>Pod: {String(task.pod_id || '-')}</Text>
                <Text style={[styles.itemMeta, { color: palette.textMuted }]}>Booking: {String(task.booking_id || '-')}</Text>
                <Text style={[styles.itemMeta, { color: palette.textMuted }]}>Shift assignment: {String(task.shift_assignment_id || '-')}</Text>
                <Text style={[styles.itemMeta, { color: palette.textMuted }]}>Bắt đầu: {formatDateTime(task.start_time)}</Text>
                <Text style={[styles.itemMeta, { color: palette.textMuted }]}>Kết thúc: {formatDateTime(task.end_time)}</Text>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacingX._20,
  },
  loadingText: {
    marginTop: spacingY._10,
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  content: {
    paddingHorizontal: spacingX._20,
    paddingBottom: spacingY._40,
    paddingTop: spacingY._15,
    gap: spacingY._15,
  },
  headerCard: {
    borderRadius: radius._20,
    borderWidth: 1,
    padding: spacingX._20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  headerSubtitle: {
    marginTop: spacingY._7,
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacingX._10,
    marginTop: spacingY._15,
  },
  actionButton: {
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  errorCard: {
    borderRadius: radius._12,
    borderWidth: 1,
    padding: spacingX._12,
  },
  errorText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  sectionCard: {
    borderRadius: radius._17,
    borderWidth: 1,
    padding: spacingX._15,
    gap: spacingY._12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  sectionCount: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    paddingVertical: spacingY._10,
  },
  itemCard: {
    borderRadius: radius._12,
    borderWidth: 1,
    padding: spacingX._12,
    gap: spacingY._5,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._10,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    flexShrink: 1,
  },
  itemStatus: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.mono,
  },
  itemMeta: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
});
