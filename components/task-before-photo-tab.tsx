import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ResizeMode, Video } from 'expo-av';
import { CameraMode, CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
  createCleaningPhoto,
  getCleaningPhotos,
  getCleaningTaskById,
  getPodItemsByPodId,
} from '@/services/cleaner-dashboard.service';
import type { CleaningPhoto, CleaningTask, PodItemEntry } from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

interface TaskBeforePhotoTabProps {
  token: string;
  taskId: string | null;
  isDark: boolean;
  palette: typeof Colors.light;
  onClose: () => void;
  onPhotosDone: () => void;
  onReportDamage: (params: { podId?: string; bookingId?: string; podName?: string }) => void;
}

type PendingMedia = {
  id: string;
  uri: string;
  mediaType: 'IMAGE' | 'VIDEO';
};

export default function TaskBeforePhotoTab({
  token,
  taskId,
  isDark,
  palette,
  onClose,
  onPhotosDone,
  onReportDamage,
}: TaskBeforePhotoTabProps) {
  const [task, setTask] = useState<CleaningTask | null>(null);
  const [savedPhotos, setSavedPhotos] = useState<CleaningPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<PendingMedia[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('picture');
  const [isRecording, setIsRecording] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [lightboxIsVideo, setLightboxIsVideo] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [libraryPermission, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();

  // REUSABLE pod items inspection
  const [reusablePodItems, setReusablePodItems] = useState<PodItemEntry[]>([]);
  const [podItemsPodName, setPodItemsPodName] = useState('');
  const [loadingPodItems, setLoadingPodItems] = useState(false);
  const [reusableInputByItemKey, setReusableInputByItemKey] = useState<Record<string, string>>({});

  const loadDetail = useCallback(async () => {
    if (!taskId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const [taskData, photosData] = await Promise.all([
        getCleaningTaskById(token, taskId),
        getCleaningPhotos(token, taskId),
      ]);
      setTask(taskData);
      setSavedPhotos(photosData);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [taskId, token]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Load REUSABLE pod items once task is available
  useEffect(() => {
    if (!token || !task) return;
    const podRecord = (task.pod && typeof task.pod === 'object')
      ? (task.pod as { id?: string })
      : undefined;
    const podId = String(task.pod_id || podRecord?.id || '').trim();
    if (!podId) {
      setReusablePodItems([]);
      setPodItemsPodName('');
      return;
    }
    setLoadingPodItems(true);
    getPodItemsByPodId(token, podId)
      .then((podItemsData) => {
        const reusable = (podItemsData.items || []).filter((pi) => {
          const t = String(pi.item_type || pi.item?.item_type || '').trim().toUpperCase();
          return t === 'REUSABLE';
        });
        setReusablePodItems(reusable);
        setPodItemsPodName(String(podItemsData.pod_name || task.pod_name || ''));
      })
      .catch(() => {
        setReusablePodItems([]);
        setPodItemsPodName('');
      })
      .finally(() => setLoadingPodItems(false));
  }, [token, task]);

  const updateReusableQuantity = useCallback((itemKey: string, text: string, max: number) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    const num = Math.min(Math.max(0, Number(cleaned || 0)), max);
    setReusableInputByItemKey((prev) => ({ ...prev, [itemKey]: String(num) }));
  }, []);

  const openCamera = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Không thể mở camera', 'Vui lòng cấp quyền camera để chụp ảnh.');
        return;
      }
    }
    setIsCameraOpen(true);
  };

  const handleCapturePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.75 });
      if (!photo?.uri) {
        Alert.alert('Lỗi', 'Không chụp được ảnh, vui lòng thử lại.');
        return;
      }
      setCapturedPhotos((prev) => [
        ...prev,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, uri: photo.uri, mediaType: 'IMAGE' },
      ]);
      Alert.alert('Chụp ảnh thành công', 'Ảnh đã được thêm vào danh sách.', [{ text: 'OK' }]);
    } catch {
      Alert.alert('Lỗi', 'Không thể chụp ảnh, vui lòng thử lại.');
    }
  };

  const handleStartRecording = async () => {
    if (!cameraRef.current || isRecording) return;
    try {
      setIsRecording(true);
      const video = await cameraRef.current.recordAsync({ maxDuration: 60 });
      setIsRecording(false);
      if (!video?.uri) {
        Alert.alert('Lỗi', 'Không quay được video, vui lòng thử lại.');
        return;
      }
      setCapturedPhotos((prev) => [
        ...prev,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, uri: video.uri, mediaType: 'VIDEO' },
      ]);
      Alert.alert('Quay video thành công', 'Video đã được thêm vào danh sách.', [{ text: 'OK' }]);
    } catch {
      setIsRecording(false);
      Alert.alert('Lỗi', 'Không thể quay video, vui lòng thử lại.');
    }
  };

  const handleStopRecording = () => {
    cameraRef.current?.stopRecording();
  };

  const pickPhotoFromLibrary = async () => {
    if (!libraryPermission?.granted) {
      const result = await requestLibraryPermission();
      if (!result.granted) {
        Alert.alert('Không thể mở thư viện', 'Vui lòng cấp quyền thư viện để chọn ảnh/video.');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.75,
      allowsEditing: false,
      selectionLimit: 1,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!asset?.uri) {
      Alert.alert('Lỗi', 'Không đọc được file đã chọn.');
      return;
    }
    const isVideo = asset.type === 'video';
    setCapturedPhotos((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, uri: asset.uri, mediaType: isVideo ? 'VIDEO' : 'IMAGE' },
    ]);
  };

  const removeCapturedPhoto = (photoId: string) => {
    setCapturedPhotos((prev) => prev.filter((p) => p.id !== photoId));
  };

  const openLightbox = (uri: string, isVideo: boolean) => {
    setLightboxUri(uri);
    setLightboxIsVideo(isVideo);
  };

  const handlePhotosDone = async () => {
    if (!taskId) return;
    const savedBeforePhotos = savedPhotos.filter(
      (p) => String(p.media_type || p.type || '').toUpperCase() === 'BEFORE',
    );

    if (capturedPhotos.length === 0 && savedBeforePhotos.length === 0) {
      Alert.alert('Chưa thể tiếp tục', 'Vui lòng chụp ít nhất một ảnh trước khi dọn.');
      return;
    }

    if (capturedPhotos.length === 0) {
      onPhotosDone();
      return;
    }

    setUploadingPhoto(true);
    setError(null);
    try {
      for (const photo of capturedPhotos) {
        await createCleaningPhoto(token, {
          cleaning_task_id: taskId,
          local_uri: photo.uri,
          type: 'BEFORE',
          file_type: photo.mediaType,
        });
      }
      const count = capturedPhotos.length;
      setCapturedPhotos([]);
      Alert.alert('Thành công', `Đã lưu ${count} ảnh/video trước khi dọn.`, [
        { text: 'Tiếp tục', onPress: onPhotosDone },
      ]);
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      Alert.alert('Lỗi', msg);
    } finally {
      setUploadingPhoto(false);
    }
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

  const savedBeforePhotos = savedPhotos.filter(
    (p) => String(p.media_type || p.type || '').toUpperCase() === 'BEFORE',
  );
  const hasPhotos = capturedPhotos.length > 0 || savedBeforePhotos.length > 0;

  return (
    <>
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
              backgroundColor: '#EFF6FF',
              borderRadius: 16,
              padding: 14,
              borderWidth: 1,
              borderColor: '#BFDBFE',
            }}>
            <Text
              style={{ fontWeight: '700', color: '#1D4ED8', fontSize: 14, marginBottom: 4 }}>
              Bước 1/3 – Chụp ảnh TRƯỚC khi dọn
            </Text>
            <Text style={{ color: '#3B82F6', fontSize: 13 }}>
              Chụp ảnh toàn cảnh phòng trước khi bắt đầu dọn dẹp. Ảnh sẽ được lưu vào nhiệm vụ.
            </Text>
          </View>

          {/* REUSABLE pod items inspection */}
          <View
            style={{
              backgroundColor: palette.card,
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: palette.border,
            }}>
            <Text
              style={[styles.sectionTitle, { color: '#7c3aed', marginBottom: 4, textAlign: 'center' }]}>
              Kiểm kê vật tư
            </Text>
            {podItemsPodName ? (
              <Text style={[styles.subsectionTitle, { color: palette.textMuted, marginBottom: 8, textAlign: 'center', fontWeight: '400', fontSize: 13 }]}>
                Pod: {podItemsPodName}
              </Text>
            ) : null}

            {loadingPodItems ? (
              <ActivityIndicator color={palette.primary} style={{ marginVertical: 8 }} />
            ) : reusablePodItems.length === 0 ? (
              <Text style={[styles.emptyText, { color: palette.textMuted, textAlign: 'center' }]}>
                Không có vật tư tái sử dụng nào cho pod này.
              </Text>
            ) : (
              (() => {
                const hasShortage = reusablePodItems.some((pi, idx) => {
                  const exp = Math.max(0, Math.floor(Number(pi.expected_quantity || 0)));
                  const key = String(pi.item_id || pi.id || `reusable-${idx}`).trim();
                  const raw = reusableInputByItemKey[key];
                  const observed = raw !== undefined ? Number(raw) : exp;
                  return observed < exp;
                });

                return (
                  <>
                    {reusablePodItems.map((podItem, index) => {
                      const itemName = String(
                        podItem.item_name || podItem.item?.name || podItem.item_id || 'Item',
                      );
                      const expectedQty = Math.max(0, Math.floor(Number(podItem.expected_quantity || 0)));
                      const itemKey = String(podItem.item_id || podItem.id || `reusable-${index}`).trim();
                      const rawInput = reusableInputByItemKey[itemKey];
                      // Default to expected_quantity so item appears full until cleaner changes it
                      const observedQty = rawInput !== undefined ? Number(rawInput) : expectedQty;
                      const isMatch = observedQty === expectedQty;
                      const isShort = observedQty < expectedQty;
                      const qtyColor = isMatch ? '#16a34a' : isShort ? '#dc2626' : '#d97706';

                      return (
                        <View
                          key={String(podItem.id || `${podItem.item_id}-${podItem.pod_id}-${index}`)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingVertical: 10,
                            borderBottomWidth: index < reusablePodItems.length - 1 ? 1 : 0,
                            borderBottomColor: palette.border,
                          }}>
                          <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                            <Text
                              style={{ fontSize: 14, fontWeight: '500', color: palette.text }}
                              numberOfLines={2}>
                              {itemName}
                            </Text>
                            <Text style={{ fontSize: 12, color: palette.textMuted, marginTop: 2 }}>
                              Cần có:{' '}
                              <Text style={{ fontWeight: '700', color: '#7c3aed' }}>{expectedQty}</Text>
                            </Text>
                          </View>

                          {/* Quantity stepper */}
                          <View style={styles.supplyQtyWrap}>
                            <Pressable
                              style={[styles.supplyQtyButton, { backgroundColor: observedQty <= 0 ? palette.neutral200 : '#ede9fe' }]}
                              disabled={observedQty <= 0}
                              onPress={() => updateReusableQuantity(itemKey, String(observedQty - 1), expectedQty)}>
                              <Text style={{ fontSize: 15, fontWeight: '800', color: '#7c3aed' }}>-</Text>
                            </Pressable>

                            <TextInput
                              style={[styles.supplyQtyInput, { color: qtyColor, borderColor: palette.border }]}
                              value={String(observedQty)}
                              onChangeText={(text) => updateReusableQuantity(itemKey, text, expectedQty)}
                              keyboardType="number-pad"
                              maxLength={4}
                              textAlign="center"
                            />

                            <Pressable
                              style={[styles.supplyQtyButton, { backgroundColor: observedQty >= expectedQty ? palette.neutral200 : '#ede9fe' }]}
                              disabled={observedQty >= expectedQty}
                              onPress={() => updateReusableQuantity(itemKey, String(observedQty + 1), expectedQty)}>
                              <Text style={{ fontSize: 15, fontWeight: '800', color: '#7c3aed' }}>+</Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}

                    {/* Damage report button – shown when any REUSABLE item is below expected */}
                    {hasShortage ? (
                      <Pressable
                        style={{
                          marginTop: 12,
                          backgroundColor: palette.error,
                          borderRadius: radius._10,
                          paddingVertical: 11,
                          alignItems: 'center',
                          flexDirection: 'row',
                          justifyContent: 'center',
                          gap: 8,
                        }}
                        onPress={() =>
                          onReportDamage({
                            podId: task?.pod_id,
                            bookingId: String(task?.booking_id ?? ''),
                            podName: String(task?.pod_name ?? podItemsPodName),
                          })
                        }>
                        <MaterialIcons name="warning" size={18} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, fontFamily: Fonts.sans }}>
                          Báo cáo hư hại
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                );
              })()
            )}
          </View>

          {/* Capture buttons */}
          <View style={{ gap: spacingY._10 }}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              Chụp ảnh / quay video trước khi dọn
            </Text>
            <Pressable
              style={[styles.captureButton, { backgroundColor: '#1f7aed' }]}
              disabled={uploadingPhoto}
              onPress={() => { setCameraMode('picture'); void openCamera(); }}>
              <MaterialIcons name="photo-camera" size={20} color="#fff" />
              <Text style={styles.captureButtonText}>Mở camera (ảnh)</Text>
            </Pressable>
            <Pressable
              style={[styles.captureButton, { backgroundColor: '#7c3aed' }]}
              disabled={uploadingPhoto}
              onPress={() => { setCameraMode('video'); void openCamera(); }}>
              <MaterialIcons name="videocam" size={20} color="#fff" />
              <Text style={styles.captureButtonText}>Mở camera (video)</Text>
            </Pressable>
            <Pressable
              style={[styles.captureButton, { backgroundColor: '#475569' }]}
              disabled={uploadingPhoto}
              onPress={() => void pickPhotoFromLibrary()}>
              <MaterialIcons name="photo-library" size={20} color="#fff" />
              <Text style={styles.captureButtonText}>Chọn từ thư viện</Text>
            </Pressable>
          </View>

          {/* Pending photos/videos */}
          {capturedPhotos.length > 0 ? (
            <View style={{ gap: spacingY._7 }}>
              <Text style={[styles.subsectionTitle, { color: palette.textMuted }]}>
                Mới ({capturedPhotos.length})
              </Text>
              <View style={styles.photosRow}>
                {capturedPhotos.map((item) => (
                  <View key={item.id} style={styles.thumbWrap}>
                    <Pressable onPress={() => openLightbox(item.uri, item.mediaType === 'VIDEO')}>
                      {item.mediaType === 'VIDEO' ? (
                        <View style={[styles.thumb, styles.videoThumbPlaceholder]}>
                          <MaterialIcons name="play-circle-filled" size={36} color="#fff" />
                        </View>
                      ) : (
                        <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
                      )}
                    </Pressable>
                    {item.mediaType === 'VIDEO' ? (
                      <View style={[styles.mediaBadge, { backgroundColor: '#7c3aed' }]}>
                        <MaterialIcons name="videocam" size={10} color="#fff" />
                      </View>
                    ) : null}
                    <Pressable
                      style={[styles.removeIcon, { backgroundColor: '#00000085' }]}
                      onPress={() => removeCapturedPhoto(item.id)}>
                      <MaterialIcons name="close" size={14} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Already saved BEFORE photos */}
          {savedBeforePhotos.length > 0 ? (
            <View style={{ gap: spacingY._7 }}>
              <Text style={[styles.subsectionTitle, { color: palette.textMuted }]}>
                Ảnh đã lưu ({savedBeforePhotos.length})
              </Text>
              <View style={styles.photosRow}>
                {savedBeforePhotos.map((photo) => {
                    const mediaUri = String(photo.media?.url || photo.media_url || photo.photo_url || '');
                    const isVideo = (photo.file_type || photo.media?.file_type || '').toUpperCase() === 'VIDEO';
                    return (
                  <View key={String(photo.id || Math.random())} style={styles.thumbWrap}>
                    <Pressable onPress={() => openLightbox(mediaUri, isVideo)}>
                      {isVideo ? (
                        <View style={[styles.thumb, styles.videoThumbPlaceholder]}>
                          <MaterialIcons name="play-circle-filled" size={36} color="#fff" />
                        </View>
                      ) : (
                        <Image source={{ uri: mediaUri }} style={styles.thumb} resizeMode="cover" />
                      )}
                    </Pressable>
                    {isVideo ? (
                      <View style={[styles.mediaBadge, { backgroundColor: '#7c3aed' }]}>
                        <MaterialIcons name="videocam" size={10} color="#fff" />
                      </View>
                    ) : null}
                    <View style={styles.doneIcon}>
                      <MaterialIcons name="check-circle" size={20} color="#22c55e" />
                    </View>
                  </View>
                    );
                  })}
              </View>
            </View>
          ) : null}

          {!hasPhotos ? (
            <Text
              style={[styles.emptyText, { color: palette.textMuted, textAlign: 'center' }]}>
              Chưa có ảnh trước khi dọn
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Done button – fixed bottom bar */}
      <View style={[styles.bottomBar, { backgroundColor: palette.background }]}>
        <Pressable
          style={[
            styles.doneButton,
            { backgroundColor: hasPhotos ? palette.success : palette.neutral400 },
          ]}
          disabled={uploadingPhoto || !hasPhotos}
          onPress={() => void handlePhotosDone()}>
          {uploadingPhoto ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Text style={styles.doneButtonText}>Lưu ảnh và tiếp tục</Text>
          )}
        </Pressable>
      </View>

      {/* Lightbox Modal */}
      <Modal
        visible={lightboxUri !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxUri(null)}>
        <View style={styles.lightboxOverlay}>
          <Pressable style={styles.lightboxClose} onPress={() => setLightboxUri(null)}>
            <MaterialIcons name="close" size={26} color="#fff" />
          </Pressable>
          {lightboxUri ? (
            lightboxIsVideo ? (
              <Video
                source={{ uri: lightboxUri }}
                style={styles.lightboxImage}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls
                shouldPlay
              />
            ) : (
              <Image source={{ uri: lightboxUri }} style={styles.lightboxImage} resizeMode="contain" />
            )
          ) : null}
        </View>
      </Modal>

      {/* Camera Modal */}
      <Modal
        visible={isCameraOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => {
          if (isRecording) handleStopRecording();
          setIsCameraOpen(false);
        }}>
        <View style={styles.cameraModalRoot}>
          <CameraView
            style={styles.cameraModalView}
            facing="back"
            ref={cameraRef}
            mode={cameraMode}
          />
          {/* Top header */}
          <View style={styles.cameraHeader}>
            <Pressable
              style={styles.cameraBackBtn}
              onPress={() => {
                if (isRecording) handleStopRecording();
                setIsCameraOpen(false);
              }}>
              <MaterialIcons name="arrow-back" size={26} color="#fff" />
            </Pressable>
            {isRecording ? (
              <View style={styles.recordingBadge}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>Đang quay...</Text>
              </View>
            ) : capturedPhotos.length > 0 ? (
              <Text style={styles.cameraCountBadge}>Đã lưu: {capturedPhotos.length}</Text>
            ) : null}
          </View>
          {/* Bottom shutter */}
          <View style={styles.cameraBottomBar}>
            {cameraMode === 'picture' ? (
              <Pressable
                style={styles.shutterBtn}
                onPress={() => void handleCapturePhoto()}>
                <View style={styles.shutterInner} />
              </Pressable>
            ) : (
              <Pressable
                style={[styles.shutterBtn, isRecording && { borderColor: '#ef4444' }]}
                onPress={() => void (isRecording ? handleStopRecording() : handleStartRecording())}>
                <View style={[styles.shutterInner, isRecording && { backgroundColor: '#ef4444', borderRadius: 4 }]} />
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
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
  emptyText: {
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#00000099',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
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
    fontWeight: '600',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  doneIcon: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    backgroundColor: '#ffffffd6',
    borderRadius: 99,
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
  captureButton: {
    height: 44,
    borderRadius: radius._10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingX._5,
    paddingHorizontal: spacingX._10,
  },
  captureButtonText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    color: '#fff',
  },
  bottomBar: {
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._15,
  },
  doneButton: {
    borderRadius: radius._10,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    fontSize: 18,
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
  cameraCountBadge: {
    marginLeft: spacingX._12,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    color: '#fff',
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
});
