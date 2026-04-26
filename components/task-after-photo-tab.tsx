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
    View,
} from 'react-native';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import {
    createCleaningMedia,
    getCleaningMedia,
    getCleaningTaskById,
    getPodItemsByPodId,
    updateCleaningTask,
} from '@/services/cleaner-dashboard.service';
import {
    bulkCreateInventoryActivityLogs,
    getCleanerDailyActivityLogs,
} from '@/services/inventory.service';
import type { CleaningPhoto, CleaningTask, PodItemEntry } from '@/types/cleaner-dashboard';
import type { InventoryActivityLogEntry } from '@/types/inventory';
import { getErrorMessage } from '@/utils/validation';

interface TaskAfterPhotoTabProps {
  token: string;
  taskId: string | null;
  isDark: boolean;
  palette: typeof Colors.light;
  onClose: () => void;
  onCompleted: () => void;
}

type PendingPhoto = { id: string; uri: string; mediaType: 'IMAGE' | 'VIDEO' };

function normalizeActionType(actionType?: string) {
  return String(actionType || '').trim().toUpperCase();
}

function toPositiveInt(value: unknown) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function isInvalidActionTypeError(error: unknown) {
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return message.includes('invalid action_type') || message.includes('action_type');
}

function isConsumablePodItem(podItem: PodItemEntry) {
  const itemType = String(podItem.item_type || podItem.item?.item_type || '').trim().toUpperCase();
  return itemType === 'CONSUMABLE';
}

