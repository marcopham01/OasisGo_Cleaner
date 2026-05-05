import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getMyCleanerIncidents } from '@/services/incident.service';
import type { CleanerIncident } from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

interface FlatIncident {
  incident: CleanerIncident;
  cleaningTaskId: string;
  podName: string;
}

function formatDateTime(dateText?: string) {
  if (!dateText) return '-';
  const parsed = new Date(dateText);
  return Number.isNaN(parsed.getTime())
    ? dateText
    : parsed.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function severityLabel(s?: string) {
  const v = String(s || '').toUpperCase();
  if (v === 'LOW') return 'Thấp';
  if (v === 'MEDIUM') return 'Trung bình';
  if (v === 'HIGH') return 'Cao';
  if (v === 'CRITICAL') return 'Nghiêm trọng';
  return s || '-';
}

function severityConfig(s?: string, palette?: typeof Colors.light): { color: string; icon: keyof typeof MaterialIcons.glyphMap } {
  const v = String(s || '').toUpperCase();
  if (v === 'CRITICAL') return { color: '#dc2626', icon: 'warning' };
  if (v === 'HIGH') return { color: palette?.error ?? '#f43f5e', icon: 'error-outline' };
  if (v === 'MEDIUM') return { color: '#f59e0b', icon: 'report-problem' };
  return { color: palette?.success ?? '#10b981', icon: 'info-outline' };
}

function statusConfig(s?: string): { label: string; color: string; bg: string; icon: keyof typeof MaterialIcons.glyphMap } {
  const v = String(s || '').toUpperCase();
  if (v === 'PENDING') return { label: 'Chờ xử lý', color: '#d97706', bg: '#fef3c7', icon: 'hourglass-empty' };
  if (v === 'PROCESSING') return { label: 'Đang xử lý', color: '#2563eb', bg: '#dbeafe', icon: 'build' };
  if (v === 'COMPLETED') return { label: 'Hoàn thành', color: '#059669', bg: '#d1fae5', icon: 'check-circle' };
  if (v === 'RESOLVED') return { label: 'Đã giải quyết', color: '#059669', bg: '#d1fae5', icon: 'verified' };
  if (v === 'DISMISSED') return { label: 'Đã hủy', color: '#6b7280', bg: '#f3f4f6', icon: 'cancel' };
  return { label: s || '-', color: '#6b7280', bg: '#f3f4f6', icon: 'help-outline' };
}

function incidentTypeLabel(t?: string) {
  const v = String(t || '').toUpperCase();
  if (v === 'DAMAGE_REPORT') return 'Hư hại';
  if (v === 'REPLENISHMENT_REQUEST') return 'Bổ sung vật tư';
  if (v === 'OPERATIONAL') return 'Vận hành';
  return t || '';
}

export default function IncidentListScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { token } = useAuth();
  const router = useRouter();
  const isDark = theme === 'dark';

  const [flatIncidents, setFlatIncidents] = useState<FlatIncident[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const incidents = await getMyCleanerIncidents(token);
      const flat: FlatIncident[] = incidents.map((incident) => {
        const task = incident.cleaning_task as Record<string, unknown> | null;
        const cleaningTaskId = String(incident.cleaning_task_id || task?.id || task?._id || '').trim();
        const podName = String(incident.pod_name || task?.pod_name || '').trim() || 'Pod';
        return { incident, cleaningTaskId, podName };
      });
      setFlatIncidents(flat);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handlePress = (item: FlatIncident) => {
    const incidentId = String(item.incident.id || '').trim();
    if (!incidentId) return;
    const params = new URLSearchParams();
    params.set('incidentId', incidentId);
    if (item.cleaningTaskId) params.set('cleaningTaskId', item.cleaningTaskId);
    router.push(`/incident/${incidentId}?${params.toString()}` as never);
  };

  const displayedIncidents = showAll
    ? flatIncidents
    : flatIncidents.filter(
        (item) =>
          String(item.incident.incident_type || '').toUpperCase() === 'REPLENISHMENT_REQUEST' &&
          String(item.incident['replenishment_status'] || '').toUpperCase() === 'NOT_REPLENISHED',
      );

  if (!token) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: palette.error }]}>Bạn chưa đăng nhập</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[palette.primary]} tintColor={palette.primary} />}>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: `${palette.error}15`, borderColor: `${palette.error}40` }]}>
            <MaterialIcons name="error-outline" size={16} color={palette.error} />
            <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
          </View>
        ) : null}

        {loading && flatIncidents.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={palette.primary} size="large" />
            <Text style={[styles.loadingText, { color: palette.textMuted }]}>Đang tải...</Text>
          </View>
        ) : flatIncidents.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: isDark ? palette.surface : '#f0fdf4' }]}>
              <MaterialIcons name="check-circle-outline" size={40} color={palette.success} />
            </View>
            <Text style={[styles.emptyTitle, { color: palette.text }]}>Không có sự cố nào</Text>
            <Text style={[styles.emptySubtitle, { color: palette.textMuted }]}>
              Hiện tại bạn chưa có báo cáo hư hại nào cần xử lý
            </Text>
          </View>
        ) : (
          <>
            <Pressable
              style={({ pressed }) => [
                styles.toggleBtn,
                {
                  backgroundColor: isDark ? palette.surface : '#eff6ff',
                  borderColor: palette.primary,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              onPress={() => setShowAll((v) => !v)}>
              <MaterialIcons
                name={showAll ? 'filter-list' : 'format-list-bulleted'}
                size={15}
                color={palette.primary}
              />
              <Text style={[styles.toggleBtnText, { color: palette.primary }]}>
                {showAll ? 'Chỉ hiển thị cần xử lý gấp' : 'Xem tất cả sự cố'}
              </Text>
            </Pressable>
            {displayedIncidents.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={[styles.emptyIcon, { backgroundColor: isDark ? palette.surface : '#f0fdf4' }]}>
                  <MaterialIcons name="check-circle-outline" size={40} color={palette.success} />
                </View>
                <Text style={[styles.emptyTitle, { color: palette.text }]}>Không có sự cố cần xử lý gấp</Text>
                <Text style={[styles.emptySubtitle, { color: palette.textMuted }]}>
                  Không có yêu cầu bổ sung vật tư đang chờ xử lý
                </Text>
              </View>
            ) : (
              <>
            <Text style={[styles.listCount, { color: palette.textMuted }]}>
              {displayedIncidents.length} sự cố{!showAll ? ' cần xử lý gấp' : ''}
            </Text>
            {displayedIncidents.map((item, index) => {
              const { incident, podName } = item;
              const incidentId = String(incident.id || index);
              const sv = severityConfig(String(incident.severity || ''), palette);
              const st = statusConfig(String(incident.status || ''));
              const typeLabel = incidentTypeLabel(String(incident.incident_type || ''));
              const detailCount = Array.isArray(incident.details) ? incident.details.length : 0;
              const booking = incident.booking as Record<string, unknown> | null;
              const bookingStatus = booking ? String(booking.status || '').trim() : '';

              return (
                <Pressable
                  key={incidentId}
                  style={({ pressed }) => [
                    styles.card,
                    {
                      backgroundColor: palette.card,
                      borderColor: isDark ? palette.border : '#e8edf5',
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                  onPress={() => handlePress(item)}>

                  {/* Accent bar */}
                  <View style={[styles.accentBar, { backgroundColor: sv.color }]} />

                  <View style={styles.cardInner}>
                    {/* Row 1: type + status */}
                    <View style={styles.topRow}>
                      {typeLabel ? (
                        <View style={[styles.typePill, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
                          <MaterialIcons name="report" size={11} color={palette.textMuted} />
                          <Text style={[styles.typePillText, { color: palette.textMuted }]}>{typeLabel}</Text>
                        </View>
                      ) : null}
                      <View style={{ flex: 1 }} />
                      <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
                        <MaterialIcons name={st.icon} size={12} color={st.color} />
                        <Text style={[styles.statusPillText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    </View>

                    {/* Row 2: Pod + Severity */}
                    <View style={styles.podRow}>
                      <MaterialIcons name="place" size={14} color={sv.color} />
                      <Text style={[styles.podName, { color: palette.text }]} numberOfLines={1}>
                        {podName}
                      </Text>
                      <View style={[styles.severityChip, { backgroundColor: `${sv.color}18`, borderColor: `${sv.color}40` }]}>
                        <MaterialIcons name={sv.icon} size={11} color={sv.color} />
                        <Text style={[styles.severityChipText, { color: sv.color }]}>
                          {severityLabel(String(incident.severity || ''))}
                        </Text>
                      </View>
                    </View>

                    {/* Row 3: Description */}
                    <Text style={[styles.description, { color: palette.text }]} numberOfLines={2}>
                      {String(incident.description || 'Không có mô tả')}
                    </Text>

                    {/* Row 4: Booking info */}
                    {bookingStatus ? (
                      <View style={[styles.bookingRow, { backgroundColor: isDark ? '#0f172a' : '#f8fafc', borderColor: isDark ? palette.border : '#e2e8f0' }]}>
                        <MaterialIcons name="book-online" size={12} color={palette.textMuted} />
                        <View style={[styles.bookingStatusChip, { backgroundColor: bookingStatus.toUpperCase() === 'COMPLETED' ? '#d1fae5' : '#fef3c7' }]}>
                          <Text style={[styles.bookingStatusText, { color: bookingStatus.toUpperCase() === 'COMPLETED' ? '#059669' : '#d97706' }]}>
                            {bookingStatus.toUpperCase() === 'COMPLETED' ? 'Booking: Đã hoàn thành' : bookingStatus.toUpperCase() === 'CANCELLED' ? 'Booking: Đã hủy' : bookingStatus.toUpperCase() === 'ACTIVE' ? 'Booking: Đang diễn ra' : `Booking: ${bookingStatus}`}
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    {/* Divider */}
                    <View style={[styles.divider, { backgroundColor: isDark ? palette.border : '#f1f5f9' }]} />
                    {/* Row 4: Footer */}
                    <View style={styles.footer}>
                      <View style={styles.footerLeft}>
                        {detailCount > 0 ? (
                          <View style={styles.footerChip}>
                            <MaterialIcons name="list-alt" size={12} color={palette.textMuted} />
                            <Text style={[styles.footerChipText, { color: palette.textMuted }]}>
                              {detailCount} hạng mục
                            </Text>
                          </View>
                        ) : null}
                        <View style={styles.footerChip}>
                          <MaterialIcons name="access-time" size={12} color={palette.textMuted} />
                          <Text style={[styles.footerChipText, { color: palette.textMuted }]}>
                            {formatDateTime(String(incident.created_at || ''))}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.arrowBtn, { backgroundColor: isDark ? palette.surface : '#f8fafc' }]}>
                        <MaterialIcons name="arrow-forward-ios" size={12} color={palette.primary} />
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacingX._15,
    paddingTop: spacingY._12,
    paddingBottom: spacingY._25,
    gap: spacingY._12,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 220, gap: spacingY._7 },
  loadingText: { fontSize: 13, fontFamily: Fonts.sans, marginTop: spacingY._5 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacingY._25, gap: spacingY._7 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: spacingY._5 },
  emptyTitle: { fontSize: 16, fontWeight: '700', fontFamily: Fonts.sans },
  emptySubtitle: { fontSize: 13, fontFamily: Fonts.sans, textAlign: 'center', maxWidth: 260, lineHeight: 18 },
  emptyText: { fontSize: 15, fontFamily: Fonts.sans, textAlign: 'center' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: spacingX._7, borderWidth: 1, borderRadius: radius._10, padding: spacingX._12 },
  errorText: { fontSize: 13, fontFamily: Fonts.sans, fontWeight: '600', flex: 1 },
  listCount: { fontSize: 12, fontFamily: Fonts.sans, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: spacingX._5 },

  card: {
    borderRadius: radius._17,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  accentBar: { width: 4, borderRadius: 2 },
  cardInner: { flex: 1, padding: spacingX._15, gap: spacingY._7 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacingX._7 },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: spacingX._7, paddingVertical: 3,
    borderRadius: radius._6,
  },
  typePillText: { fontSize: 10, fontFamily: Fonts.sans, fontWeight: '600' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: spacingX._7, paddingVertical: 3,
    borderRadius: radius._6,
  },
  statusPillText: { fontSize: 11, fontFamily: Fonts.sans, fontWeight: '700' },

  podRow: { flexDirection: 'row', alignItems: 'center', gap: spacingX._5 },
  podName: { fontSize: 15, fontWeight: '700', fontFamily: Fonts.sans, flex: 1 },
  severityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: spacingX._7, paddingVertical: 3,
    borderRadius: radius._6, borderWidth: 1,
  },
  severityChipText: { fontSize: 10, fontFamily: Fonts.sans, fontWeight: '700' },

  description: { fontSize: 13, fontFamily: Fonts.sans, lineHeight: 19, color: '#374151' },

  divider: { height: 1, marginVertical: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacingX._10, flex: 1, flexWrap: 'wrap' },
  footerChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  footerChipText: { fontSize: 11, fontFamily: Fonts.sans },
  arrowBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._7,
    borderWidth: 1,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._7,
    alignSelf: 'flex-start',
  },
  toggleBtnText: { fontSize: 13, fontFamily: Fonts.sans, fontWeight: '600' },
  bookingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    borderRadius: radius._10, borderWidth: 1,
    paddingHorizontal: spacingX._10, paddingVertical: 6,
  },
  bookingStatusChip: { borderRadius: radius._6, paddingHorizontal: 7, paddingVertical: 2 },
  bookingStatusText: { fontSize: 11, fontFamily: Fonts.sans, fontWeight: '700' },
});
