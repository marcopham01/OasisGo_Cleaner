import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ResizeMode, Video } from 'expo-av';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import VideoThumb from '@/components/video-thumb';
import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import {
    getCleaningMedia,
    getCleaningTaskById,
    getIncidentsByCleaningTaskId,
} from '@/services/cleaner-dashboard.service';
import type {
    CleaningPhoto,
    CleaningTask,
    Incident
} from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

interface TaskSummaryTabProps {
  token: string;
  taskId: string | null;
  palette: typeof Colors.light;
  onBack?: () => void;
}

function formatDateTime(dateText?: string | null) {
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

function taskStatusLabelVi(status?: string | null) {
  const s = String(status || '').toUpperCase();
  if (s === 'DONE') return 'Hoàn thành';
  if (s === 'IN_PROGRESS') return 'Đang thực hiện';
  if (s === 'ACCEPTED') return 'Đã nhận';
  if (s === 'ASSIGNED') return 'Đã phân công';
  if (s === 'CANCELLED') return 'Đã hủy';
  return status ?? '-';
}

function severityLabelVi(severity?: string | null) {
  if (severity === 'LOW') return 'Thấp';
  if (severity === 'MEDIUM') return 'Trung bình';
  if (severity === 'HIGH') return 'Cao';
  if (severity === 'CRITICAL') return 'Nghiêm trọng';
  return severity ?? '-';
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|avi|webm|mkv|m4v)(\?|#|$)/i.test(url) || /\/video\/upload\//i.test(url);
}

function severityColor(severity?: string | null, palette?: typeof Colors.light) {
  if (!palette) return '#64748b';
  if (severity === 'LOW') return palette.success;
  if (severity === 'MEDIUM') return '#f59e0b';
  if (severity === 'HIGH') return palette.error;
  if (severity === 'CRITICAL') return palette.error;
  return palette.textMuted;
}

export default function TaskSummaryTab({
  token,
  taskId,
  palette,
  onBack,
}: TaskSummaryTabProps) {
  const [task, setTask] = useState<CleaningTask | null>(null);
  const [beforePhotos, setBeforePhotos] = useState<CleaningPhoto[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<CleaningPhoto[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<{ uri: string; isVideo: boolean } | null>(null);

  const loadData = useCallback(async () => {
    if (!taskId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const [taskData, allPhotos, incidentsData] = await Promise.all([
        getCleaningTaskById(token, taskId),
        getCleaningMedia(token, taskId),
        getIncidentsByCleaningTaskId(token, taskId),
      ]);
      setTask(taskData);
      setBeforePhotos(allPhotos.filter((p) => String(p.media_type || p.type || '').toUpperCase() === 'BEFORE'));
      setAfterPhotos(allPhotos.filter((p) => String(p.media_type || p.type || '').toUpperCase() === 'AFTER'));
      setIncidents(incidentsData);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [taskId, token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (!taskId) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <Text style={[styles.emptyText, { color: palette.textMuted }]}>Task không hợp lệ</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <ActivityIndicator color={palette.primary} size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <MaterialIcons name="error-outline" size={40} color={palette.error} />
        <Text style={[styles.emptyText, { color: palette.error, marginTop: 8 }]}>{error}</Text>
        <Pressable
          style={[styles.retryButton, { backgroundColor: palette.primary }]}
          onPress={() => void loadData()}>
          <Text style={[styles.retryText, { color: palette.white }]}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }

  const isDone = String(task?.status || '').toUpperCase() === 'DONE';

  return (
    <>
      {/* ── Image/Video Lightbox ── */}
      <Modal
        visible={selectedMedia !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMedia(null)}>
        <View style={styles.lightboxOverlay}>
          <Pressable style={styles.lightboxClose} onPress={() => setSelectedMedia(null)}>
            <MaterialIcons name="close" size={26} color="#fff" />
          </Pressable>
          {selectedMedia ? (
            selectedMedia.isVideo ? (
              <Video
                source={{ uri: selectedMedia.uri }}
                style={styles.lightboxImage}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls
                shouldPlay
              />
            ) : (
              <Image
                source={{ uri: selectedMedia.uri }}
                style={styles.lightboxImage}
                resizeMode="contain"
              />
            )
          ) : null}
        </View>
      </Modal>

      <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      showsVerticalScrollIndicator={false}>
      <View style={styles.container}>

        {/* ── Status Hero Card ── */}
        <View
          style={[
            styles.statusHero,
            {
              backgroundColor: isDone ? '#ECFDF5' : `${palette.warning}18`,
              borderColor: isDone ? '#22C55E' : palette.warning,
            },
          ]}>
          <View style={[styles.statusIconWrap, { backgroundColor: isDone ? '#22C55E' : palette.warning }]}>
            <MaterialIcons
              name={isDone ? 'check-circle' : 'cleaning-services'}
              size={44}
              color="#fff"
            />
          </View>
          <Text style={[styles.statusHeroTitle, { color: isDone ? '#15803D' : palette.warning }]}>
            {isDone ? 'Nhiệm vụ đã hoàn thành' : 'Tóm tắt nhiệm vụ'}
          </Text>
          {task?.pod_name ? (
            <Text style={[styles.statusHeroPod, { color: isDone ? '#15803D' : palette.warning }]}>
              {task.pod_name}
            </Text>
          ) : null}
          {task?.pod_cluster_name ? (
            <Text style={[styles.statusSub, { color: palette.textMuted }]}>
              {task.pod_cluster_name}
            </Text>
          ) : null}
        </View>

        {/* ── Task Info ── */}
        {task ? (
          <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="schedule" size={18} color={palette.primary} />
              <Text style={[styles.cardTitle, { color: palette.text }]}>Nhật ký thời gian</Text>
            </View>

            {task.booking_guest_name ? (
              <View style={styles.auditRow}>
                <View style={styles.auditContent}>
                  <Text style={[styles.auditLabel, { color: palette.textMuted }]}>Khách</Text>
                  <Text style={[styles.auditValue, { color: palette.text }]}>{task.booking_guest_name}</Text>
                </View>
              </View>
            ) : null}

            {/* Audit trail rows */}
            {([
              { label: 'Đã thông báo', value: task.notified_at },
              { label: 'Đã chấp nhận', value: task.accepted_at },
              { label: 'Bắt đầu dọn', value: task.actual_start_time ?? task.start_time },
              { label: 'Hoàn thành', value: task.actual_end_time ?? task.end_time },
            ] as { label: string; value?: string | null }[]).map(({ label, value }) =>
              value ? (
                <View key={label} style={styles.auditRow}>
                  <View style={styles.auditContent}>
                    <Text style={[styles.auditLabel, { color: palette.textMuted }]}>{label}</Text>
                    <Text style={[styles.auditValue, { color: palette.text }]}>{formatDateTime(value)}</Text>
                  </View>
                </View>
              ) : null
            )}
          </View>
        ) : null}

        {/* ── Before Photos ── */}
        <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="photo-camera" size={18} color={palette.primary} />
            <Text style={[styles.cardTitle, { color: palette.text }]}>
              Ảnh trước khi dọn ({beforePhotos.length})
            </Text>
          </View>
          {beforePhotos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.photoRow}>
                {beforePhotos.map((photo, idx) => {
                  const uri = String(photo.media?.url || photo.media_url || photo.photo_url || '');
                  const isVideo = (photo.file_type || photo.media?.file_type || '').toUpperCase() === 'VIDEO';
                  return (
                    <View key={photo.id ?? `before_${idx}`} style={{ position: 'relative' }}>
                      <Pressable onPress={() => setSelectedMedia({ uri, isVideo })}>
                        {isVideo ? (
                          <VideoThumb uri={uri} style={styles.photoThumb} iconSize={32} />
                        ) : (
                          <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
                        )}
                      </Pressable>
                      {isVideo ? (
                        <View style={styles.mediaBadge}>
                          <MaterialIcons name="videocam" size={10} color="#fff" />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>Chưa có ảnh trước khi dọn</Text>
          )}
        </View>

        {/* ── After Photos ── */}
        <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="photo-camera" size={18} color={palette.success} />
            <Text style={[styles.cardTitle, { color: palette.text }]}>
              Ảnh sau khi dọn ({afterPhotos.length})
            </Text>
          </View>
          {afterPhotos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.photoRow}>
                {afterPhotos.map((photo, idx) => {
                  const uri = String(photo.media?.url || photo.media_url || photo.photo_url || '');
                  const isVideo = (photo.file_type || photo.media?.file_type || '').toUpperCase() === 'VIDEO';
                  return (
                    <View key={photo.id ?? `after_${idx}`} style={{ position: 'relative' }}>
                      <Pressable onPress={() => setSelectedMedia({ uri, isVideo })}>
                        {isVideo ? (
                          <VideoThumb uri={uri} style={styles.photoThumb} iconSize={32} />
                        ) : (
                          <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
                        )}
                      </Pressable>
                      {isVideo ? (
                        <View style={styles.mediaBadge}>
                          <MaterialIcons name="videocam" size={10} color="#fff" />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>Chưa có ảnh sau khi dọn</Text>
          )}
        </View>

        {/* ── Damage Reports ── */}
        <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="report-problem" size={18} color={palette.error} />
            <Text style={[styles.cardTitle, { color: palette.text }]}>
              Báo cáo hư hại ({incidents.length})
            </Text>
          </View>

          {incidents.length === 0 ? (
            <View style={styles.noIncidentRow}>
              <MaterialIcons name="check-circle" size={20} color={palette.success} />
              <Text style={[styles.noIncidentText, { color: palette.success }]}>
                Không có hư hại được ghi nhận
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacingY._10 }}>
              {incidents.map((incident, idx) => {
                const sColor = severityColor(String(incident.severity || ''), palette);
                const incidentTypeLabel =
                  incident.incident_type === 'DAMAGE_REPORT' ? 'Hư hại vật tư' : 'Sự cố chung';
                return (
                  <View
                    key={String(incident.id ?? idx)}
                    style={[styles.incidentCard, { borderColor: sColor, backgroundColor: `${sColor}10` }]}>
                    <View style={styles.incidentHeader}>
                      <View
                        style={[styles.severityBadge, { backgroundColor: sColor }]}>
                        <Text style={styles.severityBadgeText}>
                          {severityLabelVi(String(incident.severity || ''))}
                        </Text>
                      </View>
                      <Text style={[styles.incidentType, { color: palette.textMuted }]}>
                        {incidentTypeLabel}
                      </Text>
                      <Text style={[styles.incidentStatus, { color: palette.textMuted }]}>
                        {String(incident.status || 'PENDING')}
                      </Text>
                    </View>

                    <Text style={[styles.incidentDesc, { color: palette.text }]}>
                      {String(incident.description || '-')}
                    </Text>

                    {incident.photo_urls && incident.photo_urls.length > 0 ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.photoRow}>
                          {incident.photo_urls.map((url, photoIdx) => {
                            const uri = String(url);
                            const isVideo = isVideoUrl(uri);
                            return (
                              <View key={`${incident.id}_${photoIdx}`} style={{ position: 'relative' }}>
                                <Pressable onPress={() => setSelectedMedia({ uri, isVideo })}>
                                  {isVideo ? (
                                    <VideoThumb uri={uri} style={styles.incidentThumb} iconSize={28} />
                                  ) : (
                                    <Image
                                      source={{ uri }}
                                      style={styles.incidentThumb}
                                      resizeMode="cover"
                                    />
                                  )}
                                </Pressable>
                                {isVideo ? (
                                  <View style={styles.mediaBadge}>
                                    <MaterialIcons name="videocam" size={10} color="#fff" />
                                  </View>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      </ScrollView>
                    ) : null}

                    <Text style={[styles.incidentTime, { color: palette.textMuted }]}>
                      {formatDateTime(String(incident.created_at || ''))}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

      {onBack ? (
        <View style={styles.backButtonWrap}>
          <Pressable
            style={[styles.backButton, { backgroundColor: palette.primary }]}
            onPress={onBack}>
            <MaterialIcons name="arrow-back" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={[styles.backButtonText, { color: '#fff' }]}>Về trang nhiệm vụ</Text>
          </Pressable>
        </View>
      ) : null}

      </View>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._20,
    paddingBottom: spacingY._30,
    gap: spacingY._12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacingX._20,
    gap: spacingY._10,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacingY._10,
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._10,
    borderRadius: radius._10,
  },
  retryText: {
    fontWeight: '600',
    fontFamily: Fonts.sans,
    fontSize: 14,
  },
  backButtonWrap: {
    paddingTop: spacingY._10,
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacingX._25,
    paddingVertical: spacingY._12,
    borderRadius: radius._10,
  },
  backButtonText: {
    fontWeight: '700',
    fontFamily: Fonts.sans,
    fontSize: 15,
  },

  // ── Status Hero Card ──
  statusHero: {
    alignItems: 'center',
    gap: spacingY._10,
    borderWidth: 1.5,
    borderRadius: radius._20,
    paddingVertical: spacingY._25,
    paddingHorizontal: spacingX._20,
  },
  statusIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusHeroTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: Fonts.sans,
    textAlign: 'center',
  },
  statusHeroPod: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    textAlign: 'center',
    marginTop: 2,
  },
  statusSub: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    marginTop: 2,
    textAlign: 'center',
  },

  // ── Card ──
  card: {
    borderWidth: 1,
    borderRadius: radius._20,
    padding: spacingX._15,
    gap: spacingY._10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._7,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },

  // ── Audit trail ──
  auditRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacingX._10,
    paddingVertical: 4,
  },
  auditDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#94a3b8',
    marginTop: 5,
    flexShrink: 0,
  },
  auditContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  auditLabel: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  auditValue: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
    maxWidth: '65%',
  },

  // ── Photos ──
  photoRow: {
    flexDirection: 'row',
    gap: spacingX._7,
    paddingVertical: 2,
  },
  photoThumb: {
    width: 100,
    height: 100,
    borderRadius: radius._10,
    overflow: 'hidden',
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

  // ── Incidents ──
  noIncidentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._7,
  },
  noIncidentText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  incidentCard: {
    borderWidth: 1,
    borderRadius: radius._17,
    padding: spacingX._12,
    gap: spacingY._7,
  },
  incidentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._7,
    flexWrap: 'wrap',
  },
  severityBadge: {
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: 3,
  },
  severityBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  incidentType: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    flex: 1,
  },
  incidentStatus: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },
  incidentDesc: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    lineHeight: 19,
  },
  incidentThumb: {
    width: 80,
    height: 80,
    borderRadius: radius._10,
  },
  incidentTime: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },

  // ── Lightbox ──
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  lightboxImage: {
    width: '100%',
    height: '80%',
  },
});
