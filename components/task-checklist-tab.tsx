import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import {
  getCleaningTaskById,
  getIncidentsByCleaningTaskId,
  getMyLostFoundItems,
  getPodItemsByPodId,
} from '@/services/cleaner-dashboard.service';
import type {
  CleaningTask,
  Incident,
  LostFoundItem,
  PodItemEntry,
} from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

interface TaskChecklistTabProps {
  token: string;
  taskId: string | null;
  isDark: boolean;
  palette: typeof Colors.light;
  onClose: () => void;
  onWorkDone: () => void;
  onReportDamage: (params: { podId?: string; bookingId?: string; podName?: string }) => void;
  onReportLostFound: (params: { podId?: string; bookingId?: string; podName?: string }) => void;
}

const CLEANING_CHECKLIST_ITEMS = [
  'Thay ga giường và vỏ gối (đồ dùng một lần)',
  'Khử khuẩn bảng điều khiển',
  'Kiểm tra đồ khách để quên',
  'Xịt khử mùi không khí',
];

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

function incidentStatusVi(status?: string) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PENDING') return 'Đang chờ xử lý';
  if (normalized === 'RESOLVED') return 'Đã xử lý';
  if (normalized === 'DISMISSED') return 'Đã hủy';
  return status || 'Đang chờ xử lý';
}

function lostFoundStatusVi(status?: string) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'FOUND') return 'Đã tìm thấy';
  if (normalized === 'CLAIMED') return 'Đã nhận lại';
  if (normalized === 'DISPOSED') return 'Đã tiêu hủy';
  if (normalized === 'RETURNED_TO_USER') return 'Đã trả cho khách';
  return status || 'Đã tìm thấy';
}

function severityVi(severity?: string) {
  const normalized = String(severity || '').toUpperCase();
  if (normalized === 'LOW') return 'Thấp';
  if (normalized === 'MEDIUM') return 'Trung bình';
  if (normalized === 'HIGH') return 'Cao';
  if (normalized === 'CRITICAL') return 'Nghiêm trọng';
  return severity || 'Trung bình';
}

function podItemStatusVi(status?: string) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'IN_STOCK') return 'Đủ số lượng';
  if (normalized === 'MISSING') return 'Thiếu số lượng';
  if (normalized === 'OVERSTOCKED') return 'Dư số lượng';
  return status || 'Chưa xác định';
}

function podItemStatusColor(status: string | undefined, palette: typeof Colors.light) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'IN_STOCK') return palette.success;
  if (normalized === 'MISSING') return palette.error;
  if (normalized === 'OVERSTOCKED') return '#f59e0b';
  return palette.textMuted;
}

function toBoundedInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function isConsumablePodItem(podItem: PodItemEntry) {
  const itemType = String(podItem.item_type || podItem.item?.item_type || '').trim().toUpperCase();
  return itemType === 'CONSUMABLE';
}

