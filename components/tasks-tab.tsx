import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { getMyCleaningTasks } from '@/services/cleaner-dashboard.service';
import type { CleaningRequestSource, CleaningTask, CleaningTaskStatus } from '@/types/cleaner-dashboard';
import { getErrorMessage, validateDateRange } from '@/utils/validation';

interface TasksTabProps {
  token: string;
  isDark: boolean;
  palette: typeof Colors.light;
  onSelectTask: (task: CleaningTask) => void;
  onLoadingChange?: (loading: boolean) => void;
  onErrorChange?: (error: string | null) => void;
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
  if (normalized === 'DONE') return isDark ? '#34d399' : '#10b981';
  if (normalized === 'IN_PROGRESS') return isDark ? '#fbbf24' : '#d97706';
  if (normalized === 'ACCEPTED') return isDark ? '#60a5fa' : '#2563eb';
  if (normalized === 'ASSIGNED') return isDark ? '#60a5fa' : '#2563eb';
  if (normalized === 'CANCELLED' || normalized === 'MISSED') return isDark ? '#fb7185' : '#e11d48';
  return isDark ? '#94a3b8' : '#64748b';
}

function taskId(task: CleaningTask) {
  return String(task.id || task._id || '');
}

export default function TasksTab({
  token,
  isDark,
  palette,
  onSelectTask,
  onLoadingChange,
  onErrorChange,
}: TasksTabProps) {
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dueFromFilter, setDueFromFilter] = useState('');
  const [dueToFilter, setDueToFilter] = useState('');
  const [shiftAssignmentIdFilter, setShiftAssignmentIdFilter] = useState('');
  const [podIdFilter, setPodIdFilter] = useState('');
  const [bookingIdFilter, setBookingIdFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTasks = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    if (!search) {
      return tasks;
    }

    return tasks.filter(
      (task) =>
        taskId(task).toLowerCase().includes(search) ||
        String(task.pod_id || '').toLowerCase().includes(search) ||
        String(task.booking_id || '').toLowerCase().includes(search),
    );
  }, [tasks, searchQuery]);

  const loadTasks = useCallback(async () => {
    const dateValidation = validateDateRange(dueFromFilter.trim(), dueToFilter.trim());
    if (!dateValidation.valid) {
      const msg = dateValidation.error || 'Khoảng thời gian không hợp lệ';
      setError(msg);
      onErrorChange?.(msg);
      return;
    }

    setLoading(true);
    setError(null);
    onLoadingChange?.(true);

    try {
      const data = await getMyCleaningTasks(token, {
        status: statusFilter.trim().toUpperCase() as CleaningTaskStatus,
        request_source: sourceFilter.trim().toUpperCase() as CleaningRequestSource,
        due_from: dueFromFilter.trim(),
        due_to: dueToFilter.trim(),
        shift_assignment_id: shiftAssignmentIdFilter.trim(),
        pod_id: podIdFilter.trim(),
        booking_id: bookingIdFilter.trim(),
      });

      setTasks(data);
      onErrorChange?.(null);
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      onErrorChange?.(msg);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }, [
    token,
    statusFilter,
    sourceFilter,
    dueFromFilter,
    dueToFilter,
    shiftAssignmentIdFilter,
    podIdFilter,
    bookingIdFilter,
    onLoadingChange,
    onErrorChange,
  ]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const resetFilters = () => {
    setStatusFilter('');
    setSourceFilter('');
    setDueFromFilter('');
    setDueToFilter('');
    setShiftAssignmentIdFilter('');
    setPodIdFilter('');
    setBookingIdFilter('');
    setSearchQuery('');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: palette.text }]}>Danh sách task của tôi</Text>

        {/* Search */}
        <TextInput
          style={[
            styles.input,
            { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
          ]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Tìm kiếm task ID, pod, booking..."
          placeholderTextColor={palette.neutral500}
          autoCapitalize="none"
        />

        {/* Advanced Filter Toggle */}
        <Pressable
          style={[styles.filterToggle, { backgroundColor: palette.primaryDark }]}
          onPress={() => setShowAdvancedFilter(!showAdvancedFilter)}>
          <Text style={[styles.filterToggleText, { color: palette.white }]}>
            {showAdvancedFilter ? 'Ẩn bộ lọc' : 'Hiển thị bộ lọc nâng cao'}
          </Text>
        </Pressable>

        {/* Advanced Filters */}
        {showAdvancedFilter && (
          <View style={[styles.filterBox, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <TextInput
              style={[
                styles.input,
                { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
              ]}
              value={statusFilter}
              onChangeText={setStatusFilter}
              placeholder="Status (ASSIGNED, ACCEPTED, IN_PROGRESS...)"
              placeholderTextColor={palette.neutral500}
              autoCapitalize="characters"
            />
            <TextInput
              style={[
                styles.input,
                { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
              ]}
              value={sourceFilter}
              onChangeText={setSourceFilter}
              placeholder="Source (USER_REQUEST, AUTO_AFTER_CHECKOUT...)"
              placeholderTextColor={palette.neutral500}
              autoCapitalize="characters"
            />
            <TextInput
              style={[
                styles.input,
                { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
              ]}
              value={dueFromFilter}
              onChangeText={setDueFromFilter}
              placeholder="Due from (ISO date-time)"
              placeholderTextColor={palette.neutral500}
              autoCapitalize="none"
            />
            <TextInput
              style={[
                styles.input,
                { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
              ]}
              value={dueToFilter}
              onChangeText={setDueToFilter}
              placeholder="Due to (ISO date-time)"
              placeholderTextColor={palette.neutral500}
              autoCapitalize="none"
            />
            <TextInput
              style={[
                styles.input,
                { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
              ]}
              value={shiftAssignmentIdFilter}
              onChangeText={setShiftAssignmentIdFilter}
              placeholder="Shift assignment ID"
              placeholderTextColor={palette.neutral500}
              autoCapitalize="none"
            />
            <TextInput
              style={[
                styles.input,
                { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
              ]}
              value={podIdFilter}
              onChangeText={setPodIdFilter}
              placeholder="Pod ID"
              placeholderTextColor={palette.neutral500}
              autoCapitalize="none"
            />
            <TextInput
              style={[
                styles.input,
                { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
              ]}
              value={bookingIdFilter}
              onChangeText={setBookingIdFilter}
              placeholder="Booking ID"
              placeholderTextColor={palette.neutral500}
              autoCapitalize="none"
            />

            <View style={styles.filterActions}>
              <Pressable
                style={[styles.filterButton, { backgroundColor: palette.primary }]}
                disabled={loading}
                onPress={() => void loadTasks()}>
                <Text style={[styles.filterButtonText, { color: palette.white }]}>Lọc</Text>
              </Pressable>
              <Pressable
                style={[styles.filterButton, { backgroundColor: palette.neutral400 }]}
                onPress={resetFilters}>
                <Text style={[styles.filterButtonText, { color: palette.white }]}>Xóa</Text>
              </Pressable>
            </View>
          </View>
        )}

        {error && (
          <View style={[styles.errorBox, { backgroundColor: palette.card, borderColor: palette.error }]}>
            <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={palette.primary} style={styles.loader} />
        ) : filteredTasks.length === 0 ? (
          <Text style={[styles.emptyText, { color: palette.textMuted }]}>Không có task nào.</Text>
        ) : (
          filteredTasks.map((task) => {
            const status = String(task.status || 'UNKNOWN');
            const key = taskId(task);

            return (
              <Pressable
                key={key}
                onPress={() => onSelectTask(task)}
                style={[
                  styles.card,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: palette.text }]}>Task #{key || '-'}</Text>
                  <Text style={[styles.status, { color: statusColor(status, isDark) }]}>{status}</Text>
                </View>

                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Pod: {String(task.pod_id || '-')}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Booking: {String(task.booking_id || '-')}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Source: {String(task.request_source || '-')}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Due: {formatDateTime(task.due_at || undefined)}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Start: {formatDateTime(task.start_time || undefined)}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  End: {formatDateTime(task.end_time || undefined)}
                </Text>

                <View style={styles.footer}>
                  <Text style={[styles.clickHint, { color: palette.primary }]}>Nhấn để xem chi tiết</Text>
                </View>
              </Pressable>
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
  filterToggle: {
    borderRadius: radius._10,
    paddingVertical: spacingY._12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterToggleText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  filterBox: {
    borderWidth: 1,
    borderRadius: radius._12,
    padding: spacingX._12,
    gap: spacingY._10,
  },
  filterActions: {
    flexDirection: 'row',
    gap: spacingX._10,
  },
  filterButton: {
    flex: 1,
    borderRadius: radius._10,
    paddingVertical: spacingY._10,
    alignItems: 'center',
  },
  filterButtonText: {
    fontSize: 14,
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
  footer: {
    marginTop: spacingY._7,
  },
  clickHint: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    fontStyle: 'italic',
  },
});
