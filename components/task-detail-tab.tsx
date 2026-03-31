import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
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
  createIncidentFromCleaningTask,
  getCleaningPhotos,
  getCleaningTaskById,
  getIncidentsByCleaningTaskId,
  getPodById,
  updateCleaningTask,
} from '@/services/cleaner-dashboard.service';
import type {
  CleanerTaskAction,
  CleaningPhoto,
  CleaningPhotoType,
  CleaningTask,
  Incident,
  IncidentSeverity,
} from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

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

const INCIDENT_SEVERITY_OPTIONS: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function shouldHidePermissionMessage(message: string) {
  return message.toLowerCase().includes('không có quyền');
}

function taskPodDisplayName(task: CleaningTask) {
  const podRecord = task.pod as { name?: string; code?: string } | undefined;
  return String(task.pod_name || podRecord?.name || task.pod_code || podRecord?.code || '').trim();
}

function taskClusterDisplayName(task: CleaningTask) {
  const clusterRecord = task.cluster as { name?: string; code?: string } | undefined;
  const podRecord = task.pod as {
    pod_cluster_name?: string;
    cluster_name?: string;
    cluster?: { name?: string; code?: string };
  } | undefined;

  return String(
    task.pod_cluster_name ||
      task.cluster_name ||
      clusterRecord?.name ||
      clusterRecord?.code ||
      podRecord?.pod_cluster_name ||
      podRecord?.cluster_name ||
      podRecord?.cluster?.name ||
      podRecord?.cluster?.code ||
      '',
  ).trim();
}

