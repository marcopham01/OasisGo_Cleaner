import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
  getMyLostFoundItems,
  getMyShiftAssignments,
  getPodClusters,
  getPodsByClusterId,
  getWarehouseList,
  updateLostFoundStatus,
} from '@/services/cleaner-dashboard.service';
import type {
  CreateLostFoundItemPayload,
  LostFoundItem,
  LostFoundStatus,
  PodCluster,
  PodDetails,
  StaffShiftAssignment,
  WarehouseListItem,
} from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

interface LostFoundTabProps {
  token: string;
  isDark: boolean;
  palette: typeof Colors.light;
  onErrorChange?: (error: string | null) => void;
}

const LOST_FOUND_STATUS_TRANSITIONS: Record<string, LostFoundStatus[]> = {
  FOUND: ['CLAIMED', 'DISPOSED', 'RETURNED_TO_USER'],
  CLAIMED: ['RETURNED_TO_USER'],
  DISPOSED: [],
  RETURNED_TO_USER: [],
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

function statusColor(status: string | undefined, isDark: boolean) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'FOUND') return isDark ? '#60a5fa' : '#2563eb';
  if (normalized === 'CLAIMED') return isDark ? '#34d399' : '#10b981';
  if (normalized === 'DISPOSED') return isDark ? '#fb7185' : '#e11d48';
  if (normalized === 'RETURNED_TO_USER') return isDark ? '#a78bfa' : '#7c3aed';
  return isDark ? '#94a3b8' : '#64748b';
}

function statusLabel(status: string | undefined) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'FOUND') return 'Đã tìm thấy';
  if (normalized === 'CLAIMED') return 'Đã nhận';
  if (normalized === 'DISPOSED') return 'Đã xử lý';
  if (normalized === 'RETURNED_TO_USER') return 'Đã trả';
  return normalized || '-';
}

function nextStatusLabel(status: LostFoundStatus) {
  if (status === 'CLAIMED') return 'Đánh dấu đã nhận';
  if (status === 'DISPOSED') return 'Đánh dấu đã xử lý';
  if (status === 'RETURNED_TO_USER') return 'Đánh dấu đã trả';
  return status;
}

