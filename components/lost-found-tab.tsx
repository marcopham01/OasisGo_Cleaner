import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ResizeMode, Video } from 'expo-av';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';

import VideoThumb from '@/components/video-thumb';
import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/services/api';
import {
    getDamageReports,
    getMyLostFoundItems,
    getPodById,
    getWarehouseList,
} from '@/services/cleaner-dashboard.service';
import type {
    DamageReportResponse,
    IncidentSeverity,
    LostFoundItem,
} from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

const INCIDENT_SEVERITY_OPTIONS: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function getSeverityLabelVi(severity: IncidentSeverity) {
  if (severity === 'LOW') return 'Thấp';
  if (severity === 'MEDIUM') return 'Tr.bình';
  if (severity === 'HIGH') return 'Cao';
  if (severity === 'CRITICAL') return 'Tr.trọng';
  return severity;
}

function formatVnd(value?: number | null) {
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('vi-VN').format(Number(value)) + ' VND';
}

function parsePositiveInt(value: string, fallback = 1) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

interface LostFoundTabProps {
  token: string;
  isDark: boolean;
  palette: typeof Colors.light;
  onErrorChange?: (error: string | null) => void;
}

function resolveMediaBaseUrl() {
  const envBase = String(process.env.EXPO_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  if (envBase) {
    return envBase;
  }

  const clientBase = String(apiClient.defaults.baseURL || '').trim().replace(/\/+$/, '');
  if (!clientBase) {
    return '';
  }

  return clientBase.replace(/\/api$/i, '');
}

const MEDIA_BASE_URL = resolveMediaBaseUrl();

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

function toPhotoUrl(value: unknown) {
  const url = String(value || '').trim();
  if (!url) return '';

  if (/^https?:\/\//i.test(url) || /^data:image\//i.test(url) || /^file:\/\//i.test(url)) {
    return url;
  }

  if ((url.startsWith('/') || url.startsWith('./')) && MEDIA_BASE_URL) {
    const normalizedPath = url.startsWith('./') ? url.slice(1) : url;
    return `${MEDIA_BASE_URL}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`;
  }

  return '';
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|avi|webm|mkv|m4v)(\?|#|$)/i.test(url) || /\/video\/upload\//i.test(url);
}

function resolveLostFoundMedia(item: LostFoundItem): Array<{ uri: string; isVideo: boolean }> {
  const seen = new Set<string>();
  const result: Array<{ uri: string; isVideo: boolean }> = [];

  const push = (candidate: unknown, knownType?: string) => {
    const uri = toPhotoUrl(candidate);
    if (!uri || seen.has(uri)) return;
    seen.add(uri);
    const isVideo =
      knownType === 'VIDEO' ||
      (knownType !== 'IMAGE' && isVideoUrl(uri));
    result.push({ uri, isVideo });
  };

  // Preferred: photo_urls array returned by backend toLostFoundItemView
  if (Array.isArray(item.photo_urls)) {
    item.photo_urls.forEach((entry) => push(entry));
  }

  // Legacy fallbacks
  push(item.photo_url);

  const genericRecord = item as Record<string, unknown>;
  const photos = genericRecord.photos;
  if (Array.isArray(photos)) {
    photos.forEach((entry) => {
      if (typeof entry === 'string') { push(entry); return; }
      if (entry && typeof entry === 'object') {
        const photoObj = entry as Record<string, unknown>;
        push(photoObj.media_url);
        push(photoObj.photo_url);
        push(photoObj.url);
        push(photoObj.secure_url);
        push(photoObj.uri);
      }
    });
  }

  push(genericRecord.image_url);
  push(genericRecord.image);

  return result;
}

function itemId(item: LostFoundItem) {
  return String(item.id || item._id || '');
}

function statusColor(status: string | undefined, isDark: boolean) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'FOUND') return isDark ? '#60a5fa' : '#2563eb';
  if (normalized === 'IN_STORAGE') return isDark ? '#34d399' : '#059669';
  if (normalized === 'CLAIM_PENDING') return isDark ? '#fbbf24' : '#d97706';
  if (normalized === 'RETURNED') return isDark ? '#a78bfa' : '#7c3aed';
  if (normalized === 'DISPOSED') return isDark ? '#fb7185' : '#e11d48';
  return isDark ? '#94a3b8' : '#64748b';
}

