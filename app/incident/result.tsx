import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getReplenishmentRequestsByCleaningTask } from '@/services/incident.service';
import type { CleanerCheckinReportData, CleanerIncident } from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

function formatDateTime(dateText?: string | null) {
  if (!dateText) return '-';
  const parsed = new Date(dateText as string);
  return Number.isNaN(parsed.getTime())
    ? String(dateText)
    : parsed.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function formatVnd(value?: number | null) {
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('vi-VN').format(Number(value)) + ' đ';
}

function severityLabel(s?: string) {
  const v = String(s || '').toUpperCase();
  if (v === 'LOW') return 'Thấp';
  if (v === 'MEDIUM') return 'Trung bình';
  if (v === 'HIGH') return 'Cao';
  if (v === 'CRITICAL') return 'Nghiêm trọng';
  return s || '-';
}

function InfoRow({ label, value, palette }: { label: string; value: string; palette: typeof Colors.light }) {
  if (!value || value === '-') return null;
  return (
    <View style={[styles.infoRow, { borderBottomColor: palette.border }]}>
      <Text style={[styles.infoLabel, { color: palette.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

export default function IncidentResultScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ incidentId?: string; cleaningTaskId?: string }>();

  const incidentId = String(params.incidentId || '').trim();
  const cleaningTaskId = String(params.cleaningTaskId || '').trim();

  const [data, setData] = useState<CleanerCheckinReportData | null>(null);
  const [incident, setIncident] = useState<CleanerIncident | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !cleaningTaskId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getReplenishmentRequestsByCleaningTask(token, cleaningTaskId);
      setData(result);
      const found = result.incidents.find(
        (inc) => String(inc.id || '') === incidentId,
      );
      setIncident(found ?? (result.incidents[0] ?? null));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [token, cleaningTaskId, incidentId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!token) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={{ color: palette.error }}>Bạn chưa đăng nhập</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={palette.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={{ color: palette.error, textAlign: 'center', paddingHorizontal: 24 }}>{error}</Text>
          <Pressable
            style={[styles.backBtn, { backgroundColor: palette.primary, marginTop: spacingY._15 }]}
            onPress={() => {
              if (cleaningTaskId) {
                router.replace(`/task/${encodeURIComponent(cleaningTaskId)}` as never);
              } else {
                router.replace('/(tabs)' as never);
              }
            }}>
            <Text style={styles.backBtnText}>Quay lại nhiệm vụ</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const cleaningTask = data?.cleaning_task as Record<string, unknown> | null;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Success header */}
        <View style={[styles.successHeader, { backgroundColor: `${palette.success}12`, borderColor: palette.success }]}>
          <MaterialIcons name="check-circle" size={48} color={palette.success} />
          <Text style={[styles.successTitle, { color: palette.success }]}>Đã xử lý xong!</Text>
          <Text style={[styles.successSub, { color: palette.textMuted }]}>
            Hư hại đã được ghi nhận là hoàn thành
          </Text>
        </View>

        {/* Incident summary */}
        {incident ? (
          <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>Thông tin hư hại</Text>

            <InfoRow
              label="Mô tả"
              value={String(incident.description || '-')}
              palette={palette}
            />
            <InfoRow
              label="Mức độ"
              value={severityLabel(String(incident.severity || ''))}
              palette={palette}
            />
            <InfoRow
              label="Trạng thái"
              value="Đã hoàn thành"
              palette={palette}
            />
            <InfoRow
              label="Loại sự cố"
              value={(() => {
                const t = String(incident.incident_type || '').toUpperCase();
                if (t === 'DAMAGE_REPORT') return 'Hư hại';
                if (t === 'REPLENISHMENT_REQUEST') return 'Bổ sung vật tư';
                if (t === 'OPERATIONAL') return 'Vận hành';
                return incident.incident_type ? String(incident.incident_type) : '-';
              })()}
              palette={palette}
            />
            <InfoRow
              label="Thời gian tạo"
              value={formatDateTime(String(incident.created_at || ''))}
              palette={palette}
            />
            <InfoRow
              label="Cập nhật"
              value={formatDateTime(String(incident.updated_at || ''))}
              palette={palette}
            />
          </View>
        ) : null}

        {/* Resolution note */}
        {incident?.resolution_note ? (
          <View style={[styles.noteCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#15803D', marginBottom: 4 }}>
              Ghi chú xử lý
            </Text>
            <Text style={{ fontSize: 14, color: '#166534', lineHeight: 20 }}>
              {String(incident.resolution_note)}
            </Text>
          </View>
        ) : null}

        {/* Items handled */}
        {Array.isArray(incident?.details) && incident!.details.length > 0 ? (
          <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>
              Vật tư đã xử lý ({incident!.details.length})
            </Text>
            {incident!.details.map((detail, idx) => (
              <View key={`r_detail_${idx}`} style={[styles.detailItem, { borderTopColor: palette.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[styles.detailName, { color: palette.text }]}>
                    {String(detail.name_snapshot || detail.type || 'Hạng mục')}
                  </Text>
                  <Text style={[styles.detailQty, { color: palette.textMuted }]}>
                    x{detail.quantity ?? 1}
                  </Text>
                </View>

              </View>
            ))}
          </View>
        ) : null}

        {/* Photos */}
        {Array.isArray(incident?.photo_urls) && incident!.photo_urls.length > 0 ? (
          <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.cardTitle, { color: palette.text }]}>Hình ảnh</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {incident!.photo_urls.map((url, idx) => (
                <Image
                  key={`r_photo_${idx}`}
                  source={{ uri: String(url) }}
                  style={{ width: 80, height: 80, borderRadius: 8 }}
                  resizeMode="cover"
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* Cleaning task info */}

      </ScrollView>

      {/* Footer button */}
      <View style={[styles.bottomBar, { backgroundColor: palette.background, borderTopColor: palette.border, paddingBottom: Math.max(insets.bottom, spacingX._15) }]}>
        <Pressable
          style={[styles.backBtn, { backgroundColor: palette.primary }]}
          onPress={() => {
            if (cleaningTaskId) {
              router.replace(`/task/${encodeURIComponent(cleaningTaskId)}` as never);
            } else {
              router.replace('/(tabs)' as never);
            }
          }}>
          <Text style={styles.backBtnText}>Quay lại nhiệm vụ</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  scrollContent: {
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._15,
    paddingBottom: 100,
    gap: spacingY._15,
  },
  successHeader: {
    borderRadius: radius._17,
    borderWidth: 1.5,
    padding: spacingX._20,
    alignItems: 'center',
    gap: spacingY._7,
  },
  successTitle: { fontSize: 22, fontWeight: '800', fontFamily: Fonts.sans },
  successSub: { fontSize: 14, fontFamily: Fonts.sans, textAlign: 'center' },
  card: {
    borderRadius: radius._12,
    borderWidth: 1,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    paddingHorizontal: spacingX._12,
    paddingTop: spacingY._10,
    paddingBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  noteCard: {
    borderRadius: radius._12,
    borderWidth: 1,
    padding: spacingX._12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacingX._7,
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    fontWeight: '600',
    width: 110,
    flexShrink: 0,
  },
  infoValue: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    flex: 1,
    textAlign: 'right',
  },
  detailItem: {
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._7,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailName: { fontSize: 13, fontFamily: Fonts.sans, fontWeight: '600', flex: 1 },
  detailQty: { fontSize: 12, fontFamily: Fonts.sans },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacingX._15,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    borderRadius: radius._12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    color: '#fff',
  },
});
