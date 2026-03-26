import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
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
    updateCleaningTask,
} from '@/services/cleaner-dashboard.service';
import type {
    CleanerTaskAction,
    CleaningPhoto,
    CleaningPhotoType,
    CleaningTask,
} from '@/types/cleaner-dashboard';
import { getErrorMessage, validateRejectionReason } from '@/utils/validation';

interface TaskDetailTabProps {
  token: string;
  taskId: string | null;
  isDark: boolean;
  palette: typeof Colors.light;
  onClose: () => void;
  onTaskUpdated?: (task: CleaningTask) => void;
  onErrorChange?: (error: string | null) => void;
}

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

function taskActionPayload(action: CleanerTaskAction, rejectionReason: string) {
  const now = new Date().toISOString();

  switch (action) {
    case 'accept':
      return { status: 'ACCEPTED' as const, accepted_at: now };
    case 'start':
      return { status: 'IN_PROGRESS' as const, start_time: now };
    case 'complete':
      return { status: 'DONE' as const, end_time: now };
    case 'reject':
      return {
        status: 'CANCELLED' as const,
        rejection_reason: rejectionReason.trim() || 'Cleaner rejected task',
      };
    default:
      return {};
  }
}

function getActionLabel(action: CleanerTaskAction): string {
  const labels: Record<CleanerTaskAction, string> = {
    accept: 'Nhận việc',
    start: 'Bắt đầu dọn',
    complete: 'Hoàn tất',
    reject: 'Từ chối',
  };
  return labels[action];
}

function getActionColor(action: CleanerTaskAction, palette: typeof Colors.light): string {
  const colors: Record<CleanerTaskAction, string> = {
    accept: palette.secondary,
    start: '#f59e0b',
    complete: palette.success,
    reject: palette.error,
  };
  return colors[action];
}

