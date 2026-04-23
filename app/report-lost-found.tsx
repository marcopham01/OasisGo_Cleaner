import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ResizeMode, Video } from 'expo-av';
import { CameraMode, CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  const router = useRouter();
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
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Camera / media ──
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaFileType, setMediaFileType] = useState<'IMAGE' | 'VIDEO' | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('picture');
  const [isRecording, setIsRecording] = useState(false);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [, requestVideoPermission] = useMicrophonePermissions();

  const openCameraForPhoto = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Không thể mở camera', 'Vui lòng cấp quyền camera để chụp ảnh.');
        return;
      }
    }
    setCameraMode('picture');
    setIsCameraOpen(true);
  };

  const openCameraForVideo = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Không thể mở camera', 'Vui lòng cấp quyền camera.');
        return;
      }
    }
    const videoResult = await requestVideoPermission();
    if (!videoResult.granted) {
      Alert.alert('Không thể quay video', 'Vui lòng cấp quyền microphone để quay video.');
      return;
    }
    setCameraMode('video');
    setIsCameraOpen(true);
  };

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.75,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setMediaUri(asset.uri);
    setMediaFileType(asset.type === 'video' ? 'VIDEO' : 'IMAGE');
  };

  const handleCapturePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.75 });
      if (!photo?.uri) { Alert.alert('Lỗi', 'Không chụp được ảnh, vui lòng thử lại.'); return; }
      setMediaUri(photo.uri);
      setMediaFileType('IMAGE');
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
        setMediaUri(video.uri);
        setMediaFileType('VIDEO');
        setIsCameraOpen(false);
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
  const [warehouseList, setWarehouseList] = useState<WarehouseListItem[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingClusterPods, setLoadingClusterPods] = useState(false);
  const [showClusterSelector, setShowClusterSelector] = useState(false);
  const [showPodSelector, setShowPodSelector] = useState(false);
  const [showWarehouseSelector, setShowWarehouseSelector] = useState(false);

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
        const assignmentLocationIds = new Set(
          assignments
            .map((assignment) => String(assignment.location?.id || '').trim())
            .filter(Boolean),
        );

        const scopedClusters = assignmentLocationIds.size > 0
          ? clusters.filter((cluster) => assignmentLocationIds.has(String(cluster.location_id || '').trim()))
          : [];

        setClusterList(scopedClusters);

        const shiftLocationId = String((assignments[0] as StaffShiftAssignment | undefined)?.location?.id || '').trim();
        const matchedCluster = shiftLocationId
          ? scopedClusters.find((c) => String(c.location_id || '').trim() === shiftLocationId)
          : undefined;
        const defaultCluster = matchedCluster ?? scopedClusters[0];

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
      warehouse_id: selectedWarehouseId || null,
      media_local_uri: mediaUri || null,
      media_file_type: mediaFileType || undefined,
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
                onPress={() => { setShowPodSelector((v) => !v); setShowClusterSelector(false); setShowWarehouseSelector(false); }}>
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

            {/* ── Ảnh món đồ ── */}
            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.cardTitle, { color: palette.text }]}>Ảnh / Video món đồ</Text>
              {mediaUri ? (
                <View style={{ gap: spacingY._10 }}>
                  <Pressable onPress={() => setLightboxVisible(true)}>
                    {mediaFileType === 'VIDEO' ? (
                      <View style={[styles.photoPreview, styles.videoThumbPlaceholder]}>
                        <MaterialIcons name="play-circle-filled" size={48} color="#fff" />
                      </View>
                    ) : (
                      <Image source={{ uri: mediaUri }} style={styles.photoPreview} resizeMode="cover" />
                    )}
                  </Pressable>
                  <View style={{ flexDirection: 'row', gap: spacingX._7 }}>
                    <Pressable
                      style={[styles.photoRetakeBtn, { flex: 1, borderColor: palette.border, backgroundColor: palette.surface }]}
                      onPress={() => void openCameraForPhoto()}>
                      <MaterialIcons name="photo-camera" size={16} color={palette.primary} />
                      <Text style={[styles.photoRetakeText, { color: palette.primary }]}>Chụp lại</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.photoRetakeBtn, { flex: 1, borderColor: '#7c3aed', backgroundColor: palette.surface }]}
                      onPress={() => void openCameraForVideo()}>
                      <MaterialIcons name="videocam" size={16} color="#7c3aed" />
                      <Text style={[styles.photoRetakeText, { color: '#7c3aed' }]}>Quay video</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.photoRetakeBtn, { flex: 1, borderColor: palette.border, backgroundColor: palette.surface }]}
                      onPress={() => void pickFromLibrary()}>
                      <MaterialIcons name="photo-library" size={16} color={palette.text} />
                      <Text style={[styles.photoRetakeText, { color: palette.text }]}>Thư viện</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={{ gap: spacingY._7 }}>
                  <Pressable
                    style={[styles.photoTriggerBtn, { borderColor: palette.primary, backgroundColor: `${palette.primary}10` }]}
                    onPress={() => void openCameraForPhoto()}>
                    <MaterialIcons name="photo-camera" size={24} color={palette.primary} />
                    <Text style={[styles.photoTriggerText, { color: palette.primary }]}>Chụp ảnh món đồ</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.photoTriggerBtn, { borderColor: '#7c3aed', backgroundColor: '#7c3aed18' }]}
                    onPress={() => void openCameraForVideo()}>
                    <MaterialIcons name="videocam" size={24} color="#7c3aed" />
                    <Text style={[styles.photoTriggerText, { color: '#7c3aed' }]}>Quay video</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.photoTriggerBtn, { borderColor: palette.neutral500, backgroundColor: `${palette.neutral500}18` }]}
                    onPress={() => void pickFromLibrary()}>
                    <MaterialIcons name="photo-library" size={24} color={palette.neutral500} />
                    <Text style={[styles.photoTriggerText, { color: palette.neutral500 }]}>Chọn từ thư viện</Text>
                  </Pressable>
                </View>
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
      <Modal visible={lightboxVisible} transparent animationType="fade" onRequestClose={() => setLightboxVisible(false)}>
        <View style={styles.lightboxOverlay}>
          <Pressable style={styles.lightboxClose} onPress={() => setLightboxVisible(false)}>
            <MaterialIcons name="close" size={26} color="#fff" />
          </Pressable>
          {mediaUri && mediaFileType === 'VIDEO' ? (
            <Video
              source={{ uri: mediaUri }}
              style={styles.lightboxImage}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls
              shouldPlay
            />
          ) : mediaUri ? (
            <Image source={{ uri: mediaUri }} style={styles.lightboxImage} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>

      {/* ── Camera Modal ── */}
      <Modal visible={isCameraOpen} animationType="slide" statusBarTranslucent>
        <View style={styles.cameraModalRoot}>
          <CameraView style={styles.cameraModalView} facing="back" ref={cameraRef} mode={cameraMode} />
          <View style={styles.cameraHeader}>
            <Pressable style={styles.cameraBackBtn} onPress={() => { if (isRecording) handleStopRecording(); setIsCameraOpen(false); }}>
              <MaterialIcons name="arrow-back" size={26} color="#fff" />
            </Pressable>
            {isRecording ? (
              <View style={styles.recordingBadge}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>Đang quay...</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.cameraBottomBar}>
            {cameraMode === 'picture' ? (
              <Pressable style={styles.shutterBtn} onPress={() => void handleCapturePhoto()}>
                <View style={styles.shutterInner} />
              </Pressable>
            ) : (
              <Pressable
                style={[styles.shutterBtn, { backgroundColor: isRecording ? '#ef4444' : '#fff' }]}
                onPress={() => void (isRecording ? handleStopRecording() : handleStartRecording())}>
                <View style={[styles.shutterInner, { backgroundColor: isRecording ? '#fff' : '#ef4444', borderColor: isRecording ? '#fff' : '#ef4444' }]} />
              </Pressable>
            )}
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
    fontSize: 14,
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
    fontSize: 15,
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
  cameraHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacingY._50,
    paddingHorizontal: spacingX._15,
    paddingBottom: spacingY._12,
    backgroundColor: '#00000066',
  },
  cameraBackBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#00000060',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacingY._40,
    alignItems: 'center',
  },
  shutterBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#ffffff88',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#cbd5e1',
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
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef444488',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
    marginLeft: 12,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  recordingText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
});