function taskBookingWindow(task: CleaningTask) {
  const bookingRecord = task.booking as { start_time?: string; end_time?: string } | undefined;

  return {
    start_time: String(task.booking_start_time || bookingRecord?.start_time || '').trim() || undefined,
    end_time: String(task.booking_end_time || bookingRecord?.end_time || '').trim() || undefined,
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
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [podName, setPodName] = useState<string | null>(null);
  const [clusterName, setClusterName] = useState<string | null>(null);
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [libraryPermission, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [capturedPhotoUris, setCapturedPhotoUris] = useState<string[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [photoType, setPhotoType] = useState<CleaningPhotoType>('BEFORE');
  const [captureMode, setCaptureMode] = useState<'CLEANING' | 'INCIDENT'>('CLEANING');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentSeverity, setIncidentSeverity] = useState<IncidentSeverity>('MEDIUM');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);

  const taskStatus = String(task?.status || '').toUpperCase();
  const isIncidentMode = captureMode === 'INCIDENT';
  const canReportIncident = taskStatus === 'IN_PROGRESS';
  const canAccessPhotoFlow =
    taskStatus === 'ACCEPTED' ||
    taskStatus === 'ARRIVED' ||
    taskStatus === 'IN_PROGRESS' ||
    taskStatus === 'DONE';
  const canCaptureCleaningPhotos = canAccessPhotoFlow && taskStatus !== 'DONE' && !isIncidentMode;
  const canCaptureIncidentPhotos = isIncidentMode && canReportIncident;
  const canCaptureNewPhotos = canCaptureCleaningPhotos || canCaptureIncidentPhotos;

  const openCamera = async () => {
    if (!task || !canCaptureNewPhotos) {
      Alert.alert(
        'Chưa thể chụp ảnh',
        isIncidentMode
          ? 'Chỉ có thể báo cáo hư hại khi task đang ở trạng thái IN_PROGRESS.'
          : 'Bạn cần bấm "Bắt đầu dọn" trước khi chụp ảnh task.',
      );
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

  const pickPhotoFromLibrary = async () => {
    if (!task || !canCaptureNewPhotos) {
      Alert.alert(
        'Chưa thể thêm ảnh',
        isIncidentMode
          ? 'Chỉ có thể báo cáo hư hại khi task đang ở trạng thái IN_PROGRESS.'
          : 'Bạn cần bấm "Bắt đầu dọn" trước khi thêm ảnh task.',
      );
      return;
    }

    if (!libraryPermission?.granted) {
      const permissionResult = await requestLibraryPermission();
      if (!permissionResult.granted) {
        Alert.alert('Không thể mở thư viện', 'Vui lòng cấp quyền thư viện để chọn ảnh.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      allowsEditing: false,
      selectionLimit: 1,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const selectedUri = result.assets[0]?.uri;
    if (!selectedUri) {
      Alert.alert('Lỗi', 'Không đọc được ảnh đã chọn.');
      return;
    }

    setCapturedPhotoUris((prev) => [...prev, selectedUri]);
  };

  const removeCapturedPhoto = (indexToRemove: number) => {
    setCapturedPhotoUris((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  useEffect(() => {
    if (!canCaptureNewPhotos) {
      setIsCameraOpen(false);
      setCapturedPhotoUris([]);
    }
  }, [canCaptureNewPhotos]);

  useEffect(() => {
    if (!canReportIncident && isIncidentMode) {
      setCaptureMode('CLEANING');
      setIncidentDescription('');
      setIncidentSeverity('MEDIUM');
      setCapturedPhotoUris([]);
      setIsCameraOpen(false);
    }
  }, [canReportIncident, isIncidentMode]);

  const loadDetail = useCallback(async () => {
    if (!taskId || !token) return;

    setLoading(true);
    setError(null);
    onErrorChange?.(null);

    try {
      const [taskData, photosData, incidentsData] = await Promise.all([
        getCleaningTaskById(token, taskId),
        getCleaningPhotos(token, taskId),
        getIncidentsByCleaningTaskId(token, taskId),
      ]);

      setTask(taskData);
      setPhotos(photosData);
      setIncidents(incidentsData);
      setPodName(taskPodDisplayName(taskData) || null);
      setClusterName(taskClusterDisplayName(taskData) || null);

      const podId = String(taskData.pod_id || '').trim();

      if (podId) {
        try {
          const pod = await getPodById(token, podId);
          setPodName(String(pod.name || pod.code || '').trim() || null);
        } catch {
          // Keep existing pod name resolved from task payload.
        }
      }

      onErrorChange?.(null);
    } catch (err) {
      const msg = getErrorMessage(err);
      if (shouldHidePermissionMessage(msg)) {
        setError(null);
        onErrorChange?.(null);
      } else {
        setError(msg);
        onErrorChange?.(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [taskId, token, onErrorChange]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleAction = async (action: CleanerTaskAction) => {
    if (!task || !taskId) return;

    setActionLoading(true);
    setError(null);
    onErrorChange?.(null);

    try {
      const payload = taskActionPayload(action, '');
      const updated = await updateCleaningTask(token, taskId, payload);

      setTask(updated);
      onTaskUpdated?.(updated);
      onErrorChange?.(null);

      Alert.alert('Thành công', `${getActionLabel(action)} thành công`);
    } catch (err) {
      const msg = getErrorMessage(err);
      if (shouldHidePermissionMessage(msg)) {
        setError(null);
        onErrorChange?.(null);
      } else {
        setError(msg);
        onErrorChange?.(msg);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleUploadPhoto = async () => {
    if (!taskId || capturedPhotoUris.length === 0) {
      Alert.alert('Lỗi', 'Vui lòng chụp ít nhất một ảnh trước khi lưu.');
      return;
    }

    const normalizedIncidentDescription = incidentDescription.trim();
    if (isIncidentMode && !normalizedIncidentDescription) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập mô tả hư hại trước khi gửi báo cáo.');
      return;
    }

    setUploadingPhoto(true);
    setError(null);
    onErrorChange?.(null);

    try {
      if (isIncidentMode) {
        await createIncidentFromCleaningTask(token, {
          cleaning_task_id: taskId,
          description: normalizedIncidentDescription,
          severity: incidentSeverity,
          local_uris: capturedPhotoUris,
        });

        setCapturedPhotoUris([]);
        setIncidentDescription('');
        setIncidentSeverity('MEDIUM');
        setCaptureMode('CLEANING');
        setIsCameraOpen(false);
        onErrorChange?.(null);

        Alert.alert('Thành công', 'Đã gửi báo cáo hư hại cho task này.');
      } else {
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
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      if (shouldHidePermissionMessage(msg)) {
        setError(null);
        onErrorChange?.(null);
      } else {
        setError(msg);
        onErrorChange?.(msg);
      }
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
  const bookingWindow = taskBookingWindow(task);
  const displayPodName = podName || taskPodDisplayName(task) || 'Pod tieu chuan - A03U';
  const displayClusterName = clusterName || taskClusterDisplayName(task) || 'Cum Pod A - Khu vuc Ga Quoc noi T1';

  const handleStartCleaning = async () => {
    if (canAccept) {
      await handleAction('accept');
      return;
    }

    if (canStart) {
      await handleAction('start');
      return;
    }
  };

  const actionButtonLabel = canAccept
    ? 'START CLEANING'
    : canStart
      ? 'START CLEANING'
      : taskStatus === 'IN_PROGRESS'
        ? 'CLEANING IN PROGRESS'
        : 'CLEANING COMPLETED';

  const actionHintText = canAccept
    ? 'Nhan viec de bat dau quy trinh don dep.'
    : canStart
      ? 'San sang bat dau don dep cho task nay.'
      : taskStatus === 'IN_PROGRESS'
        ? 'Task dang duoc thuc hien. Ban co the cap nhat anh tai day.'
        : 'Task da hoan tat hoac khong kha dung de bat dau.';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={palette.text} />
          </Pressable>
          <Text style={[styles.title, { color: palette.text }]}>Chi tiết Task</Text>
          <View style={styles.headerSpacer} />
        </View>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: palette.card, borderColor: palette.error }]}>
            <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
          </View>
        )}

        {/* Task Info */}
        <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Thông tin task</Text>
          <View style={styles.infoRow}>
            <MaterialIcons name="meeting-room" size={17} color={palette.neutral500} />
            <Text style={[styles.infoLabel, { color: palette.textMuted }]}>Tên pod:</Text>
            <Text style={[styles.infoValue, { color: palette.text }]}>{displayPodName}</Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="apartment" size={17} color={palette.neutral500} />
            <Text style={[styles.infoLabel, { color: palette.textMuted }]}>Khu vực:</Text>
            <Text style={[styles.infoValue, { color: palette.text }]}>{displayClusterName}</Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="local-offer" size={17} color={palette.neutral500} />
            <Text style={[styles.infoLabel, { color: palette.textMuted }]}>Trạng thái:</Text>
            <Text style={[styles.infoValue, { color: palette.text }]}>{task.status || 'ASSIGNED'}</Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="event" size={17} color={palette.neutral500} />
            <Text style={[styles.infoLabel, { color: palette.textMuted }]}>Ngày làm việc:</Text>
            <Text style={[styles.infoValue, { color: palette.text }]}>
              {formatDateTime(task.due_at || bookingWindow.end_time || '2026-04-01T23:30:00.000Z')}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="schedule" size={17} color={palette.neutral500} />
            <Text style={[styles.infoLabel, { color: palette.textMuted }]}>Bắt đầu dự kiến:</Text>
            <Text style={[styles.infoValue, { color: palette.text }]}>
              {formatDateTime(bookingWindow.start_time || '2026-04-01T22:30:00.000Z')}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="schedule" size={17} color={palette.neutral500} />
            <Text style={[styles.infoLabel, { color: palette.textMuted }]}>Kết thúc dự kiến:</Text>
            <Text style={[styles.infoValue, { color: palette.text }]}>
              {formatDateTime(bookingWindow.end_time || task.due_at || '2026-04-01T23:30:00.000Z')}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="play-circle-outline" size={17} color={palette.neutral500} />
            <Text style={[styles.infoLabel, { color: palette.textMuted }]}>Bắt đầu thực tế:</Text>
            <Text style={[styles.infoValue, { color: palette.text }]}>
              {formatDateTime(task.start_time || '2026-04-01T22:35:00.000Z')}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="check-circle-outline" size={17} color={palette.neutral500} />
            <Text style={[styles.infoLabel, { color: palette.textMuted }]}>Kết thúc thực tế:</Text>
            <Text style={[styles.infoValue, { color: palette.text }]}>
              {formatDateTime(task.end_time || '2026-04-01T23:10:00.000Z')}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <MaterialIcons name="label-outline" size={17} color={palette.neutral500} />
            <Text style={[styles.infoLabel, { color: palette.textMuted }]}>Nguồn yêu cầu:</Text>
            <Text style={[styles.infoValue, { color: palette.text }]}>{String(task.request_source || 'AUTO_AFTER_CHECKOUT')}</Text>
          </View>
        </View>

        {/* Incidents Section */}
        {incidents.length > 0 && (
          <View style={[styles.section, { backgroundColor: `${palette.error}12`, borderColor: palette.error }]}>
            <Text style={[styles.sectionTitle, { color: palette.error }]}>Báo cáo hư hại ({incidents.length})</Text>
            {incidents.map((incident) => {
              const severityColor = {
                LOW: palette.success,
                MEDIUM: '#f59e0b',
                HIGH: palette.error,
                CRITICAL: palette.error,
              }[String(incident.severity || 'MEDIUM')] || palette.textMuted;

              return (
                <View
                  key={String(incident.id || Math.random())}
                  style={[styles.incidentItem, { borderColor: severityColor }]}>
                  <View style={styles.incidentHeader}>
                    <Text style={[styles.incidentSeverity, { color: severityColor }]}>
                      {String(incident.severity || 'MEDIUM')}
                    </Text>
                    <Text style={[styles.incidentStatus, { color: palette.textMuted }]}>
                      {String(incident.status || 'PENDING')}
                    </Text>
                  </View>
                  <Text style={[styles.incidentDescription, { color: palette.text }]}>
                    {String(incident.description || '-')}
                  </Text>
                  {incident.photo_urls && incident.photo_urls.length > 0 && (
                    <ScrollView horizontal style={styles.incidentPhotosScroll}>
                      {incident.photo_urls.map((photoUrl, idx) => (
                        <Image
                          key={`${incident.id}_${idx}`}
                          source={{ uri: String(photoUrl) }}
                          style={styles.incidentPhotoThumb}
                          resizeMode="cover"
                        />
                      ))}
                    </ScrollView>
                  )}
                  <Text style={[styles.incidentTime, { color: palette.textMuted }]}>
                    {formatDateTime(String(incident.created_at || ''))}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Ready Card */}
        <View style={styles.readySection}>
          <View style={[styles.readyIconWrap, { backgroundColor: palette.primaryLight }]}> 
            <MaterialIcons name="auto-awesome" size={32} color={palette.primary} />
          </View>
          <Text style={[styles.readyTitle, { color: palette.text }]}>Ready to clean?</Text>
          <Text style={[styles.readyDescription, { color: palette.textMuted }]}>{actionHintText}</Text>
          <Pressable
            style={[
              styles.readyButton,
              {
                backgroundColor: canAccept || canStart ? '#2f64da' : palette.neutral400,
              },
            ]}
            disabled={actionLoading || (!canAccept && !canStart)}
            onPress={() => void handleStartCleaning()}>
            {actionLoading ? (
              <ActivityIndicator color={palette.white} />
            ) : (
              <View style={styles.readyButtonInner}>
                <MaterialIcons name="play-arrow" size={20} color={palette.white} />
                <Text style={[styles.readyButtonText, { color: palette.white }]}>{actionButtonLabel}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Photos */}
        {canAccessPhotoFlow ? (
          <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              Ảnh BEFORE/AFTER ({photos.length})
            </Text>

            {isIncidentMode && (
              <View style={[styles.incidentModeBox, { backgroundColor: `${palette.error}14`, borderColor: palette.error }]}>
                <Text style={[styles.incidentModeTitle, { color: palette.error }]}>Chế độ báo cáo hư hại</Text>
                <Text style={[styles.incidentModeText, { color: palette.textMuted }]}>
                  Ảnh mới sẽ được gửi vào Incident, không lưu vào bộ ảnh cleaning BEFORE/AFTER.
                </Text>
              </View>
            )}

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
                  <Image source={{ uri: photo.photo_url }} style={styles.photoPreview} resizeMode="contain" />
                </View>
              ))
            )}

            {canCaptureNewPhotos ? (
              <>
                <Text style={[styles.subsectionTitle, { color: palette.text }]}>Chụp ảnh mới</Text>

                {isIncidentMode ? (
                  <>
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
                      value={incidentDescription}
                      onChangeText={setIncidentDescription}
                      placeholder="Mô tả hư hại (bắt buộc)"
                      placeholderTextColor={palette.neutral500}
                      multiline
                    />

                    <View style={styles.photoTypeSelector}>
                      {INCIDENT_SEVERITY_OPTIONS.map((severity) => {
                        const selected = incidentSeverity === severity;
                        return (
                          <Pressable
                            key={severity}
                            style={[
                              styles.typeButton,
                              selected
                                ? { backgroundColor: palette.error }
                                : {
                                    backgroundColor: palette.surface,
                                    borderColor: palette.border,
                                    borderWidth: 1,
                                  },
                            ]}
                            onPress={() => setIncidentSeverity(severity)}>
                            <Text
                              style={[
                                styles.typeButtonText,
                                { color: selected ? palette.white : palette.text },
                              ]}>
                              {severity}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <View style={styles.photoTypeSelector}>
                    <Pressable
                      style={[
                        styles.typeButton,
                        photoType === 'BEFORE'
                          ? { backgroundColor: palette.primary }
                          : { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 },
                      ]}
                      onPress={() => {
                        setPhotoType('BEFORE');
                        if (!isCameraOpen) {
                          void openCamera();
                        }
                      }}>
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
                      onPress={() => {
                        setPhotoType('AFTER');
                        if (!isCameraOpen) {
                          void openCamera();
                        }
                      }}>
                      <Text
                        style={[
                          styles.typeButtonText,
                          { color: photoType === 'AFTER' ? palette.white : palette.text },
                        ]}>
                        AFTER
                      </Text>
                    </Pressable>
                  </View>
                )}

                <View style={styles.sourceActionRow}>
                  <Pressable
                    style={[styles.sourceButton, { backgroundColor: palette.primary }]}
                    disabled={uploadingPhoto}
                    onPress={() => void openCamera()}>
                    <Text style={[styles.sourceButtonText, { color: palette.white }]}>Chụp ảnh</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.sourceButton, { backgroundColor: palette.secondary }]}
                    disabled={uploadingPhoto}
                    onPress={() => void pickPhotoFromLibrary()}>
                    <Text style={[styles.sourceButtonText, { color: palette.primaryDark }]}>Chọn từ máy</Text>
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
                        <Text style={[styles.cameraButtonText, { color: palette.white }]}>Chụp hình</Text>
                      </Pressable>
                    </View>
                    {capturedPhotoUris.length > 0 && (
                      <Text style={[styles.cameraHint, { color: palette.textMuted }]}> 
                        Đã chụp {capturedPhotoUris.length} ảnh. Bấm {'"Chụp hình"'} để chụp thêm.
                      </Text>
                    )}
                  </View>
                ) : (
                  <Text style={[styles.emptyText, { color: palette.textMuted }]}>Chưa mở camera</Text>
                )}

                {capturedPhotoUris.length > 0 ? (
                  <View style={styles.capturedBox}>
                    <Text style={[styles.capturedTitle, { color: palette.text }]}>Ảnh chờ lưu ({capturedPhotoUris.length})</Text>
                    {capturedPhotoUris.map((uri, index) => (
                      <View key={`${uri}_${index}`} style={styles.pendingPhotoItem}>
                        <Image source={{ uri }} style={styles.capturedImage} resizeMode="contain" />
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
                  style={[
                    styles.uploadButton,
                    { backgroundColor: isIncidentMode ? palette.error : palette.success },
                  ]}
                  disabled={uploadingPhoto || capturedPhotoUris.length === 0}
                  onPress={() => void handleUploadPhoto()}>
                  {uploadingPhoto ? (
                    <ActivityIndicator color={palette.white} />
                  ) : (
                    <Text style={[styles.uploadButtonText, { color: palette.white }]}>
                      {isIncidentMode ? 'Gửi báo cáo hư hại' : 'Lưu tất cả ảnh vào task'}
                    </Text>
                  )}
                </Pressable>
              </>
            ) : (
              <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                {isIncidentMode
                  ? 'Chế độ báo cáo hư hại chỉ khả dụng khi task ở trạng thái IN_PROGRESS.'
                  : 'Task đã hoàn tất, không thể chụp hoặc thêm ảnh mới.'}
              </Text>
            )}
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
  readySection: {
    marginTop: spacingY._5,
    marginBottom: spacingY._5,
    padding: spacingX._15,
    alignItems: 'center',
    gap: spacingY._12,
  },
  readyIconWrap: {
    width: 92,
    height: 92,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyTitle: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    textAlign: 'center',
  },
  readyDescription: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: Fonts.sans,
    textAlign: 'center',
    paddingHorizontal: spacingX._10,
  },
  readyButton: {
    width: '100%',
    borderRadius: radius._15,
    paddingVertical: spacingY._12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 3,
  },
  readyButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._5,
  },
  readyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    letterSpacing: 0.5,
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
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.sans,
    marginTop: spacingY._5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._7,
    flexWrap: 'wrap',
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
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
  sourceActionRow: {
    flexDirection: 'row',
    gap: spacingX._7,
  },
  sourceButton: {
    flex: 1,
    borderRadius: radius._10,
    paddingVertical: spacingY._10,
    alignItems: 'center',
  },
  sourceButtonText: {
    fontSize: 13,
    fontWeight: '700',
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
  cameraHint: {
    fontSize: 12,
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
    fontFamily: Fonts.mono,
  },
  incidentStatus: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },
  incidentDescription: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    lineHeight: 18,
  },
  incidentPhotosScroll: {
    gap: spacingX._7,
  },
  incidentPhotoThumb: {
    width: 80,
    height: 80,
    borderRadius: radius._10,
    marginRight: spacingX._7,
  },
  incidentTime: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },
});