function statusLabel(status: string | undefined) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'FOUND') return 'Đã tìm thấy';
  if (normalized === 'IN_STORAGE') return 'Đang lưu kho';
  if (normalized === 'CLAIM_PENDING') return 'Chờ bàn giao';
  if (normalized === 'RETURNED') return 'Đã trả khách';
  if (normalized === 'DISPOSED') return 'Đã xử lý';
  return normalized || '-';
}

function drStatusInfo(status: string, palette: typeof Colors.light) {
  if (status === 'PENDING') return { label: 'Đang chờ duyệt', text: palette.warning, bg: 'rgba(245, 158, 11, 0.16)' };
  if (status === 'RESOLVED') return { label: 'Đã xử lý', text: palette.success, bg: palette.secondaryBg };
  if (status === 'DISMISSED') return { label: 'Bị bác bỏ', text: palette.error, bg: 'rgba(244, 63, 94, 0.14)' };
  return { label: status || 'Không xác định', text: palette.textMuted, bg: palette.border };
}

function drSeverityInfo(severity: string, palette: typeof Colors.light) {
  if (severity === 'LOW') return { label: 'Thấp', text: palette.success, bg: palette.secondaryBg };
  if (severity === 'MEDIUM') return { label: 'Trung bình', text: palette.warning, bg: 'rgba(245, 158, 11, 0.16)' };
  if (severity === 'HIGH') return { label: 'Cao', text: '#b45309', bg: 'rgba(251, 191, 36, 0.2)' };
  if (severity === 'CRITICAL') return { label: 'Nghiêm trọng', text: palette.error, bg: 'rgba(244, 63, 94, 0.14)' };
  return { label: severity || 'Không xác định', text: palette.textMuted, bg: palette.border };
}

