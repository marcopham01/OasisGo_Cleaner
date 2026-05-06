import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ResizeMode, Video } from 'expo-av';
import { CameraMode, CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { RefreshCw, Zap, ZapOff } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import VideoThumb from '@/components/video-thumb';
import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
    createDamageReport,
    getDamageReportItems,
    getDamageServiceCatalogs,
    getMyWorkRosters,
    getPodsByClusterId,
} from '@/services/cleaner-dashboard.service';
import type {
    CreateDamageReportPayload,
    DamageReportItem,
    DamageServiceCatalogItem,
    IncidentSeverity,
    PodCluster,
    PodDetails,
    StaffWorkRoster,
} from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

const SEVERITY_OPTIONS: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function getSeverityLabel(s: IncidentSeverity) {
  if (s === 'LOW') return 'Thấp';
  if (s === 'MEDIUM') return 'Trung bình';
  if (s === 'HIGH') return 'Cao';
  if (s === 'CRITICAL') return 'Nghiêm trọng';
  return s;
}

function formatVnd(value?: number | null) {
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('vi-VN').format(Number(value)) + ' đ';
}

function parseQty(value: string) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

type PendingMedia = { id: string; uri: string; mediaType: 'IMAGE' | 'VIDEO'; precompressed?: boolean };