export default function TaskChecklistTab({
  token,
  taskId,
  isDark,
  palette,
  onClose,
  onWorkDone,
  onReportDamage,
  onReportLostFound,
}: TaskChecklistTabProps) {
  const [task, setTask] = useState<CleaningTask | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [lostFoundItems, setLostFoundItems] = useState<LostFoundItem[]>([]);
  const [loadingLostFound, setLoadingLostFound] = useState(false);
  const [podItems, setPodItems] = useState<PodItemEntry[]>([]);
  const [podItemsPodName, setPodItemsPodName] = useState('');
  const [loadingPodItems, setLoadingPodItems] = useState(false);
  const [supplyInputByItemKey, setSupplyInputByItemKey] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  // Checklist
  const [completedChecklistItems, setCompletedChecklistItems] = useState<string[]>([]);

  const loadDetail = useCallback(async () => {
    if (!taskId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const [taskData, incidentsData] = await Promise.all([
        getCleaningTaskById(token, taskId),
        getIncidentsByCleaningTaskId(token, taskId),
      ]);
      setTask(taskData);
      setIncidents(incidentsData);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [taskId, token]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const refreshIncidents = useCallback(async () => {
    if (!taskId || !token) return;
    try {
      const incidentsData = await getIncidentsByCleaningTaskId(token, taskId);
      setIncidents(incidentsData);
    } catch {
      // silent — don't disrupt the UI on background refresh
    }
  }, [taskId, token]);

  const refreshLostFoundItems = useCallback(async () => {
    if (!token || !task) return;

    const bookingId = String(task.booking_id ?? '').trim();
    const podId = String(task.pod_id ?? '').trim();
    if (!bookingId && !podId) {
      setLostFoundItems([]);
      return;
    }

    setLoadingLostFound(true);
    try {
      const items = await getMyLostFoundItems(token, {
        booking_id: bookingId || undefined,
        pod_id: podId || undefined,
      });
      setLostFoundItems(items);
    } catch {
      setLostFoundItems([]);
    } finally {
      setLoadingLostFound(false);
    }
  }, [token, task]);

  const refreshPodItems = useCallback(async () => {
    if (!token || !task) return;
    const podRecord = (task.pod && typeof task.pod === 'object')
      ? (task.pod as { id?: string })
      : undefined;
    const podId = String(task.pod_id || podRecord?.id || '').trim();
    if (!podId) {
      setPodItems([]);
      setPodItemsPodName('');
      return;
    }

    setLoadingPodItems(true);
    try {
      const podItemsData = await getPodItemsByPodId(token, podId);
      const consumableItems = (podItemsData.items || []).filter((item) => isConsumablePodItem(item));
      setPodItems(consumableItems);
      setPodItemsPodName(String(podItemsData.pod_name || task.pod_name || ''));
    } catch {
      setPodItems([]);
      setPodItemsPodName('');
    } finally {
      setLoadingPodItems(false);
    }
  }, [token, task]);

  const updateSupplyQuantity = useCallback(
    (itemKey: string, expectedQuantity: number, nextValue: number | string) => {
      const max = Math.max(0, Math.floor(expectedQuantity || 0));
      const parsedFromText =
        typeof nextValue === 'string'
          ? Number(nextValue.replace(/[^0-9]/g, '') || 0)
          : Number(nextValue || 0);
      const bounded = toBoundedInt(parsedFromText, 0, max);
      setSupplyInputByItemKey((prev) => ({
        ...prev,
        [itemKey]: bounded,
      }));
    },
    [],
  );

  useEffect(() => {
    void refreshLostFoundItems();
    void refreshPodItems();
  }, [refreshLostFoundItems, refreshPodItems]);

  useFocusEffect(
    useCallback(() => {
      void refreshIncidents();
      void refreshLostFoundItems();
      void refreshPodItems();
    }, [refreshIncidents, refreshLostFoundItems, refreshPodItems]),
  );

  const toggleChecklistItem = (item: string) => {
    setCompletedChecklistItems((prev) =>
      prev.includes(item) ? prev.filter((c) => c !== item) : [...prev, item],
    );
  };

  if (!taskId) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: palette.background }]}>
        <Text style={[styles.emptyText, { color: palette.textMuted }]}>Task không hợp lệ</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: palette.background }]}>
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }

  const completedChecklistCount = completedChecklistItems.length;
  const isChecklistComplete =
    CLEANING_CHECKLIST_ITEMS.length > 0 &&
    completedChecklistCount === CLEANING_CHECKLIST_ITEMS.length;
  const hasDamageReports = incidents.length > 0;
  const hasLostFoundReports = lostFoundItems.length > 0;
  const showReportActionSection = !(hasDamageReports && hasLostFoundReports);

  return (
    <>
      <Modal
        visible={selectedImageUri !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedImageUri(null)}>
        <View style={styles.lightboxOverlay}>
          <Pressable style={styles.lightboxClose} onPress={() => setSelectedImageUri(null)}>
            <MaterialIcons name="close" size={26} color="#fff" />
          </Pressable>
          {selectedImageUri ? (
            <Image source={{ uri: selectedImageUri }} style={styles.lightboxImage} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>

      <ScrollView style={{ flex: 1, backgroundColor: palette.background }}>
        <View style={styles.container}>
          {error ? (
            <View
              style={[styles.errorBox, { backgroundColor: palette.card, borderColor: palette.error }]}>
              <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
            </View>
          ) : null}

          {/* Step banner */}
          <View
            style={{
              backgroundColor: '#F0FDF4',
              borderRadius: 16,
              padding: 14,
              borderWidth: 1,
              borderColor: '#BBF7D0',
            }}>
            <Text style={{ fontWeight: '700', color: '#15803D', fontSize: 14, marginBottom: 4 }}>
              Bước 2/3 – Dọn dẹp & Báo cáo hư hại
            </Text>
            <Text style={{ color: '#16A34A', fontSize: 13 }}>
              Hoàn thành danh sách dọn dẹp và báo cáo nếu có hư hại trong phòng.
            </Text>
          </View>

          {/* Cleaning checklist */}
          <View
            style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 32,
              padding: 16,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.06,
              shadowRadius: 24,
              elevation: 4,
              borderWidth: 1,
              borderColor: '#E2E8F0',
            }}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <Text
                style={{
                  fontWeight: 'bold',
                  color: '#3B82F6',
                  fontSize: 22,
                  letterSpacing: 0.2,
                  textAlign: 'center',
                }}>
                Danh sách dọn dẹp
              </Text>
            </View>
            {CLEANING_CHECKLIST_ITEMS.map((item) => {
              const isCompleted = completedChecklistItems.includes(item);
              return (
                <Pressable
                  key={item}
                  onPress={() => toggleChecklistItem(item)}
                  style={{
                    backgroundColor: isCompleted ? '#ECFDF5' : '#fff',
                    borderRadius: 18,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    marginBottom: 12,
                    shadowColor: isCompleted ? '#22C55E' : '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: isCompleted ? 0.1 : 0.04,
                    shadowRadius: 10,
                    elevation: isCompleted ? 2 : 1,
                    borderWidth: 1.5,
                    borderColor: isCompleted ? '#22C55E' : '#F1F5F9',
                    opacity: isCompleted ? 0.85 : 1,
                  }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      flex: 1,
                      minWidth: 0,
                      marginRight: 10,
                    }}>
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        backgroundColor: isCompleted ? '#D1FAE5' : '#EFF6FF',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 8,
                      }}>
                      <MaterialIcons
                        name="cleaning-services"
                        size={14}
                        color={isCompleted ? '#22C55E' : '#3B82F6'}
                      />
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontWeight: '500',
                        color: isCompleted ? '#22C55E' : '#334155',
                        fontSize: 10,
                        lineHeight: 14,
                        textDecorationLine: isCompleted ? 'line-through' : 'none',
                      }}>
                      {item}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexShrink: 0,
                      width: 20,
                      height: 20,
                      borderRadius: 5,
                      borderWidth: 1.5,
                      borderColor: isCompleted ? '#22C55E' : '#E2E8F0',
                      backgroundColor: isCompleted ? '#22C55E' : '#fff',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    {isCompleted && <MaterialIcons name="check" size={12} color="#fff" />}
                  </View>
                </Pressable>
              );
            })}
            <Text
              style={{
                textAlign: 'center',
                color: '#64748B',
                fontSize: 12,
                marginTop: 4,
              }}>
              {completedChecklistCount}/{CLEANING_CHECKLIST_ITEMS.length} mục đã hoàn thành
            </Text>
          </View>

          {/* Pod items — standard quantity reference */}
          <View
            style={{
              backgroundColor: palette.card,
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: palette.border,
            }}>
            <Text
              style={[
                styles.sectionTitle,
                { color: '#0284c7', marginBottom: 8, textAlign: 'center' },
              ]}>
              Danh sách bổ sung vật tư
            </Text>
            {podItemsPodName ? (
              <Text style={[styles.info, { color: palette.textMuted, marginBottom: 8, textAlign: 'center' }]}>
                Pod: {podItemsPodName}
              </Text>
            ) : null}

            {loadingPodItems ? (
              <ActivityIndicator color={palette.primary} />
            ) : podItems.length === 0 ? (
              <Text style={[styles.info, { color: palette.textMuted }]}>
                Chưa có dữ liệu đồ dùng cho pod này.
              </Text>
            ) : (
              podItems.map((podItem, index) => {
                const itemName = String(
                  podItem.item_name || podItem.item?.name || podItem.item_id || 'Item',
                );
                const expectedQuantity = Math.max(0, Math.floor(Number(podItem.expected_quantity || 0)));
                const itemKey = String(podItem.item_id || podItem.id || `pod-item-${index}`).trim();
                const hasInputValue = Object.prototype.hasOwnProperty.call(supplyInputByItemKey, itemKey);
                const defaultQuantity = hasInputValue
                  ? Number(supplyInputByItemKey[itemKey] || 0)
                  : expectedQuantity;
                const inputQuantity = toBoundedInt(defaultQuantity, 0, expectedQuantity);

                return (
                  <View
                    key={String(podItem.id || `${podItem.item_id}-${podItem.pod_id}`)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: palette.border,
                    }}>
                    <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                      <Text
                        style={{ fontSize: 14, fontWeight: '500', color: palette.text }}
                        numberOfLines={2}>
                        {itemName}
                      </Text>
                      <Text style={{ fontSize: 12, color: palette.textMuted, marginTop: 3 }}>
                        Chuẩn: <Text style={{ fontWeight: '700', color: palette.primary }}>{expectedQuantity}</Text>
                      </Text>
                    </View>
                    <View style={styles.supplyQtyWrap}>
                      <Pressable
                        style={[
                          styles.supplyQtyButton,
                          {
                            backgroundColor: inputQuantity <= 0 ? palette.neutral200 : '#e0f2fe',
                          },
                        ]}
                        disabled={inputQuantity <= 0}
                        onPress={() => updateSupplyQuantity(itemKey, expectedQuantity, inputQuantity - 1)}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: '#0369a1' }}>-</Text>
                      </Pressable>

                      <TextInput
                        style={[styles.supplyQtyInput, { color: palette.text, borderColor: palette.border }]}
                        value={String(inputQuantity)}
                        onChangeText={(text) => updateSupplyQuantity(itemKey, expectedQuantity, text)}
                        keyboardType="number-pad"
                        maxLength={3}
                        textAlign="center"
                      />

                      <Pressable
                        style={[
                          styles.supplyQtyButton,
                          {
                            backgroundColor:
                              inputQuantity >= expectedQuantity ? palette.neutral200 : '#d1fae5',
                          },
                        ]}
                        disabled={inputQuantity >= expectedQuantity}
                        onPress={() => updateSupplyQuantity(itemKey, expectedQuantity, inputQuantity + 1)}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: '#15803d' }}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Incident report action section */}
          {showReportActionSection ? (
            <View
              style={[
                styles.damageSection,
                {
                  backgroundColor: `${palette.secondary}12`,
                  borderColor: palette.secondary,
                },
              ]}>
              <Text style={[styles.sectionTitle, { color: palette.secondary, alignSelf: 'center' }]}>
                Báo cáo vấn đề
              </Text>

              <View style={styles.actionButtonRow}>
                {!hasDamageReports ? (
                  <Pressable
                    style={[styles.actionButton, styles.actionButtonHalf, { backgroundColor: palette.error }]}
                    onPress={() => onReportDamage({
                      podId: task?.pod_id,
                      bookingId: String(task?.booking_id ?? ''),
                      podName: String(task?.pod_name ?? ''),
                    })}>
                    <Text style={[styles.actionButtonText, { color: palette.white }]}> 
                      Báo cáo hư hại
                    </Text>
                  </Pressable>
                ) : null}

                {!hasLostFoundReports ? (
                  <Pressable
                    style={[styles.actionButton, styles.actionButtonHalf, { backgroundColor: '#0ea5e9' }]}
                    onPress={() => onReportLostFound({
                      podId: task?.pod_id,
                      bookingId: String(task?.booking_id ?? ''),
                      podName: String(task?.pod_name ?? ''),
                    })}>
                    <Text style={[styles.actionButtonText, { color: palette.white }]}> 
                      Ghi nhận đồ thất lạc
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Existing incidents */}
          {incidents.length > 0 ? (
            <View
              style={[
                styles.incidentSection,
                { backgroundColor: `${palette.error}12`, borderColor: palette.error },
              ]}>
              <Text style={[styles.sectionTitle, { color: palette.error, alignSelf: 'center' }]}>
                Hư hại
              </Text>
              {incidents.map((incident) => {
                const severityColor = {
                  LOW: palette.success,
                  MEDIUM: '#f59e0b',
                  HIGH: palette.error,
                  CRITICAL: palette.error,
                }[String(incident.severity || 'MEDIUM')] ?? palette.textMuted;

                return (
                  <View
                    key={String(incident.id || Math.random())}
                    style={[styles.incidentItem, { borderColor: severityColor }]}>
                    <View style={styles.incidentHeader}>
                      <View>
                        <Text style={[styles.incidentSeverity, { color: severityColor }]}>
                          {severityVi(String(incident.severity || 'MEDIUM'))}
                        </Text>
                      </View>
                      <Text style={[styles.incidentStatus, { color: palette.textMuted }]}>
                        {incidentStatusVi(String(incident.status || 'PENDING'))}
                      </Text>
                    </View>
                    <Text style={[styles.incidentDescription, { color: palette.text }]}>
                      {String(incident.description || '-')}
                    </Text>
                    {incident.photo_urls && incident.photo_urls.length > 0 ? (
                      <ScrollView horizontal>
                        {incident.photo_urls.map((url, idx) => (
                          <Pressable key={`${incident.id}_${idx}`} onPress={() => setSelectedImageUri(String(url))}>
                            <Image
                              source={{ uri: String(url) }}
                              style={styles.incidentThumb}
                              resizeMode="cover"
                            />
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : null}
                    <Text style={[styles.incidentTime, { color: palette.textMuted }]}>
                      {formatDateTime(String(incident.created_at || ''))}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* Existing lost-found reports */}
          {lostFoundItems.length > 0 ? (
            <View
              style={[
                styles.incidentSection,
                { backgroundColor: '#e0f2fe', borderColor: '#7dd3fc' },
              ]}>
              <Text style={[styles.sectionTitle, { color: '#0369a1', alignSelf: 'center' }]}>
                Đồ thất lạc
              </Text>

              {loadingLostFound ? (
                <ActivityIndicator color="#0284c7" />
              ) : (
                lostFoundItems.map((item) => (
                  <View
                    key={String(item.id || item._id || Math.random())}
                    style={[styles.incidentItem, { borderColor: '#38bdf8', backgroundColor: '#f0f9ff' }]}>
                    <View style={styles.incidentHeader}>
                      <Text style={[styles.lostFoundItemName, { color: '#0f172a' }]}>
                        {String(item.item_name || '-')}
                      </Text>
                      <Text style={[styles.incidentStatus, { color: '#0284c7', fontSize: 11 }]}>
                        {lostFoundStatusVi(String(item.status || 'FOUND'))}
                      </Text>
                    </View>
                    {item.description ? (
                      <Text style={[styles.incidentDescription, { color: palette.textMuted }]}>
                        {String(item.description)}
                      </Text>
                    ) : null}
                    {item.photo_url ? (
                      <Pressable onPress={() => setSelectedImageUri(String(item.photo_url))}>
                        <Image source={{ uri: String(item.photo_url) }} style={styles.incidentThumb} resizeMode="cover" />
                      </Pressable>
                    ) : null}
                    <Text style={[styles.incidentTime, { color: palette.textMuted }]}> 
                      {formatDateTime(String(item.found_at || item.created_at || ''))}
                    </Text>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {!isChecklistComplete ? (
            <Text style={{ textAlign: 'center', color: palette.textMuted, fontSize: 13, marginBottom: 4 }}>
              Cần hoàn thành {completedChecklistCount}/{CLEANING_CHECKLIST_ITEMS.length} mục trước khi tiếp tục
            </Text>
          ) : null}
          <Pressable
            style={[styles.workDoneButton, { backgroundColor: isChecklistComplete ? palette.success : palette.neutral400 }]}
            disabled={!isChecklistComplete}
            onPress={onWorkDone}>
            <Text style={styles.workDoneButtonText}>Hoàn thành dọn dẹp</Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._25,
    paddingBottom: spacingY._15,
    gap: spacingY._15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    flex: 1,
    marginLeft: spacingX._7,
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  info: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  inputLabel: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  damageSection: {
    borderWidth: 1,
    borderRadius: radius._12,
    padding: spacingX._12,
    gap: spacingY._10,
  },
  draftCard: {
    borderWidth: 1,
    borderRadius: radius._12,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    gap: spacingY._7,
  },
  draftTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  itemRow: {
    flexDirection: 'row',
    gap: spacingX._7,
  },
  itemChip: {
    minWidth: 150,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
    gap: spacingY._5,
  },
  itemName: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  itemCost: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },
  detailRow: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._7,
    paddingVertical: spacingY._5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._7,
  },
  detailInfo: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: 2,
  },
  qtyWrap: {
    width: 84,
    flexShrink: 0,
    alignSelf: 'center',
  },
  qtyStepper: {
    height: 34,
    borderWidth: 1,
    borderRadius: radius._10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingHorizontal: spacingX._5,
  },
  qtyButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    minWidth: 18,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    includeFontPadding: false,
  },
  pricingBox: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
    gap: spacingY._5,
  },
  pricingText: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  pricingTotal: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    fontWeight: '700',
  },
  photoSection: {
    borderWidth: 1,
    borderRadius: radius._12,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    gap: spacingY._10,
  },
  severityRow: {
    flexDirection: 'row',
    gap: spacingX._7,
  },
  severityButton: {
    flex: 1,
    borderRadius: radius._10,
    paddingVertical: spacingY._10,
    alignItems: 'center',
  },
  severityText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  photoActionRow: {
    flexDirection: 'row',
    gap: spacingX._10,
  },
  photoActionButton: {
    height: 80,
    borderRadius: radius._10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingY._5,
  },
  photoActionLabel: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    color: '#fff',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  photosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingX._10,
  },
  thumbWrap: {
    width: 96,
    height: 96,
    borderRadius: radius._10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#dbe3ef',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  removeIcon: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 99,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButton: {
    borderRadius: radius._10,
    paddingVertical: spacingY._12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  actionButton: {
    borderRadius: radius._10,
    paddingVertical: spacingY._12,
    alignItems: 'center',
  },
  actionButtonRow: {
    flexDirection: 'row',
    gap: spacingX._10,
  },
  actionButtonHalf: {
    flex: 1,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  supplyQtyWrap: {
    width: 108,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    flexShrink: 0,
  },
  supplyQtyButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplyQtyInput: {
    flex: 1,
    height: 32,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    paddingVertical: 0,
    paddingHorizontal: 4,
    includeFontPadding: false,
  },
  incidentSection: {
    borderWidth: 1,
    borderRadius: radius._12,
    padding: spacingX._12,
    gap: spacingY._10,
  },
  incidentItem: {
    borderWidth: 1,
    borderRadius: radius._10,
    padding: spacingX._10,
    gap: spacingY._7,
    marginBottom: spacingY._7,
  },
  incidentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  incidentSeverity: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  incidentStatus: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },
  lostFoundItemName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    fontFamily: Fonts.sans,
    marginRight: spacingX._10,
  },
  incidentDescription: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    lineHeight: 18,
  },
  incidentThumb: {
    width: 80,
    height: 80,
    borderRadius: radius._10,
    marginRight: spacingX._7,
  },
  incidentTime: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },
  workDoneButton: {
    borderRadius: radius._15,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacingY._10,
  },
  workDoneButtonText: {
    fontSize: 17,
    fontWeight: '800',
    fontFamily: Fonts.sans,
    color: '#fff',
    letterSpacing: 0.3,
  },
  cameraModalRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraModalView: {
    flex: 1,
  },
  cameraModalOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacingX._12,
    paddingBottom: spacingY._20,
    paddingTop: spacingY._10,
    backgroundColor: '#00000088',
    gap: spacingY._7,
  },
  cameraActions: {
    flexDirection: 'row',
    gap: spacingX._7,
  },
  cameraButton: {
    flex: 1,
    borderRadius: radius._10,
    paddingVertical: spacingY._10,
    alignItems: 'center',
  },
  cameraButtonText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Fonts.sans,
    color: '#fff',
  },
  cameraHint: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    color: '#e2e8f0',
    textAlign: 'center',
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxClose: {
    position: 'absolute',
    top: 52,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00000060',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  lightboxImage: {
    width: '100%',
    height: '80%',
  },
});
