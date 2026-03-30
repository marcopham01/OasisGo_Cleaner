import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import {
    createLostFoundItem,
    getLostFoundItems,
    getMyCleaningTasks,
    updateLostFoundStatus,
} from '@/services/cleaner-dashboard.service';
import type {
    CleaningTask,
    CreateLostFoundItemPayload,
    LostFoundItem,
    LostFoundStatus,
} from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

interface LostFoundTabProps {
  token: string;
  isDark: boolean;
  palette: typeof Colors.light;
  onErrorChange?: (error: string | null) => void;
}

const LOST_FOUND_STATUSES: LostFoundStatus[] = ['FOUND', 'STORED', 'CLAIMED', 'DISPOSED'];

const LOST_FOUND_STATUS_TRANSITIONS: Record<LostFoundStatus, LostFoundStatus[]> = {
  FOUND: ['STORED', 'CLAIMED', 'DISPOSED'],
  STORED: ['CLAIMED', 'DISPOSED'],
  CLAIMED: [],
  DISPOSED: [],
};

function formatDateTime(dateText?: string | null) {
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

function itemId(item: LostFoundItem) {
  return String(item.id || item._id || '');
}

function taskId(task: CleaningTask) {
  return String(task.id || task._id || '').trim();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function statusColor(status: string | undefined, isDark: boolean) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'FOUND') return isDark ? '#60a5fa' : '#2563eb';
  if (normalized === 'STORED') return isDark ? '#fbbf24' : '#d97706';
  if (normalized === 'CLAIMED') return isDark ? '#34d399' : '#10b981';
  if (normalized === 'DISPOSED') return isDark ? '#fb7185' : '#e11d48';
  return isDark ? '#94a3b8' : '#64748b';
}

function shouldHidePermissionMessage(message: string) {
  return message.toLowerCase().includes('khong co quyen') || message.toLowerCase().includes('không có quyền');
}

