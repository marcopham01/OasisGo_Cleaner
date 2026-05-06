import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
    getCleanerIncidentDetail,
    updateCleanerIncidentStatus,
} from '@/services/incident.service';
import type { CleanerIncident, IncidentDetailLine } from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

// ─── Helpers ─────────────────────────────────────────────────────

function formatDateTime(dateText?: string | null) {
  if (!dateText) return '-';
  const parsed = new Date(dateText as string);
  return Number.isNaN(parsed.getTime())
    ? String(dateText)
    : parsed.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function formatVnd(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return new Intl.NumberFormat('vi-VN').format(Number(value)) + ' đ';
}

function severityConfig(s?: string, palette?: typeof Colors.light) {
  const v = String(s || '').toUpperCase();
  if (v === 'CRITICAL') return { label: 'Nghiêm trọng', color: '#dc2626', bg: '#fee2e2', icon: 'warning' as const };
  if (v === 'HIGH') return { label: 'Cao', color: palette?.error ?? '#f43f5e', bg: '#fee2e2', icon: 'error-outline' as const };
  if (v === 'MEDIUM') return { label: 'Trung bình', color: '#d97706', bg: '#fef3c7', icon: 'report-problem' as const };
  return { label: 'Thấp', color: palette?.success ?? '#10b981', bg: '#d1fae5', icon: 'info-outline' as const };
}

function statusConfig(s?: string) {
  const v = String(s || '').toUpperCase();
  if (v === 'PENDING') return { label: 'Chờ xử lý', color: '#d97706', bg: '#fef3c7', icon: 'hourglass-empty' as const };
  if (v === 'PROCESSING') return { label: 'Đang xử lý', color: '#2563eb', bg: '#dbeafe', icon: 'build' as const };
  if (v === 'COMPLETED') return { label: 'Hoàn thành', color: '#059669', bg: '#d1fae5', icon: 'check-circle' as const };
  if (v === 'RESOLVED') return { label: 'Đã giải quyết', color: '#059669', bg: '#d1fae5', icon: 'verified' as const };
  if (v === 'DISMISSED') return { label: 'Đã hủy', color: '#6b7280', bg: '#f3f4f6', icon: 'cancel' as const };
  return { label: s || '-', color: '#6b7280', bg: '#f3f4f6', icon: 'help-outline' as const };
}

function taskStatusLabel(s?: string) {
  const v = String(s || '').toUpperCase();
  if (v === 'ASSIGNED') return 'Đã giao';
  if (v === 'ACCEPTED') return 'Đã nhận';
  if (v === 'IN_PROGRESS') return 'Đang thực hiện';
  if (v === 'DONE') return 'Hoàn tất';
  if (v === 'MISSED') return 'Bỏ lỡ';
  if (v === 'CANCELLED') return 'Đã hủy';
  return s || '-';
}

function bookingStatusLabel(s?: string) {
  const v = String(s || '').toUpperCase();
  if (v === 'IN_USE') return 'Đang sử dụng';
  if (v === 'COMPLETED') return 'Đã kết thúc';
  if (v === 'BOOKED') return 'Đã đặt';
  if (v === 'CANCELLED') return 'Đã hủy';
  if (v === 'NO_SHOW') return 'Không đến';
  if (v === 'ACTIVE') return 'Đang diễn ra';
  if (v === 'PENDING') return 'Chờ xác nhận';
  return s || '-';
}

function checkinStateLabel(s?: string) {
  const v = String(s || '').toUpperCase();
  if (v === 'MANUAL_CHECKED_IN') return 'Check-in thủ công';
  if (v === 'AUTO_CHECKED_IN') return 'Check-in tự động';
  if (v === 'QR_CHECKED_IN') return 'Check-in QR';
  if (v === 'NOT_CHECKED_IN') return 'Chưa check-in';
  return s || '-';
}

function requestSourceLabel(s?: string) {
  const v = String(s || '').toUpperCase();
  if (v === 'AUTO_AFTER_CHECKOUT') return 'Tự động sau check-out';
  if (v === 'MANUAL') return 'Thủ công';
  if (v === 'SYSTEM') return 'Hệ thống';
  return s || '-';
}

function incidentTypeLabel(s?: string) {
  const v = String(s || '').toUpperCase();
  if (v === 'REPLENISHMENT_REQUEST') return 'Bổ sung vật tư';
  if (v === 'DAMAGE_REPORT') return 'Báo hư hại';
  if (v === 'OPERATIONAL') return 'Vận hành';
  return s || '-';
}

// ─── Sub-components ────────────────────────────────────────────

function InfoRow({ icon, label, value, palette }: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  palette: typeof Colors.light;
}) {
  if (!value || value === '-' || value === 'null' || value === 'undefined') return null;
  return (
    <View style={[rowStyles.row, { borderBottomColor: palette.border }]}>
      <View style={rowStyles.labelWrap}>
        <MaterialIcons name={icon} size={13} color={palette.textMuted} />
        <Text style={[rowStyles.label, { color: palette.textMuted }]}>{label}</Text>
      </View>
      <Text style={[rowStyles.value, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: spacingY._7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacingX._7,
  },
  labelWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '42%' },
  label: { fontSize: 12, fontFamily: Fonts.sans, fontWeight: '500', flexShrink: 1 },
  value: { fontSize: 13, fontFamily: Fonts.sans, textAlign: 'right', flex: 1, fontWeight: '600' },
});

