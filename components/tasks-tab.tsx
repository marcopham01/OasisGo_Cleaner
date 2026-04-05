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
import { getBookingById, getMyCleaningTasks, getPodById } from '@/services/cleaner-dashboard.service';
import type { CleaningRequestSource, CleaningTask, CleaningTaskStatus } from '@/types/cleaner-dashboard';
import {
    CLEANING_REQUEST_SOURCES,
    CLEANING_TASK_STATUSES,
} from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

type BookingTimeWindow = {
  start_time?: string;
  end_time?: string;
};

interface TasksTabProps {
  token: string;
  isDark: boolean;
  palette: typeof Colors.light;
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

const ACTIVE_STATUSES = new Set(['ASSIGNED', 'NOTIFIED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS']);

function statusBadgeBackground(status: string, isDark: boolean) {
  const normalized = status.toUpperCase();
  if (normalized === 'IN_PROGRESS') return isDark ? '#1d4ed8' : '#dbeafe';
  if (normalized === 'ASSIGNED' || normalized === 'NOTIFIED') return isDark ? '#92400e' : '#fef3c7';
  if (normalized === 'DONE') return isDark ? '#065f46' : '#d1fae5';
  if (normalized === 'CANCELLED' || normalized === 'MISSED') return isDark ? '#881337' : '#ffe4e6';
  return isDark ? '#334155' : '#e2e8f0';
}

function statusBadgeText(status: string, isDark: boolean) {
  const normalized = status.toUpperCase();
  if (normalized === 'IN_PROGRESS') return isDark ? '#bfdbfe' : '#1d4ed8';
  if (normalized === 'ASSIGNED' || normalized === 'NOTIFIED') return isDark ? '#fcd34d' : '#b45309';
  if (normalized === 'DONE') return isDark ? '#6ee7b7' : '#047857';
  if (normalized === 'CANCELLED' || normalized === 'MISSED') return isDark ? '#fda4af' : '#be123c';
  return isDark ? '#cbd5e1' : '#475569';
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ');
}

export default function TasksTab({
  token,
  isDark,
  palette,
  onLoadingChange,
  onErrorChange,
}: TasksTabProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [podNameMap, setPodNameMap] = useState<Record<string, string>>({});
  const [podClusterNameMap, setPodClusterNameMap] = useState<Record<string, string>>({});
  const [bookingNameMap, setBookingNameMap] = useState<Record<string, string>>({});
  const [bookingTimeMap, setBookingTimeMap] = useState<Record<string, BookingTimeWindow>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<CleaningTaskStatus | 'ALL'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<CleaningRequestSource | 'ALL'>('ALL');
  const [sortFilter, setSortFilter] = useState<'newest' | 'oldest'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [draftStatusFilter, setDraftStatusFilter] = useState<CleaningTaskStatus | 'ALL'>('ALL');
  const [draftSourceFilter, setDraftSourceFilter] = useState<CleaningRequestSource | 'ALL'>('ALL');
  const [draftSortFilter, setDraftSortFilter] = useState<'newest' | 'oldest'>('newest');
  const searchAnimation = useRef(new Animated.Value(0)).current;

  const filteredTasks = useMemo<CleaningTask[]>(() => {
    const search = searchQuery.trim().toLowerCase();
    const bySearch = tasks.filter((task) => {
      if (!search) return true;

      const podDisplay = String(
        podNameMap[String(task.pod_id || '')] || taskPodDisplayName(task) || '',
      ).toLowerCase();
      const bookingDisplay = String(
        bookingNameMap[String(task.booking_id || '')] || taskBookingDisplayName(task) || '',
      ).toLowerCase();
      const clusterDisplay = String(
        podClusterNameMap[String(task.pod_id || '')] || taskClusterDisplayName(task) || '',
      ).toLowerCase();

      return (
        podDisplay.includes(search) ||
        clusterDisplay.includes(search) ||
        bookingDisplay.includes(search) ||
        String(task.pod_id || '').toLowerCase().includes(search) ||
        String(task.booking_id || '').toLowerCase().includes(search) ||
        String(task.status || '').toLowerCase().includes(search)
      );
    });

    return [...bySearch].sort((a, b) => {
      const aTime = new Date(String(a.due_at || a.created_at || '')).getTime() || 0;
      const bTime = new Date(String(b.due_at || b.created_at || '')).getTime() || 0;
      return sortFilter === 'newest' ? bTime - aTime : aTime - bTime;
    });
  }, [tasks, searchQuery, sortFilter, podNameMap, podClusterNameMap, bookingNameMap]);

  const activeCount = useMemo(() => {
    return tasks.filter((task) => ACTIVE_STATUSES.has(String(task.status || '').toUpperCase())).length;
  }, [tasks]);

  const assignedCount = useMemo(() => {
    return tasks.filter((task) => {
      const status = String(task.status || '').toUpperCase();
      return status === 'ASSIGNED' || status === 'NOTIFIED';
    }).length;
  }, [tasks]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    onLoadingChange?.(true);

    try {
      const data = await getMyCleaningTasks(token, {
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        request_source: sourceFilter === 'ALL' ? undefined : sourceFilter,
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
    onLoadingChange,
    onErrorChange,
  ]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    Animated.timing(searchAnimation, {
      toValue: isSearchOpen ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [isSearchOpen, searchAnimation]);

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
      const initialClusterMap = Object.fromEntries(
        tasks
          .map((task) => [String(task.pod_id || '').trim(), taskClusterDisplayName(task)] as const)
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
        setPodClusterNameMap(initialClusterMap);
        setBookingNameMap(initialBookingMap);
        setBookingTimeMap(initialBookingTimeMap);
      }

      if (podIds.length === 0 && bookingIds.length === 0) {
        if (isMounted) {
          setPodNameMap(initialPodMap);
          setPodClusterNameMap(initialClusterMap);
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
                const podRecord = pod as {
                  name?: string;
                  code?: string;
                  cluster_name?: string;
                  cluster?: { name?: string; code?: string };
                };

                return [
                  podId,
                  {
                    podName: String(podRecord.name || podRecord.code || '').trim(),
                    clusterName: String(
                      podRecord.cluster_name ||
                        podRecord.cluster?.name ||
                        podRecord.cluster?.code ||
                        '',
                    ).trim(),
                  },
                ] as const;
              } catch {
                return [podId, { podName: '', clusterName: '' }] as const;
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

        setPodNameMap({
          ...initialPodMap,
          ...Object.fromEntries(pods.map(([id, pod]) => [id, pod.podName])),
        });
        setPodClusterNameMap({
          ...initialClusterMap,
          ...Object.fromEntries(pods.map(([id, pod]) => [id, pod.clusterName])),
        });
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
        setPodClusterNameMap(initialClusterMap);
        setBookingNameMap(initialBookingMap);
        setBookingTimeMap(initialBookingTimeMap);
      }
    };

    void loadNames();

    return () => {
      isMounted = false;
    };
  }, [tasks, token]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTasks();
    setRefreshing(false);
  };

  const openFilterModal = () => {
    setDraftStatusFilter(statusFilter);
    setDraftSourceFilter(sourceFilter);
    setDraftSortFilter(sortFilter);
    setIsFilterModalOpen(true);
  };

  const applyFilterModal = () => {
    setStatusFilter(draftStatusFilter);
    setSourceFilter(draftSourceFilter);
    setSortFilter(draftSortFilter);
    setIsFilterModalOpen(false);
  };

  const resetFilterModal = () => {
    setDraftStatusFilter('ALL');
    setDraftSourceFilter('ALL');
    setDraftSortFilter('newest');
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
      <View style={styles.container}>
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: palette.primaryDark, borderColor: palette.primary },
          ]}>
          <View style={styles.summaryRow}>
            <View>
              <Text style={[styles.summaryLabel, { color: palette.primaryLight }]}>ASSIGNED</Text>
              <Text style={[styles.summaryValue, { color: palette.white }]}>{assignedCount} Pods</Text>
            </View>
            <View style={styles.summaryRight}>
              <Text style={[styles.summaryLabel, { color: palette.primaryLight }]}>ACTIVE</Text>
              <Text style={[styles.summaryActive, { color: palette.primaryLight }]}>{activeCount}</Text>
            </View>
          </View>

          <Text style={[styles.title, { color: palette.white }]}>My task</Text>
          <Text style={[styles.subtitle, { color: palette.primaryLight }]}>Quản lý task theo trạng thái và nguồn yêu cầu</Text>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.iconButton, { backgroundColor: palette.surface, borderColor: palette.border }]}
            onPress={() => setIsSearchOpen((prev) => !prev)}>
            <MaterialIcons
              name={isSearchOpen ? 'close' : 'search'}
              size={20}
              color={palette.text}
            />
            <Text style={[styles.iconButtonText, { color: palette.text }]}>Search</Text>
          </Pressable>

          <Pressable
            style={[styles.iconButton, { backgroundColor: palette.surface, borderColor: palette.border }]}
            onPress={openFilterModal}>
            <MaterialIcons name="tune" size={20} color={palette.text} />
            <Text style={[styles.iconButtonText, { color: palette.text }]}>Filter</Text>
          </Pressable>
        </View>

        <Animated.View
          style={[
            styles.searchAnimatedWrap,
            {
              height: searchContainerHeight,
              opacity: searchContainerOpacity,
              transform: [{ translateY: searchContainerTranslateY }],
            },
          ]}
          pointerEvents={isSearchOpen ? 'auto' : 'none'}>
          <TextInput
            style={[
              styles.input,
              { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
            ]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Tìm task theo pod, booking, trạng thái..."
            placeholderTextColor={palette.neutral500}
            autoCapitalize="none"
          />
        </Animated.View>

        <View style={styles.activeFilterRow}>
          <Text style={[styles.activeFilterText, { color: palette.textMuted }]}>
            Status: {statusFilter === 'ALL' ? 'Tất cả' : statusLabel(statusFilter)}
          </Text>
          <Text style={[styles.activeFilterText, { color: palette.textMuted }]}>
            Source: {sourceFilter === 'ALL' ? 'Tất cả' : sourceFilter.replace(/_/g, ' ')}
          </Text>
          <Text style={[styles.activeFilterText, { color: palette.textMuted }]}>
            Sort: {sortFilter === 'newest' ? 'Mới nhất' : 'Cũ nhất'}
          </Text>
        </View>

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
                onPress={() => router.push({ pathname: '/task/[id]', params: { id: key } })}
                style={[
                  styles.card,
                  { backgroundColor: palette.card, borderColor: palette.border },
                ]}>
                <View style={styles.cardContentRow}>
                  <View style={styles.cardMainContent}>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardTitleWrap}>
                        <Text style={[styles.cardTitle, { color: palette.primaryDark }]}> 
                          {podNameMap[String(task.pod_id || '')] || taskPodDisplayName(task) || 'Pod Example'}
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: statusBadgeBackground(status, isDark) },
                          ]}>
                          <Text style={[styles.statusBadgeText, { color: statusBadgeText(status, isDark) }]}>
                            {statusLabel(status)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.metaBlock}>
                      <View style={styles.metaLine}>
                        <MaterialIcons name="apartment" size={16} color={palette.neutral500} />
                        <Text style={[styles.meta, { color: palette.textMuted }]}> 
                          {podClusterNameMap[String(task.pod_id || '')] || taskClusterDisplayName(task) || 'Cluster Example'}
                        </Text>
                      </View>
                      <View style={styles.metaLine}>
                        <MaterialIcons name="local-offer" size={16} color={palette.neutral500} />
                        <Text style={[styles.meta, { color: palette.textMuted }]}>
                          {String(task.request_source || '-')}
                        </Text>
                      </View>
                      <View style={styles.metaLine}>
                        <MaterialIcons name="schedule" size={16} color={palette.neutral500} />
                        <Text style={[styles.meta, { color: palette.textMuted }]}> 
                          Due {formatDateTime(task.due_at || bookingWindow.end_time)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={[styles.arrowButton, { backgroundColor: palette.neutral200 }]}> 
                    <MaterialIcons name="arrow-forward" size={18} color={palette.neutral500} />
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      <Modal visible={isFilterModalOpen} transparent animationType="fade" onRequestClose={() => setIsFilterModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Bộ lọc task</Text>
              <Pressable onPress={() => setIsFilterModalOpen(false)}>
                <MaterialIcons name="close" size={20} color={palette.textMuted} />
              </Pressable>
            </View>

            <Text style={[styles.filterLabel, { color: palette.textMuted }]}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {(['ALL', ...CLEANING_TASK_STATUSES] as const).map((status) => {
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

            <Text style={[styles.filterLabel, { color: palette.textMuted }]}>Request Source</Text>
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
                      {source === 'ALL' ? 'Tất cả' : source.replace(/_/g, ' ')}
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
                <Text style={[styles.modalButtonText, { color: palette.neutral800 }]}>Reset</Text>
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
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._15,
    gap: spacingY._12,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: radius._20,
    padding: spacingX._15,
    gap: spacingY._7,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  summaryRight: {
    alignItems: 'flex-end',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    letterSpacing: 0.6,
  },
  summaryValue: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  summaryActive: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacingX._10,
  },
  iconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingX._7,
    borderWidth: 1,
    borderRadius: radius._12,
    paddingVertical: spacingY._10,
    flex: 1,
  },
  iconButtonText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  searchAnimatedWrap: {
    overflow: 'hidden',
  },
  input: {
    borderWidth: 1,
    borderRadius: radius._12,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  filterGroup: {
    gap: spacingY._7,
  },
  activeFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingX._10,
  },
  activeFilterText: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  filterRow: {
    gap: spacingX._7,
    paddingRight: spacingX._10,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._7,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  sortRow: {
    flexDirection: 'row',
    gap: spacingX._10,
  },
  sortButton: {
    flex: 1,
    borderRadius: radius._10,
    borderWidth: 1,
    paddingVertical: spacingY._10,
    alignItems: 'center',
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: '600',
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
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: spacingX._10,
    marginTop: spacingY._5,
  },
  modalButton: {
    flex: 1,
    borderRadius: radius._10,
    paddingVertical: spacingY._10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '700',
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
    borderRadius: radius._15,
    padding: spacingX._15,
  },
  cardContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._12,
  },
  cardMainContent: {
    flex: 1,
    gap: spacingY._10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._7,
  },
  cardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._7,
    flex: 1,
  },
  cardTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  statusBadge: {
    borderRadius: radius._10,
    paddingHorizontal: spacingX._7,
    paddingVertical: spacingY._5,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  arrowButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  metaBlock: {
    gap: spacingY._5,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._7,
  },
  meta: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
});