export default function TaskAfterPhotoTab({
  token,
  taskId,
  isDark,
  palette,
  onClose,
  onCompleted,
}: TaskAfterPhotoTabProps) {
  const [task, setTask] = useState<CleaningTask | null>(null);
  const [savedPhotos, setSavedPhotos] = useState<CleaningPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<PendingPhoto[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('picture');
  const [isRecording, setIsRecording] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [lightboxIsVideo, setLightboxIsVideo] = useState(false);
  const [completing, setCompleting] = useState(false);
  const isCompletingRef = useRef(false);
  const hasNavigatedToSummaryRef = useRef(false);
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [libraryPermission, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();

  const navigateToSummaryOnce = useCallback(() => {
    if (hasNavigatedToSummaryRef.current) return;
    hasNavigatedToSummaryRef.current = true;
    onCompleted();
  }, [onCompleted]);

  const loadDetail = useCallback(async () => {
    if (!taskId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const [taskData, photosData] = await Promise.all([
        getCleaningTaskById(token, taskId),
        getCleaningMedia(token, taskId),
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

  const handleComplete = async () => {
    if (isCompletingRef.current || hasNavigatedToSummaryRef.current) return;
    if (!taskId || !task) return;

    const savedAfterPhotos = savedPhotos.filter(
      (p) => String(p.media_type || p.type || '').toUpperCase() === 'AFTER',
    );

    if (capturedPhotos.length === 0 && savedAfterPhotos.length === 0) {
      Alert.alert('Chưa thể hoàn thành', 'Vui lòng chụp ít nhất một ảnh sau khi dọn.');
      return;
    }

    isCompletingRef.current = true;
    setCompleting(true);
    setError(null);
    try {
      // Upload AFTER photos/videos
      for (const photo of capturedPhotos) {
        await createCleaningMedia(token, {
          cleaning_task_id: taskId,
          local_uri: photo.uri,
          type: 'AFTER',
          file_type: photo.mediaType,
        });
      }

      // Auto-log consumed inventory based on pod standard items vs cleaner-held quantities.
      const cleanerId = String(task.cleaner_id || '').trim();
      const podId = String(task.pod_id || '').trim();

      if (cleanerId && podId) {
        const [podItemsData, dailyLogs] = await Promise.all([
          getPodItemsByPodId(token, podId),
          getCleanerDailyActivityLogs(token, cleanerId),
        ]);

        const existingConsumedForTask = (dailyLogs.logs || []).some((log) => {
          return (
            normalizeActionType(String(log.action_type || '')) === 'CONSUMED' &&
            String(log.cleaning_task_id || '').trim() === taskId
          );
        });

        if (!existingConsumedForTask) {
          const requiredByItem = new Map<string, number>();
          for (const podItem of podItemsData.items || []) {
            if (!isConsumablePodItem(podItem)) continue;
            const itemId = String(podItem.item_id || '').trim();
            const requiredQuantity = toPositiveInt(podItem.expected_quantity);
            if (!itemId || requiredQuantity <= 0) continue;
            requiredByItem.set(itemId, (requiredByItem.get(itemId) || 0) + requiredQuantity);
          }

          const heldByStock = new Map<
            string,
            {
              inventory_stock_id: string;
              item_id: string;
              net_quantity: number;
              created_at?: string;
            }
          >();

          for (const log of dailyLogs.logs || []) {
            const inventoryStockId = String(log.inventory_stock_id || '').trim();
            const itemId = String(log.item_id || '').trim();
            const quantity = toPositiveInt(log.quantity);
            if (!inventoryStockId || !itemId || quantity <= 0) continue;

            const action = normalizeActionType(String(log.action_type || ''));
            const sign = action === 'CHECKOUT' ? 1 : (action === 'RETURN' || action === 'WASTE' || action === 'CONSUMED' ? -1 : 0);
            if (sign === 0) continue;

            const key = `${inventoryStockId}::${itemId}`;
            const existing = heldByStock.get(key) || {
              inventory_stock_id: inventoryStockId,
              item_id: itemId,
              net_quantity: 0,
              created_at: String(log.created_at || ''),
            };

            existing.net_quantity += sign * quantity;
            if (!existing.created_at && log.created_at) {
              existing.created_at = String(log.created_at);
            }

            heldByStock.set(key, existing);
          }

          const consumedLogs: InventoryActivityLogEntry[] = [];

          for (const [itemId, requiredQuantity] of requiredByItem.entries()) {
            let remainingToConsume = requiredQuantity;

            const stockCandidates = [...heldByStock.values()]
              .filter((entry) => entry.item_id === itemId && entry.net_quantity > 0)
              .sort((a, b) => {
                const aTime = new Date(a.created_at || '').getTime() || 0;
                const bTime = new Date(b.created_at || '').getTime() || 0;
                return aTime - bTime;
              });

            for (const stock of stockCandidates) {
              if (remainingToConsume <= 0) break;

              const consumeQty = Math.min(stock.net_quantity, remainingToConsume);
              if (consumeQty <= 0) continue;

              consumedLogs.push({
                inventory_stock_id: stock.inventory_stock_id,
                quantity: consumeQty,
                action_type: 'CONSUMED',
                cleaning_task_id: taskId,
                reason: `Auto consumed for cleaning task ${taskId}`,
              });

              stock.net_quantity -= consumeQty;
              remainingToConsume -= consumeQty;
            }
          }

          if (consumedLogs.length > 0) {
            try {
              await bulkCreateInventoryActivityLogs(token, {
                staff_id: cleanerId,
                logs: consumedLogs,
              });
            } catch (inventoryLogError) {
              // Fallback for environments where backend has not yet allowed CONSUMED.
              if (!isInvalidActionTypeError(inventoryLogError)) {
                throw inventoryLogError;
              }

              await bulkCreateInventoryActivityLogs(token, {
                staff_id: cleanerId,
                logs: consumedLogs.map((entry) => ({
                  ...entry,
                  action_type: 'WASTE',
                  reason: `${String(entry.reason || '')} (fallback: WASTE do backend chưa hỗ trợ CONSUMED)`,
                })),
              });
            }
          }
        }
      }

      // Mark task as DONE
      const now = new Date().toISOString();
      await updateCleaningTask(token, taskId, { status: 'DONE' as const, end_time: now });
      navigateToSummaryOnce();
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      Alert.alert('Lỗi', msg);
    } finally {
      isCompletingRef.current = false;
      setCompleting(false);
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

  const savedAfterPhotos = savedPhotos.filter(
    (p) => String(p.media_type || p.type || '').toUpperCase() === 'AFTER',
  );
  const hasPhotos = capturedPhotos.length > 0 || savedAfterPhotos.length > 0;

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
              backgroundColor: '#FFF7ED',
              borderRadius: 16,
              padding: 14,
              borderWidth: 1,
              borderColor: '#FED7AA',
            }}>
            <Text style={{ fontWeight: '700', color: '#C2410C', fontSize: 14, marginBottom: 4 }}>
              Bước 3/3 – Lưu thông tin SAU khi dọn
            </Text>
            <Text style={{ color: '#EA580C', fontSize: 13 }}>
              Lưu thông tin toàn cảnh phòng sau khi đã dọn dẹp xong, rồi bấm Hoàn thành để kết thúc
              nhiệm vụ.
            </Text>
          </View>

          {/* Capture buttons */}
          <View style={{ gap: spacingY._10 }}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              Lưu thông tin sau khi dọn
            </Text>
            <Pressable
              style={[styles.captureButton, { backgroundColor: '#1f7aed' }]}
              disabled={completing}
              onPress={() => { setCameraMode('picture'); void openCamera(); }}>
              <MaterialIcons name="photo-camera" size={20} color="#fff" />
              <Text style={styles.captureButtonText}>Mở camera (ảnh)</Text>
            </Pressable>
            <Pressable
              style={[styles.captureButton, { backgroundColor: '#7c3aed' }]}
              disabled={completing}
              onPress={() => { setCameraMode('video'); void openCamera(); }}>
              <MaterialIcons name="videocam" size={20} color="#fff" />
              <Text style={styles.captureButtonText}>Mở camera (video)</Text>
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

          {/* Already saved AFTER photos/videos */}
          {savedAfterPhotos.length > 0 ? (
            <View style={{ gap: spacingY._7 }}>
              <Text style={[styles.subsectionTitle, { color: palette.textMuted }]}>
                Đã lưu ({savedAfterPhotos.length})
              </Text>
              <View style={styles.photosRow}>
                {savedAfterPhotos.map((photo) => {
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
            <Text style={[styles.emptyText, { color: palette.textMuted, textAlign: 'center' }]}>
              Chưa có ảnh sau khi dọn
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Complete button – fixed bottom bar */}
      <View style={[styles.bottomBar, { backgroundColor: palette.background }]}>
        <Pressable
          style={[
            styles.completeButton,
            { backgroundColor: hasPhotos ? palette.success : palette.neutral400 },
          ]}
          disabled={completing || !hasPhotos}
          onPress={() => void handleComplete()}>
          {completing ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <>
              <MaterialIcons name="check-circle" size={22} color="#fff" />
              <Text style={styles.completeButtonText}>Hoàn thành dọn dẹp</Text>
            </>
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
  completeButton: {
    borderRadius: radius._15,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacingX._7,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 3,
  },
  completeButtonText: {
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