function SectionCard({ title, icon, children, palette }: {
  title: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  children: React.ReactNode;
  palette: typeof Colors.light;
}) {
  return (
    <View style={[sectionStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={[sectionStyles.header, { borderBottomColor: palette.border }]}>
        <MaterialIcons name={icon} size={15} color={palette.primary} />
        <Text style={[sectionStyles.title, { color: palette.text }]}>{title}</Text>
      </View>
      <View style={sectionStyles.body}>{children}</View>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  card: {
    borderRadius: radius._17,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._7,
    paddingHorizontal: spacingX._15,
    paddingVertical: spacingY._7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 13, fontWeight: '700', fontFamily: Fonts.sans },
  body: { paddingHorizontal: spacingX._15, paddingBottom: spacingY._7 },
});

// ─── Main Screen ──────────────────────────────────────────────

export default function IncidentDetailScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const isDark = theme === 'dark';
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; incidentId?: string; cleaningTaskId?: string }>();

  const incidentId = String(params.incidentId || params.id || '').trim();
  const cleaningTaskId = String(params.cleaningTaskId || '').trim();

  const [incident, setIncident] = useState<CleanerIncident | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token || !incidentId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getCleanerIncidentDetail(token, incidentId);
      setIncident(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [token, incidentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolvedCleaningTaskId =
    cleaningTaskId ||
    String((incident?.cleaning_task as Record<string, unknown> | null)?.id || incident?.cleaning_task_id || '').trim();

  // ── Action: REPLENISHMENT_REQUEST — navigate to repair screen ──
  const handleGoRepair = async () => {
    if (!token || !incident) return;
    const targetId = String(incident.id || '').trim();
    if (!targetId) return;

    const currentStatus = String(incident.status || '').toUpperCase();
    if (currentStatus !== 'PENDING') {
      router.push(
        `/incident/repair?incidentId=${encodeURIComponent(targetId)}&cleaningTaskId=${encodeURIComponent(resolvedCleaningTaskId)}` as never,
      );
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateCleanerIncidentStatus(token, targetId, { status: 'PROCESSING' });
      setIncident((prev) => prev ? { ...prev, status: updated.status ?? 'PROCESSING' } : prev);
      router.push(
        `/incident/repair?incidentId=${encodeURIComponent(targetId)}&cleaningTaskId=${encodeURIComponent(resolvedCleaningTaskId)}` as never,
      );
    } catch (err) {
      Alert.alert('Lỗi', getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Action: DAMAGE_REPORT — inline status progression ──
  const handleDamageStatusUpdate = async (targetStatus: 'PROCESSING' | 'COMPLETED') => {
    if (!token || !incident) return;
    const targetId = String(incident.id || '').trim();
    if (!targetId) return;

    setSubmitting(true);
    try {
      const updated = await updateCleanerIncidentStatus(token, targetId, { status: targetStatus });
      setIncident((prev) => prev ? { ...prev, status: updated.status ?? targetStatus } : prev);
      if (targetStatus === 'COMPLETED') {
        Alert.alert(
          'Đã ghi nhận',
          'Báo cáo hư hại đã được đánh dấu hoàn thành. Quản lý sẽ xem xét và duyệt.',
          [{ text: 'OK' }],
        );
      }
    } catch (err) {
      Alert.alert('Lỗi', getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading / Error states ──
  if (!token) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['bottom']}>
        <View style={styles.center}>
          <MaterialIcons name="lock-outline" size={40} color={palette.error} />
          <Text style={[styles.centerText, { color: palette.error }]}>Bạn chưa đăng nhập</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={palette.primary} size="large" />
          <Text style={[styles.centerText, { color: palette.textMuted }]}>Đang tải...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['bottom']}>
        <View style={styles.center}>
          <MaterialIcons name="error-outline" size={40} color={palette.error} />
          <Text style={[styles.centerText, { color: palette.error }]}>{error}</Text>
          <TouchableOpacity onPress={load} style={[styles.retryBtn, { borderColor: palette.primary }]}>
            <Text style={[styles.retryText, { color: palette.primary }]}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!incident) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['bottom']}>
        <View style={styles.center}>
          <MaterialIcons name="find-in-page" size={40} color={palette.textMuted} />
          <Text style={[styles.centerText, { color: palette.textMuted }]}>Không tìm thấy sự cố</Text>
        </View>
      </SafeAreaView>
    );
  }

  const sv = severityConfig(String(incident.severity || ''), palette);
  const st = statusConfig(String(incident.status || ''));
  const currentStatus = String(incident.status || '').toUpperCase();
  const incidentType = String(incident.incident_type || '').toUpperCase();
  const isDamageReport = incidentType === 'DAMAGE_REPORT';
  const isReplenishment = incidentType === 'REPLENISHMENT_REQUEST';
  const canProcess = currentStatus === 'PENDING' || currentStatus === 'PROCESSING';

  const cleaningTask = incident.cleaning_task as Record<string, unknown> | null;
  const booking = incident.booking as Record<string, unknown> | null;

  // pod_name is returned at root level by the API
  const podName = String(
    incident.pod_name || (incident as Record<string, unknown>)['pod_name'] ||
    cleaningTask?.pod_name || incident.pod_id || ''
  ).trim();

  const details: IncidentDetailLine[] = Array.isArray(incident.details) ? incident.details : [];
  const photoUrls: string[] = Array.isArray(incident.photo_urls) ? incident.photo_urls.map(String) : [];

  const reporterName = String(incident.reporter_name || '').trim();
  const handledByName = String(incident.handled_by_name || '').trim();
  const escalationNote = String(incident.escalation_note || '').trim();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Hero card ── */}
        <View style={[styles.heroCard, { backgroundColor: palette.card, borderColor: sv.color + '40' }]}>
          <View style={[styles.heroAccent, { backgroundColor: sv.color }]} />
          <View style={styles.heroBody}>
            {/* Chips: type + severity */}
            <View style={styles.heroTop}>
              <View style={[styles.chip, { backgroundColor: isDark ? palette.surface : '#f1f5f9' }]}>
                <MaterialIcons name="report" size={11} color={palette.textMuted} />
                <Text style={[styles.chipText, { color: palette.textMuted }]}>
                  {incidentTypeLabel(String(incident.incident_type || ''))}
                </Text>
              </View>
              <View style={[styles.chip, { backgroundColor: sv.bg, borderColor: sv.color + '50', borderWidth: 1 }]}>
                <MaterialIcons name={sv.icon} size={11} color={sv.color} />
                <Text style={[styles.chipText, { color: sv.color }]}>{sv.label}</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
                <MaterialIcons name={st.icon} size={11} color={st.color} />
                <Text style={[styles.statusPillText, { color: st.color }]}>{st.label}</Text>
              </View>
            </View>

            {/* Pod name */}
            {podName ? (
              <View style={styles.podRow}>
                <MaterialIcons name="place" size={16} color={sv.color} />
                <Text style={[styles.podName, { color: palette.text }]}>{podName}</Text>
              </View>
            ) : null}

            {/* Description */}
            <Text style={[styles.description, { color: palette.text }]}>
              {String(incident.description || 'Không có mô tả')}
            </Text>

            {/* Timestamps row */}
            <View style={styles.timestampRow}>
              <View style={styles.timeRow}>
                <MaterialIcons name="add-circle-outline" size={11} color={palette.textMuted} />
                <Text style={[styles.timeText, { color: palette.textMuted }]}>
                  Tạo: {formatDateTime(String(incident.created_at || ''))}
                </Text>
              </View>
              {incident.updated_at && incident.updated_at !== incident.created_at ? (
                <View style={styles.timeRow}>
                  <MaterialIcons name="update" size={11} color={palette.textMuted} />
                  <Text style={[styles.timeText, { color: palette.textMuted }]}>
                    Cập nhật: {formatDateTime(String(incident.updated_at))}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── People ── */}
        <SectionCard title="Người liên quan" icon="people" palette={palette}>
          <View style={[rowStyles.row, { borderBottomColor: palette.border }]}>
            <View style={rowStyles.labelWrap}>
              <MaterialIcons name="person-outline" size={13} color={palette.textMuted} />
              <Text style={[rowStyles.label, { color: palette.textMuted }]}>Người báo cáo</Text>
            </View>
            <Text style={[rowStyles.value, { color: palette.text }]}>{reporterName || '-'}</Text>
          </View>
          <View style={[rowStyles.row, { borderBottomColor: palette.border }]}>
            <View style={rowStyles.labelWrap}>
              <MaterialIcons name="build" size={13} color={palette.textMuted} />
              <Text style={[rowStyles.label, { color: palette.textMuted }]}>Người xử lý</Text>
            </View>
            <Text style={[rowStyles.value, { color: palette.text }]}>{handledByName || '-'}</Text>
          </View>
        </SectionCard>

        {/* ── Resolution note ── */}
        {incident.resolution_note ? (
          <View style={[styles.noteBox, { backgroundColor: isDark ? '#0d2318' : '#f0fdf4', borderColor: palette.success + '60' }]}>
            <MaterialIcons name="check-circle-outline" size={16} color={palette.success} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.noteLabel, { color: palette.success }]}>Ghi chú xử lý</Text>
              <Text style={[styles.noteText, { color: palette.text }]}>{String(incident.resolution_note)}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Escalation note ── */}
        {escalationNote ? (
          <View style={[styles.noteBox, { backgroundColor: isDark ? '#1c0a0a' : '#fff7ed', borderColor: '#f97316' + '50' }]}>
            <MaterialIcons name="warning-amber" size={16} color="#f97316" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.noteLabel, { color: '#f97316' }]}>Ghi chú leo thang</Text>
              <Text style={[styles.noteText, { color: palette.text }]}>{escalationNote}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Detail items ── */}
        {details.length > 0 ? (
          <SectionCard title={`Hạng mục (${details.length})`} icon="list-alt" palette={palette}>
            {details.map((detail, idx) => {
              const isItem = String(detail.type || '').toUpperCase() === 'ITEM';
              return (
                <View
                  key={`detail_${idx}`}
                  style={[
                    styles.detailCard,
                    {
                      backgroundColor: isItem
                        ? (isDark ? '#0a1f14' : '#f0fdf4')
                        : (isDark ? '#0a1324' : '#eff6ff'),
                      borderColor: isItem ? (palette.success + '30') : '#bfdbfe',
                    },
                  ]}>
                  {/* Badge */}
                  <View style={[styles.detailTypeBadge, { backgroundColor: isItem ? (palette.success + '25') : '#dbeafe' }]}>
                    <MaterialIcons name={isItem ? 'inventory-2' : 'miscellaneous-services'} size={10} color={isItem ? palette.success : '#2563eb'} />
                    <Text style={[styles.detailTypeTxt, { color: isItem ? palette.success : '#2563eb' }]}>
                      {isItem ? 'Vật tư' : 'Dịch vụ'}
                    </Text>
                  </View>
                  {/* Name */}
                  <Text style={[styles.detailName, { color: palette.text }]}>
                    {String(detail.name_snapshot || 'Hạng mục')}
                  </Text>
                  {/* Qty */}
                  <Text style={[styles.detailMetaText, { color: palette.textMuted }]}>
                    Số lượng: <Text style={{ fontWeight: '700', color: palette.text }}>× {detail.quantity ?? 1}</Text>
                  </Text>
                  {/* Note */}
                  {detail.note ? (
                    <View style={[styles.detailNoteBox, { backgroundColor: isDark ? '#ffffff10' : '#00000008' }]}>
                      <MaterialIcons name="notes" size={11} color={palette.textMuted} />
                      <Text style={[styles.detailNoteText, { color: palette.textMuted }]}>{String(detail.note)}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </SectionCard>
        ) : null}

        {/* ── Photos ── */}
        {photoUrls.length > 0 ? (
          <SectionCard title={`Ảnh đính kèm (${photoUrls.length})`} icon="photo-library" palette={palette}>
            <View style={styles.photoGrid}>
              {photoUrls.map((url, idx) => (
                <Image key={`photo_${idx}`} source={{ uri: url }} style={styles.photo} resizeMode="cover" />
              ))}
            </View>
          </SectionCard>
        ) : null}

        {/* ── Cleaning Task ── hidden per UX decision ── */}

        {/* ── Booking ── hidden per UX decision ── */}

      </ScrollView>

      {/* ── CTA Button ── */}
      {canProcess ? (
        <View style={[styles.bottomBar, { backgroundColor: palette.background, borderTopColor: palette.border, paddingBottom: Math.max(insets.bottom, spacingY._12) }]}>
          {isDamageReport ? (
            /* DAMAGE_REPORT: inline status progression, no repair screen */
            currentStatus === 'PENDING' ? (
              <Pressable
                style={({ pressed }) => [
                  styles.ctaBtn,
                  { backgroundColor: '#d97706', opacity: pressed || submitting ? 0.8 : 1 },
                ]}
                disabled={submitting}
                onPress={() => handleDamageStatusUpdate('PROCESSING')}>
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <MaterialIcons name="build" size={20} color="#fff" />
                    <Text style={styles.ctaBtnText}>Xác nhận đang xử lý</Text>
                  </>
                )}
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.ctaBtn,
                  { backgroundColor: palette.success, opacity: pressed || submitting ? 0.8 : 1 },
                ]}
                disabled={submitting}
                onPress={() => handleDamageStatusUpdate('COMPLETED')}>
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <MaterialIcons name="check-circle" size={20} color="#fff" />
                    <Text style={styles.ctaBtnText}>Đánh dấu đã hoàn thành</Text>
                  </>
                )}
              </Pressable>
            )
          ) : isReplenishment ? (
            /* REPLENISHMENT_REQUEST: navigate to repair screen */
            <Pressable
              style={({ pressed }) => [
                styles.ctaBtn,
                {
                  backgroundColor: currentStatus === 'PROCESSING' ? '#2563eb' : palette.primary,
                  opacity: pressed || submitting ? 0.8 : 1,
                },
              ]}
              disabled={submitting}
              onPress={handleGoRepair}>
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <MaterialIcons
                    name={currentStatus === 'PROCESSING' ? 'build' : 'arrow-forward'}
                    size={20}
                    color="#fff"
                  />
                  <Text style={styles.ctaBtnText}>
                    {currentStatus === 'PROCESSING' ? 'Tiếp tục xử lý' : 'Bắt đầu xử lý'}
                  </Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: spacingY._7 },
  centerText: { fontSize: 14, fontFamily: Fonts.sans, textAlign: 'center', paddingHorizontal: 24, marginTop: 4 },
  retryBtn: { borderWidth: 1, borderRadius: radius._10, paddingHorizontal: spacingX._20, paddingVertical: spacingY._7, marginTop: spacingY._7 },
  retryText: { fontSize: 14, fontFamily: Fonts.sans, fontWeight: '600' },

  scrollContent: {
    paddingHorizontal: spacingX._15,
    paddingTop: spacingY._12,
    paddingBottom: 110,
    gap: spacingY._12,
  },

  // ── Hero ──
  heroCard: {
    borderRadius: radius._17,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  heroAccent: { width: 5 },
  heroBody: { flex: 1, padding: spacingX._15, gap: spacingY._7 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacingX._7, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: spacingX._7, paddingVertical: 3, borderRadius: radius._6,
  },
  chipText: { fontSize: 10, fontFamily: Fonts.sans, fontWeight: '700' },
  podRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  podName: { fontSize: 17, fontWeight: '800', fontFamily: Fonts.sans, flex: 1 },
  description: { fontSize: 14, fontFamily: Fonts.sans, lineHeight: 20 },
  timestampRow: { gap: 3 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacingX._10, paddingVertical: 4, borderRadius: radius._10,
  },
  statusPillText: { fontSize: 10, fontWeight: '700', fontFamily: Fonts.sans },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  timeText: { fontSize: 10, fontFamily: Fonts.sans },

  // ── Notes ──
  noteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacingX._10,
    borderWidth: 1, borderRadius: radius._12, padding: spacingX._12,
  },
  noteLabel: { fontSize: 11, fontWeight: '700', fontFamily: Fonts.sans, marginBottom: 3 },
  noteText: { fontSize: 13, fontFamily: Fonts.sans, lineHeight: 18 },

  // ── Financial ──
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacingY._7,
    marginTop: spacingY._5,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  totalLabel: { fontSize: 13, fontFamily: Fonts.sans, fontWeight: '600' },
  totalValue: { fontSize: 16, fontFamily: Fonts.sans, fontWeight: '800' },

  // ── Photos ──
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: spacingY._7 },
  photo: { width: 88, height: 88, borderRadius: radius._10 },

  // ── Detail items ──
  detailCard: {
    borderRadius: radius._12,
    borderWidth: 1,
    padding: spacingX._12,
    marginBottom: spacingY._7,
    gap: spacingY._5,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailTypeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  detailTypeTxt: { fontSize: 10, fontWeight: '700', fontFamily: Fonts.sans },
  detailName: { fontSize: 14, fontFamily: Fonts.sans, fontWeight: '700', lineHeight: 20 },
  detailTotal: { fontSize: 15, fontFamily: Fonts.sans, fontWeight: '800' },
  detailMeta: { flexDirection: 'row', gap: spacingX._15, flexWrap: 'wrap' },
  detailMetaText: { fontSize: 12, fontFamily: Fonts.sans },
  detailNoteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 4,
    borderRadius: radius._6, padding: 6,
  },
  detailNoteText: { fontSize: 12, fontFamily: Fonts.sans, flex: 1, lineHeight: 17 },

  // ── CTA ──
  bottomBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacingX._15,
    paddingVertical: spacingY._12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingX._7,
    borderRadius: radius._17,
    paddingVertical: 15,
  },
  ctaBtnText: { fontSize: 16, fontWeight: '800', fontFamily: Fonts.sans, color: '#fff' },

  // ── Booking Card ──
  bookingCard: {
    borderRadius: radius._17,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  bookingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._7,
    paddingHorizontal: spacingX._15,
    paddingVertical: spacingY._7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bookingHeaderText: { fontSize: 13, fontWeight: '700', fontFamily: Fonts.sans },
  bookingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._10,
    margin: spacingX._12,
    borderRadius: radius._12,
    borderWidth: 1,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
  },
  bookingStatusLabel: { fontSize: 14, fontWeight: '700', fontFamily: Fonts.sans },
  bookingInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bookingInfoIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingInfoBody: { flex: 1 },
  bookingInfoLabel: { fontSize: 11, fontFamily: Fonts.sans },
  bookingInfoValue: { fontSize: 14, fontWeight: '600', fontFamily: Fonts.sans, marginTop: 1 },
});