export default function LostFoundTab({ token, isDark, palette, onErrorChange }: LostFoundTabProps) {
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [taskOptions, setTaskOptions] = useState<CleaningTask[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [cleaningTaskFilter, setCleaningTaskFilter] = useState('');
  const [podFilter, setPodFilter] = useState('');
  const [bookingFilter, setBookingFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [itemName, setItemName] = useState('');
  const [description, setDescription] = useState('');
  const [createMode, setCreateMode] = useState<'TASK' | 'POD'>('TASK');
  const [cleaningTaskId, setCleaningTaskId] = useState('');
  const [podId, setPodId] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [foundAt, setFoundAt] = useState('');
  const [showTaskList, setShowTaskList] = useState(false);
  const [showPodList, setShowPodList] = useState(false);
  const [showBookingList, setShowBookingList] = useState(false);

  const podOptions = useMemo(
    () => uniqueStrings(taskOptions.map((task) => String(task.pod_id || ''))),
    [taskOptions],
  );

  const bookingOptions = useMemo(() => {
    if (createMode === 'TASK' && cleaningTaskId) {
      const matchedTask = taskOptions.find((task) => taskId(task) === cleaningTaskId);
      if (matchedTask?.booking_id) {
        return [String(matchedTask.booking_id)];
      }
    }

    if (createMode === 'POD' && podId) {
      return uniqueStrings(
        taskOptions
          .filter((task) => String(task.pod_id || '').trim() === podId)
          .map((task) => String(task.booking_id || '')),
      );
    }

    return uniqueStrings(taskOptions.map((task) => String(task.booking_id || '')));
  }, [taskOptions, createMode, cleaningTaskId, podId]);

  const selectedTaskLabel = useMemo(() => {
    if (!cleaningTaskId) return 'Chưa chọn cleaning task';

    const matchedTask = taskOptions.find((task) => taskId(task) === cleaningTaskId);
    if (!matchedTask) return cleaningTaskId;

    return `Task ${cleaningTaskId} • Pod ${String(matchedTask.pod_id || '-')}`;
  }, [taskOptions, cleaningTaskId]);

  const selectedPodLabel = podId || 'Chưa chọn pod';
  const selectedBookingLabel = bookingId || 'Không gắn booking';

  const filteredItems = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    if (!search) {
      return items;
    }

    return items.filter((item) => {
      return (
        String(item.item_name || '')
          .toLowerCase()
          .includes(search) ||
        String(item.description || '')
          .toLowerCase()
          .includes(search) ||
        String(item.cleaning_task_id || '')
          .toLowerCase()
          .includes(search) ||
        String(item.pod_id || '')
          .toLowerCase()
          .includes(search) ||
        String(item.booking_id || '')
          .toLowerCase()
          .includes(search)
      );
    });
  }, [items, searchQuery]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    onErrorChange?.(null);

    try {
      const data = await getLostFoundItems(token, {
        status: statusFilter.trim().toUpperCase() as LostFoundStatus,
        cleaning_task_id: cleaningTaskFilter.trim(),
        pod_id: podFilter.trim(),
        booking_id: bookingFilter.trim(),
      });

      setItems(data);
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
    }
  }, [
    token,
    statusFilter,
    cleaningTaskFilter,
    podFilter,
    bookingFilter,
    onErrorChange,
  ]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const loadCreateOptions = useCallback(async () => {
    setLoadingOptions(true);

    try {
      const tasks = await getMyCleaningTasks(token, {});
      setTaskOptions(tasks);
    } catch {
      setTaskOptions([]);
    } finally {
      setLoadingOptions(false);
    }
  }, [token]);

  useEffect(() => {
    void loadCreateOptions();
  }, [loadCreateOptions]);

  const handleCreateItem = async () => {
    const normalizedItemName = itemName.trim();
    const normalizedCleaningTaskId = cleaningTaskId.trim();
    const normalizedPodId = podId.trim();

    if (!normalizedItemName) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên món đồ.');
      return;
    }

    if (createMode === 'TASK' && !normalizedCleaningTaskId) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn cleaning task từ danh sách.');
      return;
    }

    if (createMode === 'POD' && !normalizedPodId) {
      Alert.alert('Thiếu thông tin', 'Cần nhập cleaning_task_id hoặc pod_id.');
      return;
    }

    const payload: CreateLostFoundItemPayload = {
      item_name: normalizedItemName,
      description: description.trim() || undefined,
      cleaning_task_id: createMode === 'TASK' ? normalizedCleaningTaskId : undefined,
      pod_id: createMode === 'POD' ? normalizedPodId : undefined,
      booking_id: bookingId.trim() || undefined,
      found_at: foundAt.trim() || undefined,
    };

    setCreating(true);
    setError(null);
    onErrorChange?.(null);

    try {
      const createdItem = await createLostFoundItem(token, payload);
      setItems((prev) => [createdItem, ...prev]);

      setItemName('');
      setDescription('');
      setCleaningTaskId('');
      setPodId('');
      setBookingId('');
      setFoundAt('');
      setShowTaskList(false);
      setShowPodList(false);
      setShowBookingList(false);

      onErrorChange?.(null);
      Alert.alert('Thành công', 'Đã tạo mục lost & found mới.');
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
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (item: LostFoundItem, nextStatus: LostFoundStatus) => {
    const id = itemId(item);
    if (!id) {
      Alert.alert('Lỗi', 'Không xác định được ID item.');
      return;
    }

    setUpdatingItemId(id);
    setError(null);
    onErrorChange?.(null);

    try {
      const updated = await updateLostFoundStatus(token, id, nextStatus);
      setItems((prev) => prev.map((existing) => (itemId(existing) === id ? updated : existing)));
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
      setUpdatingItemId(null);
    }
  };

  const resetFilters = () => {
    setStatusFilter('');
    setCleaningTaskFilter('');
    setPodFilter('');
    setBookingFilter('');
    setSearchQuery('');
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: palette.text }]}>Lost & Found</Text>

        <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}> 
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Tạo mục mới</Text>

          <View style={styles.rowButtons}>
            <Pressable
              style={[
                styles.secondaryButton,
                createMode === 'TASK'
                  ? { backgroundColor: palette.primary }
                  : { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 },
              ]}
              onPress={() => {
                setCreateMode('TASK');
                setPodId('');
                setShowPodList(false);
              }}>
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: createMode === 'TASK' ? palette.white : palette.text },
                ]}>
                Theo task
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.secondaryButton,
                createMode === 'POD'
                  ? { backgroundColor: palette.primary }
                  : { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 },
              ]}
              onPress={() => {
                setCreateMode('POD');
                setCleaningTaskId('');
                setShowTaskList(false);
              }}>
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: createMode === 'POD' ? palette.white : palette.text },
                ]}>
                Theo pod độc lập
              </Text>
            </Pressable>
          </View>

          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
            value={itemName}
            onChangeText={setItemName}
            placeholder="Tên món đồ (bắt buộc)"
            placeholderTextColor={palette.neutral500}
          />

          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Mô tả (tùy chọn)"
            placeholderTextColor={palette.neutral500}
            multiline
          />

          {createMode === 'TASK' ? (
            <View style={styles.selectorBlock}>
              <Pressable
                style={[styles.selectorTrigger, { borderColor: palette.border, backgroundColor: palette.surface }]}
                onPress={() => {
                  setShowTaskList((prev) => !prev);
                  setShowPodList(false);
                  setShowBookingList(false);
                }}>
                <Text style={[styles.selectorTriggerText, { color: palette.text }]}>Cleaning task: {selectedTaskLabel}</Text>
                <Text style={[styles.selectorHint, { color: palette.textMuted }]}>{showTaskList ? 'Ẩn danh sách' : 'Mở danh sách'}</Text>
              </Pressable>

              {showTaskList && (
                <View style={[styles.selectorList, { borderColor: palette.border, backgroundColor: palette.background }]}> 
                  {loadingOptions ? (
                    <ActivityIndicator color={palette.primary} />
                  ) : taskOptions.length === 0 ? (
                    <Text style={[styles.emptyText, { color: palette.textMuted }]}>Không có task để chọn.</Text>
                  ) : (
                    taskOptions.map((task) => {
                      const id = taskId(task);
                      if (!id) return null;

                      return (
                        <Pressable
                          key={id}
                          style={[
                            styles.selectorItem,
                            {
                              borderColor: palette.border,
                              backgroundColor: cleaningTaskId === id ? `${palette.primary}22` : palette.surface,
                            },
                          ]}
                          onPress={() => {
                            setCleaningTaskId(id);
                            setPodId(String(task.pod_id || '').trim());
                            setBookingId(String(task.booking_id || '').trim());
                            setShowTaskList(false);
                          }}>
                          <Text style={[styles.selectorItemTitle, { color: palette.text }]}>Task {id}</Text>
                          <Text style={[styles.selectorItemMeta, { color: palette.textMuted }]}>
                            Pod: {String(task.pod_id || '-')} • Booking: {String(task.booking_id || '-')}
                          </Text>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.selectorBlock}>
              <Pressable
                style={[styles.selectorTrigger, { borderColor: palette.border, backgroundColor: palette.surface }]}
                onPress={() => {
                  setShowPodList((prev) => !prev);
                  setShowTaskList(false);
                  setShowBookingList(false);
                }}>
                <Text style={[styles.selectorTriggerText, { color: palette.text }]}>Pod: {selectedPodLabel}</Text>
                <Text style={[styles.selectorHint, { color: palette.textMuted }]}>{showPodList ? 'Ẩn danh sách' : 'Mở danh sách'}</Text>
              </Pressable>

              {showPodList && (
                <View style={[styles.selectorList, { borderColor: palette.border, backgroundColor: palette.background }]}> 
                  {loadingOptions ? (
                    <ActivityIndicator color={palette.primary} />
                  ) : podOptions.length === 0 ? (
                    <Text style={[styles.emptyText, { color: palette.textMuted }]}>Không có pod để chọn.</Text>
                  ) : (
                    podOptions.map((podOption) => (
                      <Pressable
                        key={podOption}
                        style={[
                          styles.selectorItem,
                          {
                            borderColor: palette.border,
                            backgroundColor: podId === podOption ? `${palette.primary}22` : palette.surface,
                          },
                        ]}
                        onPress={() => {
                          setPodId(podOption);
                          setShowPodList(false);
                          if (bookingId && !bookingOptions.includes(bookingId)) {
                            setBookingId('');
                          }
                        }}>
                        <Text style={[styles.selectorItemTitle, { color: palette.text }]}>Pod {podOption}</Text>
                      </Pressable>
                    ))
                  )}
                </View>
              )}
            </View>
          )}

          <View style={styles.selectorBlock}>
            <Pressable
              style={[styles.selectorTrigger, { borderColor: palette.border, backgroundColor: palette.surface }]}
              onPress={() => {
                setShowBookingList((prev) => !prev);
                setShowTaskList(false);
                setShowPodList(false);
              }}>
              <Text style={[styles.selectorTriggerText, { color: palette.text }]}>Booking: {selectedBookingLabel}</Text>
              <Text style={[styles.selectorHint, { color: palette.textMuted }]}>{showBookingList ? 'Ẩn danh sách' : 'Mở danh sách'}</Text>
            </Pressable>

            {showBookingList && (
              <View style={[styles.selectorList, { borderColor: palette.border, backgroundColor: palette.background }]}> 
                <Pressable
                  style={[styles.selectorItem, { borderColor: palette.border, backgroundColor: palette.surface }]}
                  onPress={() => {
                    setBookingId('');
                    setShowBookingList(false);
                  }}>
                  <Text style={[styles.selectorItemTitle, { color: palette.text }]}>Không gắn booking</Text>
                </Pressable>
                {bookingOptions.map((bookingOption) => (
                  <Pressable
                    key={bookingOption}
                    style={[
                      styles.selectorItem,
                      {
                        borderColor: palette.border,
                        backgroundColor: bookingId === bookingOption ? `${palette.primary}22` : palette.surface,
                      },
                    ]}
                    onPress={() => {
                      setBookingId(bookingOption);
                      setShowBookingList(false);
                    }}>
                    <Text style={[styles.selectorItemTitle, { color: palette.text }]}>Booking {bookingOption}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
            value={foundAt}
            onChangeText={setFoundAt}
            placeholder="found_at ISO date-time (tùy chọn)"
            placeholderTextColor={palette.neutral500}
            autoCapitalize="none"
          />

          <Pressable
            style={[styles.primaryButton, { backgroundColor: palette.primary }]}
            disabled={creating}
            onPress={() => void handleCreateItem()}>
            {creating ? (
              <ActivityIndicator color={palette.white} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: palette.white }]}>Tạo lost & found</Text>
            )}
          </Pressable>
        </View>

        <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Bộ lọc</Text>

          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Tìm theo tên đồ, mô tả, pod/task/booking"
            placeholderTextColor={palette.neutral500}
          />

          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
            value={statusFilter}
            onChangeText={setStatusFilter}
            placeholder={`Status (${LOST_FOUND_STATUSES.join(', ')})`}
            placeholderTextColor={palette.neutral500}
            autoCapitalize="characters"
          />

          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
            value={cleaningTaskFilter}
            onChangeText={setCleaningTaskFilter}
            placeholder="Filter cleaning_task_id"
            placeholderTextColor={palette.neutral500}
            autoCapitalize="none"
          />

          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
            value={podFilter}
            onChangeText={setPodFilter}
            placeholder="Filter pod_id"
            placeholderTextColor={palette.neutral500}
            autoCapitalize="none"
          />

          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
            value={bookingFilter}
            onChangeText={setBookingFilter}
            placeholder="Filter booking_id"
            placeholderTextColor={palette.neutral500}
            autoCapitalize="none"
          />

          <View style={styles.rowButtons}>
            <Pressable
              style={[styles.secondaryButton, { backgroundColor: palette.primary }]}
              onPress={() => void loadItems()}>
              <Text style={[styles.secondaryButtonText, { color: palette.white }]}>Tải danh sách</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryButton, { backgroundColor: palette.neutral400 }]}
              onPress={resetFilters}>
              <Text style={[styles.secondaryButtonText, { color: palette.white }]}>Xóa lọc</Text>
            </Pressable>
          </View>
        </View>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: palette.card, borderColor: palette.error }]}>
            <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
          </View>
        )}

        <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}> 
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Danh sách item ({filteredItems.length})</Text>

          {loading ? (
            <ActivityIndicator color={palette.primary} />
          ) : filteredItems.length === 0 ? (
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>Chưa có item nào.</Text>
          ) : (
            filteredItems.map((item) => {
              const normalizedStatus = String(item.status || 'FOUND').toUpperCase() as LostFoundStatus;
              const nextStatuses = LOST_FOUND_STATUS_TRANSITIONS[normalizedStatus] || [];
              const id = itemId(item);

              return (
                <View
                  key={id || Math.random()}
                  style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: palette.text }]}>{String(item.item_name || '-')}</Text>
                    <Text style={[styles.status, { color: statusColor(normalizedStatus, isDark) }]}>
                      {normalizedStatus}
                    </Text>
                  </View>

                  <Text style={[styles.meta, { color: palette.textMuted }]}>Mô tả: {String(item.description || '-')}</Text>
                  <Text style={[styles.meta, { color: palette.textMuted }]}>Task: {String(item.cleaning_task_id || '-')}</Text>
                  <Text style={[styles.meta, { color: palette.textMuted }]}>Pod: {String(item.pod_id || '-')}</Text>
                  <Text style={[styles.meta, { color: palette.textMuted }]}>Booking: {String(item.booking_id || '-')}</Text>
                  <Text style={[styles.meta, { color: palette.textMuted }]}>Found at: {formatDateTime(item.found_at)}</Text>
                  <Text style={[styles.meta, { color: palette.textMuted }]}>Created: {formatDateTime(item.created_at)}</Text>
                  <Text style={[styles.meta, { color: palette.textMuted }]}>Claimed at: {formatDateTime(item.claimed_at)}</Text>

                  {nextStatuses.length > 0 && (
                    <View style={styles.statusActions}>
                      {nextStatuses.map((nextStatus) => (
                        <Pressable
                          key={`${id}_${nextStatus}`}
                          style={[styles.statusButton, { backgroundColor: palette.primaryDark }]}
                          disabled={updatingItemId === id}
                          onPress={() => void handleUpdateStatus(item, nextStatus)}>
                          <Text style={[styles.statusButtonText, { color: palette.white }]}>{nextStatus}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
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
  section: {
    borderWidth: 1,
    borderRadius: radius._12,
    padding: spacingX._12,
    gap: spacingY._10,
  },
  sectionTitle: {
    fontSize: 15,
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
  selectorBlock: {
    gap: spacingY._7,
  },
  selectorTrigger: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    gap: spacingY._5,
  },
  selectorTriggerText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  selectorHint: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  selectorList: {
    borderWidth: 1,
    borderRadius: radius._10,
    padding: spacingX._10,
    gap: spacingY._7,
    maxHeight: 220,
  },
  selectorItem: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._10,
    gap: spacingY._5,
  },
  selectorItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  selectorItemMeta: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  primaryButton: {
    borderRadius: radius._10,
    paddingVertical: spacingY._12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  rowButtons: {
    flexDirection: 'row',
    gap: spacingX._10,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: radius._10,
    paddingVertical: spacingY._10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Fonts.sans,
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
    paddingVertical: spacingY._7,
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
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  statusActions: {
    marginTop: spacingY._7,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingX._7,
  },
  statusButton: {
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
});
