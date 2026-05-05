import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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
import {
    getCleanerIncidentDetail,
    resolveReplenishment,
} from '@/services/incident.service';
import { getDailyTakenItemsSummary } from '@/services/inventory.service';
import type { CleanerIncident, IncidentDetailLine } from '@/types/cleaner-dashboard';
import { getErrorMessage } from '@/utils/validation';

interface SupplyItem {
  name: string;
  itemId: string | null;
  type: string;
  required: number;
  held: number;
  unitCost: number | null;
  note: string | null;
}

function buildSupplyItems(
  details: IncidentDetailLine[],
  heldQty: Record<string, number>,
): SupplyItem[] {
  return details.map((detail) => {
    const itemId = String(detail.item_id || '').trim() || null;
    const held = itemId ? Math.max(0, Number(heldQty[itemId] ?? 0)) : 0;
    return {
      name: String(detail.name_snapshot || detail.type || 'Vật tư'),
      itemId,
      type: String(detail.type || 'ITEM'),
      required: Number(detail.quantity ?? 1),
      held,
      unitCost: detail.unit_cost_snapshot != null ? Number(detail.unit_cost_snapshot) : null,
      note: detail.note ? String(detail.note) : null,
    };
  });
}

export default function IncidentRepairScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ incidentId?: string; cleaningTaskId?: string }>();

  const incidentId = String(params.incidentId || '').trim();
  const cleaningTaskId = String(params.cleaningTaskId || '').trim();

  const [incident, setIncident] = useState<CleanerIncident | null>(null);
  const [supplyItems, setSupplyItems] = useState<SupplyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token || !incidentId) return;
    setLoading(true);
    setError(null);
    try {
      const [found, inventorySummary] = await Promise.all([
        getCleanerIncidentDetail(token, incidentId),
        getDailyTakenItemsSummary(token).catch(() => ({ cleaners: [] })),
      ]);

      setIncident(found);

      // Build held quantity map from inventory logs
      const heldQtyMap: Record<string, number> = {};
      for (const cleaner of (inventorySummary as { cleaners?: Array<{ items?: Array<{ item_id?: string; net_quantity?: number }> }> }).cleaners ?? []) {
        for (const item of cleaner.items ?? []) {
          const id = String(item.item_id || '').trim();
          if (!id) continue;
          heldQtyMap[id] = (heldQtyMap[id] ?? 0) + Number(item.net_quantity || 0);
        }
      }

      const details = Array.isArray(found?.details) ? found.details : [];
      setSupplyItems(buildSupplyItems(details, heldQtyMap));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [token, incidentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleComplete = async () => {
    if (!token || !incident) return;
    const targetId = String(incident.id || '').trim();
    if (!targetId) return;

    const items = supplyItems
      .filter((s) => s.type === 'ITEM' && s.itemId)
      .map((s) => ({ item_id: s.itemId as string, quantity: s.required }));

    if (items.length === 0) {
      Alert.alert('Không có vật tư', 'Sự cố này không có vật tư ITEM nào để xử lý.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await resolveReplenishment(token, targetId, items);

      const itemLines = `${result.items_processed ?? items.length} loại vật tư`;

      const successMessage = (() => {
        const raw = String(result.message || '').toLowerCase();
        if (raw.includes('already') || raw.includes('replenished')) return 'Sự cố này đã được xử lý trước đó.';
        if (raw.includes('not found') || raw.includes('không tìm thấy')) return 'Không tìm thấy sự cố.';
        if (raw.includes('success') || raw.includes('complete') || raw.includes('done')) return 'Đã xử lý thành công.';
        if (result.message) return result.message;
        return 'Đã xử lý thành công.';
      })();

      Alert.alert(
        'Bổ sung hoàn tất',
        `${successMessage}\n\n${itemLines}`,
        [
          {
            text: 'Xem kết quả',
            onPress: () => {
              router.replace(
                `/incident/result?incidentId=${encodeURIComponent(targetId)}&cleaningTaskId=${encodeURIComponent(cleaningTaskId)}` as never,
              );
            },
          },
        ],
        { cancelable: false },
      );
    } catch (err) {
      Alert.alert('Lỗi', getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

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
        </View>
      </SafeAreaView>
    );
  }

  const shortageItems = supplyItems.filter((s) => s.type === 'ITEM' && s.held < s.required);
  const hasShortage = shortageItems.length > 0;
  const allService = supplyItems.every((s) => s.type !== 'ITEM');

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Description card */}
        {incident?.description ? (
          <View style={[styles.heroCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={[styles.heroAccent, { backgroundColor: palette.primary }]} />
            <View style={styles.heroBody}>
              <View style={styles.heroRow}>
                <MaterialIcons name="build" size={14} color={palette.primary} />
                <Text style={[styles.heroLabel, { color: palette.primary }]}>Mô tả hư hại</Text>
              </View>
              <Text style={[styles.heroDesc, { color: palette.text }]}>{incident.description}</Text>
            </View>
          </View>
        ) : null}

        {/* Supply items */}
        <View style={[styles.section, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={[styles.sectionHeader, { borderBottomColor: palette.border }]}>
            <MaterialIcons name="inventory" size={15} color={palette.primary} />
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              Vật tư / hạng mục xử lý
            </Text>
            {supplyItems.length > 0 ? (
              <View style={[styles.countBadge, { backgroundColor: palette.primary + '18' }]}>
                <Text style={[styles.countText, { color: palette.primary }]}>{supplyItems.length}</Text>
              </View>
            ) : null}
          </View>

          {supplyItems.length === 0 ? (
            <View style={styles.emptyWrap}>
              <MaterialIcons name="info-outline" size={28} color={palette.textMuted} />
              <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                Không có hạng mục cụ thể nào được ghi nhận
              </Text>
            </View>
          ) : (
            supplyItems.map((item, idx) => {
              const isItem = item.type === 'ITEM';
              const sufficient = !isItem || item.held >= item.required;
              const shortage = isItem ? Math.max(0, item.required - item.held) : 0;
              const accentColor = sufficient ? '#10b981' : '#f59e0b';
              const bgColor = sufficient
                ? (palette.background === '#fff' || palette.background === '#ffffff' ? '#f0fdf4' : '#0f2b1f')
                : (palette.background === '#fff' || palette.background === '#ffffff' ? '#fffbeb' : '#1e1407');

              return (
                <View
                  key={`item_${idx}`}
                  style={[
                    styles.itemRow,
                    {
                      borderTopColor: palette.border,
                      backgroundColor: bgColor,
                    },
                    idx === 0 && { borderTopWidth: 0 },
                  ]}>
                  {/* Left accent */}
                  <View style={[styles.itemAccent, { backgroundColor: accentColor }]} />

                  <View style={styles.itemBody}>
                    {/* Top: badge + name */}
                    <View style={styles.itemTop}>
                      <View style={[
                        styles.typeBadge,
                        { backgroundColor: isItem ? '#d1fae5' : '#dbeafe' },
                      ]}>
                        <MaterialIcons
                          name={isItem ? 'widgets' : 'design-services'}
                          size={10}
                          color={isItem ? '#059669' : '#2563eb'}
                        />
                        <Text style={[styles.typeBadgeText, { color: isItem ? '#059669' : '#2563eb' }]}>
                          {isItem ? 'Vật tư' : 'Dịch vụ'}
                        </Text>
                      </View>
                      <Text style={[styles.itemName, { color: palette.text }]} numberOfLines={2}>
                        {item.name}
                      </Text>
                    </View>

                    {/* Quantity row */}
                    <View style={styles.qtyRow}>
                      <View style={styles.qtyBlock}>
                        <Text style={[styles.qtyLabel, { color: palette.textMuted }]}>Yêu cầu</Text>
                        <Text style={[styles.qtyValue, { color: palette.text }]}>{item.required}</Text>
                      </View>
                      {isItem ? (
                        <>
                          <MaterialIcons name="arrow-forward" size={14} color={palette.textMuted} />
                          <View style={styles.qtyBlock}>
                            <Text style={[styles.qtyLabel, { color: palette.textMuted }]}>Đang giữ</Text>
                            <Text style={[styles.qtyValue, { color: sufficient ? '#10b981' : '#f59e0b' }]}>
                              {item.held}
                            </Text>
                          </View>
                          {shortage > 0 ? (
                            <>
                              <MaterialIcons name="arrow-forward" size={14} color="#ef4444" />
                              <View style={styles.qtyBlock}>
                                <Text style={[styles.qtyLabel, { color: '#ef4444' }]}>Thiếu</Text>
                                <Text style={[styles.qtyValue, { color: '#ef4444' }]}>{shortage}</Text>
                              </View>
                            </>
                          ) : null}
                        </>
                      ) : null}
                    </View>

                    {/* Note */}
                    {item.note ? (
                      <View style={styles.noteRow}>
                        <MaterialIcons name="notes" size={12} color={palette.textMuted} />
                        <Text style={[styles.noteText, { color: palette.textMuted }]}>{item.note}</Text>
                      </View>
                    ) : null}

                    {/* Shortage warning inline */}
                    {shortage > 0 ? (
                      <View style={styles.shortageRow}>
                        <MaterialIcons name="warning-amber" size={12} color="#f59e0b" />
                        <Text style={styles.shortageText}>
                          Cần lấy thêm {shortage} từ kho trước khi xử lý
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.shortageRow}>
                        <MaterialIcons name="check-circle" size={12} color="#10b981" />
                        <Text style={[styles.shortageText, { color: '#10b981' }]}>
                          {isItem ? 'Đủ vật tư' : 'Đã ghi nhận'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Shortage summary */}
        {hasShortage ? (
          <View style={[styles.warningCard, { backgroundColor: '#fffbeb', borderColor: '#fcd34d' }]}>
            <View style={styles.warningHeader}>
              <MaterialIcons name="warning" size={16} color="#d97706" />
              <Text style={styles.warningTitle}>Chưa đủ vật tư ({shortageItems.length} hạng mục)</Text>
            </View>
            {shortageItems.map((s, i) => (
              <Text key={i} style={styles.warningItem}>
                • {s.name}: cần {s.required}, đang giữ {s.held}
              </Text>
            ))}
            <Text style={styles.warningNote}>
              Bạn vẫn có thể xác nhận hoàn thành nếu đã xử lý bằng cách khác.
            </Text>
          </View>
        ) : supplyItems.length > 0 && !allService ? (
          <View style={[styles.okCard, { backgroundColor: '#f0fdf4', borderColor: '#6ee7b7' }]}>
            <MaterialIcons name="check-circle" size={16} color="#059669" />
            <Text style={styles.okText}>Đã đủ vật tư, sẵn sàng xử lý</Text>
          </View>
        ) : null}

      </ScrollView>

      {/* CTA */}
      <View style={[styles.bottomBar, { backgroundColor: palette.background, borderTopColor: palette.border, paddingBottom: Math.max(insets.bottom, spacingY._12) }]}>
        <Pressable
          style={({ pressed }) => [
            styles.completeBtn,
            { backgroundColor: '#059669', opacity: pressed || submitting ? 0.8 : 1 },
          ]}
          disabled={submitting}
          onPress={handleComplete}>
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <MaterialIcons name="check-circle" size={20} color="#fff" />
              <Text style={styles.completeBtnText}>Đã xử lý xong</Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: spacingY._7 },
  scrollContent: {
    paddingHorizontal: spacingX._15,
    paddingTop: spacingY._12,
    paddingBottom: 110,
    gap: spacingY._12,
  },

  heroCard: {
    borderRadius: radius._17,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  heroAccent: { width: 4 },
  heroBody: { flex: 1, padding: spacingX._12, gap: 6 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroLabel: { fontSize: 11, fontFamily: Fonts.sans, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  heroDesc: { fontSize: 14, fontFamily: Fonts.sans, lineHeight: 20 },

  section: {
    borderRadius: radius._17,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._7,
    paddingHorizontal: spacingX._15,
    paddingVertical: spacingY._10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', fontFamily: Fonts.sans, flex: 1 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countText: { fontSize: 12, fontWeight: '700', fontFamily: Fonts.sans },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', padding: spacingX._20, gap: spacingY._7 },
  emptyText: { fontSize: 13, fontFamily: Fonts.sans, textAlign: 'center' },

  itemRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  itemAccent: { width: 3 },
  itemBody: { flex: 1, padding: spacingX._12, gap: spacingY._7 },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacingX._7, flexWrap: 'wrap' },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  typeBadgeText: { fontSize: 10, fontWeight: '700', fontFamily: Fonts.sans },
  itemName: { fontSize: 14, fontFamily: Fonts.sans, fontWeight: '700', flex: 1 },

  qtyRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacingX._10, flexWrap: 'wrap',
  },
  qtyBlock: { alignItems: 'center', minWidth: 40 },
  qtyLabel: { fontSize: 10, fontFamily: Fonts.sans, fontWeight: '500' },
  qtyValue: { fontSize: 16, fontFamily: Fonts.sans, fontWeight: '800' },

  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  noteText: { fontSize: 12, fontFamily: Fonts.sans, fontStyle: 'italic', flex: 1 },

  shortageRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shortageText: { fontSize: 11, fontFamily: Fonts.sans, fontWeight: '600', color: '#f59e0b' },

  warningCard: {
    borderRadius: radius._12,
    borderWidth: 1,
    padding: spacingX._12,
    gap: 4,
  },
  warningHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  warningTitle: { fontSize: 13, fontWeight: '700', fontFamily: Fonts.sans, color: '#d97706' },
  warningItem: { fontSize: 12, fontFamily: Fonts.sans, color: '#92400e', paddingLeft: 4 },
  warningNote: { fontSize: 11, fontFamily: Fonts.sans, color: '#b45309', marginTop: 4, fontStyle: 'italic' },

  okCard: {
    borderRadius: radius._12,
    borderWidth: 1,
    padding: spacingX._12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._7,
  },
  okText: { fontSize: 13, fontFamily: Fonts.sans, fontWeight: '600', color: '#059669' },

  bottomBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacingX._15,
    paddingVertical: spacingY._12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingX._7,
    borderRadius: radius._17,
    paddingVertical: 15,
  },
  completeBtnText: { fontSize: 16, fontWeight: '800', fontFamily: Fonts.sans, color: '#fff' },
});
