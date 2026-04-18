import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
    createLostFoundItem,
    getMyShiftAssignments,
    getPodClusters,
    getPodsByClusterId,
    getWarehouseList,
} from '@/services/cleaner-dashboard.service';
import type {
    CreateLostFoundItemPayload,
    PodCluster,
    PodDetails,
    StaffShiftAssignment,
    WarehouseListItem,
} from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

export default function ReportLostFoundScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { token } = useAuth();

  // ── Form state ──
  const [itemName, setItemName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPodId, setSelectedPodId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Selector lists ──
  const [clusterList, setClusterList] = useState<PodCluster[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState('');
  const [podListForCluster, setPodListForCluster] = useState<PodDetails[]>([]);
  const [warehouseList, setWarehouseList] = useState<WarehouseListItem[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingClusterPods, setLoadingClusterPods] = useState(false);
  const [showClusterSelector, setShowClusterSelector] = useState(false);
  const [showPodSelector, setShowPodSelector] = useState(false);
  const [showWarehouseSelector, setShowWarehouseSelector] = useState(false);

  // ── Derived display names ──
  const selectedClusterName = selectedClusterId
    ? (clusterList.find((c) => String(c.id || '') === selectedClusterId)?.name ?? selectedClusterId)
    : 'Chưa chọn khu vực';

  const selectedPodName = (() => {
    if (!selectedPodId) return 'Chưa chọn pod';
    const pod = podListForCluster.find((p) => String(p.id || '') === selectedPodId);
    return pod?.name ?? (pod?.code ? `Pod ${pod.code}` : selectedPodId);
  })();

  const selectedWarehouseName = selectedWarehouseId
    ? (warehouseList.find((w) => String(w.id || '') === selectedWarehouseId)?.name ?? selectedWarehouseId)
    : 'Chưa chọn kho';

  // ── Load pods when cluster changes ──
  const loadPodsForCluster = useCallback(
    async (clusterId: string) => {
      if (!clusterId || !token) { setPodListForCluster([]); return; }
      setLoadingClusterPods(true);
      try {
        const pods = await getPodsByClusterId(token, clusterId);
        setPodListForCluster(pods);
      } catch {
        setPodListForCluster([]);
      } finally {
        setLoadingClusterPods(false);
      }
    },
    [token],
  );

  // ── Initial data load ──
  useEffect(() => {
    if (!token) return;
    setLoadingLists(true);
    const today = new Date().toISOString().split('T')[0];
    Promise.all([
      getMyShiftAssignments(token, { work_date: today }).catch((): StaffShiftAssignment[] => []),
      getWarehouseList(token).catch((): WarehouseListItem[] => []),
      getPodClusters(token).catch((): PodCluster[] => []),
    ])
      .then(async ([assignments, warehouses, clusters]) => {
        setWarehouseList(warehouses);
        setClusterList(clusters);

        const shiftLocationId = (assignments[0] as StaffShiftAssignment | undefined)?.location?.id;
        const matchedCluster = shiftLocationId
          ? clusters.find((c) => String(c.location_id || '') === String(shiftLocationId))
          : undefined;
        const defaultCluster = matchedCluster ?? clusters[0];

        if (defaultCluster?.id) {
          const defaultId = String(defaultCluster.id);
          setSelectedClusterId(defaultId);
          await loadPodsForCluster(defaultId);
        }
      })
      .catch(() => null)
      .finally(() => setLoadingLists(false));
  }, [token, loadPodsForCluster]);

  // ── Submit ──
  const handleSubmit = async () => {
    Keyboard.dismiss();
    const normalizedName = itemName.trim();
    if (!normalizedName) {
      setCreateError('Vui lòng nhập tên món đồ.');
      return;
    }
    if (!token) return;

    const payload: CreateLostFoundItemPayload = {
      item_name: normalizedName,
      description: description.trim() || undefined,
      pod_id: selectedPodId || null,
      warehouse_id: selectedWarehouseId || null,
    };

    setCreating(true);
    setCreateError(null);

    try {
      await createLostFoundItem(token, payload);
      Alert.alert('Thành công', 'Đã báo cáo đồ tìm thấy.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (err) {
      setCreateError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>

            {/* ── Thông tin món đồ ── */}
            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.cardTitle, { color: palette.text }]}>Thông tin món đồ</Text>

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
            </View>

            {/* ── Vị trí tìm thấy ── */}
            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.cardTitle, { color: palette.text }]}>Vị trí tìm thấy</Text>

              {/* Cluster */}
              <Text style={[styles.fieldLabel, { color: palette.text }]}>Khu vực (Cluster)</Text>
              <Pressable
                style={[styles.selector, { borderColor: palette.border, backgroundColor: palette.surface }]}
                onPress={() => {
                  setShowClusterSelector((v) => !v);
                  setShowPodSelector(false);
                  setShowWarehouseSelector(false);
                }}>
                <Text style={[styles.selectorText, { color: selectedClusterId ? palette.text : palette.neutral500 }]}>
                  {loadingLists ? 'Đang tải...' : selectedClusterName}
                </Text>
                <MaterialIcons
                  name={showClusterSelector ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={20}
                  color={palette.textMuted}
                />
              </Pressable>
              {showClusterSelector && (
                <ScrollView
                  style={[styles.dropdownList, { borderColor: palette.border, backgroundColor: palette.background }]}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled">
                  {loadingLists ? (
                    <ActivityIndicator color={palette.primary} style={{ padding: 12 }} />
                  ) : (
                    <>
                      <Pressable
                        style={[styles.dropdownItem, { borderColor: palette.border, backgroundColor: !selectedClusterId ? `${palette.primary}22` : palette.surface }]}
                        onPress={() => { setSelectedClusterId(''); setPodListForCluster([]); setSelectedPodId(''); setShowClusterSelector(false); }}>
                        <Text style={[styles.dropdownText, { color: palette.text }]}>Không chọn khu vực</Text>
                      </Pressable>
                      {clusterList.length === 0 ? (
                        <Text style={[styles.emptyHint, { color: palette.textMuted }]}>Không có khu vực nào.</Text>
                      ) : clusterList.map((cluster) => {
                        const cId = String(cluster.id || '');
                        if (!cId) return null;
                        return (
                          <Pressable
                            key={cId}
                            style={[styles.dropdownItem, { borderColor: palette.border, backgroundColor: selectedClusterId === cId ? `${palette.primary}22` : palette.surface }]}
                            onPress={() => { setSelectedClusterId(cId); setSelectedPodId(''); setShowClusterSelector(false); void loadPodsForCluster(cId); }}>
                            <Text style={[styles.dropdownText, { color: palette.text }]}>{cluster.name || cId}</Text>
                          </Pressable>
                        );
                      })}
                    </>
                  )}
                </ScrollView>
              )}

              {/* Pod */}
              <Text style={[styles.fieldLabel, { color: palette.text }]}>Pod tìm thấy</Text>
              <Pressable
                style={[styles.selector, { borderColor: palette.border, backgroundColor: palette.surface, opacity: selectedClusterId ? 1 : 0.5 }]}
                disabled={!selectedClusterId}
                onPress={() => { setShowPodSelector((v) => !v); setShowClusterSelector(false); setShowWarehouseSelector(false); }}>
                <Text style={[styles.selectorText, { color: selectedPodId ? palette.text : palette.neutral500 }]}>
                  {selectedClusterId ? selectedPodName : 'Chọn khu vực trước'}
                </Text>
                <MaterialIcons
                  name={showPodSelector ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={20}
                  color={palette.textMuted}
                />
              </Pressable>
              {showPodSelector && (
                <ScrollView
                  style={[styles.dropdownList, { borderColor: palette.border, backgroundColor: palette.background }]}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled">
                  {loadingClusterPods ? (
                    <ActivityIndicator color={palette.primary} style={{ padding: 12 }} />
                  ) : (
                    <>
                      <Pressable
                        style={[styles.dropdownItem, { borderColor: palette.border, backgroundColor: !selectedPodId ? `${palette.primary}22` : palette.surface }]}
                        onPress={() => { setSelectedPodId(''); setShowPodSelector(false); }}>
                        <Text style={[styles.dropdownText, { color: palette.text }]}>Không chọn pod</Text>
                      </Pressable>
                      {podListForCluster.length === 0 ? (
                        <Text style={[styles.emptyHint, { color: palette.textMuted }]}>Không có pod nào trong khu vực này.</Text>
                      ) : podListForCluster.map((pod) => {
                        const pId = String(pod.id || '');
                        if (!pId) return null;
                        return (
                          <Pressable
                            key={pId}
                            style={[styles.dropdownItem, { borderColor: palette.border, backgroundColor: selectedPodId === pId ? `${palette.primary}22` : palette.surface }]}
                            onPress={() => { setSelectedPodId(pId); setShowPodSelector(false); }}>
                            <Text style={[styles.dropdownText, { color: palette.text }]}>
                              {pod.name || (pod.code ? `Pod ${pod.code}` : pId)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </>
                  )}
                </ScrollView>
              )}

              {/* Warehouse */}
              <Text style={[styles.fieldLabel, { color: palette.text }]}>Kho lưu giữ</Text>
              <Pressable
                style={[styles.selector, { borderColor: palette.border, backgroundColor: palette.surface }]}
                onPress={() => { setShowWarehouseSelector((v) => !v); setShowPodSelector(false); setShowClusterSelector(false); }}>
                <Text style={[styles.selectorText, { color: selectedWarehouseId ? palette.text : palette.neutral500 }]}>
                  {selectedWarehouseName}
                </Text>
                <MaterialIcons
                  name={showWarehouseSelector ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={20}
                  color={palette.textMuted}
                />
              </Pressable>
              {showWarehouseSelector && (
                <ScrollView
                  style={[styles.dropdownList, { borderColor: palette.border, backgroundColor: palette.background }]}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled">
                  {loadingLists ? (
                    <ActivityIndicator color={palette.primary} style={{ padding: 12 }} />
                  ) : (
                    <>
                      <Pressable
                        style={[styles.dropdownItem, { borderColor: palette.border, backgroundColor: !selectedWarehouseId ? `${palette.primary}22` : palette.surface }]}
                        onPress={() => { setSelectedWarehouseId(''); setShowWarehouseSelector(false); }}>
                        <Text style={[styles.dropdownText, { color: palette.text }]}>Không chọn kho</Text>
                      </Pressable>
                      {warehouseList.length === 0 ? (
                        <Text style={[styles.emptyHint, { color: palette.textMuted }]}>Không có kho nào.</Text>
                      ) : warehouseList.map((wh) => {
                        const id = String(wh.id || '');
                        if (!id) return null;
                        return (
                          <Pressable
                            key={id}
                            style={[styles.dropdownItem, { borderColor: palette.border, backgroundColor: selectedWarehouseId === id ? `${palette.primary}22` : palette.surface }]}
                            onPress={() => { setSelectedWarehouseId(id); setShowWarehouseSelector(false); }}>
                            <Text style={[styles.dropdownText, { color: palette.text }]}>{wh.name || id}</Text>
                          </Pressable>
                        );
                      })}
                    </>
                  )}
                </ScrollView>
              )}
            </View>

            {/* ── Lỗi ── */}
            {createError ? (
              <View style={[styles.errorBox, { backgroundColor: `${palette.error}15`, borderColor: `${palette.error}40` }]}>
                <Text style={[styles.errorText, { color: palette.error }]}>{createError}</Text>
              </View>
            ) : null}

            {/* ── Gửi ── */}
            <Pressable
              style={[styles.submitButton, { backgroundColor: palette.primary, opacity: creating ? 0.7 : 1 }]}
              disabled={creating}
              onPress={() => void handleSubmit()}>
              {creating ? (
                <ActivityIndicator color={palette.white} />
              ) : (
                <Text style={[styles.submitButtonText, { color: palette.white }]}>Gửi báo cáo</Text>
              )}
            </Pressable>

          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._15,
    paddingBottom: spacingY._30,
    gap: spacingY._12,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius._12,
    paddingHorizontal: spacingX._15,
    paddingVertical: spacingY._12,
    gap: spacingY._7,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Fonts.sans,
    marginTop: spacingY._5,
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
    minHeight: 80,
    textAlignVertical: 'top',
  },
  selector: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorText: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    flex: 1,
  },
  dropdownList: {
    borderWidth: 1,
    borderRadius: radius._10,
    maxHeight: 220,
  },
  dropdownItem: {
    borderBottomWidth: 1,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
  },
  dropdownText: {
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  emptyHint: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
  },
  errorBox: {
    borderRadius: radius._10,
    borderWidth: 1,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
  },
  errorText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  submitButton: {
    borderRadius: radius._10,
    paddingVertical: spacingY._12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
});
