import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ResizeMode, Video } from 'expo-av';
import { CameraMode, CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { RefreshCw, Zap, ZapOff } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
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
    createLostFoundItem,
    getMyWorkRosters,
    getPodsByClusterId,
} from '@/services/cleaner-dashboard.service';
import type {
    CreateLostFoundItemPayload,
    PodCluster,
    PodDetails,
    StaffWorkRoster,
} from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

export default function ReportLostFoundScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    fromCleaningTask?: string;
    cleaningTaskId?: string;
    bookingId?: string;
    podId?: string;
    podName?: string;
  }>();

  const lockedFromCleaningTask =
    params.fromCleaningTask === '1' || Boolean(String(params.cleaningTaskId || '').trim());
  const lockedCleaningTaskId = String(params.cleaningTaskId || '').trim();
  const lockedBookingId = String(params.bookingId || '').trim();
  const lockedPodId = String(params.podId || '').trim();
  const lockedPodName = String(params.podName || '').trim();

  // ── Form state ──
  const [itemName, setItemName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPodId, setSelectedPodId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Camera / media ──
  const MAX_MEDIA = 5;
  const [mediaList, setMediaList] = useState<Array<{ uri: string; fileType: 'IMAGE' | 'VIDEO' }>>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('picture');
  const [isRecording, setIsRecording] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [, requestVideoPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flashEnabled, setFlashEnabled] = useState(false);

  const openCamera = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Không thể mở camera', 'Vui lòng cấp quyền camera.');
        return;
      }
    }
    // Request mic silently so video mode works without extra steps
    await requestVideoPermission();
    setIsCameraOpen(true);
  };

  const canAddMore = mediaList.length < MAX_MEDIA;

  const appendMedia = (uri: string, fileType: 'IMAGE' | 'VIDEO') => {
    setMediaList((prev) =>
      prev.length < MAX_MEDIA ? [...prev, { uri, fileType }] : prev,
    );
  };

  const removeMedia = (index: number) => {
    setMediaList((prev) => prev.filter((_, i) => i !== index));
  };

  const pickFromLibrary = async () => {
    const remaining = MAX_MEDIA - mediaList.length;
    if (remaining <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.75,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets?.length) return;
    setMediaList((prev) => {
      const combined = [...prev];
      for (const asset of result.assets) {
        if (combined.length >= MAX_MEDIA) break;
        combined.push({ uri: asset.uri, fileType: asset.type === 'video' ? 'VIDEO' : 'IMAGE' });
      }
      return combined;
    });
  };

  const handleCapturePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.75 });
      if (!photo?.uri) { Alert.alert('Lỗi', 'Không chụp được ảnh, vui lòng thử lại.'); return; }
      appendMedia(photo.uri, 'IMAGE');
      setIsCameraOpen(false);
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
        appendMedia(video.uri, 'VIDEO');
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


  // ── Selector lists ──
  const [clusterList, setClusterList] = useState<PodCluster[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState('');
  const [podListForCluster, setPodListForCluster] = useState<PodDetails[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingClusterPods, setLoadingClusterPods] = useState(false);
  const [showClusterSelector, setShowClusterSelector] = useState(false);
  const [showPodSelector, setShowPodSelector] = useState(false);

  useEffect(() => {
    if (!lockedFromCleaningTask || !lockedPodId) return;
    setSelectedPodId(lockedPodId);
  }, [lockedFromCleaningTask, lockedPodId]);

  // ── Derived display names ──
  const selectedClusterName = selectedClusterId
    ? (clusterList.find((c) => String(c.id || '') === selectedClusterId)?.name ?? selectedClusterId)
    : 'Chưa chọn khu vực';

  const selectedPodName = (() => {
    if (lockedFromCleaningTask && lockedPodName) return lockedPodName;
    if (!selectedPodId) return 'Chưa chọn pod';
    const pod = podListForCluster.find((p) => String(p.id || '') === selectedPodId);
    return pod?.name ?? (pod?.code ? `Pod ${pod.code}` : selectedPodId);
  })();

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
    Promise.all([
      getMyWorkRosters(token).catch((): StaffWorkRoster[] => []),
    ])
      .then(async ([rosters]) => {
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

        const defaultCluster = scopedClusters[0];
        if (defaultCluster?.id) {
          const defaultId = String(defaultCluster.id);
          setSelectedClusterId(defaultId);
          await loadPodsForCluster(defaultId);
        } else {
          setSelectedClusterId('');
          setSelectedPodId('');
          setPodListForCluster([]);
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

    const resolvedPodId = lockedFromCleaningTask
      ? (lockedPodId || selectedPodId || null)
      : (selectedPodId || null);
    const resolvedBookingId = lockedFromCleaningTask ? (lockedBookingId || null) : null;

    const payload: CreateLostFoundItemPayload = {
      item_name: normalizedName,
      description: description.trim() || undefined,
      pod_id: resolvedPodId,
      booking_id: resolvedBookingId,
      media_local_uris: mediaList.length > 0 ? mediaList : undefined,
    };

    setCreating(true);
    setCreateError(null);

    try {
      await createLostFoundItem(token, payload);
      Alert.alert('Thành công', 'Đã báo cáo đồ tìm thấy.', [
        {
          text: 'OK',
          onPress: () => {
            if (lockedFromCleaningTask && lockedCleaningTaskId) {
              router.replace(`/task/checklist?taskId=${lockedCleaningTaskId}`);
              return;
            }
            router.back();
          },
        },
      ]);
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
              <Text style={[styles.cardTitle, styles.itemInfoTitle, { color: '#1D4ED8' }]}>Thông tin món đồ</Text>

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
              {!lockedFromCleaningTask ? (
                <>
                  <Text style={[styles.fieldLabel, { color: palette.text }]}>Khu vực (Cluster)</Text>
                  <Pressable
                    style={[styles.selector, { borderColor: palette.border, backgroundColor: palette.surface }]}
                    onPress={() => {
                      setShowClusterSelector((v) => !v);
                      setShowPodSelector(false);
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
                </>
              ) : null}

              {/* Pod */}
              <Text style={[styles.fieldLabel, { color: palette.text }]}>Pod tìm thấy</Text>
              <Pressable
                style={[
                  styles.selector,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.surface,
                    opacity: lockedFromCleaningTask ? 0.75 : (selectedClusterId ? 1 : 0.5),
                  },
                ]}
                disabled={lockedFromCleaningTask || !selectedClusterId}
                onPress={() => { setShowPodSelector((v) => !v); setShowClusterSelector(false); }}>
                <Text style={[styles.selectorText, { color: selectedPodId ? palette.text : palette.neutral500 }]}>
                  {lockedFromCleaningTask ? selectedPodName : (selectedClusterId ? selectedPodName : 'Chọn khu vực trước')}
                </Text>
                {!lockedFromCleaningTask ? (
                  <MaterialIcons
                    name={showPodSelector ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                    size={20}
                    color={palette.textMuted}
                  />
                ) : null}
              </Pressable>
              {showPodSelector && !lockedFromCleaningTask && (
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

            </View>

            {/* ── Ảnh / Video món đồ ── */}
            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.cardTitle, { color: palette.text }]}>Ảnh / Video món đồ</Text>
                <Text style={{ fontSize: 12, fontFamily: Fonts.sans, color: palette.textMuted }}>
                  {mediaList.length}/{MAX_MEDIA}
                </Text>
              </View>

              {/* Thumbnail strip */}
              {mediaList.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: spacingX._7 }}>
                    {mediaList.map(({ uri, fileType }, idx) => (
                      <View key={`media_${idx}`} style={{ position: 'relative' }}>
                        <Pressable onPress={() => setLightboxIndex(idx)}>
                          {fileType === 'VIDEO' ? (
                            <VideoThumb uri={uri} style={styles.thumb} iconSize={28} />
                          ) : (
                            <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                          )}
                        </Pressable>
                        <Pressable
                          style={styles.thumbRemoveBtn}
                          onPress={() => removeMedia(idx)}>
                          <MaterialIcons name="close" size={12} color="#fff" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              ) : null}

              {/* Action buttons — hide when limit reached */}
              {canAddMore ? (
                <View style={{ flexDirection: 'row', gap: spacingX._7 }}>
                  <Pressable
                    style={[styles.photoRetakeBtn, { flex: 1, borderColor: palette.primary, backgroundColor: `${palette.primary}10` }]}
                    onPress={() => void openCamera()}>
                    <MaterialIcons name="photo-camera" size={16} color={palette.primary} />
                    <Text style={[styles.photoRetakeText, { color: palette.primary }]}>Camera</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.photoRetakeBtn, { flex: 1, borderColor: palette.border, backgroundColor: palette.surface }]}
                    onPress={() => void pickFromLibrary()}>
                    <MaterialIcons name="photo-library" size={16} color={palette.text} />
                    <Text style={[styles.photoRetakeText, { color: palette.text }]}>Thư viện</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={{ fontSize: 12, fontFamily: Fonts.sans, color: palette.textMuted, textAlign: 'center' }}>
                  Đã đạt tối đa {MAX_MEDIA} file
                </Text>
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

      {/* ── Lightbox Modal ── */}
      {lightboxIndex !== null && mediaList[lightboxIndex] ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setLightboxIndex(null)}>
          <View style={styles.lightboxOverlay}>
            <Pressable style={styles.lightboxClose} onPress={() => setLightboxIndex(null)}>
              <MaterialIcons name="close" size={26} color="#fff" />
            </Pressable>
            {mediaList.length > 1 ? (
              <Text style={{ color: '#ffffff99', fontSize: 13, position: 'absolute', top: 56, alignSelf: 'center' }}>
                {lightboxIndex + 1} / {mediaList.length}
              </Text>
            ) : null}
            {mediaList[lightboxIndex].fileType === 'VIDEO' ? (
              <Video
                source={{ uri: mediaList[lightboxIndex].uri }}
                style={styles.lightboxImage}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls
                shouldPlay
              />
            ) : (
              <Image
                source={{ uri: mediaList[lightboxIndex].uri }}
                style={styles.lightboxImage}
                resizeMode="contain"
              />
            )}
            {/* Prev / Next */}
            {lightboxIndex > 0 ? (
              <Pressable
                style={[styles.lightboxNav, { left: 12 }]}
                onPress={() => setLightboxIndex((i) => (i ?? 0) - 1)}>
                <MaterialIcons name="chevron-left" size={30} color="#fff" />
              </Pressable>
            ) : null}
            {lightboxIndex < mediaList.length - 1 ? (
              <Pressable
                style={[styles.lightboxNav, { right: 12 }]}
                onPress={() => setLightboxIndex((i) => (i ?? 0) + 1)}>
                <MaterialIcons name="chevron-right" size={30} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        </Modal>
      ) : null}

      {/* ── Camera Modal ── */}
      <Modal visible={isCameraOpen} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
        <View style={styles.cameraModalRoot}>
          <CameraView style={styles.cameraModalView} facing={facing} ref={cameraRef} mode={cameraMode} flash={flashEnabled ? 'on' : 'off'} />
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
              <Pressable onPress={() => { if (!isRecording) setCameraMode('video'); }}>
                <Text style={[styles.cameraModeTab, cameraMode === 'video' && styles.cameraModeTabActive]}>
                  VIDEO
                </Text>
              </Pressable>
              <Pressable onPress={() => { if (!isRecording) setCameraMode('picture'); }}>
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
                {mediaList.length > 0 && (
                  <>
                    <MaterialIcons name="collections" size={18} color="#fff" />
                    <Text style={styles.cameraCountLabel}>{mediaList.length}</Text>
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
  itemInfoTitle: {
    textAlign: 'center',
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
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: radius._10,
    backgroundColor: '#dbe3ef',
  },
  thumb: {
    width: 88,
    height: 88,
    borderRadius: radius._10,
    backgroundColor: '#dbe3ef',
  },
  thumbRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRetakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingX._5,
    borderWidth: 1,
    borderRadius: radius._10,
    paddingVertical: spacingY._10,
  },
  photoRetakeText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  photoTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingX._10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius._10,
    paddingVertical: spacingY._25,
  },
  photoTriggerText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  cameraModalRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraModalView: {
    flex: 1,
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
  lightboxNav: {
    position: 'absolute',
    top: '50%',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00000066',
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
});

