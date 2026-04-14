import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { getMyCleaningTasks } from '@/services/cleaner-dashboard.service';
import {
    bulkCheckoutInventory,
    getCleanerDailyCheckoutLogs,
    getInventoryEstimate,
} from '@/services/inventory.service';
import type {
    CheckoutDraftItem,
    CleanerDailyCheckoutResponse,
    DailyCheckoutLogEntry,
    InventoryEstimateResponse,
    InventorySuggestedStock,
} from '@/types/inventory';
import { getErrorMessage } from '@/utils/validation';

interface SuppliesTabProps {
  token: string;
  userId?: string | null;
  isDark: boolean;
  palette: typeof Colors.light;
}

function todayISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Unique warehouses extracted from all suggested_stocks in an estimate */
function extractWarehouses(estimate: InventoryEstimateResponse | null) {
  const seen = new Set<string>();
  const warehouses: Array<{ id: string; name: string }> = [];

  if (!estimate) return warehouses;

  for (const item of estimate.items) {
    for (const stock of item.suggested_stocks) {
      const wId = stock.warehouse_id ?? '';
      if (wId && !seen.has(wId)) {
        seen.add(wId);
        warehouses.push({ id: wId, name: stock.warehouse_name || wId });
      }
    }
  }

  return warehouses;
}

/** Build draft items from estimate, picking best stock for selected warehouse */
function buildDraftItems(
  estimate: InventoryEstimateResponse | null,
  warehouseId: string | null,
): CheckoutDraftItem[] {
  if (!estimate) return [];

  return estimate.items
    .map((item) => {
      let candidates: InventorySuggestedStock[];
      if (warehouseId) {
        candidates = item.suggested_stocks.filter((s) => s.warehouse_id === warehouseId);
      } else {
        candidates = [...item.suggested_stocks];
      }

      // Pick stock with highest available quantity
      const selectedStock =
        candidates.reduce<InventorySuggestedStock | null>((best, s) => {
          if (!best) return s;
          return s.quantity_available > best.quantity_available ? s : best;
        }, null) ?? null;

      const available = selectedStock?.quantity_available ?? 0;
      const checkoutQuantity = Math.min(item.required_quantity, available);

      return {
        item_id: item.item_id,
        item_name: item.item_name || item.item_id,
        required_quantity: item.required_quantity,
        available_quantity: available,
        shortage_quantity: Math.max(0, item.required_quantity - available),
        selectedStock,
        checkoutQuantity: Math.max(0, checkoutQuantity),
      } satisfies CheckoutDraftItem;
    })
    .filter((d) => d.required_quantity > 0);
}

interface ItemRowProps {
  item: CheckoutDraftItem;
  onChange: (itemId: string, qty: number) => void;
  palette: typeof Colors.light;
}