function progressStepState(status: string | undefined) {
  const normalized = String(status || '').toUpperCase();
  const order = ['ASSIGNED', 'NOTIFIED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'DONE'];
  const rank = order.indexOf(normalized);

  return {
    accepted: rank >= 2,
    started: rank >= 4,
    completed: rank >= 5,
  };
}

export default function TaskDetailTab({
  token,
  taskId,
  isDark,
  palette,
  onClose,
  onTaskUpdated,
  onErrorChange,
}: TaskDetailTabProps) {
  const [task, setTask] = useState<CleaningTask | null>(null);
  const [photos, setPhotos] = useState<CleaningPhoto[]>([]);
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [capturedPhotoUris, setCapturedPhotoUris] = useState<string[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [photoType, setPhotoType] = useState<CleaningPhotoType>('BEFORE');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const openCamera = async () => {
    if (!task || !progressStepState(task.status).started) {
      Alert.alert('Chưa thể chụp ảnh', 'Bạn cần bấm "Bắt đầu dọn" trước khi chụp ảnh task.');
      return;
    }

    if (!cameraPermission?.granted) {
      const permissionResult = await requestCameraPermission();
      if (!permissionResult.granted) {
        Alert.alert('Không thể mở camera', 'Vui lòng cấp quyền camera để chụp ảnh.');
        return;
      }
    }

    setIsCameraOpen(true);
  };

  const handleCapturePhoto = async () => {
    if (!cameraRef.current) {
      return;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.75,
      });

      if (!photo?.uri) {
        Alert.alert('Lỗi', 'Không chụp được ảnh, vui lòng thử lại.');
        return;
      }

      setCapturedPhotoUris((prev) => [...prev, photo.uri]);
    } catch {
      Alert.alert('Lỗi', 'Không thể chụp ảnh, vui lòng thử lại.');
    }
  };

  const removeCapturedPhoto = (indexToRemove: number) => {
    setCapturedPhotoUris((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const loadDetail = useCallback(async () => {
    if (!taskId || !token) return;

    setLoading(true);
    setError(null);
    onErrorChange?.(null);

    try {
      const [taskData, photosData] = await Promise.all([
        getCleaningTaskById(token, taskId),
        getCleaningPhotos(token, taskId),
      ]);

      setTask(taskData);

      setPhotos(photosData);
      onErrorChange?.(null);
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      onErrorChange?.(msg);
    } finally {
      setLoading(false);
    }
  }, [taskId, token, onErrorChange]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleAction = async (action: CleanerTaskAction) => {
    if (!task || !taskId) return;

    if (action === 'reject') {
      const validation = validateRejectionReason(rejectionReason);
      if (!validation.valid) {
        Alert.alert('Lỗi', validation.error || 'Lý do từ chối không hợp lệ');
        return;
      }
    }

    setActionLoading(true);
    setError(null);
    onErrorChange?.(null);

    try {
      const payload = taskActionPayload(action, rejectionReason);
      const updated = await updateCleaningTask(token, taskId, payload);

      setTask(updated);
      setRejectionReason('');
      onTaskUpdated?.(updated);
      onErrorChange?.(null);

      Alert.alert('Thành công', `${getActionLabel(action)} thành công`);
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      onErrorChange?.(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUploadPhoto = async () => {
    if (!taskId || capturedPhotoUris.length === 0) {
      Alert.alert('Lỗi', 'Vui lòng chụp ít nhất một ảnh trước khi lưu.');
      return;
    }

    setUploadingPhoto(true);
    setError(null);
    onErrorChange?.(null);

    try {
      await Promise.all(
        capturedPhotoUris.map((uri) =>
          createCleaningPhoto(token, {
            cleaning_task_id: taskId,
            local_uri: uri,
            type: photoType,
          }),
        ),
      );

      setCapturedPhotoUris([]);
      const updated = await getCleaningPhotos(token, taskId);
      setPhotos(updated);
      onErrorChange?.(null);

      Alert.alert('Thành công', `Đã lưu ${capturedPhotoUris.length} ảnh cho task.`);
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      onErrorChange?.(msg);
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (!taskId) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: palette.background }]}>
        <Text style={[styles.emptyText, { color: palette.textMuted }]}>
          Chọn một task để xem chi tiết
        </Text>
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

  if (!task) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: palette.background }]}>
        <Text style={[styles.emptyText, { color: palette.error }]}>
          Không tìm thấy task
        </Text>
      </View>
    );
  }

  const canAccept = task.status === 'ASSIGNED' || task.status === 'NOTIFIED';
  const canStart = task.status === 'ACCEPTED' || task.status === 'ARRIVED';
  const canComplete = task.status === 'IN_PROGRESS';
  const canReject = ['ASSIGNED', 'NOTIFIED', 'ACCEPTED'].includes(String(task.status || ''));
  const progress = progressStepState(task.status);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.text }]}>Chi tiết Task</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={[styles.closeButtonText, { color: palette.text }]}>✕</Text>
          </Pressable>
        </View>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: palette.card, borderColor: palette.error }]}>
            <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
          </View>
        )}

        {/* Task Info */}
        <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Thông tin task</Text>
          <Text style={[styles.info, { color: palette.textMuted }]}>ID: {String(task.id || '-')}</Text>
          <Text style={[styles.info, { color: palette.textMuted }]}>Trạng thái: {task.status}</Text>
          <Text style={[styles.info, { color: palette.textMuted }]}>Pod: {String(task.pod_id || '-')}</Text>
          <Text style={[styles.info, { color: palette.textMuted }]}>
            Booking: {String(task.booking_id || '-')}
          </Text>
          <Text style={[styles.info, { color: palette.textMuted }]}>
            Source: {String(task.request_source || '-')}
          </Text>
          <Text style={[styles.info, { color: palette.textMuted }]}>
            Due: {formatDateTime(task.due_at || undefined)}
          </Text>
          <Text style={[styles.info, { color: palette.textMuted }]}>
            Started: {formatDateTime(task.start_time || undefined)}
          </Text>
          <Text style={[styles.info, { color: palette.textMuted }]}>
            Completed: {formatDateTime(task.end_time || undefined)}
          </Text>
        </View>

        {/* Actions */}
        <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Hành động</Text>

          <View style={styles.progressRow}>
            <View
              style={[
                styles.progressStep,
                {
                  borderColor: progress.accepted ? palette.success : palette.border,
                  backgroundColor: progress.accepted ? `${palette.success}22` : palette.surface,
                },
              ]}>
              <Text style={[styles.progressLabel, { color: palette.text }]}>1. Nhận việc</Text>
            </View>
            <View
              style={[
                styles.progressStep,
                {
                  borderColor: progress.started ? palette.success : palette.border,
                  backgroundColor: progress.started ? `${palette.success}22` : palette.surface,
                },
              ]}>
              <Text style={[styles.progressLabel, { color: palette.text }]}>2. Bắt đầu</Text>
            </View>
            <View
              style={[
                styles.progressStep,
                {
                  borderColor: progress.completed ? palette.success : palette.border,
                  backgroundColor: progress.completed ? `${palette.success}22` : palette.surface,
                },
              ]}>
              <Text style={[styles.progressLabel, { color: palette.text }]}>3. Hoàn tất</Text>
            </View>
          </View>

          <View style={styles.actionGrid}>
            {canAccept && (
              <Pressable
                style={[styles.actionButton, { backgroundColor: getActionColor('accept', palette) }]}
                disabled={actionLoading}
                onPress={() => void handleAction('accept')}>
                <Text style={[styles.actionButtonText, { color: palette.primaryDark }]}>
                  {getActionLabel('accept')}
                </Text>
              </Pressable>
            )}

            {canStart && (
              <Pressable
                style={[styles.actionButton, { backgroundColor: getActionColor('start', palette) }]}
                disabled={actionLoading}
                onPress={() => void handleAction('start')}>
                <Text style={[styles.actionButtonText, { color: palette.white }]}>
                  {getActionLabel('start')}
                </Text>
              </Pressable>
            )}

            {canComplete && (
              <Pressable
                style={[styles.actionButton, { backgroundColor: getActionColor('complete', palette) }]}
                disabled={actionLoading}
                onPress={() => void handleAction('complete')}>
                <Text style={[styles.actionButtonText, { color: palette.white }]}>
                  {getActionLabel('complete')}
                </Text>
              </Pressable>
            )}

            {canReject && (
              <Pressable
                style={[styles.actionButton, { backgroundColor: getActionColor('reject', palette) }]}
                disabled={actionLoading}
                onPress={() => void handleAction('reject')}>
                <Text style={[styles.actionButtonText, { color: palette.white }]}>
                  {getActionLabel('reject')}
                </Text>
              </Pressable>
            )}
          </View>

          {canReject && (
            <TextInput
              style={[
                styles.input,
                { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface },
              ]}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              placeholder="Lý do từ chối (tuỳ chọn)"
              placeholderTextColor={palette.neutral500}
              editable={!actionLoading}
            />
          )}
        </View>

        {/* Photos */}
        {progress.started ? (
          <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              Ảnh BEFORE/AFTER ({photos.length})
            </Text>

            {photos.length === 0 ? (
              <Text style={[styles.emptyText, { color: palette.textMuted }]}>Chưa có ảnh</Text>
            ) : (
              photos.map((photo) => (
                <View
                  key={String(photo.id || Math.random())}
                  style={[styles.photoItem, { borderColor: palette.border }]}>
                  <View style={styles.photoHeader}>
                    <Text style={[styles.photoType, { color: palette.text }]}>{photo.type}</Text>
                  </View>
                  <Text
                    style={[styles.photoUrl, { color: palette.textMuted }]}
                    numberOfLines={2}>
                    {photo.photo_url}
                  </Text>
                  <Image source={{ uri: photo.photo_url }} style={styles.photoPreview} />
                </View>
              ))
            )}

            <Text style={[styles.subsectionTitle, { color: palette.text }]}>Chụp ảnh mới</Text>

          <View style={styles.photoTypeSelector}>
            <Pressable
              style={[
                styles.typeButton,
                photoType === 'BEFORE'
                  ? { backgroundColor: palette.primary }
                  : { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 },
              ]}
              onPress={() => setPhotoType('BEFORE')}>
              <Text
                style={[
                  styles.typeButtonText,
                  { color: photoType === 'BEFORE' ? palette.white : palette.text },
                ]}>
                BEFORE
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.typeButton,
                photoType === 'AFTER'
                  ? { backgroundColor: palette.primary }
                  : { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 },
              ]}
              onPress={() => setPhotoType('AFTER')}>
              <Text
                style={[
                  styles.typeButtonText,
                  { color: photoType === 'AFTER' ? palette.white : palette.text },
                ]}>
                AFTER
              </Text>
            </Pressable>
          </View>

            {isCameraOpen ? (
              <View style={styles.cameraBox}>
                <CameraView style={styles.cameraView} facing="back" ref={cameraRef} />
                <View style={styles.cameraActions}>
                  <Pressable
                    style={[styles.cameraButton, { backgroundColor: palette.neutral500 }]}
                    onPress={() => setIsCameraOpen(false)}>
                    <Text style={[styles.cameraButtonText, { color: palette.white }]}>Xong</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.cameraButton, { backgroundColor: palette.primary }]}
                    onPress={() => void handleCapturePhoto()}>
                    <Text style={[styles.cameraButtonText, { color: palette.white }]}>Chụp thêm</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                style={[styles.uploadButton, { backgroundColor: palette.primary }]}
                disabled={uploadingPhoto}
                onPress={() => void openCamera()}>
                <Text style={[styles.uploadButtonText, { color: palette.white }]}>Mở camera</Text>
              </Pressable>
            )}

            {capturedPhotoUris.length > 0 ? (
              <View style={styles.capturedBox}>
                <Text style={[styles.capturedTitle, { color: palette.text }]}>Ảnh chờ lưu ({capturedPhotoUris.length})</Text>
                {capturedPhotoUris.map((uri, index) => (
                  <View key={`${uri}_${index}`} style={styles.pendingPhotoItem}>
                    <Image source={{ uri }} style={styles.capturedImage} />
                    <Pressable
                      style={[styles.removePhotoButton, { backgroundColor: palette.error }]}
                      onPress={() => removeCapturedPhoto(index)}>
                      <Text style={[styles.removePhotoText, { color: palette.white }]}>Xóa ảnh này</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.emptyText, { color: palette.textMuted }]}>Chưa chụp ảnh mới</Text>
            )}

            <Pressable
              style={[styles.uploadButton, { backgroundColor: palette.success }]}
              disabled={uploadingPhoto || capturedPhotoUris.length === 0}
              onPress={() => void handleUploadPhoto()}>
              {uploadingPhoto ? (
                <ActivityIndicator color={palette.white} />
              ) : (
                <Text style={[styles.uploadButtonText, { color: palette.white }]}>Lưu tất cả ảnh vào task</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>Ảnh BEFORE/AFTER</Text>
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>
              Ảnh chỉ hiển thị và chụp được sau khi task chuyển sang bước {'"Bắt đầu dọn"'}.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._15,
    gap: spacingY._15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: '700',
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
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacingX._20,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  section: {
    borderWidth: 1,
    borderRadius: radius._12,
    padding: spacingX._12,
    gap: spacingY._10,
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
    marginTop: spacingY._5,
  },
  info: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  progressRow: {
    gap: spacingY._7,
  },
  progressStep: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
  },
  progressLabel: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingX._7,
  },
  actionButton: {
    flex: 1,
    minWidth: '45%',
    borderRadius: radius._10,
    paddingVertical: spacingY._12,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 13,
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
  photoItem: {
    borderWidth: 1,
    borderRadius: radius._10,
    padding: spacingX._10,
    gap: spacingY._5,
  },
  photoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoType: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.mono,
  },
  photoUrl: {
    fontSize: 12,
    fontFamily: Fonts.mono,
  },
  photoPreview: {
    height: 160,
    borderRadius: radius._10,
    width: '100%',
    backgroundColor: '#00000018',
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
  cameraBox: {
    gap: spacingY._10,
  },
  cameraView: {
    width: '100%',
    height: 260,
    borderRadius: radius._10,
    overflow: 'hidden',
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
  },
  capturedBox: {
    gap: spacingY._7,
    padding: spacingX._10,
    borderRadius: radius._10,
    borderWidth: 1,
    borderColor: '#00000018',
  },
  capturedTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  capturedImage: {
    width: '100%',
    height: 220,
    borderRadius: radius._10,
    backgroundColor: '#00000018',
  },
  pendingPhotoItem: {
    gap: spacingY._7,
  },
  removePhotoButton: {
    borderRadius: radius._10,
    paddingVertical: spacingY._7,
    alignItems: 'center',
  },
  removePhotoText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
});