export default function DamageReportScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { token } = useAuth();
  const insets = useSafeAreaInsets();

  // ── Locked context (when navigated from cleaning task) ──
  const params = useLocalSearchParams<{
    cleaningTaskId?: string;
    bookingId?: string;
    podId?: string;
    podName?: string;
  }>();
  const lockedCleaningTaskId = params.cleaningTaskId?.trim() || undefined;
  const lockedBookingId = params.bookingId?.trim() || undefined;
  const lockedPodId = params.podId?.trim() || undefined;
  const lockedPodName = params.podName?.trim() || undefined;

  // ── Form state ──
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('MEDIUM');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [detailQtyById, setDetailQtyById] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Catalog / cluster state ──
  const [clusterList, setClusterList] = useState<PodCluster[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState('');
  const [podList, setPodList] = useState<PodDetails[]>([]);
  const [selectedPodId, setSelectedPodId] = useState('');
  const [loadingPods, setLoadingPods] = useState(false);
  const [showClusterSelector, setShowClusterSelector] = useState(false);
  const [showPodSelector, setShowPodSelector] = useState(false);
  const [items, setItems] = useState<DamageReportItem[]>([]);
  const [services, setServices] = useState<DamageServiceCatalogItem[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);

  // ── Camera / photo / video state ──
  const [capturedMedia, setCapturedMedia] = useState<PendingMedia[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('picture');
  const [isRecording, setIsRecording] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [lightboxIsVideo, setLightboxIsVideo] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [, requestVideoPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flashEnabled, setFlashEnabled] = useState(false);

  // ── Initial data load ──
  useEffect(() => {
    if (!token) return;
    setLoadingCatalogs(true);

    // When opened from a cleaning task, skip cluster/pod fetching — just load catalogs
    if (lockedCleaningTaskId) {
      if (lockedPodId) setSelectedPodId(lockedPodId);
      Promise.all([
        getDamageReportItems(token).catch((): DamageReportItem[] => []),
        getDamageServiceCatalogs(token).catch((): DamageServiceCatalogItem[] => []),
      ])
        .then(([drItems, drServices]) => {
          setItems(drItems.filter((it) => String(it.id || '').trim()));
          setServices(drServices);
        })
        .catch(() => null)
        .finally(() => setLoadingCatalogs(false));
      return;
    }

    Promise.all([
      getMyWorkRosters(token).catch((): StaffWorkRoster[] => []),
      getDamageReportItems(token).catch((): DamageReportItem[] => []),
      getDamageServiceCatalogs(token).catch((): DamageServiceCatalogItem[] => []),
    ])
      .then(([rosters, drItems, drServices]) => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayRosters = rosters.filter((r) => {
          if (r.is_active === false) return false;
          if (r.is_temporary) {
            return r.work_date ? String(r.work_date).slice(0, 10) === todayStr : false;
          }
          return true;
        });

        const seenIds = new Set<string>();
        const scopedClusters: PodCluster[] = [];
        for (const roster of todayRosters) {
          const cId = String(roster.cluster?.id || '').trim();
          if (cId && !seenIds.has(cId)) {
            seenIds.add(cId);
            scopedClusters.push({
              id: roster.cluster?.id,
              name: roster.cluster?.name,
              location_id: roster.cluster?.location_id ?? roster.location_id,
              description: roster.cluster?.description,
            });
          }
        }

        setClusterList(scopedClusters);
        setItems(drItems.filter((it) => String(it.id || '').trim()));
        setServices(drServices);

        const def = scopedClusters[0];
        if (def?.id) {
          const id = String(def.id);
          setSelectedClusterId(id);
          void loadPodsForCluster(id);
        } else {
          setSelectedClusterId('');
          setSelectedPodId('');
          setPodList([]);
        }
      })
      .catch(() => null)
      .finally(() => setLoadingCatalogs(false));
  }, [token, lockedCleaningTaskId, lockedPodId]);

  const loadPodsForCluster = useCallback(
    async (clusterId: string) => {
      if (!token || !clusterId) { setPodList([]); return; }
      setLoadingPods(true);
      try {
        const pods = await getPodsByClusterId(token, clusterId);
        setPodList(pods);
      } catch {
        setPodList([]);
      } finally {
        setLoadingPods(false);
      }
    },
    [token],
  );

  // ── Derived ──
  const selectedClusterName = useMemo(() => {
    if (!selectedClusterId) return 'Chưa chọn khu vực';
    return clusterList.find((c) => String(c.id || '') === selectedClusterId)?.name ?? selectedClusterId;
  }, [selectedClusterId, clusterList]);

  const selectedPodName = useMemo(() => {
    if (!selectedPodId) return 'Chưa chọn pod';
    const pod = podList.find((p) => String(p.id || '') === selectedPodId);
    return pod?.name ?? (pod?.code ? `Pod ${pod.code}` : selectedPodId);
  }, [selectedPodId, podList]);

  const selectedItemEntries = useMemo(
    () => items.filter((it) => selectedItemIds.includes(String(it.id || '').trim())),
    [items, selectedItemIds],
  );
  const selectedServiceEntries = useMemo(
    () => services.filter((s) => selectedServiceIds.includes(String(s.id || '').trim())),
    [services, selectedServiceIds],
  );
  const totalSelected = selectedItemIds.length + selectedServiceIds.length;

  const getQty = useCallback(
    (type: 'ITEM' | 'SERVICE', id: string) => parseQty(detailQtyById[`${type}:${id}`] ?? '1'),
    [detailQtyById],
  );

  const previewItemValue = useMemo(
    () => selectedItemEntries.reduce((sum, it) => sum + (Number(it.unit_cost) || 0) * getQty('ITEM', String(it.id || '').trim()), 0),
    [selectedItemEntries, getQty],
  );
  const previewServiceValue = useMemo(
    () => selectedServiceEntries.reduce((sum, s) => sum + (Number(s.base_price) || 0) * getQty('SERVICE', String(s.id || '').trim()), 0),
    [selectedServiceEntries, getQty],
  );

  // ── Actions ──
  const toggleDetail = (type: 'ITEM' | 'SERVICE', id: string) => {
    const key = `${type}:${id}`;
    const updateIds = (prev: string[]) => {
      const exists = prev.includes(id);
      setDetailQtyById((q) => {
        if (exists) {
          const { [key]: _removed, ...rest } = q;
          return rest;
        }
        return { ...q, [key]: q[key] || '1' };
      });
      return exists ? prev.filter((x) => x !== id) : [...prev, id];
    };
    if (type === 'ITEM') setSelectedItemIds(updateIds);
    else setSelectedServiceIds(updateIds);
  };

  const adjustQty = (type: 'ITEM' | 'SERVICE', id: string, delta: number) => {
    const key = `${type}:${id}`;
    setDetailQtyById((prev) => {
      const cur = parseQty(prev[key] ?? '1');
      return { ...prev, [key]: String(Math.max(1, cur + delta)) };
    });
  };

  const openCamera = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Không thể mở camera', 'Vui lòng cấp quyền camera.');
        return;
      }
    }
    // Request mic silently (fire-and-forget) so the camera modal opens immediately
    void requestVideoPermission();
    setIsCameraOpen(true);
  };

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.75,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets?.length) return;
    // Compress images sequentially to avoid running manipulateAsync in parallel (OOM risk)
    const newItems: PendingMedia[] = [];
    for (const asset of result.assets) {
      const isVideo = asset.type === 'video';
      let finalUri = asset.uri;
      let precompressed = false;
      if (!isVideo) {
        try {
          const compressed = await manipulateAsync(
            asset.uri,
            [{ resize: { width: 1280 } }],
            { compress: 0.7, format: SaveFormat.JPEG },
          );
          if (compressed?.uri) { finalUri = compressed.uri; precompressed = true; }
        } catch {
          // Compression failed — keep original URI
        }
      }
      newItems.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        uri: finalUri,
        mediaType: isVideo ? 'VIDEO' : 'IMAGE',
        precompressed,
      });
    }
    setCapturedMedia((prev) => [...prev, ...newItems]);
  };

  const handleCapturePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
      if (!photo?.uri) { Alert.alert('Lỗi', 'Không chụp được ảnh, vui lòng thử lại.'); return; }
      let finalUri = photo.uri;
      let precompressed = false;
      try {
        const compressed = await manipulateAsync(
          photo.uri,
          [{ resize: { width: 1280 } }],
          { compress: 0.7, format: SaveFormat.JPEG },
        );
        if (compressed?.uri) { finalUri = compressed.uri; precompressed = true; }
      } catch {
        // Compression failed — keep original URI
      }
      setCapturedMedia((prev) => [
        ...prev,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, uri: finalUri, mediaType: 'IMAGE', precompressed },
      ]);
      Alert.alert('Chụp ảnh thành công', 'Ảnh đã được thêm vào danh sách.', [{ text: 'OK', onPress: () => setIsCameraOpen(false) }]);
    } catch {
      Alert.alert('Lỗi', 'Không thể chụp ảnh, vui lòng thử lại.');
    }
  };

  const handleStartRecording = async () => {
    if (!cameraRef.current || isRecording) return;
    setIsRecording(true);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 60 });
      if (video?.uri) {
        setCapturedMedia((prev) => [
          ...prev,
          { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, uri: video.uri, mediaType: 'VIDEO' },
        ]);
        setIsCameraOpen(false);
        Alert.alert('Quảy video thành công', 'Video đã được thêm vào danh sách.', [{ text: 'OK' }]);
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể quay video, vui lòng thử lại.');
    } finally {
      setIsRecording(false);
    }
  };

  const handleStopRecording = () => {
    if (cameraRef.current && isRecording) {
      cameraRef.current.stopRecording();
    }
  };

  const handleSwitchMode = (newMode: CameraMode) => {
    if (newMode === cameraMode) return;
    if (isRecording) {
      cameraRef.current?.stopRecording();
      setIsRecording(false);
    }
    setCameraMode(newMode);
  };

  const removeMedia = (mediaId: string) => {
    setCapturedMedia((prev) => prev.filter((m) => m.id !== mediaId));
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    const desc = description.trim();
    if (!desc) {
      setError('Vui lòng nhập mô tả hư hại.');
      return;
    }
    if (totalSelected === 0) {
      setError('Vui lòng chọn ít nhất một món đồ hoặc dịch vụ.');
      return;
    }
    if (!token) return;

    const normalizedNote = note.trim() || undefined;
    const itemDetails = selectedItemIds.map((itemId) => ({
      type: 'ITEM' as const,
      item_id: itemId,
      quantity: getQty('ITEM', itemId),
      note: normalizedNote,
    }));
    const serviceDetails = selectedServiceIds.map((svcId) => ({
      type: 'SERVICE' as const,
      service_catalog_id: svcId,
      quantity: getQty('SERVICE', svcId),
      note: normalizedNote,
    }));
    const estimatedServiceFee = selectedServiceEntries.reduce(
      (sum, s) => sum + (Number(s.base_price) || 0) * getQty('SERVICE', String(s.id || '').trim()),
      0,
    );
    const payload: CreateDamageReportPayload = {
      cleaning_task_id: lockedCleaningTaskId,
      booking_id: lockedBookingId,
      pod_id: lockedCleaningTaskId ? (lockedPodId || undefined) : (selectedPodId || undefined),
      description: desc,
      details: [...itemDetails, ...serviceDetails],
      estimated_service_fee: estimatedServiceFee,
      severity,
      local_uris: capturedMedia.map((m) => m.uri),
      local_media: capturedMedia.map((m) => ({ uri: m.uri, mediaType: m.mediaType, precompressed: m.precompressed })),
    };

    setSubmitting(true);
    setError(null);
    try {
      await createDamageReport(token, payload);
      Alert.alert('Thành công', 'Đã gửi báo cáo hư hại.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
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

            {/* ── Vị trí (Cluster / Pod) ── */}
            <View style={[styles.incidentDraftCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.incidentDraftTitle, { color: palette.text }]}>Vị trí hư hại</Text>

              {lockedCleaningTaskId ? (
                /* Locked — values from cleaning task context */
                <View style={[styles.lockedField, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                  <MaterialIcons name="lock" size={16} color={palette.textMuted} style={{ marginRight: 6 }} />
                  <Text style={[styles.lockedFieldText, { color: palette.text }]}>
                    {lockedPodName ? `Pod: ${lockedPodName}` : lockedPodId ? `Pod ID: ${lockedPodId}` : 'Pod: (từ nhiệm vụ dọn dẹp)'}
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={[styles.subsectionTitle, { color: palette.text }]}>Khu vực (Cluster)</Text>
              <Pressable
                style={[styles.selector, { borderColor: palette.border, backgroundColor: palette.surface }]}
                onPress={() => { setShowClusterSelector((v) => !v); setShowPodSelector(false); }}>
                <Text style={[styles.selectorText, { color: selectedClusterId ? palette.text : palette.neutral500 }]}>
                  {loadingCatalogs ? 'Đang tải...' : selectedClusterName}
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
                  {loadingCatalogs ? (
                    <ActivityIndicator color={palette.primary} style={{ padding: 12 }} />
                  ) : (
                    <>
                      <Pressable
                        style={[styles.dropdownItem, { borderColor: palette.border, backgroundColor: !selectedClusterId ? `${palette.error}22` : palette.surface }]}
                        onPress={() => { setSelectedClusterId(''); setPodList([]); setSelectedPodId(''); setShowClusterSelector(false); }}>
                        <Text style={[styles.dropdownText, { color: palette.text }]}>Không chọn khu vực</Text>
                      </Pressable>
                      {clusterList.map((c) => {
                        const cId = String(c.id || '');
                        return (
                          <Pressable
                            key={cId}
                            style={[styles.dropdownItem, { borderColor: palette.border, backgroundColor: selectedClusterId === cId ? `${palette.error}22` : palette.surface }]}
                            onPress={() => { setSelectedClusterId(cId); setSelectedPodId(''); setShowClusterSelector(false); void loadPodsForCluster(cId); }}>
                            <Text style={[styles.dropdownText, { color: palette.text }]}>{c.name || cId}</Text>
                          </Pressable>
                        );
                      })}
                    </>
                  )}
                </ScrollView>
              )}

              <Text style={[styles.subsectionTitle, { color: palette.text }]}>Pod bị hư hại</Text>
              <Pressable
                style={[styles.selector, { borderColor: palette.border, backgroundColor: palette.surface, opacity: selectedClusterId ? 1 : 0.5 }]}
                disabled={!selectedClusterId}
                onPress={() => { setShowPodSelector((v) => !v); setShowClusterSelector(false); }}>
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
                  {loadingPods ? (
                    <ActivityIndicator color={palette.primary} style={{ padding: 12 }} />
                  ) : (
                    <>
                      <Pressable
                        style={[styles.dropdownItem, { borderColor: palette.border, backgroundColor: !selectedPodId ? `${palette.error}22` : palette.surface }]}
                        onPress={() => { setSelectedPodId(''); setShowPodSelector(false); }}>
                        <Text style={[styles.dropdownText, { color: palette.text }]}>Không chọn pod</Text>
                      </Pressable>
                      {podList.map((pod) => {
                        const pId = String(pod.id || '');
                        return (
                          <Pressable
                            key={pId}
                            style={[styles.dropdownItem, { borderColor: palette.border, backgroundColor: selectedPodId === pId ? `${palette.error}22` : palette.surface }]}
                            onPress={() => { setSelectedPodId(pId); setShowPodSelector(false); }}>
                            <Text style={[styles.dropdownText, { color: palette.text }]}>
                              {pod.name ?? (pod.code ? `Pod ${pod.code}` : pId)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </>
                  )}
                </ScrollView>
              )}
                </>
              )}
            </View>

            {/* ── Mô tả hư hại ── */}
            <View style={[styles.incidentDraftCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.incidentDraftTitle, { color: palette.text }]}>Thông tin báo cáo hư hại</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: palette.border,
                    color: palette.text,
                    backgroundColor: palette.surface,
                    minHeight: 86,
                    textAlignVertical: 'top',
                  },
                ]}
                value={description}
                onChangeText={setDescription}
                placeholder="Mô tả hư hại (bắt buộc)"
                placeholderTextColor={palette.neutral500}
                multiline
              />
            </View>

            {/* ── Món đồ + Dịch vụ chips ── */}
            <View style={[styles.incidentDraftCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.subsectionTitle, { color: palette.text }]}>Chọn những món đồ bị hư</Text>
              {loadingCatalogs ? (
                <ActivityIndicator color={palette.primary} style={{ paddingVertical: spacingY._10 }} />
              ) : items.filter((it) => String(it.item_type || '').toUpperCase() === 'REUSABLE').length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.damageItemRow}>
                    {items
                      .filter((it) => String(it.item_type || '').toUpperCase() === 'REUSABLE')
                      .map((it) => {
                        const itId = String(it.id || '').trim();
                        if (!itId) return null;
                        const sel = selectedItemIds.includes(itId);
                        return (
                          <Pressable
                            key={`item_${itId}`}
                            style={[
                              styles.damageItemChip,
                              sel
                                ? { backgroundColor: palette.error }
                                : { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 },
                            ]}
                            onPress={() => toggleDetail('ITEM', itId)}>
                            <Text style={[styles.damageItemName, { color: sel ? palette.white : palette.text }]} numberOfLines={1}>
                              {String(it.name || itId)}
                            </Text>
                          </Pressable>
                        );
                      })}
                  </View>
                </ScrollView>
              ) : (
                <Text style={[styles.info, { color: palette.textMuted }]}>Chưa có dữ liệu món đồ REUSABLE.</Text>
              )}

              <Text style={[styles.subsectionTitle, { color: palette.text }]}>Chọn vi phạm quy chuẩn dịch vụ</Text>
              {loadingCatalogs ? null : services.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.damageItemRow}>
                    {services.map((s) => {
                      const sId = String(s.id || '').trim();
                      if (!sId) return null;
                      const sel = selectedServiceIds.includes(sId);
                      return (
                        <Pressable
                          key={`svc_${sId}`}
                          style={[
                            styles.damageItemChip,
                            sel
                              ? { backgroundColor: palette.error }
                              : { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 },
                          ]}
                          onPress={() => toggleDetail('SERVICE', sId)}>
                          <Text style={[styles.damageItemName, { color: sel ? palette.white : palette.text }]} numberOfLines={1}>
                            {String(s.name || sId)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              ) : (
                <Text style={[styles.info, { color: palette.textMuted }]}>Chưa có dữ liệu SERVICE.</Text>
              )}

              <Text style={[styles.info, { color: palette.textMuted }]}>Đã chọn: {totalSelected} dòng</Text>
            </View>

            {/* ── Chi tiết đã chọn ── */}
            {totalSelected > 0 && (
              <View style={[styles.incidentDraftCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
                <Text style={[styles.incidentDraftTitle, { color: palette.text }]}>Chi tiết đã chọn</Text>
                <View style={styles.detailSelectionList}>
                  {[
                    ...selectedItemIds.map((id) => ({ type: 'ITEM' as const, id })),
                    ...selectedServiceIds.map((id) => ({ type: 'SERVICE' as const, id })),
                  ].map((entry) => {
                    const matched =
                      entry.type === 'ITEM'
                        ? items.find((it) => String(it.id || '').trim() === entry.id)
                        : services.find((s) => String(s.id || '').trim() === entry.id);
                    const typeLabel = entry.type === 'ITEM' ? 'Vật tư' : 'Dịch vụ';
                    const label = `${typeLabel} • ${String(matched?.name ?? entry.id)}`;
                    const qty = getQty(entry.type, entry.id);
                    return (
                      <View
                        key={`sel_${entry.type}_${entry.id}`}
                        style={[styles.detailSelectionRow, { borderColor: palette.border, backgroundColor: palette.surface }]}>
                        <View style={styles.detailSelectionInfo}>
                          <Text
                            style={[styles.damageItemName, styles.detailSelectionLabel, { color: palette.text }]}
                            numberOfLines={2}
                            ellipsizeMode="tail">
                            {label}
                          </Text>
                        </View>
                        <View style={styles.detailSelectionQtyWrap}>
                          <View style={[styles.detailSelectionQtyStepper, { borderColor: palette.border, backgroundColor: palette.card }]}>
                            <Pressable
                              style={styles.detailSelectionQtyButton}
                              disabled={qty <= 1}
                              onPress={() => adjustQty(entry.type, entry.id, -1)}>
                              <MaterialIcons name="remove" size={18} color={qty <= 1 ? palette.textMuted : palette.text} />
                            </Pressable>
                            <Text style={[styles.detailSelectionQtyValue, { color: palette.text }]}>{qty}</Text>
                            <Pressable
                              style={styles.detailSelectionQtyButton}
                              onPress={() => adjustQty(entry.type, entry.id, 1)}>
                              <MaterialIcons name="add" size={18} color={palette.text} />
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── Ghi chú + Pricing ── */}
            <View style={[styles.incidentDraftCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <View style={styles.damageNumericRow}>
                <View style={styles.damageNumericCol}>
                  <Text style={[styles.damageInputLabel, { color: palette.textMuted }]}>Ghi chú (tuỳ chọn)</Text>
                  <TextInput
                    style={[
                      styles.input,
                      styles.damageInput,
                      { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
                    ]}
                    value={note}
                    onChangeText={setNote}
                    placeholder="Ví dụ: vỡ do va chạm"
                    placeholderTextColor={palette.neutral500}
                  />
                </View>
              </View>

            </View>

            {/* ── Mức độ nghiêm trọng + Ảnh hư hại ── */}
            <View style={[styles.incidentPhotoSection, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.subsectionTitle, { color: palette.text }]}>Mức độ nghiêm trọng</Text>
              <View style={styles.photoTypeSelector}>
                {SEVERITY_OPTIONS.map((sev) => {
                  const sel = severity === sev;
                  return (
                    <Pressable
                      key={sev}
                      style={[
                        styles.typeButton,
                        sel
                          ? { backgroundColor: palette.error }
                          : { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 },
                      ]}
                      onPress={() => setSeverity(sev)}>
                      <Text style={[styles.typeButtonText, styles.damageSeverityButtonText, { color: sel ? palette.white : palette.text }]}>
                        {getSeverityLabel(sev)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.incidentPhotoTitle, { color: palette.text }]}>Ảnh / Video hư hại</Text>
              <View style={styles.incidentPhotoActionRow}>
                <Pressable
                  style={[styles.requiredCaptureTile, styles.incidentPhotoActionTile, { borderColor: '#1f7aed', backgroundColor: '#1f7aed' }]}
                  onPress={() => void openCamera()}>
                  <MaterialIcons name="photo-camera" size={24} color={palette.white} />
                  <Text style={[styles.requiredCaptureLabel, styles.incidentPhotoActionLabel]}>Camera</Text>
                </Pressable>
              </View>

              <View style={styles.requiredPhotosRow}>
                {capturedMedia.map((item) => (
                  <View key={item.id} style={styles.requiredThumbWrap}>
                    <Pressable onPress={() => { setLightboxUri(item.uri); setLightboxIsVideo(item.mediaType === 'VIDEO'); }}>
                      {item.mediaType === 'VIDEO' ? (
                        <VideoThumb uri={item.uri} style={styles.requiredThumb} iconSize={32} />
                      ) : (
                        <Image source={{ uri: item.uri }} style={styles.requiredThumb} resizeMode="cover" />
                      )}
                    </Pressable>
                    {item.mediaType === 'VIDEO' ? (
                      <View style={styles.mediaBadge}>
                        <MaterialIcons name="videocam" size={10} color="#fff" />
                      </View>
                    ) : null}
                    <Pressable
                      style={[styles.requiredRemoveIcon, { backgroundColor: '#00000085' }]}
                      onPress={() => removeMedia(item.id)}>
                      <MaterialIcons name="close" size={14} color={palette.white} />
                    </Pressable>
                  </View>
                ))}
              </View>
              {capturedMedia.length === 0 && (
                <Text style={[styles.info, { color: palette.textMuted }]}>Chưa có ảnh/video hư hại</Text>
              )}
            </View>

            {/* ── Lỗi ── */}
            {error ? (
              <View style={[styles.errorBox, { backgroundColor: `${palette.error}15`, borderColor: `${palette.error}40` }]}>
                <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
              </View>
            ) : null}

            {/* ── Gửi ── */}
            <Pressable
              style={[styles.uploadButton, { backgroundColor: palette.error, opacity: submitting ? 0.7 : 1 }]}
              disabled={submitting}
              onPress={() => void handleSubmit()}>
              {submitting
                ? <ActivityIndicator color={palette.white} />
                : <Text style={[styles.uploadButtonText, { color: palette.white }]}>Gửi báo cáo hư hại</Text>}
            </Pressable>

          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* ── Lightbox Modal ── */}
      <Modal
        visible={lightboxUri !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { setLightboxUri(null); setLightboxIsVideo(false); }}>
        <View style={styles.lightboxOverlay}>
          <Pressable style={styles.lightboxClose} onPress={() => { setLightboxUri(null); setLightboxIsVideo(false); }}>
            <MaterialIcons name="close" size={26} color="#fff" />
          </Pressable>
          {lightboxUri && lightboxIsVideo ? (
            <Video
              source={{ uri: lightboxUri }}
              style={styles.lightboxImage}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls
              shouldPlay
            />
          ) : lightboxUri ? (
            <Image source={{ uri: lightboxUri }} style={styles.lightboxImage} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>

      {/* ── Camera Modal ── */}
      <Modal visible={isCameraOpen} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
        <View style={styles.cameraModalRoot}>
          <CameraView key={cameraMode} style={styles.cameraModalView} facing={facing} ref={cameraRef} mode={cameraMode} flash={flashEnabled ? 'on' : 'off'} />
          {/* Grid Overlay */}
          <View style={styles.cameraGridOverlay} pointerEvents="none">
            <View style={styles.cameraGridLine_H1} />
            <View style={styles.cameraGridLine_H2} />
            <View style={styles.cameraGridLine_V1} />
            <View style={styles.cameraGridLine_V2} />
          </View>
          {/* Recording Indicator */}
          {isRecording && (
            <View style={styles.cameraRecordingIndicator}>
              <View style={styles.cameraRecordingDot} />
              <Text style={styles.cameraRecordingLabel}>REC</Text>
            </View>
          )}
          {/* Top Bar */}
          <View style={[styles.cameraTopBar, { paddingTop: Math.max(insets.top, 10) + 10 }]}>
            <Pressable
              style={styles.cameraTopBtn}
              onPress={() => { if (isRecording) handleStopRecording(); setIsCameraOpen(false); }}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
            {cameraMode === 'picture' ? (
              <Pressable
                style={styles.cameraTopBtn}
                onPress={() => setFlashEnabled((prev) => !prev)}>
                {flashEnabled ? (
                  <Zap size={22} color="#FBBF24" />
                ) : (
                  <ZapOff size={22} color="#fff" />
                )}
              </Pressable>
            ) : (
              <View style={[styles.cameraTopBtn, { opacity: 0 }]} />
            )}
            <Pressable
              style={styles.cameraTopBtn}
              onPress={() => setFacing((prev) => (prev === 'back' ? 'front' : 'back'))}>
              <RefreshCw size={22} color="#fff" />
            </Pressable>
          </View>
          {/* Bottom Controls */}
          <View style={[styles.cameraBottomBar, { paddingBottom: Math.max(insets.bottom, spacingY._10) }]}>
            <View style={styles.cameraModeRow}>
              <Pressable onPress={() => handleSwitchMode('video')}>
                <Text style={[styles.cameraModeTab, cameraMode === 'video' && styles.cameraModeTabActive]}>
                  VIDEO
                </Text>
              </Pressable>
              <Pressable onPress={() => handleSwitchMode('picture')}>
                <Text style={[styles.cameraModeTab, cameraMode === 'picture' && styles.cameraModeTabActive]}>
                  ẢNH
                </Text>
              </Pressable>
            </View>
            <View style={styles.cameraControlsRow}>
              <Pressable
                style={styles.cameraGalleryBtn}
                onPress={() => void pickFromLibrary().finally(() => setIsCameraOpen(false))}>
                <MaterialIcons name="photo-library" size={22} color="#fff" />
              </Pressable>
              <Pressable
                style={styles.cameraShutterOuter}
                onPress={() => {
                  if (cameraMode === 'picture') {
                    void handleCapturePhoto();
                  } else {
                    void (isRecording ? handleStopRecording() : handleStartRecording());
                  }
                }}>
                <View
                  style={[
                    styles.cameraShutterInner,
                    cameraMode === 'video' && !isRecording && styles.cameraShutterVideo,
                    isRecording && styles.cameraShutterRecording,
                  ]}
                />
              </Pressable>
              <View style={styles.cameraCountArea}>
                {capturedMedia.length > 0 && (
                  <>
                    <MaterialIcons name="collections" size={18} color="#fff" />
                    <Text style={styles.cameraCountLabel}>{capturedMedia.length}</Text>
                  </>
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._15,
    paddingBottom: spacingY._30,
    gap: spacingY._10,
  },
  // ── Cards ──
  incidentDraftCard: {
    borderWidth: 1,
    borderRadius: radius._12,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    gap: spacingY._7,
  },
  lockedField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius._12,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
  },
  lockedFieldText: {
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  incidentDraftTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  incidentPhotoSection: {
    borderWidth: 1,
    borderRadius: radius._12,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    gap: spacingY._10,
  },
  incidentPhotoTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.sans,
    marginTop: spacingY._5,
  },
  info: {
    fontSize: 13,
    fontFamily: Fonts.sans,
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
  input: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  damageItemRow: {
    flexDirection: 'row',
    gap: spacingX._7,
  },
  damageItemChip: {
    minWidth: 150,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
    gap: spacingY._5,
  },
  damageItemName: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  damageItemCost: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },
  detailSelectionList: {
    gap: spacingY._7,
  },
  detailSelectionRow: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._7,
    paddingVertical: spacingY._5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._7,
  },
  detailSelectionInfo: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: 2,
  },
  detailSelectionLabel: {
    flexShrink: 1,
  },
  detailSelectionQtyWrap: {
    width: 84,
    flexShrink: 0,
    alignSelf: 'center',
  },
  detailSelectionQtyStepper: {
    height: 34,
    borderWidth: 1,
    borderRadius: radius._10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingHorizontal: spacingX._5,
  },
  detailSelectionQtyButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailSelectionQtyValue: {
    minWidth: 18,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    includeFontPadding: false,
  },
  damageNumericRow: {
    flexDirection: 'row',
    gap: spacingX._10,
  },
  damageNumericCol: {
    flex: 1,
    gap: spacingY._5,
  },
  damageInputLabel: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  damageInput: {
    minHeight: 44,
  },
  incidentPricingBox: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
    gap: spacingY._5,
  },
  incidentPricingText: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  incidentPricingTotal: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    fontWeight: '700',
  },
  photoTypeSelector: {
    flexDirection: 'row',
    gap: spacingX._7,
  },
  typeButton: {
    flex: 1,
    borderRadius: radius._10,
    paddingVertical: spacingY._10,
    alignItems: 'center',
  },
  typeButtonText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  damageSeverityButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  incidentModeBox: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._10,
    gap: spacingY._5,
  },
  incidentModeTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  incidentModeText: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  incidentPhotoActionRow: {
    flexDirection: 'row',
    gap: spacingX._10,
  },
  incidentPhotoActionTile: {
    flex: 1,
    width: undefined,
    minHeight: 96,
    paddingHorizontal: spacingX._7,
    borderStyle: 'solid',
  },
  incidentPhotoActionLabel: {
    color: '#ffffff',
    fontWeight: '700',
  },
  requiredCaptureTile: {
    width: 96,
    height: 96,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius._10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingY._5,
  },
  requiredCaptureLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8aa0bc',
    fontFamily: Fonts.sans,
  },
  requiredPhotosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingX._10,
  },
  requiredThumbWrap: {
    width: 96,
    height: 96,
    borderRadius: radius._10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#dbe3ef',
  },
  requiredThumb: {
    width: '100%',
    height: '100%',
  },
  requiredRemoveIcon: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
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
  uploadButton: {
    borderRadius: radius._10,
    paddingVertical: spacingY._12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  cameraModalRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraModalView: {
    flex: 1,
  },
  cameraTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacingY._50,
    paddingHorizontal: spacingX._15,
    paddingBottom: spacingY._15,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  cameraTopBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  cameraBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    paddingBottom: spacingY._30,
    paddingTop: spacingY._15,
    paddingHorizontal: spacingX._20,
    gap: spacingY._15,
  },
  cameraModeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacingX._20,
  },
  cameraModeTab: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  cameraModeTabActive: {
    color: '#FBBF24',
  },
  cameraControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cameraGalleryBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  cameraShutterOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraShutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#fff',
  },
  cameraShutterVideo: {
    backgroundColor: '#ef4444',
  },
  cameraShutterRecording: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    width: 28,
    height: 28,
  },
  cameraCountArea: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  cameraCountLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Fonts.sans,
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
  videoThumbPlaceholder: {
    backgroundColor: '#1e1b4b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: '#7c3aed',
    flexDirection: 'row',
    alignItems: 'center',
  },
  cameraGridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cameraGridLine_H1: {
    position: 'absolute',
    top: '33.33%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  cameraGridLine_H2: {
    position: 'absolute',
    top: '66.66%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  cameraGridLine_V1: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '33.33%',
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  cameraGridLine_V2: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '66.66%',
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  cameraRecordingIndicator: {
    position: 'absolute',
    top: 100,
    right: spacingX._15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  cameraRecordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  cameraRecordingLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
});