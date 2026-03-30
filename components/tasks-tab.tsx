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
import { getBookingById, getMyCleaningTasks, getPodById } from '@/services/cleaner-dashboard.service';
import type { CleaningRequestSource, CleaningTask, CleaningTaskStatus } from '@/types/cleaner-dashboard';
import { getErrorMessage, validateDateRange } from '@/utils/validation';

type BookingTimeWindow = {
  start_time?: string;
  end_time?: string;
};

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

function shouldHidePermissionMessage(message: string) {
  return message.toLowerCase().includes('không có quyền');
}

function taskPodDisplayName(task: CleaningTask) {
  const podRecord = task.pod as { name?: string; code?: string } | undefined;
  return String(task.pod_name || podRecord?.name || task.pod_code || podRecord?.code || '').trim();
}

function taskBookingDisplayName(task: CleaningTask) {
  const bookingRecord = task.booking as { order_id?: string; id?: string } | undefined;
  return String(task.booking_order_id || bookingRecord?.order_id || bookingRecord?.id || '').trim();
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

export default function TasksTab({
  token,
  isDark,
  palette,
  onSelectTask,
  onLoadingChange,
  onErrorChange,
}: TasksTabProps) {
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [podNameMap, setPodNameMap] = useState<Record<string, string>>({});
  const [bookingNameMap, setBookingNameMap] = useState<Record<string, string>>({});
  const [bookingTimeMap, setBookingTimeMap] = useState<Record<string, BookingTimeWindow>>({});
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
        String(podNameMap[String(task.pod_id || '')] || taskPodDisplayName(task) || '')
          .toLowerCase()
          .includes(search) ||
        String(bookingNameMap[String(task.booking_id || '')] || taskBookingDisplayName(task) || '')
          .toLowerCase()
          .includes(search) ||
        String(task.pod_id || '').toLowerCase().includes(search) ||
        String(task.booking_id || '').toLowerCase().includes(search),
    );
  }, [tasks, searchQuery, podNameMap, bookingNameMap]);

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

  useEffect(() => {
    let isMounted = true;

    const loadNames = async () => {
      const podIds = [...new Set(tasks.map((task) => String(task.pod_id || '').trim()).filter(Boolean))];
      const bookingIds = [
        ...new Set(tasks.map((task) => String(task.booking_id || '').trim()).filter(Boolean)),
      ];

      const initialPodMap = Object.fromEntries(
        tasks
          .map((task) => [String(task.pod_id || '').trim(), taskPodDisplayName(task)] as const)
          .filter(([id, label]) => Boolean(id && label)),
      );
      const initialBookingMap = Object.fromEntries(
        tasks
          .map((task) => [String(task.booking_id || '').trim(), taskBookingDisplayName(task)] as const)
          .filter(([id, label]) => Boolean(id && label)),
      );
      const initialBookingTimeMap = Object.fromEntries(
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

      if (isMounted) {
        setPodNameMap(initialPodMap);
        setBookingNameMap(initialBookingMap);
        setBookingTimeMap(initialBookingTimeMap);
      }

      if (podIds.length === 0 && bookingIds.length === 0) {
        if (isMounted) {
          setPodNameMap(initialPodMap);
          setBookingNameMap(initialBookingMap);
          setBookingTimeMap(initialBookingTimeMap);
        }
        return;
      }

      try {
        const [pods, bookings] = await Promise.all([
          Promise.all(
            podIds.map(async (podId) => {
              try {
                const pod = await getPodById(token, podId);
                return [podId, String(pod.name || pod.code || '').trim()] as const;
              } catch {
                return [podId, ''] as const;
              }
            }),
          ),
          Promise.all(
            bookingIds.map(async (bookingId) => {
              try {
                const booking = await getBookingById(token, bookingId);
                return [
                  bookingId,
                  {
                    label: String(booking.order_id || booking.id || '').trim(),
                    start_time: String(booking.start_time || '').trim(),
                    end_time: String(booking.end_time || '').trim(),
                  },
                ] as const;
              } catch {
                return [bookingId, { label: '', start_time: '', end_time: '' }] as const;
              }
            }),
          ),
        ]);

        if (!isMounted) return;

        setPodNameMap({ ...initialPodMap, ...Object.fromEntries(pods) });
        setBookingNameMap({
          ...initialBookingMap,
          ...Object.fromEntries(bookings.map(([id, booking]) => [id, booking.label])),
        });
        setBookingTimeMap({
          ...initialBookingTimeMap,
          ...Object.fromEntries(
            bookings.map(([id, booking]) => [
              id,
              {
                start_time: booking.start_time || undefined,
                end_time: booking.end_time || undefined,
              },
            ]),
          ),
        });
      } catch {
        if (!isMounted) return;
        setPodNameMap(initialPodMap);
        setBookingNameMap(initialBookingMap);
        setBookingTimeMap(initialBookingTimeMap);
      }
    };

    void loadNames();

    return () => {
      isMounted = false;
    };
  }, [tasks, token]);

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
          placeholder="Tìm kiếm task theo tên pod/booking..."
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
            const bookingWindow = taskBookingWindow(task, bookingTimeMap);

            return (
              <Pressable
                key={key}
                onPress={() => onSelectTask(task)}
                style={[
                  styles.card,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: palette.text }]}>Task dọn dẹp</Text>
                  <Text style={[styles.status, { color: statusColor(status, isDark) }]}>{status}</Text>
                </View>

                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Pod: {podNameMap[String(task.pod_id || '')] || taskPodDisplayName(task) || '-'}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Booking:{' '}
                  {bookingNameMap[String(task.booking_id || '')] || taskBookingDisplayName(task) || '-'}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Source: {String(task.request_source || '-')}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Due: {formatDateTime(task.due_at || undefined)}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Booking Start: {formatDateTime(bookingWindow.start_time)}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Booking End: {formatDateTime(bookingWindow.end_time)}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  Start (thuc te): {formatDateTime(task.start_time || undefined)}
                </Text>
                <Text style={[styles.meta, { color: palette.textMuted }]}>
                  End (thuc te): {formatDateTime(task.end_time || undefined)}
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
