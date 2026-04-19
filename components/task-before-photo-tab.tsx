import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, useCameraPermissions } from 'expo-camera';
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
  createCleaningPhoto,
  getCleaningPhotos,
  getCleaningTaskById,
} from '@/services/cleaner-dashboard.service';
import type { CleaningPhoto, CleaningTask } from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

interface TaskBeforePhotoTabProps {
  token: string;
  taskId: string | null;
  isDark: boolean;
  palette: typeof Colors.light;
  onClose: () => void;
  onPhotosDone: () => void;
}

type PendingPhoto = {
  id: string;
  uri: string;
};

export default function TaskBeforePhotoTab({
  token,
  taskId,
  isDark,
  palette,
  onClose,
  onPhotosDone,
}: TaskBeforePhotoTabProps) {
  const [task, setTask] = useState<CleaningTask | null>(null);
  const [savedPhotos, setSavedPhotos] = useState<CleaningPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<PendingPhoto[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [libraryPermission, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();

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
        { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, uri: photo.uri },
      ]);
      Alert.alert('Chụp ảnh thành công', 'Ảnh đã được thêm vào danh sách.', [{ text: 'OK' }]);
    } catch {
      Alert.alert('Lỗi', 'Không thể chụp ảnh, vui lòng thử lại.');
    }
  };

  const pickPhotoFromLibrary = async () => {
    if (!libraryPermission?.granted) {
      const result = await requestLibraryPermission();
      if (!result.granted) {
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
    if (result.canceled || !result.assets?.length) return;
    const selectedUri = result.assets[0]?.uri;
    if (!selectedUri) {
      Alert.alert('Lỗi', 'Không đọc được ảnh đã chọn.');
      return;
    }
    setCapturedPhotos((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, uri: selectedUri },
    ]);
  };

  const removeCapturedPhoto = (photoId: string) => {
    setCapturedPhotos((prev) => prev.filter((p) => p.id !== photoId));
  };

  const handlePhotosDone = async () => {
    if (!taskId) return;
    const savedBeforePhotos = savedPhotos.filter(
      (p) => String(p.type || '').toUpperCase() === 'BEFORE',
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
        });
      }
      const count = capturedPhotos.length;
      setCapturedPhotos([]);
      Alert.alert('Thành công', `Đã lưu ${count} ảnh trước khi dọn.`, [
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
    (p) => String(p.type || '').toUpperCase() === 'BEFORE',
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

          {/* Capture buttons */}
          <View style={{ gap: spacingY._10 }}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              Chụp ảnh trước khi dọn
            </Text>
            <Pressable
              style={[styles.captureButton, { backgroundColor: '#1f7aed' }]}
              disabled={uploadingPhoto}
              onPress={() => void openCamera()}>
              <MaterialIcons name="photo-camera" size={20} color="#fff" />
              <Text style={styles.captureButtonText}>Mở camera</Text>
            </Pressable>
          </View>

          {/* Pending photos */}
          {capturedPhotos.length > 0 ? (
            <View style={{ gap: spacingY._7 }}>
              <Text style={[styles.subsectionTitle, { color: palette.textMuted }]}>
                Ảnh mới ({capturedPhotos.length})
              </Text>
              <View style={styles.photosRow}>
                {capturedPhotos.map((photo) => (
                  <View key={photo.id} style={styles.thumbWrap}>
                    <Pressable onPress={() => setLightboxUri(photo.uri)}>
                      <Image source={{ uri: photo.uri }} style={styles.thumb} resizeMode="cover" />
                    </Pressable>
                    <Pressable
                      style={[styles.removeIcon, { backgroundColor: '#00000085' }]}
                      onPress={() => removeCapturedPhoto(photo.id)}>
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
                {savedBeforePhotos.map((photo) => (
                  <View key={String(photo.id || Math.random())} style={styles.thumbWrap}>
                    <Pressable onPress={() => setLightboxUri(String(photo.photo_url || ''))}>
                      <Image
                        source={{ uri: String(photo.photo_url || '') }}
                        style={styles.thumb}
                        resizeMode="cover"
                      />
                    </Pressable>
                    <View style={styles.doneIcon}>
                      <MaterialIcons name="check-circle" size={20} color="#22c55e" />
                    </View>
                  </View>
                ))}
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
            <Image source={{ uri: lightboxUri }} style={styles.lightboxImage} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>

      {/* Camera Modal */}
      <Modal
        visible={isCameraOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => setIsCameraOpen(false)}>
        <View style={styles.cameraModalRoot}>
          <CameraView style={styles.cameraModalView} facing="back" ref={cameraRef} />
          {/* Top header */}
          <View style={styles.cameraHeader}>
            <Pressable style={styles.cameraBackBtn} onPress={() => setIsCameraOpen(false)}>
              <MaterialIcons name="arrow-back" size={26} color="#fff" />
            </Pressable>
            {capturedPhotos.length > 0 ? (
              <Text style={styles.cameraCountBadge}>Đã chụp: {capturedPhotos.length}</Text>
            ) : null}
          </View>
          {/* Bottom shutter */}
          <View style={styles.cameraBottomBar}>
            <Pressable
              style={styles.shutterBtn}
              onPress={() => void handleCapturePhoto()}>
              <View style={styles.shutterInner} />
            </Pressable>
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
  doneButton: {
    borderRadius: radius._10,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    fontSize: 20,
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