export default function LostFoundTab({ token, isDark, palette, onErrorChange }: LostFoundTabProps) {
  const params = useLocalSearchParams<{
    listTab?: string;
    tab?: string;
    section?: string;
  }>();
  const { user } = useAuth();
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMedia, setPreviewMedia] = useState<{ uri: string; isVideo: boolean } | null>(null);
  // List sub-tab
  const [activeListTab, setActiveListTab] = useState<'LOST_FOUND' | 'DAMAGE'>('LOST_FOUND');
  const [damageReports, setDamageReports] = useState<DamageReportResponse[]>([]);

  useEffect(() => {
    const requestedTab = String(params.listTab || params.tab || params.section || '')
      .trim()
      .toUpperCase();
    if (requestedTab === 'DAMAGE') {
      setActiveListTab('DAMAGE');
      return;
    }
    if (requestedTab === 'LOST_FOUND') {
      setActiveListTab('LOST_FOUND');
    }
  }, [params.listTab, params.section, params.tab]);

  const loadItems = useCallback(async (opts?: { isRefresh?: boolean }) => {
    if (opts?.isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    onErrorChange?.(null);

    try {
      const myUserId = String(user?.id || '').trim() || undefined;
      const [lfData, drData] = await Promise.all([
        getMyLostFoundItems(token, { found_by_user_id: myUserId }),
        getDamageReports(token, { page: 1, limit: 50 }).catch(() => ({ items: [], pagination: null })),
      ]);

      // Enrich pod_name and warehouse_name
      const uniquePodIds = [...new Set(lfData.map((i) => String(i.pod_id || '').trim()).filter(Boolean))];
      const uniqueWarehouseIds = [...new Set(lfData.map((i) => String(i.warehouse_id || '').trim()).filter(Boolean))];

      const [podResults, warehouseResults] = await Promise.all([
        Promise.all(uniquePodIds.map((id) => getPodById(token, id).catch(() => null))),
        uniqueWarehouseIds.length > 0 ? getWarehouseList(token).catch(() => []) : Promise.resolve([]),
      ]);

      const podNameMap: Record<string, string> = {};
      for (let i = 0; i < uniquePodIds.length; i++) {
        const pod = podResults[i];
        if (pod) {
          podNameMap[uniquePodIds[i]] = pod.name || (pod.code ? `Pod ${pod.code}` : uniquePodIds[i]);
        }
      }

      const warehouseNameMap: Record<string, string> = {};
      for (const wh of warehouseResults) {
        const wId = String(wh.id || '').trim();
        if (wId) warehouseNameMap[wId] = String(wh.name || wId);
      }

      const enriched = lfData.map((item) => ({
        ...item,
        pod_name: item.pod_name || (item.pod_id ? (podNameMap[String(item.pod_id)] ?? null) : null),
        warehouse_name: item.warehouse_name || (item.warehouse_id ? (warehouseNameMap[String(item.warehouse_id)] ?? null) : null),
      }));

      setItems(enriched);
      setDamageReports(
        [...drData.items].sort((a, b) =>
          new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime(),
        ),
      );
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      onErrorChange?.(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, user, onErrorChange]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  // Reload list when navigating back from damage-report screen
  useFocusEffect(
    useCallback(() => {
      void loadItems();
    }, [loadItems]),
  );

  const closeImagePreview = () => {
    setPreviewMedia(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      {/* ── Page header ── */}
      <View style={[styles.pageHeaderWrap, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
        <Text style={[styles.pageTitle, { color: palette.primary }]}>Báo cáo sự cố</Text>

        {/* Action buttons */}
        <View style={styles.actionBtnRow}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: palette.primary }]}
            onPress={() => router.push('/report-lost-found' as never)}>
            <Text style={[styles.actionBtnText, { color: palette.white }]}>+ Báo tìm thấy đồ</Text>
          </Pressable>
          {/* ⚠ Báo hư hại — ẩn tạm, giữ lại logic */}
          <Pressable
            style={[styles.actionBtn, { backgroundColor: '#d97706' }]}
            onPress={() => router.push('/incident/list' as never)}>
            <Text style={[styles.actionBtnText, { color: '#fff' }]}>🔧 Xử lý hư hại gấp</Text>
          </Pressable>
        </View>

        {/* Sub-tab switcher — ẩn tạm, chỉ hiện đồ thất lạc
        <View style={styles.switchRow}>
          <Pressable
            style={[styles.switchBtn, {
              backgroundColor: activeListTab === 'LOST_FOUND' ? palette.primaryBg : palette.surface,
              borderColor: activeListTab === 'LOST_FOUND' ? palette.primary : palette.border,
            }]}
            onPress={() => setActiveListTab('LOST_FOUND')}>
            <Text style={[styles.switchBtnText, {
              color: activeListTab === 'LOST_FOUND' ? palette.primary : palette.textMuted,
            }]}>
              Đồ thất lạc ({items.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.switchBtn, {
              backgroundColor: activeListTab === 'DAMAGE' ? `${palette.error}18` : palette.surface,
              borderColor: activeListTab === 'DAMAGE' ? palette.error : palette.border,
            }]}
            onPress={() => setActiveListTab('DAMAGE')}>
            <Text style={[styles.switchBtnText, {
              color: activeListTab === 'DAMAGE' ? palette.error : palette.textMuted,
            }]}>
              Báo cáo hư hại ({damageReports.length})
            </Text>
          </Pressable>
        </View>
        */}
      </View>

      {error && (
        <View style={[styles.errorBox, { backgroundColor: palette.card, borderColor: palette.error, marginHorizontal: spacingX._20, marginTop: spacingY._12 }]}>
          <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
        </View>
      )}

      {/* ── Lists ── */}
      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={palette.primary}
              onRefresh={() => void loadItems({ isRefresh: true })}
            />
          }>
          {items.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                Bạn chưa có báo cáo đồ thất lạc nào.
              </Text>
            </View>
          ) : (
            items.map((item) => {
              const status = String(item.status || 'FOUND').toUpperCase();
              const id = itemId(item);
              const media = resolveLostFoundMedia(item);

              return (
                <View
                  key={id || Math.random()}
                  style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={1}>
                      {String(item.item_name || '-')}
                    </Text>
                    <View style={[styles.lfStatusBadge, { backgroundColor: `${statusColor(status, isDark)}22` }]}>
                      <Text style={[styles.lfStatusBadgeText, { color: statusColor(status, isDark) }]}>
                        {statusLabel(status)}
                      </Text>
                    </View>
                  </View>

                  {item.description ? (
                    <Text style={[styles.meta, { color: palette.textMuted }]}>
                      {String(item.description)}
                    </Text>
                  ) : null}

                  {media.length > 0 ? (
                    <View>
                      <Text style={[styles.meta, { color: palette.textMuted, marginBottom: spacingY._5 }]}>
                        Media ({media.length})
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.photoRow}>
                          {media.map(({ uri, isVideo }, idx) => (
                            <View
                              key={`${id || 'lost-found'}_media_${idx}`}
                              style={{ position: 'relative' }}>
                              <Pressable
                                style={styles.photoThumbPressable}
                                onPress={() => setPreviewMedia({ uri, isVideo })}>
                                {isVideo ? (
                                  <VideoThumb uri={uri} style={styles.photoThumb} iconSize={32} />
                                ) : (
                                  <Image
                                    source={{ uri }}
                                    style={styles.photoThumb}
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
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  ) : null}

                  <View style={styles.metaGrid}>
                    <MetaRow label="Pod" value={item.pod_name || item.pod_id || null} palette={palette} />
                    <MetaRow label="Kho" value={item.warehouse_name || item.warehouse_id || null} palette={palette} />
                    <MetaRow label="Thời điểm tìm" value={formatDateTime(item.found_at)} palette={palette} />
                    {item.claimed_at ? (
                      <MetaRow label="Đã nhận lúc" value={formatDateTime(item.claimed_at)} palette={palette} />
                    ) : null}
                  </View>


                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Danh sách báo cáo hư hại — ẩn tạm
      activeListTab === 'DAMAGE' && (
          {damageReports.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                Bạn chưa có báo cáo hư hại nào.
              </Text>
            </View>
          ) : (
            damageReports.map((report) => {
              const incidentId = String(report.report_id || '').trim();
              const podName = report.context?.pod_name || report.context?.pod_id || 'Không rõ Pod';
              const photos = Array.isArray(report.photo_urls)
                ? report.photo_urls
                    .map((uri) => toPhotoUrl(uri))
                    .filter(Boolean)
                    .map((uri) => ({ uri, isVideo: isVideoUrl(uri) }))
                : [];
              const totalValue = (() => {
                const v = report.pricing?.estimated_total_value;
                return typeof v === 'number' && Number.isFinite(v) ? formatVnd(v) : null;
              })();

              const statusNorm = String(report.status || '').toUpperCase();
              const severityNorm = String(report.severity || '').toUpperCase();

              const statusInfo = drStatusInfo(statusNorm, palette);
              const severityInfo = drSeverityInfo(severityNorm, palette);

              return (
                <View
                  key={incidentId || `${report.created_at}-${report.description}`}
                  style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
                  <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={2}>
                    {String(report.description || 'Báo cáo hư hại')}
                  </Text>

                  <View style={styles.badgeRow}>
                    <View style={[styles.badgeChip, { backgroundColor: statusInfo.bg }]}>
                      <Text style={[styles.badgeChipText, { color: statusInfo.text }]}>{statusInfo.label}</Text>
                    </View>
                    <View style={[styles.badgeChip, { backgroundColor: severityInfo.bg }]}>
                      <Text style={[styles.badgeChipText, { color: severityInfo.text }]}>{severityInfo.label}</Text>
                    </View>
                  </View>

                  <View style={styles.metaGrid}>
                    <MetaRow label="Pod" value={podName} palette={palette} />
                    {totalValue ? <MetaRow label="Ước tính" value={totalValue} palette={palette} /> : null}
                    <MetaRow label="Ngày tạo" value={formatDateTime(report.created_at)} palette={palette} />
                  </View>

                  {photos.length > 0 ? (
                    <View>
                      <Text style={[styles.meta, { color: palette.textMuted, marginBottom: spacingY._5 }]}>
                        Media đính kèm ({photos.length})
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.photoRow}>
                          {photos.map(({ uri, isVideo }, idx) => (
                            <View
                              key={`${incidentId || 'damage'}_media_${idx}`}
                              style={{ position: 'relative' }}>
                              <Pressable
                                style={styles.photoThumbPressable}
                                onPress={() => setPreviewMedia({ uri, isVideo })}>
                                {isVideo ? (
                                  <VideoThumb uri={uri} style={styles.photoThumb} iconSize={32} />
                                ) : (
                                  <Image
                                    source={{ uri }}
                                    style={styles.photoThumb}
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
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  ) : null}

                  {incidentId ? (
                    <Pressable
                      style={styles.copyIdRow}
                      onPress={() => {
                        Clipboard.setStringAsync(incidentId)
                          .then(() => Alert.alert('Đã sao chép', `Mã báo cáo: ${incidentId}`))
                          .catch(() => null);
                      }}
                      hitSlop={8}>
                      <Text style={[styles.meta, { color: palette.textMuted }]}>Mã: </Text>
                      <Text style={[styles.meta, { color: palette.textMuted, flex: 1 }]} numberOfLines={1} ellipsizeMode="head">
                        {incidentId}
                      </Text>
                      <MaterialIcons name="content-copy" size={14} color={palette.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      */}

      <Modal
        visible={previewMedia !== null}
        transparent
        animationType="fade"
        onRequestClose={closeImagePreview}>
        <View style={styles.lightboxOverlay}>
          <Pressable style={styles.lightboxBackdrop} onPress={closeImagePreview} />

          <Pressable style={styles.lightboxClose} onPress={closeImagePreview} hitSlop={8}>
            <MaterialIcons name="close" size={26} color="#fff" />
          </Pressable>

          {previewMedia ? (
            previewMedia.isVideo ? (
              <Video
                source={{ uri: previewMedia.uri }}
                style={styles.lightboxImage}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls
                shouldPlay
              />
            ) : (
              <Image source={{ uri: previewMedia.uri }} style={styles.lightboxImage} resizeMode="contain" />
            )
          ) : null}
        </View>
      </Modal>

    </View>
  );
}

function MetaRow({
  label,
  value,
  palette,
}: {
  label: string;
  value: string | null | undefined;
  palette: typeof Colors.light;
}) {
  if (!value || value === '-') return null;
  return (
    <View style={styles.metaRow}>
      <Text style={[styles.metaLabel, { color: palette.textMuted }]}>{label}:</Text>
      <Text style={[styles.metaValue, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Page header ──
  pageHeaderWrap: {
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._15,
    paddingBottom: spacingY._12,
    borderBottomWidth: 1,
    gap: spacingY._10,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    textAlign: 'center',
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: spacingX._10,
  },
  actionBtn: {
    flex: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    alignItems: 'center',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  switchRow: {
    flexDirection: 'row',
    gap: spacingX._10,
  },
  switchBtn: {
    flex: 1,
    borderRadius: radius._10,
    borderWidth: 1,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._7,
    alignItems: 'center',
  },
  switchBtnText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  // ── List ──
  listContent: {
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._12,
    paddingBottom: spacingY._20,
    gap: spacingY._12,
  },
  centerLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacingY._30,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: radius._12,
    padding: spacingX._20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    textAlign: 'center',
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
  card: {
    borderWidth: 1,
    borderRadius: radius._12,
    padding: spacingX._12,
    gap: spacingY._7,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    flex: 1,
  },
  // Lost-found status badge (chip style)
  lfStatusBadge: {
    borderRadius: radius._10,
    paddingHorizontal: spacingX._7,
    paddingVertical: 3,
  },
  lfStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Fonts.mono,
  },
  // Damage report badge chips
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingX._7,
  },
  badgeChip: {
    borderRadius: radius._10,
    paddingHorizontal: spacingX._7,
    paddingVertical: 3,
  },
  badgeChipText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  copyIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._5,
  },
  // Shared card sub-styles
  meta: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  metaGrid: {
    gap: spacingY._5,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacingX._5,
    alignItems: 'flex-start',
  },
  metaLabel: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    flex: 1,
  },
  actionRow: {
    marginTop: spacingY._5,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingX._7,
  },
  statusButton: {
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
    minWidth: 80,
    alignItems: 'center',
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  drChipRow: {
    flexDirection: 'row',
    gap: spacingX._7,
    paddingBottom: spacingY._5,
  },
  drChip: {
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
    minWidth: 80,
    alignItems: 'center',
  },
  drChipName: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  drChipSub: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },
  drSelectedCount: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    marginTop: spacingY._5,
  },
  drSelectedCard: {
    borderWidth: 1,
    borderRadius: radius._10,
    padding: spacingX._10,
    gap: spacingY._7,
    marginTop: spacingY._7,
  },
  drSelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
    gap: spacingX._7,
  },
  drSelInfo: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  drQtyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius._6,
    flexShrink: 0,
  },
  drQtyBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drQtyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  drQtyVal: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: Fonts.sans,
    fontWeight: '700',
  },
  drPricingBox: {
    borderWidth: 1,
    borderRadius: radius._10,
    padding: spacingX._12,
    gap: spacingY._5,
    marginTop: spacingY._10,
  },
  drPricingText: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  drPricingTotal: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  drSeverityRow: {
    flexDirection: 'row',
    gap: spacingX._7,
    flexWrap: 'wrap',
    marginBottom: spacingY._7,
  },
  drSeverityChip: {
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._7,
  },
  drSeverityText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  photoRow: {
    flexDirection: 'row',
    gap: spacingX._7,
  },
  photoThumbPressable: {
    borderRadius: radius._10,
    overflow: 'hidden',
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: radius._10,
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
    backgroundColor: '#7c3aed',
    flexDirection: 'row',
    alignItems: 'center',
  },
  lightboxOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  lightboxBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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