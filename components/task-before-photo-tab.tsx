import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
    createCleaningMedia,
    getCheckoutChecklistItems,
    getCleaningMedia,
    getCleaningTaskById,
    submitCheckoutChecklist,
} from '@/services/cleaner-dashboard.service';
import type {
    CheckoutChecklistItem,
    CheckoutChecklistStatus,
    CleaningPhoto,
    CleaningTask,
} from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

type SubmittedChecklistDetail = {
  item_id: string;
  item_name: string;
  status: CheckoutChecklistStatus;
  quantity: number;
};

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

  // Checkout checklist
  const [checklistItems, setChecklistItems] = useState<CheckoutChecklistItem[]>([]);
  const [checklistStatusByItemId, setChecklistStatusByItemId] = useState<Record<string, CheckoutChecklistStatus>>({});
  const [checklistQtyByItemId, setChecklistQtyByItemId] = useState<Record<string, string>>({});
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [checklistLoadError, setChecklistLoadError] = useState<string | null>(null);
  const [checklistSubmitted, setChecklistSubmitted] = useState(false);
  const [submittedChecklistDetails, setSubmittedChecklistDetails] = useState<SubmittedChecklistDetail[]>([]);

  const loadDetail = useCallback(async () => {
    if (!taskId || !token) return;
    setLoading(true);
    setError(null);
    try {
      // Run independently so a task-detail error doesn't block loading saved photos
      const [taskResult, photosResult] = await Promise.allSettled([
        getCleaningTaskById(token, taskId),
        getCleaningMedia(token, taskId),
      ]);
      if (taskResult.status === 'fulfilled') {
        setTask(taskResult.value);
      } else {
        setError(getErrorMessage(taskResult.reason));
      }
      if (photosResult.status === 'fulfilled') {
        setSavedPhotos(photosResult.value);
      }
    } finally {
      setLoading(false);
    }
  }, [taskId, token]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Load checkout checklist items once taskId is available
  const loadChecklist = useCallback(() => {
    if (!token || !taskId) return;
    setLoadingChecklist(true);
    setChecklistLoadError(null);
    const storedKey = `@checklist_done:${taskId}`;
    (async () => {
      try {
        // Check AsyncStorage first (fast local cache path)
        const stored = await AsyncStorage.getItem(storedKey);
        if (stored) {
          const parsed = JSON.parse(stored) as SubmittedChecklistDetail[];
          setSubmittedChecklistDetails(parsed);
          setChecklistSubmitted(true);
          // Stop loading IMMEDIATELY so the read-only view renders right away
          setLoadingChecklist(false);
          // Load items in background for display reference only (non-blocking)
          getCheckoutChecklistItems(token, taskId)
            .then((data) => setChecklistItems(data.items))
            .catch(() => {});
          return;
        }

        // Not submitted yet – load items and show interactive form
        const data = await getCheckoutChecklistItems(token, taskId);
        setChecklistItems(data.items);
        setChecklistLoadError(null);
        const defaultStatuses: Record<string, CheckoutChecklistStatus> = {};
        const defaultQtys: Record<string, string> = {};
        for (const item of data.items) {
          defaultStatuses[item.item_id] = 'MATCHED';
          defaultQtys[item.item_id] = String(item.expected_quantity);
        }
        setChecklistStatusByItemId(defaultStatuses);
        setChecklistQtyByItemId(defaultQtys);
        setChecklistSubmitted(false);
      } catch (err) {
        setChecklistItems([]);
        setChecklistLoadError(getErrorMessage(err));
      } finally {
        setLoadingChecklist(false);
      }
    })();
  }, [token, taskId]);

  useEffect(() => {
    loadChecklist();
  }, [loadChecklist]);

  const setItemStatus = useCallback((itemId: string, status: CheckoutChecklistStatus, expectedQty: number) => {
    setChecklistStatusByItemId((prev) => ({ ...prev, [itemId]: status }));
    if (status === 'MATCHED') {
      setChecklistQtyByItemId((prev) => ({ ...prev, [itemId]: String(expectedQty) }));
    } else if (status === 'MISSING') {
      // Default to expectedQty - 1 (thiếu ít nhất 1); cleaner tự chỉnh lại
      const defaultMissing = Math.max(0, expectedQty - 1);
      setChecklistQtyByItemId((prev) => ({ ...prev, [itemId]: String(defaultMissing) }));
    }
  }, []);

  const updateItemQty = useCallback((itemId: string, text: string, max: number) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    const num = Math.min(Math.max(0, Number(cleaned || 0)), max);
    setChecklistQtyByItemId((prev) => ({ ...prev, [itemId]: String(num) }));
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
    const savedBeforePhotos = savedPhotos.filter((p) => {
      const mt = String(
        p.media_type || p.type || p['photo_type'] || p['mediaType'] || ''
      ).toUpperCase();
      return mt === 'BEFORE';
    });

    if (capturedPhotos.length === 0 && savedBeforePhotos.length === 0) {
      Alert.alert('Chưa thể tiếp tục', 'Vui lòng chụp ít nhất một ảnh trước khi dọn.');
      return;
    }

    // Block if checklist failed to load
    if (checklistLoadError && !checklistSubmitted) {
      Alert.alert(
        'Không thể tải danh sách kiểm kê',
        `${checklistLoadError}\n\nVui lòng thử tải lại trước khi tiếp tục.`,
        [
          { text: 'Tải lại', onPress: loadChecklist },
          { text: 'Đóng', style: 'cancel' },
        ],
      );
      return;
    }

    // Validate checklist is filled when items exist
    if (checklistItems.length > 0 && !checklistSubmitted) {
      const allFilled = checklistItems.every((item) => !!checklistStatusByItemId[item.item_id]);
      if (!allFilled) {
        Alert.alert('Chưa hoàn tất kiểm kê', 'Vui lòng chọn trạng thái cho tất cả vật tư trước khi tiếp tục.');
        return;
      }
    }

    setUploadingPhoto(true);
    setError(null);
    try {
      // Upload photos first
      if (capturedPhotos.length > 0) {
        for (const photo of capturedPhotos) {
          await createCleaningMedia(token, {
            cleaning_task_id: taskId,
            local_uri: photo.uri,
            type: 'BEFORE',
            file_type: photo.mediaType,
          });
        }
        setCapturedPhotos([]);
      }

      // Submit checkout checklist if not yet submitted
      if (checklistItems.length > 0 && !checklistSubmitted) {
        const submitItems = checklistItems.map((item) => ({
          item_id: item.item_id,
          status: checklistStatusByItemId[item.item_id] ?? 'MATCHED',
          quantity: Number(checklistQtyByItemId[item.item_id] ?? item.expected_quantity),
        }));
        const result = await submitCheckoutChecklist(token, taskId, submitItems);
        const details: SubmittedChecklistDetail[] = submitItems.map((si) => ({
          item_id: si.item_id,
          item_name: checklistItems.find((i) => i.item_id === si.item_id)?.item_name ?? si.item_id,
          status: si.status,
          quantity: si.quantity,
        }));
        await AsyncStorage.setItem(`@checklist_done:${taskId}`, JSON.stringify(details));
        setSubmittedChecklistDetails(details);
        setChecklistSubmitted(true);
        const issueMsg =
          result.issue_count > 0
            ? `\n⚠️ Phát hiện ${result.issue_count} sự cố, đã gửi báo cáo cho quản lý.`
            : '\n✅ Tất cả vật tư đầy đủ.';
        await new Promise<void>((resolve) =>
          Alert.alert('Kiểm kê hoàn tất', `Đã lưu ${result.total_items} vật tư.${issueMsg}`, [
            { text: 'Tiếp tục', onPress: () => resolve() },
          ]),
        );
      }

      onPhotosDone();
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

  const savedBeforePhotos = savedPhotos.filter((p) => {
    const mt = String(
      p.media_type || p.type || p['photo_type'] || p['mediaType'] || ''
    ).toUpperCase();
    return mt === 'BEFORE';
  });
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
              Bước 1/3 – Lưu thông tin TRƯỚC khi dọn
            </Text>
            <Text style={{ color: '#3B82F6', fontSize: 13 }}>
              Lưu thông tin toàn cảnh phòng trước khi bắt đầu dọn dẹp. Ảnh/video sẽ được lưu vào nhiệm vụ.
            </Text>
          </View>

          {/* Capture buttons */}
          <View style={{ gap: spacingY._10 }}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              Lưu thông tin trước khi dọn
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

          {/* Checkout checklist */}
          <View
            style={{
              backgroundColor: palette.card,
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: palette.border,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
              {checklistSubmitted ? <MaterialIcons name="check-circle" size={16} color="#16a34a" /> : null}
              <Text
                style={[styles.sectionTitle, { color: checklistSubmitted ? '#16a34a' : '#7c3aed', textAlign: 'center' }]}>
                {checklistSubmitted ? 'Đã kiểm kê vật tư' : 'Kiểm kê vật tư'}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: palette.textMuted, textAlign: 'center', marginBottom: 10 }}>
              {checklistSubmitted ? 'Chi tiết vật tư đã kiểm kê' : 'Chọn trạng thái từng vật tư sau khi kiểm tra thực tế'}
            </Text>

            {loadingChecklist ? (
              <ActivityIndicator color={palette.primary} style={{ marginVertical: 8 }} />
            ) : checklistSubmitted ? (
              submittedChecklistDetails.length === 0 ? (
                <Text style={[styles.emptyText, { color: palette.textMuted, textAlign: 'center' }]}>
                  Không có vật tư nào được kiểm kê.
                </Text>
              ) : (
                <>
                  {submittedChecklistDetails.map((detail, index) => {
                    const statusLabel =
                      detail.status === 'MATCHED' ? 'Đủ'
                      : detail.status === 'DAMAGED' ? 'Hư hỏng'
                      : detail.status === 'MISSING' ? 'Thiếu'
                      : detail.status;
                    const statusColor =
                      detail.status === 'MATCHED' ? '#16a34a'
                      : detail.status === 'DAMAGED' ? '#d97706'
                      : '#dc2626';
                    const statusBg =
                      detail.status === 'MATCHED' ? '#dcfce7'
                      : detail.status === 'DAMAGED' ? '#fef9c3'
                      : '#fee2e2';
                    return (
                      <View
                        key={detail.item_id}
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingVertical: 10,
                          borderBottomWidth: index < submittedChecklistDetails.length - 1 ? 1 : 0,
                          borderBottomColor: palette.border,
                          gap: 8,
                        }}>
                        <Text
                          style={{ fontSize: 13, color: palette.text, flex: 1 }}
                          numberOfLines={2}>
                          {detail.item_name}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {detail.status !== 'MATCHED' ? (
                            <Text style={{ fontSize: 12, color: palette.textMuted }}>
                              SL: <Text style={{ fontWeight: '700', color: statusColor }}>{detail.quantity}</Text>
                            </Text>
                          ) : null}
                          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: statusBg }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: statusColor }}>
                              {statusLabel}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </>
              )
            ) : checklistLoadError ? (
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Text style={[styles.emptyText, { color: palette.error, textAlign: 'center' }]}>
                  {checklistLoadError}
                </Text>
                <Pressable
                  onPress={loadChecklist}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: radius._10,
                    backgroundColor: '#ede9fe',
                  }}>
                  <Text style={{ color: '#7c3aed', fontWeight: '700', fontSize: 13 }}>Tải lại</Text>
                </Pressable>
              </View>
            ) : checklistItems.length === 0 ? (
              <Text style={[styles.emptyText, { color: palette.textMuted, textAlign: 'center' }]}>
                Không có vật tư tái sử dụng nào cần kiểm kê.
              </Text>
            ) : (
              <>
                {checklistItems.map((item, index) => {
                  const currentStatus = checklistStatusByItemId[item.item_id] ?? 'MATCHED';
                  const currentQty = checklistQtyByItemId[item.item_id] ?? String(item.expected_quantity);
                  const showQtyInput = currentStatus === 'DAMAGED' || currentStatus === 'MISSING';

                  const statusChips: Array<{ value: CheckoutChecklistStatus; label: string; color: string; bg: string }> = [
                    { value: 'MATCHED', label: 'Đủ', color: '#16a34a', bg: '#dcfce7' },
                    { value: 'DAMAGED', label: 'Hư hỏng', color: '#d97706', bg: '#fef9c3' },
                    { value: 'MISSING', label: 'Thiếu', color: '#dc2626', bg: '#fee2e2' },
                  ];

                  return (
                    <View
                      key={item.item_id}
                      style={{
                        paddingVertical: 12,
                        borderBottomWidth: index < checklistItems.length - 1 ? 1 : 0,
                        borderBottomColor: palette.border,
                        gap: 6,
                      }}>
                      {/* Item name + expected qty */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Text
                          style={{ fontSize: 14, fontWeight: '600', color: palette.text, flex: 1, marginRight: 8 }}
                          numberOfLines={2}>
                          {item.item_name}
                        </Text>
                        <Text style={{ fontSize: 12, color: palette.textMuted, flexShrink: 0 }}>
                          Cần: <Text style={{ fontWeight: '700', color: '#7c3aed' }}>{item.expected_quantity}</Text>
                        </Text>
                      </View>

                      {/* User's pre-reported status (reference) */}
                      <Text style={{ fontSize: 11, color: palette.textMuted }}>
                        Khách báo:{' '}
                        {item.user_reported_status ? (
                          <Text style={{ fontWeight: '600', color: '#6366f1' }}>
                            {item.user_reported_status === 'MATCHED' ? 'Đủ'
                              : item.user_reported_status === 'DAMAGED' ? 'Hư hỏng'
                              : item.user_reported_status === 'MISSING' ? 'Thiếu'
                              : item.user_reported_status}
                            {item.user_reported_quantity !== null && item.user_reported_quantity !== undefined
                              ? ` (${item.user_reported_quantity})`
                              : ''}
                          </Text>
                        ) : (
                          <Text style={{ fontWeight: '600', color: palette.neutral400 }}>Chưa báo cáo</Text>
                        )}
                      </Text>

                      {/* Status chips */}
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        {statusChips.map((chip) => {
                          const active = currentStatus === chip.value;
                          return (
                            <Pressable
                              key={chip.value}
                              onPress={() => setItemStatus(item.item_id, chip.value, item.expected_quantity)}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 5,
                                borderRadius: 20,
                                borderWidth: 1.5,
                                borderColor: active ? chip.color : palette.border,
                                backgroundColor: active ? chip.bg : palette.background,
                              }}>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: active ? chip.color : palette.textMuted }}>
                                {chip.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {/* Quantity input for DAMAGED / MISSING */}
                      {showQtyInput ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                          <Text style={{ fontSize: 12, color: palette.textMuted }}>
                            {currentStatus === 'DAMAGED' ? 'Số lượng hư hỏng:' : 'Số lượng thiếu:'}
                          </Text>
                          <View style={styles.supplyQtyWrap}>
                            <Pressable
                              style={[styles.supplyQtyButton, { backgroundColor: Number(currentQty) <= 0 ? palette.neutral200 : '#ede9fe' }]}
                              disabled={Number(currentQty) <= 0}
                              onPress={() => updateItemQty(item.item_id, String(Number(currentQty) - 1), item.expected_quantity)}>
                              <Text style={{ fontSize: 15, fontWeight: '800', color: '#7c3aed' }}>-</Text>
                            </Pressable>
                            <TextInput
                              style={[styles.supplyQtyInput, { color: '#d97706', borderColor: palette.border }]}
                              value={currentQty}
                              onChangeText={(text) => updateItemQty(item.item_id, text, item.expected_quantity)}
                              keyboardType="number-pad"
                              maxLength={4}
                              textAlign="center"
                            />
                            <Pressable
                              style={[styles.supplyQtyButton, { backgroundColor: Number(currentQty) >= item.expected_quantity ? palette.neutral200 : '#ede9fe' }]}
                              disabled={Number(currentQty) >= item.expected_quantity}
                              onPress={() => updateItemQty(item.item_id, String(Number(currentQty) + 1), item.expected_quantity)}>
                              <Text style={{ fontSize: 15, fontWeight: '800', color: '#7c3aed' }}>+</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}

              </>
            )}
          </View>
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