export default function LostFoundTab({ token, isDark, palette, onErrorChange }: LostFoundTabProps) {
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // create form state
  const [itemName, setItemName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPodId, setSelectedPodId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [foundAt, setFoundAt] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // cluster/pod/warehouse lists
  const [clusterList, setClusterList] = useState<PodCluster[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState('');
  const [podListForCluster, setPodListForCluster] = useState<PodDetails[]>([]);
  const [warehouseList, setWarehouseList] = useState<WarehouseListItem[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingClusterPods, setLoadingClusterPods] = useState(false);
  const [showClusterSelector, setShowClusterSelector] = useState(false);
  const [showPodSelector, setShowPodSelector] = useState(false);
  const [showWarehouseSelector, setShowWarehouseSelector] = useState(false);

  const selectedClusterName = useMemo(() => {
    if (!selectedClusterId) return 'Chưa chọn khu vực';
    const cluster = clusterList.find((c) => String(c.id || '') === selectedClusterId);
    return cluster?.name || selectedClusterId;
  }, [selectedClusterId, clusterList]);

  const selectedPodName = useMemo(() => {
    if (!selectedPodId) return 'Chưa chọn pod';
    const pod = podListForCluster.find((p) => String(p.id || '') === selectedPodId);
    return pod?.name || (pod?.code ? `Pod ${pod.code}` : selectedPodId);
  }, [selectedPodId, podListForCluster]);

  const selectedWarehouseName = useMemo(() => {
    if (!selectedWarehouseId) return 'Chưa chọn kho';
    const wh = warehouseList.find((w) => String(w.id || '') === selectedWarehouseId);
    return wh?.name || selectedWarehouseId;
  }, [selectedWarehouseId, warehouseList]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    onErrorChange?.(null);

    try {
      const data = await getMyLostFoundItems(token, {});
      setItems(data);
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      onErrorChange?.(msg);
    } finally {
      setLoading(false);
    }
  }, [token, onErrorChange]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const loadSelectionLists = useCallback(async () => {
    setLoadingLists(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const [assignments, warehouses, clusters] = await Promise.all([
        getMyShiftAssignments(token, { work_date: today }).catch((): StaffShiftAssignment[] => []),
        getWarehouseList(token),
        getPodClusters(token),
      ]);
      setWarehouseList(warehouses);
      setClusterList(clusters);

      // Default-select the cluster whose location_id matches the cleaner's shift location
      const shiftLocationId = (assignments[0] as StaffShiftAssignment | undefined)?.location?.id;
      const matchedCluster = shiftLocationId
        ? clusters.find((c) => String(c.location_id || '') === String(shiftLocationId))
        : undefined;
      const defaultCluster = matchedCluster ?? clusters[0];

      if (defaultCluster?.id) {
        const defaultId = String(defaultCluster.id);
        setSelectedClusterId(defaultId);
        const pods = await getPodsByClusterId(token, defaultId);
        setPodListForCluster(pods);
      }
    } catch {
      // lists are optional; leave empty
    } finally {
      setLoadingLists(false);
    }
  }, [token]);

  const loadPodsForCluster = useCallback(async (clusterId: string) => {
    if (!clusterId) {
      setPodListForCluster([]);
      return;
    }
    setLoadingClusterPods(true);
    try {
      const pods = await getPodsByClusterId(token, clusterId);
      setPodListForCluster(pods);
    } catch {
      setPodListForCluster([]);
    } finally {
      setLoadingClusterPods(false);
    }
  }, [token]);

  const openCreateModal = useCallback(() => {
    setItemName('');
    setDescription('');
    setSelectedClusterId('');
    setPodListForCluster([]);
    setSelectedPodId('');
    setSelectedWarehouseId('');
    setFoundAt('');
    setCreateError(null);
    setShowClusterSelector(false);
    setShowPodSelector(false);
    setShowWarehouseSelector(false);
    setShowCreateModal(true);
    void loadSelectionLists();
  }, [loadSelectionLists]);

  const handleCreateItem = async () => {
    const normalizedName = itemName.trim();
    if (!normalizedName) {
      setCreateError('Vui lòng nhập tên món đồ.');
      return;
    }

    const payload: CreateLostFoundItemPayload = {
      item_name: normalizedName,
      description: description.trim() || undefined,
      pod_id: selectedPodId || null,
      warehouse_id: selectedWarehouseId || null,
      found_at: foundAt.trim() || undefined,
    };

    setCreating(true);
    setCreateError(null);

    try {
      const created = await createLostFoundItem(token, payload);
      setItems((prev) => [created, ...prev]);
      setShowCreateModal(false);
      Alert.alert('Thành công', 'Đã báo cáo đồ tìm thấy.');
    } catch (err) {
      setCreateError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (item: LostFoundItem, nextStatus: LostFoundStatus) => {
    const id = itemId(item);
    if (!id) return;

    setUpdatingItemId(id);

    try {
      const updated = await updateLostFoundStatus(token, id, nextStatus);
      setItems((prev) => prev.map((existing) => (itemId(existing) === id ? updated : existing)));
    } catch (err) {
      Alert.alert('Lỗi', getErrorMessage(err));
    } finally {
      setUpdatingItemId(null);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={styles.container}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: palette.text }]}>Đồ thất lạc đã báo</Text>
          <Pressable
            style={[styles.addButton, { backgroundColor: palette.primary }]}
            onPress={openCreateModal}>
            <Text style={[styles.addButtonText, { color: palette.white }]}>+ Báo tìm thấy đồ</Text>
          </Pressable>
        </View>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: palette.card, borderColor: palette.error }]}>
            <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
          </View>
        )}

        {loading ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : items.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>
              Bạn chưa có báo cáo đồ thất lạc nào.
            </Text>
          </View>
        ) : (
          items.map((item) => {
            const status = String(item.status || 'FOUND').toUpperCase();
            const nextStatuses = (LOST_FOUND_STATUS_TRANSITIONS[status] ?? []) as LostFoundStatus[];
            const id = itemId(item);

            return (
              <View
                key={id || Math.random()}
                style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={1}>
                    {String(item.item_name || '-')}
                  </Text>
                  <Text style={[styles.statusBadge, { color: statusColor(status, isDark) }]}>
                    {statusLabel(status)}
                  </Text>
                </View>

                {item.description ? (
                  <Text style={[styles.meta, { color: palette.textMuted }]}>
                    {String(item.description)}
                  </Text>
                ) : null}

                <View style={styles.metaGrid}>
                  <MetaRow
                    label="Pod"
                    value={item.pod_name || item.pod_id || null}
                    palette={palette}
                  />
                  <MetaRow
                    label="Kho"
                    value={item.warehouse_name || item.warehouse_id || null}
                    palette={palette}
                  />
                  <MetaRow
                    label="Thời điểm tìm"
                    value={formatDateTime(item.found_at)}
                    palette={palette}
                  />
                  {item.claimed_at ? (
                    <MetaRow
                      label="Đã nhận lúc"
                      value={formatDateTime(item.claimed_at)}
                      palette={palette}
                    />
                  ) : null}
                </View>

                {nextStatuses.length > 0 && (
                  <View style={styles.actionRow}>
                    {nextStatuses.map((next) => (
                      <Pressable
                        key={`${id}_${next}`}
                        style={[styles.statusButton, { borderColor: palette.border, backgroundColor: palette.surface }]}
                        disabled={updatingItemId === id}
                        onPress={() => void handleUpdateStatus(item, next)}>
                        {updatingItemId === id ? (
                          <ActivityIndicator size="small" color={palette.primary} />
                        ) : (
                          <Text style={[styles.statusButtonText, { color: palette.primary }]}>
                            {nextStatusLabel(next)}
                          </Text>
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* Create Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: palette.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Báo cáo đồ tìm thấy</Text>
              <Pressable onPress={() => setShowCreateModal(false)}>
                <Text style={[styles.modalClose, { color: palette.textMuted }]}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <Text style={[styles.fieldLabel, { color: palette.text }]}>Tên món đồ *</Text>
              <TextInput
                style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
                value={itemName}
                onChangeText={setItemName}
                placeholder="VD: Ví da, Điện thoại iPhone..."
                placeholderTextColor={palette.neutral500}
              />

              <Text style={[styles.fieldLabel, { color: palette.text }]}>Mô tả</Text>
              <TextInput
                style={[styles.input, styles.textArea, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Mô tả thêm về món đồ (màu sắc, đặc điểm...)"
                placeholderTextColor={palette.neutral500}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.fieldLabel, { color: palette.text }]}>Khu vực (Cluster)</Text>
              <Pressable
                style={[styles.selectorTrigger, { borderColor: palette.border, backgroundColor: palette.surface }]}
                onPress={() => {
                  setShowClusterSelector((v) => !v);
                  setShowPodSelector(false);
                  setShowWarehouseSelector(false);
                }}>
                <Text style={[styles.selectorTriggerText, { color: selectedClusterId ? palette.text : palette.neutral500 }]}>
                  {loadingLists ? 'Đang tải...' : selectedClusterName}
                </Text>
                <Text style={[styles.chevron, { color: palette.textMuted }]}>{showClusterSelector ? '▲' : '▼'}</Text>
              </Pressable>

              {showClusterSelector && (
                <ScrollView
                  style={[styles.selectorList, { borderColor: palette.border, backgroundColor: palette.background }]}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled">
                  {loadingLists ? (
                    <ActivityIndicator color={palette.primary} style={{ padding: spacingY._10 }} />
                  ) : (
                    <>
                      <Pressable
                        style={[styles.selectorItem, { borderColor: palette.border, backgroundColor: !selectedClusterId ? `${palette.primary}22` : palette.surface }]}
                        onPress={() => { setSelectedClusterId(''); setPodListForCluster([]); setSelectedPodId(''); setShowClusterSelector(false); }}>
                        <Text style={[styles.selectorItemText, { color: palette.text }]}>Không chọn khu vực</Text>
                      </Pressable>
                      {clusterList.length === 0 ? (
                        <Text style={[styles.emptyText, { color: palette.textMuted, padding: spacingX._10 }]}>Không có khu vực nào.</Text>
                      ) : (
                        clusterList.map((cluster) => {
                          const cId = String(cluster.id || '');
                          if (!cId) return null;
                          return (
                            <Pressable
                              key={cId}
                              style={[styles.selectorItem, { borderColor: palette.border, backgroundColor: selectedClusterId === cId ? `${palette.primary}22` : palette.surface }]}
                              onPress={() => {
                                setSelectedClusterId(cId);
                                setSelectedPodId('');
                                setShowClusterSelector(false);
                                void loadPodsForCluster(cId);
                              }}>
                              <Text style={[styles.selectorItemText, { color: palette.text }]}>{cluster.name || cId}</Text>
                            </Pressable>
                          );
                        })
                      )}
                    </>
                  )}
                </ScrollView>
              )}

              <Text style={[styles.fieldLabel, { color: palette.text }]}>Pod tìm thấy</Text>
              <Pressable
                style={[styles.selectorTrigger, { borderColor: palette.border, backgroundColor: palette.surface, opacity: selectedClusterId ? 1 : 0.5 }]}
                disabled={!selectedClusterId}
                onPress={() => {
                  setShowPodSelector((v) => !v);
                  setShowClusterSelector(false);
                  setShowWarehouseSelector(false);
                }}>
                <Text style={[styles.selectorTriggerText, { color: selectedPodId ? palette.text : palette.neutral500 }]}>
                  {selectedClusterId ? selectedPodName : 'Chọn khu vực trước'}
                </Text>
                <Text style={[styles.chevron, { color: palette.textMuted }]}>{showPodSelector ? '▲' : '▼'}</Text>
              </Pressable>

              {showPodSelector && (
                <ScrollView
                  style={[styles.selectorList, { borderColor: palette.border, backgroundColor: palette.background }]}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled">
                  {loadingClusterPods ? (
                    <ActivityIndicator color={palette.primary} style={{ padding: spacingY._10 }} />
                  ) : (
                    <>
                      <Pressable
                        style={[styles.selectorItem, { borderColor: palette.border, backgroundColor: !selectedPodId ? `${palette.primary}22` : palette.surface }]}
                        onPress={() => { setSelectedPodId(''); setShowPodSelector(false); }}>
                        <Text style={[styles.selectorItemText, { color: palette.text }]}>Không chọn pod</Text>
                      </Pressable>
                      {podListForCluster.length === 0 ? (
                        <Text style={[styles.emptyText, { color: palette.textMuted, padding: spacingX._10 }]}>Không có pod nào trong khu vực này.</Text>
                      ) : (
                        podListForCluster.map((pod) => {
                          const pId = String(pod.id || '');
                          if (!pId) return null;
                          return (
                            <Pressable
                              key={pId}
                              style={[styles.selectorItem, { borderColor: palette.border, backgroundColor: selectedPodId === pId ? `${palette.primary}22` : palette.surface }]}
                              onPress={() => { setSelectedPodId(pId); setShowPodSelector(false); }}>
                              <Text style={[styles.selectorItemText, { color: palette.text }]}>
                                {pod.name || (pod.code ? `Pod ${pod.code}` : pId)}
                              </Text>
                            </Pressable>
                          );
                        })
                      )}
                    </>
                  )}
                </ScrollView>
              )}

              <Text style={[styles.fieldLabel, { color: palette.text }]}>Kho lưu giữ</Text>
              <Pressable
                style={[styles.selectorTrigger, { borderColor: palette.border, backgroundColor: palette.surface }]}
                onPress={() => {
                  setShowWarehouseSelector((v) => !v);
                  setShowPodSelector(false);
                  setShowClusterSelector(false);
                }}>
                <Text style={[styles.selectorTriggerText, { color: selectedWarehouseId ? palette.text : palette.neutral500 }]}>
                  {selectedWarehouseName}
                </Text>
                <Text style={[styles.chevron, { color: palette.textMuted }]}>{showWarehouseSelector ? '▲' : '▼'}</Text>
              </Pressable>

              {showWarehouseSelector && (
                <ScrollView
                  style={[styles.selectorList, { borderColor: palette.border, backgroundColor: palette.background }]}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled">
                  {loadingLists ? (
                    <ActivityIndicator color={palette.primary} style={{ padding: spacingY._10 }} />
                  ) : (
                    <>
                      <Pressable
                        style={[styles.selectorItem, { borderColor: palette.border, backgroundColor: !selectedWarehouseId ? `${palette.primary}22` : palette.surface }]}
                        onPress={() => { setSelectedWarehouseId(''); setShowWarehouseSelector(false); }}>
                        <Text style={[styles.selectorItemText, { color: palette.text }]}>Không chọn kho</Text>
                      </Pressable>
                      {warehouseList.length === 0 ? (
                        <Text style={[styles.emptyText, { color: palette.textMuted, padding: spacingX._10 }]}>Không có kho nào.</Text>
                      ) : (
                        warehouseList.map((wh) => {
                          const id = String(wh.id || '');
                          if (!id) return null;
                          return (
                            <Pressable
                              key={id}
                              style={[styles.selectorItem, { borderColor: palette.border, backgroundColor: selectedWarehouseId === id ? `${palette.primary}22` : palette.surface }]}
                              onPress={() => { setSelectedWarehouseId(id); setShowWarehouseSelector(false); }}>
                              <Text style={[styles.selectorItemText, { color: palette.text }]}>{wh.name || id}</Text>
                            </Pressable>
                          );
                        })
                      )}
                    </>
                  )}
                </ScrollView>
              )}

              {createError ? (
                <Text style={[styles.inlineError, { color: palette.error }]}>{createError}</Text>
              ) : null}

              <Pressable
                style={[styles.submitButton, { backgroundColor: palette.primary, opacity: creating ? 0.7 : 1 }]}
                disabled={creating}
                onPress={() => void handleCreateItem()}>
                {creating ? (
                  <ActivityIndicator color={palette.white} />
                ) : (
                  <Text style={[styles.submitButtonText, { color: palette.white }]}>Gửi báo cáo</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function MetaRow({
  label,
  value,
  palette,
}: {
  label: string;
  value: string | null | undefined;
  palette: typeof Colors.light;
}) {
  if (!value || value === '-') return null;
  return (
    <View style={styles.metaRow}>
      <Text style={[styles.metaLabel, { color: palette.textMuted }]}>{label}:</Text>
      <Text style={[styles.metaValue, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._15,
    gap: spacingY._12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    flex: 1,
  },
  addButton: {
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._7,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  centerLoader: {
    paddingVertical: spacingY._30,
    alignItems: 'center',
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: radius._12,
    padding: spacingX._20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    textAlign: 'center',
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
  card: {
    borderWidth: 1,
    borderRadius: radius._12,
    padding: spacingX._12,
    gap: spacingY._7,
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
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.mono,
  },
  meta: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  metaGrid: {
    gap: spacingY._5,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacingX._5,
    alignItems: 'flex-start',
  },
  metaLabel: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    flex: 1,
  },
  actionRow: {
    marginTop: spacingY._5,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingX._7,
  },
  statusButton: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
    minWidth: 80,
    alignItems: 'center',
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: radius._20,
    borderTopRightRadius: radius._20,
    maxHeight: '90%',
    paddingBottom: spacingY._20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  modalClose: {
    fontSize: 18,
    fontWeight: '600',
    padding: spacingX._5,
  },
  modalBody: {
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Fonts.sans,
    marginBottom: spacingY._5,
    marginTop: spacingY._10,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  selectorTrigger: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorTriggerText: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    flex: 1,
  },
  chevron: {
    fontSize: 12,
    marginLeft: spacingX._7,
  },
  selectorList: {
    borderWidth: 1,
    borderRadius: radius._10,
    marginTop: spacingY._5,
    maxHeight: 220,
  },
  selectorItem: {
    borderBottomWidth: 1,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
  },
  selectorItemText: {
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  inlineError: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    fontWeight: '600',
    marginTop: spacingY._7,
  },
  submitButton: {
    borderRadius: radius._10,
    paddingVertical: spacingY._12,
    alignItems: 'center',
    marginTop: spacingY._15,
    marginBottom: spacingY._10,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
});