function ItemRow({ item, onChange, palette }: ItemRowProps) {
  const [inputText, setInputText] = useState(String(item.checkoutQuantity));

  // Sync when parent resets draft
  useEffect(() => {
    setInputText(String(item.checkoutQuantity));
  }, [item.checkoutQuantity]);

  const hasSufficientStock = item.available_quantity >= item.required_quantity;
  const hasNoStock = item.available_quantity === 0;

  function handleChangeText(text: string) {
    setInputText(text);
    const parsed = parseInt(text, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      const clamped = Math.min(parsed, item.available_quantity);
      onChange(item.item_id, clamped);
    }
  }

  function handleBlur() {
    const parsed = parseInt(inputText, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      const fallback = Math.max(0, item.checkoutQuantity);
      setInputText(String(fallback));
      onChange(item.item_id, fallback);
    } else {
      const clamped = Math.min(parsed, item.available_quantity);
      setInputText(String(clamped));
      onChange(item.item_id, clamped);
    }
  }

  function step(delta: number) {
    const next = Math.max(0, Math.min(item.checkoutQuantity + delta, item.available_quantity));
    setInputText(String(next));
    onChange(item.item_id, next);
  }

  const stockStatusColor = hasNoStock
    ? palette.error
    : hasSufficientStock
      ? palette.success
      : palette.warning;

  const stockLabel = hasNoStock
    ? 'Hết hàng'
    : hasSufficientStock
      ? 'Đủ hàng'
      : `Thiếu ${item.shortage_quantity}`;

  return (
    <View style={[styles.itemCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={styles.itemHeader}>
        <Text style={[styles.itemName, { color: palette.text }]} numberOfLines={2}>
          {item.item_name}
        </Text>
        <View style={[styles.stockBadge, { backgroundColor: stockStatusColor + '22' }]}>
          <Text style={[styles.stockBadgeText, { color: stockStatusColor }]}>{stockLabel}</Text>
        </View>
      </View>

      <View style={styles.itemStats}>
        <View style={styles.statCol}>
          <Text style={[styles.statLabel, { color: palette.textMuted }]}>Cần lấy</Text>
          <Text style={[styles.statValue, { color: palette.text }]}>{item.required_quantity}</Text>
        </View>
        <View style={styles.statCol}>
          <Text style={[styles.statLabel, { color: palette.textMuted }]}>Tồn kho</Text>
          <Text style={[styles.statValue, { color: palette.text }]}>{item.available_quantity}</Text>
        </View>
        {item.selectedStock?.warehouse_name ? (
          <View style={[styles.statCol, { flexShrink: 1 }]}>
            <Text style={[styles.statLabel, { color: palette.textMuted }]}>Kho</Text>
            <Text
              style={[styles.statValue, { color: palette.primary }]}
              numberOfLines={1}
              ellipsizeMode="tail">
              {item.selectedStock.warehouse_name}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.qtyRow}>
        <Text style={[styles.qtyLabel, { color: palette.textMuted }]}>Số lượng xuất:</Text>
        <View style={[styles.stepperWrap, { borderColor: palette.border }]}>
          <Pressable
            onPress={() => step(-1)}
            disabled={item.checkoutQuantity <= 0}
            style={({ pressed }) => [
              styles.stepBtn,
              { backgroundColor: pressed ? palette.primaryBg : 'transparent' },
            ]}>
            <Text style={[styles.stepBtnText, { color: item.checkoutQuantity <= 0 ? palette.textMuted : palette.primary }]}>
              −
            </Text>
          </Pressable>
          <TextInput
            style={[styles.qtyInput, { color: palette.text, borderColor: palette.border }]}
            keyboardType="number-pad"
            value={inputText}
            onChangeText={handleChangeText}
            onBlur={handleBlur}
            maxLength={4}
          />
          <Pressable
            onPress={() => step(1)}
            disabled={item.checkoutQuantity >= item.available_quantity}
            style={({ pressed }) => [
              styles.stepBtn,
              { backgroundColor: pressed ? palette.primaryBg : 'transparent' },
            ]}>
            <Text
              style={[
                styles.stepBtnText,
                {
                  color:
                    item.checkoutQuantity >= item.available_quantity
                      ? palette.textMuted
                      : palette.primary,
                },
              ]}>
              +
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── DailyLogRow ─────────────────────────────────────────────────────────────

interface DailyLogRowProps {
  log: DailyCheckoutLogEntry;
  palette: typeof Colors.light;
}

function DailyLogRow({ log, palette }: DailyLogRowProps) {
  function formatTime(iso?: string | null) {
    if (!iso) return '--:--';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  return (
    <View style={[styles.logRow, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={styles.logInfo}>
        <Text style={[styles.logItemName, { color: palette.text }]} numberOfLines={1}>
          {log.item_name || 'Vật tư không rõ'}
        </Text>
        {log.warehouse_name ? (
          <Text style={[styles.logWarehouse, { color: palette.textMuted }]} numberOfLines={1}>
            {log.warehouse_name}
          </Text>
        ) : null}
        <Text style={[styles.logTime, { color: palette.textMuted }]}>{formatTime(log.created_at)}</Text>
      </View>
      <View style={[styles.logQtyBadge, { backgroundColor: palette.primaryBg }]}>
        <Text style={[styles.logQtyText, { color: palette.primary }]}>×{log.quantity}</Text>
      </View>
    </View>
  );
}

// ─── CheckoutModal ────────────────────────────────────────────────────────────

interface CheckoutModalProps {
  visible: boolean;
  token: string;
  userId: string;
  today: string;
  palette: typeof Colors.light;
  onClose: () => void;
  onSuccess: () => void;
}

function CheckoutModal({ visible, token, userId, today, palette, onClose, onSuccess }: CheckoutModalProps) {
  const [estimate, setEstimate] = useState<InventoryEstimateResponse | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [draftItems, setDraftItems] = useState<CheckoutDraftItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const firstTaskIdRef = useRef<string | null>(null);

  const warehouses = useMemo(() => extractWarehouses(estimate), [estimate]);

  const loadEstimate = useCallback(
    async (warehouseId?: string | null) => {
      setLoading(true);
      setError(null);
      setSuccessCount(null);
      try {
        const [est, tasks] = await Promise.all([
          getInventoryEstimate(token, userId, {
            date: today,
            include_done: true,
            warehouse_id: warehouseId ?? undefined,
          }),
          getMyCleaningTasks(token).catch(
            () => [] as import('@/types/cleaner-dashboard').CleaningTask[],
          ),
        ]);

        setEstimate(est);

        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(today);
        todayEnd.setHours(23, 59, 59, 999);

        const todayTasks = (Array.isArray(tasks) ? tasks : []).filter((t) => {
          const raw = t.estimated_start_time ?? t.start_time ?? t.due_at ?? '';
          if (!raw) return false;
          const ts = new Date(raw).getTime();
          return ts >= todayStart.getTime() && ts <= todayEnd.getTime();
        });

        const firstTask = todayTasks[0] ?? null;
        firstTaskIdRef.current = String(firstTask?.id ?? firstTask?._id ?? '').trim() || null;

        setDraftItems(buildDraftItems(est, warehouseId ?? null));
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [token, userId, today],
  );

  // Reset and load each time modal opens
  useEffect(() => {
    if (visible) {
      setSelectedWarehouseId(null);
      setSuccessCount(null);
      setError(null);
      loadEstimate(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleSelectWarehouse(warehouseId: string) {
    const next = selectedWarehouseId === warehouseId ? null : warehouseId;
    setSelectedWarehouseId(next);
    loadEstimate(next);
  }

  function handleQtyChange(itemId: string, qty: number) {
    setDraftItems((prev) =>
      prev.map((d) => (d.item_id === itemId ? { ...d, checkoutQuantity: qty } : d)),
    );
  }

  async function handleConfirm() {
    const submittable = draftItems.filter((d) => d.checkoutQuantity > 0 && d.selectedStock);
    if (submittable.length === 0) {
      Alert.alert('Thông báo', 'Không có vật tư nào cần xuất kho.');
      return;
    }
    const cleaningTaskId = firstTaskIdRef.current;
    if (!cleaningTaskId) {
      Alert.alert(
        'Không tìm thấy nhiệm vụ',
        'Bạn không có nhiệm vụ dọn phòng nào trong ngày hôm nay để liên kết với phiếu xuất kho.',
      );
      return;
    }
    Alert.alert(
      'Xác nhận xuất kho',
      `Bạn sẽ xuất ${submittable.length} loại vật tư. Tiếp tục?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xác nhận',
          onPress: async () => {
            setSubmitting(true);
            setError(null);
            try {
              const result = await bulkCheckoutInventory(token, {
                logs: submittable.map((d) => ({
                  inventory_stock_id: d.selectedStock!.inventory_stock_id,
                  quantity: d.checkoutQuantity,
                  action_type: 'CHECKOUT',
                  cleaning_task_id: cleaningTaskId,
                })),
              });
              setSuccessCount(result.count);
              onSuccess();
              await loadEstimate(selectedWarehouseId);
            } catch (err) {
              setError(getErrorMessage(err));
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  }

  const allZero = draftItems.every((d) => d.checkoutQuantity === 0);
  const totalCheckout = draftItems.reduce((sum, d) => sum + d.checkoutQuantity, 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalRoot, { backgroundColor: palette.background }]}>
        {/* Modal header */}
        <View style={[styles.modalHeader, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
          <Text style={[styles.modalTitle, { color: palette.text }]}>Lấy đồ cho hôm nay</Text>
          <Pressable onPress={onClose} style={styles.modalCloseBtn} hitSlop={12}>
            <Text style={[styles.modalCloseTxt, { color: palette.textMuted }]}>✕</Text>
          </Pressable>
        </View>

        {loading && !estimate ? (
          <View style={[styles.centered, { backgroundColor: palette.background }]}>
            <ActivityIndicator color={palette.primary} size="large" />
            <Text style={[styles.loadingText, { color: palette.textMuted }]}>Đang tải nhu cầu vật tư...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => loadEstimate(selectedWarehouseId)}
                tintColor={palette.primary}
                colors={[palette.primary]}
              />
            }>
            {/* Summary banner */}
            {estimate && (
              <View style={[styles.summaryCard, { backgroundColor: palette.primaryBg, borderColor: palette.primary + '44' }]}>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryNum, { color: palette.primary }]}>
                      {estimate.summary.total_required_quantity}
                    </Text>
                    <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>Cần lấy</Text>
                  </View>
                  <View style={[styles.summaryDivider, { backgroundColor: palette.border }]} />
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryNum, { color: palette.success }]}>
                      {estimate.summary.total_available_quantity}
                    </Text>
                    <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>Tồn kho</Text>
                  </View>
                  <View style={[styles.summaryDivider, { backgroundColor: palette.border }]} />
                  <View style={styles.summaryItem}>
                    <Text
                      style={[
                        styles.summaryNum,
                        {
                          color:
                            estimate.summary.total_shortage_quantity > 0
                              ? palette.error
                              : palette.success,
                        },
                      ]}>
                      {estimate.summary.total_shortage_quantity}
                    </Text>
                    <Text style={[styles.summaryLabel, { color: palette.textMuted }]}>Thiếu</Text>
                  </View>
                </View>
                <Text style={[styles.summaryMeta, { color: palette.textMuted }]}>
                  {estimate.task_count} nhiệm vụ · {estimate.pod_count} pod cần dọn · {today}
                </Text>
              </View>
            )}

            {/* Warehouse selector */}
            {warehouses.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>Chọn kho lấy hàng</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.warehouseRow}>
                  {warehouses.map((wh) => {
                    const active = selectedWarehouseId === wh.id;
                    return (
                      <Pressable
                        key={wh.id}
                        onPress={() => handleSelectWarehouse(wh.id)}
                        style={[
                          styles.warehouseChip,
                          {
                            backgroundColor: active ? palette.primary : palette.card,
                            borderColor: active ? palette.primary : palette.border,
                          },
                        ]}>
                        <Text style={[styles.warehouseChipText, { color: active ? palette.white : palette.text }]}>
                          {wh.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {selectedWarehouseId && (
                  <Pressable onPress={() => handleSelectWarehouse(selectedWarehouseId)} style={styles.clearWarehouse}>
                    <Text style={[styles.clearWarehouseText, { color: palette.textMuted }]}>Bỏ chọn kho</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Items list */}
            {draftItems.length === 0 && !loading ? (
              <View style={[styles.emptyBox, { backgroundColor: palette.card, borderColor: palette.border }]}>
                <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                  {estimate?.task_count === 0
                    ? 'Bạn không có nhiệm vụ nào trong ngày hôm nay.'
                    : 'Không cần bổ sung vật tư nào.'}
                </Text>
              </View>
            ) : (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>Vật tư cần lấy</Text>
                {draftItems.map((item) => (
                  <ItemRow key={item.item_id} item={item} onChange={handleQtyChange} palette={palette} />
                ))}
              </View>
            )}

            {/* Error inline */}
            {error ? (
              <View style={[styles.inlineError, { backgroundColor: palette.error + '18', borderColor: palette.error + '44' }]}>
                <Text style={[styles.inlineErrorText, { color: palette.error }]}>{error}</Text>
              </View>
            ) : null}

            {/* Success banner */}
            {successCount !== null ? (
              <View style={[styles.successBanner, { backgroundColor: palette.success + '18', borderColor: palette.success + '44' }]}>
                <Text style={[styles.successText, { color: palette.success }]}>
                  ✓ Đã xuất {successCount} loại vật tư thành công!
                </Text>
              </View>
            ) : null}

            <View style={{ height: spacingY._20 }} />
          </ScrollView>
        )}

        {/* Confirm bar */}
        {draftItems.length > 0 && (
          <View style={[styles.confirmBar, { backgroundColor: palette.card, borderTopColor: palette.border }]}>
            <View style={styles.confirmMeta}>
              <Text style={[styles.confirmMetaLabel, { color: palette.textMuted }]}>Tổng xuất:</Text>
              <Text style={[styles.confirmMetaValue, { color: palette.text }]}>{totalCheckout} đơn vị</Text>
            </View>
            <Pressable
              onPress={handleConfirm}
              disabled={submitting || allZero || loading}
              style={({ pressed }) => [
                styles.confirmBtn,
                {
                  backgroundColor:
                    submitting || allZero || loading
                      ? palette.neutral300
                      : pressed
                        ? palette.primaryDark
                        : palette.primary,
                },
              ]}>
              {submitting ? (
                <ActivityIndicator color={palette.white} size="small" />
              ) : (
                <Text style={[styles.confirmBtnText, { color: palette.white }]}>Xác nhận xuất kho</Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Main SuppliesTab ─────────────────────────────────────────────────────────

export default function SuppliesTab({ token, userId, palette }: SuppliesTabProps) {
  const today = useMemo(() => todayISODate(), []);
  const [modalVisible, setModalVisible] = useState(false);
  const [dailyLogs, setDailyLogs] = useState<CleanerDailyCheckoutResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!token || !userId) return;
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const data = await getCleanerDailyCheckoutLogs(token, userId, today);
      setDailyLogs(data);
    } catch (err) {
      setHistoryError(getErrorMessage(err));
    } finally {
      setLoadingHistory(false);
    }
  }, [token, userId, today]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loadingHistory}
            onRefresh={loadHistory}
            tintColor={palette.primary}
            colors={[palette.primary]}
          />
        }>

        {/* CTA button */}
        <Pressable
          onPress={() => setModalVisible(true)}
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: pressed ? palette.primaryDark : palette.primary },
          ]}>
          <Text style={[styles.ctaBtnText, { color: palette.white }]}>＋  Lấy đồ cho hôm nay</Text>
        </Pressable>

        {/* Daily summary strip */}
        {dailyLogs && (
          <View style={[styles.daySummaryStrip, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={styles.daySumItem}>
              <Text style={[styles.daySumNum, { color: palette.primary }]}>{dailyLogs.total_checkout_count}</Text>
              <Text style={[styles.daySumLabel, { color: palette.textMuted }]}>Lần xuất</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: palette.border }]} />
            <View style={styles.daySumItem}>
              <Text style={[styles.daySumNum, { color: palette.success }]}>{dailyLogs.total_quantity}</Text>
              <Text style={[styles.daySumLabel, { color: palette.textMuted }]}>Tổng đơn vị</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: palette.border }]} />
            <View style={styles.daySumItem}>
              <Text style={[styles.daySumNum, { color: palette.text }]}>{dailyLogs.summary_by_item.length}</Text>
              <Text style={[styles.daySumLabel, { color: palette.textMuted }]}>Loại vật tư</Text>
            </View>
          </View>
        )}



        {/* Loading indicator */}
        {loadingHistory && !dailyLogs && (
          <View style={[styles.centered, { flex: 0, paddingVertical: spacingY._20 }]}>
            <ActivityIndicator color={palette.primary} />
          </View>
        )}

        {/* History error */}
        {historyError && (
          <View style={[styles.inlineError, { backgroundColor: palette.error + '18', borderColor: palette.error + '44' }]}>
            <Text style={[styles.inlineErrorText, { color: palette.error }]}>{historyError}</Text>
          </View>
        )}

        {/* Log list */}
        {dailyLogs && dailyLogs.logs.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              {`Chi tiết lịch sử xuất kho ngày ${today.split('-').reverse().join('/')}`}
            </Text>
            {dailyLogs.logs.map((log, idx) => (
              <DailyLogRow key={log.id ?? idx} log={log} palette={palette} />
            ))}
          </View>
        )}

        {/* Empty history */}
        {!loadingHistory && dailyLogs && dailyLogs.logs.length === 0 && (
          <View style={[styles.emptyBox, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>
              Bạn chưa xuất kho lần nào hôm nay.
            </Text>
          </View>
        )}

        <View style={{ height: spacingY._20 }} />
      </ScrollView>

      {userId ? (
        <CheckoutModal
          visible={modalVisible}
          token={token}
          userId={userId}
          today={today}
          palette={palette}
          onClose={() => setModalVisible(false)}
          onSuccess={loadHistory}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacingX._15,
    paddingTop: spacingY._10,
    paddingBottom: spacingY._20,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacingX._20,
    gap: spacingY._12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  errorText: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._10,
    borderRadius: radius._10,
  },
  retryBtnText: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    fontWeight: '600',
  },
  // Summary
  summaryCard: {
    borderRadius: radius._12,
    borderWidth: 1,
    padding: spacingX._15,
    marginBottom: spacingY._15,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: spacingY._7,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryNum: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  summaryLabel: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 32,
  },
  summaryMeta: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    textAlign: 'center',
  },
  // Section
  section: {
    marginBottom: spacingY._15,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    marginBottom: spacingY._10,
  },
  // Warehouse chips
  warehouseRow: {
    flexDirection: 'row',
    gap: spacingX._7,
    paddingBottom: spacingY._7,
  },
  warehouseChip: {
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._7,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  warehouseChipText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  clearWarehouse: {
    marginTop: spacingY._5,
  },
  clearWarehouseText: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  // Item card
  itemCard: {
    borderRadius: radius._12,
    borderWidth: 1,
    padding: spacingX._12,
    marginBottom: spacingY._10,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacingY._10,
    gap: spacingX._7,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.sans,
    flex: 1,
    flexShrink: 1,
  },
  stockBadge: {
    paddingHorizontal: spacingX._7,
    paddingVertical: 3,
    borderRadius: radius.full,
    flexShrink: 0,
  },
  stockBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  itemStats: {
    flexDirection: 'row',
    gap: spacingX._15,
    marginBottom: spacingY._10,
  },
  statCol: {
    alignItems: 'flex-start',
  },
  statLabel: {
    fontSize: 10,
    fontFamily: Fonts.sans,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  // Quantity stepper
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._10,
  },
  qtyLabel: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    flex: 1,
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius._10,
    overflow: 'hidden',
  },
  stepBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: Fonts.sans,
    lineHeight: 22,
  },
  qtyInput: {
    width: 48,
    height: 36,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  // Empty state
  emptyBox: {
    borderRadius: radius._12,
    borderWidth: 1,
    padding: spacingX._20,
    alignItems: 'center',
    marginBottom: spacingY._15,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    textAlign: 'center',
  },
  // Inline error / success
  inlineError: {
    borderRadius: radius._10,
    borderWidth: 1,
    padding: spacingX._12,
    marginBottom: spacingY._10,
  },
  inlineErrorText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  successBanner: {
    borderRadius: radius._10,
    borderWidth: 1,
    padding: spacingX._12,
    marginBottom: spacingY._10,
  },
  successText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  // Confirm bar
  confirmBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacingX._15,
    paddingVertical: spacingY._10,
    borderTopWidth: 1,
    gap: spacingX._12,
  },
  confirmMeta: {
    flex: 1,
  },
  confirmMetaLabel: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },
  confirmMetaValue: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  confirmBtn: {
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._12,
    borderRadius: radius._10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 140,
    minHeight: 44,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  // CTA button (main screen)
  ctaBtn: {
    borderRadius: radius._12,
    paddingVertical: spacingY._15,
    alignItems: 'center',
    marginBottom: spacingY._15,
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  // Daily summary strip
  daySummaryStrip: {
    flexDirection: 'row',
    borderRadius: radius._12,
    borderWidth: 1,
    padding: spacingX._12,
    marginBottom: spacingY._15,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  daySumItem: {
    alignItems: 'center',
    flex: 1,
  },
  daySumNum: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  daySumLabel: {
    fontSize: 10,
    fontFamily: Fonts.sans,
    marginTop: 2,
  },
  // Summary chips per-item
  summaryChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacingX._7,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._5,
    borderRadius: radius.full,
    borderWidth: 1,
    gap: spacingX._5,
    maxWidth: '48%',
  },
  summaryChipName: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    flex: 1,
    flexShrink: 1,
  },
  summaryChipQty: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    flexShrink: 0,
  },
  // Log row
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius._10,
    borderWidth: 1,
    padding: spacingX._12,
    marginBottom: spacingY._7,
    gap: spacingX._10,
  },
  logInfo: {
    flex: 1,
    gap: 2,
  },
  logItemName: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  logWarehouse: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },
  logTime: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },
  logQtyBadge: {
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._5,
    borderRadius: radius._10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  logQtyText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  // Modal
  modalRoot: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._15,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  modalCloseBtn: {
    padding: spacingX._5,
  },
  modalCloseTxt: {
    fontSize: 18,
  },
});
