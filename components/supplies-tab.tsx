import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
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
import { getMyCleaningTasks, getMyWorkRosters } from '@/services/cleaner-dashboard.service';
import {
    bulkCreateInventoryActivityLogs,
    getAllInventoryStocks,
    getCleanerDailyActivityLogs,
    getDailyTakenItemsSummary,
    getInventoryEstimate,
    getWarehouses,
} from '@/services/inventory.service';
import type { StaffWorkRoster } from '@/types/cleaner-dashboard';
import type {
    CheckoutDraftItem,
    CleanerDailyActivityLogResponse,
    DailyActivityLogEntry,
    DailyActivityLogSummaryItem,
    DailyTakenItemsSummaryResponse,
    FreeCheckoutDraftItem,
    InventoryEstimateResponse,
    InventoryStockItem,
    InventorySuggestedStock,
    ReturnDraftItem,
    Warehouse,
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

function localDayRangeFromISO(isoDate: string) {
  const [y, m, d] = String(isoDate || '')
    .split('-')
    .map((v) => Number(v));

  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0),
    end: new Date(y, m - 1, d, 23, 59, 59, 999),
  };
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

/** Build return draft items by grouping today's CHECKOUT logs by inventory_stock_id only.
 * Multiple logs for the same stock (different tasks or multiple checkouts) are merged
 * into a single row so each physical item appears exactly once. */
function buildReturnDraftItems(
  checkoutLogs: DailyActivityLogEntry[],
  returnLogs: DailyActivityLogEntry[],
): ReturnDraftItem[] {
  const map = new Map<string, ReturnDraftItem>();

  for (const log of checkoutLogs) {
    const qty = Number(log.quantity || 0);
    if (qty <= 0) continue;
    // Key only on inventory_stock_id so the same physical item is always merged
    const key = String(log.inventory_stock_id || '').trim();
    if (!key) continue;
    if (map.has(key)) {
      map.get(key)!.checked_out += qty;
    } else {
      map.set(key, {
        inventory_stock_id: log.inventory_stock_id,
        item_id: log.item_id ?? null,
        cleaning_task_id: log.cleaning_task_id ?? null,
        item_name: log.item_name ?? null,
        warehouse_name: log.warehouse_name ?? null,
        checked_out: qty,
        already_returned: 0,
        held_quantity: null,
        returnQuantity: 0,
      });
    }
  }

  for (const log of returnLogs) {
    const qty = Number(log.quantity || 0);
    const returnedQty = Math.abs(qty);
    if (returnedQty <= 0) continue;
    const key = String(log.inventory_stock_id || '').trim();
    if (map.has(key)) {
      map.get(key)!.already_returned += returnedQty;
    }
  }

  for (const item of map.values()) {
    // Default to 0 — cleaner must explicitly choose how much to return
    item.returnQuantity = 0;
  }

  return [...map.values()].filter((item) => (item.checked_out - item.already_returned) > 0);
}

interface HeldItemSummary {
  item_id: string;
  item_name: string | null;
  checkout_quantity: number;
  return_quantity: number;
  net_quantity: number;
}

function buildHeldItems(
  summary: DailyTakenItemsSummaryResponse | null,
  fallbackSummaryByItem: DailyActivityLogSummaryItem[] = [],
): HeldItemSummary[] {
  if (!summary || !Array.isArray(summary.cleaners)) {
    return (fallbackSummaryByItem ?? [])
      .map((item) => {
        const checkoutQty = Number(item.checkout_quantity || 0);
        const returnQty = Number(item.return_quantity || 0);
        return {
          item_id: String(item.item_id || ''),
          item_name: item.item_name ?? null,
          checkout_quantity: checkoutQty,
          return_quantity: returnQty,
          net_quantity: checkoutQty - returnQty,
        } satisfies HeldItemSummary;
      })
      .filter((item) => item.item_id && item.net_quantity > 0)
      .sort((a, b) => String(a.item_name || a.item_id).localeCompare(String(b.item_name || b.item_id)));
  }

  const byItem = new Map<string, HeldItemSummary>();
  for (const cleaner of summary.cleaners) {
    for (const item of cleaner.items ?? []) {
      const itemId = String(item.item_id || '').trim();
      if (!itemId) continue;

      const checkoutQty = Number(item.checkout_quantity || 0);
      const returnQty = Number(item.return_quantity || 0);
      const netQty = Number(item.net_quantity || 0);

      if (!byItem.has(itemId)) {
        byItem.set(itemId, {
          item_id: itemId,
          item_name: item.item_name ?? null,
          checkout_quantity: 0,
          return_quantity: 0,
          net_quantity: 0,
        });
      }

      const existing = byItem.get(itemId)!;
      existing.checkout_quantity += checkoutQty;
      existing.return_quantity += returnQty;
      existing.net_quantity += netQty;
      if (!existing.item_name && item.item_name) existing.item_name = item.item_name;
    }
  }

  return [...byItem.values()]
    .filter((item) => item.net_quantity > 0)
    .sort((a, b) => String(a.item_name || a.item_id).localeCompare(String(b.item_name || b.item_id)));
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

// ─── FreeItemRow ──────────────────────────────────────────────────────────────

interface FreeItemRowProps {
  item: FreeCheckoutDraftItem;
  onChange: (stockId: string, qty: number) => void;
  palette: typeof Colors.light;
}

function FreeItemRow({ item, onChange, palette }: FreeItemRowProps) {
  const [inputText, setInputText] = useState(String(item.checkoutQuantity));

  useEffect(() => {
    setInputText(String(item.checkoutQuantity));
  }, [item.checkoutQuantity]);

  function handleChangeText(text: string) {
    setInputText(text);
    const parsed = parseInt(text, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      onChange(item.inventory_stock_id, Math.min(parsed, item.available_quantity));
    }
  }

  function handleBlur() {
    const parsed = parseInt(inputText, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      setInputText(String(item.checkoutQuantity));
    } else {
      const clamped = Math.min(parsed, item.available_quantity);
      setInputText(String(clamped));
      onChange(item.inventory_stock_id, clamped);
    }
  }

  function step(delta: number) {
    const next = Math.max(0, Math.min(item.checkoutQuantity + delta, item.available_quantity));
    setInputText(String(next));
    onChange(item.inventory_stock_id, next);
  }

  const noStock = item.available_quantity === 0;

  return (
    <View style={[styles.itemCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={styles.itemHeader}>
        <Text style={[styles.itemName, { color: palette.text }]} numberOfLines={2}>
          {item.item_name || 'Vật tư không rõ'}
        </Text>
        <View style={[styles.stockBadge, { backgroundColor: noStock ? palette.error + '22' : palette.success + '22' }]}>
          <Text style={[styles.stockBadgeText, { color: noStock ? palette.error : palette.success }]}>
            {noStock ? 'Hết hàng' : `Tồn: ${item.available_quantity}`}
          </Text>
        </View>
      </View>

      {item.warehouse_name ? (
        <Text style={[styles.statLabel, { color: palette.textMuted, marginBottom: spacingY._7 }]} numberOfLines={1}>
          Kho: {item.warehouse_name}
        </Text>
      ) : null}

      <View style={styles.qtyRow}>
        <Text style={[styles.qtyLabel, { color: palette.textMuted }]}>Số lượng lấy:</Text>
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
                { color: item.checkoutQuantity >= item.available_quantity ? palette.textMuted : palette.primary },
              ]}>
              +
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── MarqueeText ──────────────────────────────────────────────────────────────

function MarqueeText({
  text,
  textStyle,
  color,
  flex,
}: {
  text: string;
  textStyle: object;
  color: string;
  flex: number;
}) {
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [scrollWidth, setScrollWidth] = useState(0);
  const animX = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    animRef.current?.stop();
    animX.setValue(0);
    if (!shouldAnimate || scrollWidth <= 0) return;

    const duration = (scrollWidth / 25) * 1000; // 25 px/sec

    animRef.current = Animated.loop(
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(animX, { toValue: -scrollWidth, duration, useNativeDriver: true }),
        Animated.timing(animX, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(400),
      ]),
    );
    animRef.current.start();
    return () => { animRef.current?.stop(); };
  }, [shouldAnimate, scrollWidth, animX]);

  return (
    <View style={{ flex, overflow: 'hidden' }}>
      {/* Ghost: fills container width, wraps freely → if lines > 1 the text overflows → animate */}
      <Text
        style={[textStyle, { position: 'absolute', opacity: 0, left: 0, right: 0 }]}
        onTextLayout={(e) => {
          const lines = e.nativeEvent.lines;
          const overflows = lines.length > 1;
          setShouldAnimate(overflows);
          if (overflows) {
            setScrollWidth(Math.ceil(lines.reduce((sum, l) => sum + l.width, 0)));
          }
        }}>
        {text}
      </Text>
      {/* Row wrapper prevents text from wrapping — full content renders beyond clip boundary */}
      <View style={{ flexDirection: 'row' }}>
        <Animated.Text
          style={[
            textStyle,
            {
              color,
              // Explicit width stops text from wrapping once scrollWidth is known
              ...(shouldAnimate && scrollWidth > 0 ? { width: scrollWidth + 8 } : {}),
              transform: [{ translateX: animX }],
            },
          ]}
          numberOfLines={shouldAnimate ? undefined : 1}>
          {text}
        </Animated.Text>
      </View>
    </View>
  );
}

// ─── Log grouping helpers ─────────────────────────────────────────────────────

function formatLogTime(iso?: string | null) {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function logEpochSeconds(iso?: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
}

function actionMeta(actionType: string, palette: typeof Colors.light) {
  const t = String(actionType || 'CHECKOUT').toUpperCase();
  if (t === 'RETURN') return { label: 'Trả kho', icon: '↩', color: palette.warning };
  if (t === 'CONSUMED') return { label: 'Tiêu thụ', icon: '−', color: palette.error };
  if (t === 'WASTE')  return { label: 'Hỏng/Bỏ', icon: '✕', color: palette.error };
  return { label: 'Xuất kho', icon: '↑', color: palette.primary };
}

interface LogGroupEntry {
  /** Representative display time (HH:MM) of first log in group */
  time: string;
  actionType: string;
  /** Epoch-second of the first log in this group (used for ≤1s window) */
  anchorSeconds: number;
  logs: DailyActivityLogEntry[];
}

/** Group logs with same action_type whose timestamps are within 1 second of the group anchor */
function groupLogs(logs: DailyActivityLogEntry[]): LogGroupEntry[] {
  const groups: LogGroupEntry[] = [];
  for (const log of logs) {
    const actionType = String(log.action_type || 'CHECKOUT').toUpperCase();
    const logSec = logEpochSeconds(log.created_at);
    const last = groups[groups.length - 1];
    if (
      last &&
      last.actionType === actionType &&
      Math.abs(logSec - last.anchorSeconds) <= 1
    ) {
      last.logs.push(log);
    } else {
      groups.push({
        time: formatLogTime(log.created_at),
        actionType,
        anchorSeconds: logSec,
        logs: [log],
      });
    }
  }
  return groups;
}

// ─── LogGroupCard ─────────────────────────────────────────────────────────────

interface LogGroupCardProps {
  group: LogGroupEntry;
  palette: typeof Colors.light;
}

function LogGroupCard({ group, palette }: LogGroupCardProps) {
  const meta = actionMeta(group.actionType, palette);
  const displayQuantity = (qty: number) => (group.actionType === 'RETURN' ? Math.abs(qty) : qty);
  const totalQty = group.logs.reduce((s, l) => s + displayQuantity(Number(l.quantity || 0)), 0);

  return (
    <View style={[styles.logGroupCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
      {/* Group header */}
      <View style={[styles.logGroupHeader, { borderBottomColor: palette.border }]}>
        <View style={[styles.logGroupBadge, { backgroundColor: meta.color + '22' }]}>
          <Text style={[styles.logGroupBadgeText, { color: meta.color }]}>
            {meta.icon}  {meta.label}
          </Text>
        </View>
        <Text style={[styles.logGroupTime, { color: palette.textMuted }]}>{group.time}</Text>
      </View>

      {/* Items */}
      {group.logs.map((log, idx) => (
        <View
          key={log.id ?? idx}
          style={[
            styles.logGroupItem,
            idx < group.logs.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.border },
          ]}>
          <MarqueeText
            text={log.item_name || 'Vật tư không rõ'}
            textStyle={styles.logGroupItemName}
            color={palette.text}
            flex={4}
          />
          <MarqueeText
            text={log.warehouse_name || '—'}
            textStyle={styles.logGroupItemSub}
            color={palette.textMuted}
            flex={4}
          />
          <View style={styles.logGroupItemQtyWrap}>
            <Text style={[styles.logGroupItemQty, { color: meta.color }]}>×{displayQuantity(Number(log.quantity || 0))}</Text>
          </View>
        </View>
      ))}

      {/* Group footer */}
      <View style={[styles.logGroupFooter, { borderTopColor: palette.border }]}>
        <View style={[styles.logGroupTotalBadge, { backgroundColor: meta.color + '18', borderColor: meta.color + '44' }]}>
          <Text style={[styles.logGroupTotalText, { color: meta.color }]}>Tổng: ×{totalQty}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── ReturnItemRow ────────────────────────────────────────────────────────────

interface ReturnItemRowProps {
  item: ReturnDraftItem;
  rowKey: string;
  onChange: (key: string, qty: number) => void;
  palette: typeof Colors.light;
}

function ReturnItemRow({ item, rowKey, onChange, palette }: ReturnItemRowProps) {
  // Prefer held_quantity from getDailyTakenItemsSummary (accounts for CONSUMED/WASTE);
  // fall back to log-based calculation only when summary is unavailable.
  const maxReturnable =
    item.held_quantity !== null
      ? Math.max(0, item.held_quantity)
      : Math.max(0, item.checked_out - item.already_returned);
  const [inputText, setInputText] = useState(String(item.returnQuantity));

  useEffect(() => {
    setInputText(String(item.returnQuantity));
  }, [item.returnQuantity]);

  function handleChangeText(text: string) {
    setInputText(text);
    const parsed = parseInt(text, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      onChange(rowKey, Math.min(parsed, maxReturnable));
    }
  }

  function handleBlur() {
    const parsed = parseInt(inputText, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      setInputText(String(item.returnQuantity));
    } else {
      const clamped = Math.min(parsed, maxReturnable);
      setInputText(String(clamped));
      onChange(rowKey, clamped);
    }
  }

  function step(delta: number) {
    const next = Math.max(0, Math.min(item.returnQuantity + delta, maxReturnable));
    setInputText(String(next));
    onChange(rowKey, next);
  }

  return (
    <View style={[styles.itemCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={styles.itemHeader}>
        <Text style={[styles.itemName, { color: palette.text }]} numberOfLines={2}>
          {item.item_name || 'Vật tư không rõ'}
        </Text>

      </View>

      {item.warehouse_name ? (
        <Text style={[styles.statLabel, { color: palette.textMuted, marginBottom: spacingY._7 }]} numberOfLines={1}>
          Kho: {item.warehouse_name}
        </Text>
      ) : null}

      <View style={styles.qtyRow}>
        <Text style={[styles.qtyLabel, { color: palette.textMuted }]}>Số lượng trả:</Text>
        <View style={[styles.stepperWrap, { borderColor: palette.border }]}>
          <Pressable
            onPress={() => step(-1)}
            disabled={item.returnQuantity <= 0}
            style={({ pressed }) => [
              styles.stepBtn,
              { backgroundColor: pressed ? palette.warning + '22' : 'transparent' },
            ]}>
            <Text style={[styles.stepBtnText, { color: item.returnQuantity <= 0 ? palette.textMuted : palette.warning }]}>
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
            disabled={item.returnQuantity >= maxReturnable}
            style={({ pressed }) => [
              styles.stepBtn,
              { backgroundColor: pressed ? palette.warning + '22' : 'transparent' },
            ]}>
            <Text style={[
              styles.stepBtnText,
              { color: item.returnQuantity >= maxReturnable ? palette.textMuted : palette.warning },
            ]}>
              +
            </Text>
          </Pressable>
        </View>
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
  const firstTaskIdRef = useRef<string | null>(null);

  const warehouses = useMemo(() => extractWarehouses(estimate), [estimate]);

  const loadEstimate = useCallback(
    async (warehouseId?: string | null) => {
      setLoading(true);
      setError(null);
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

        const { start: todayStart, end: todayEnd } = localDayRangeFromISO(today);
        const assignmentSet = new Set((est.shift_assignment_ids ?? []).map((id) => String(id)));

        const allTasks = Array.isArray(tasks) ? tasks : [];
        const assignmentMatched = allTasks.filter((t) => {
          const shiftId = String(t.shift_assignment_id ?? '').trim();
          if (!shiftId) return false;
          if (assignmentSet.size === 0) return true;
          return assignmentSet.has(shiftId);
        });

        const dateMatched = assignmentMatched.filter((t) => {
          const raw = t.estimated_start_time ?? t.start_time ?? t.due_at ?? '';
          if (!raw) return false;
          const ts = new Date(raw).getTime();
          return ts >= todayStart.getTime() && ts <= todayEnd.getTime();
        });

        const firstTask = dateMatched[0] ?? assignmentMatched[0] ?? allTasks[0] ?? null;
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
              const result = await bulkCreateInventoryActivityLogs(token, {
                staff_id: userId,
                logs: submittable.map((d) => ({
                  inventory_stock_id: d.selectedStock!.inventory_stock_id,
                  quantity: d.checkoutQuantity,
                  action_type: 'CHECKOUT' as const,
                  cleaning_task_id: cleaningTaskId ?? undefined,
                })),
              });
              onSuccess();
              Alert.alert(
                'Xuất kho thành công',
                `Đã xuất ${result.count} loại vật tư thành công!`,
                [{ text: 'OK', onPress: onClose }],
              );
            } catch (err) {
              Alert.alert('Xuất kho thất bại', getErrorMessage(err));
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

// ─── FreeCheckoutModal ───────────────────────────────────────────────────────

interface FreeCheckoutModalProps {
  visible: boolean;
  token: string;
  userId: string;
  palette: typeof Colors.light;
  onClose: () => void;
  onSuccess: () => void;
}

function extractWarehousesFromStocks(stocks: InventoryStockItem[]) {
  const seen = new Set<string>();
  const warehouses: Array<{ id: string; name: string }> = [];
  for (const s of stocks) {
    const id = s.warehouse_id ?? '';
    if (id && !seen.has(id)) {
      seen.add(id);
      warehouses.push({ id, name: s.warehouse_name || id });
    }
  }
  return warehouses;
}

function buildFreeDraft(
  stocks: InventoryStockItem[],
  warehouseId: string | null,
): FreeCheckoutDraftItem[] {
  const filtered = warehouseId ? stocks.filter((s) => s.warehouse_id === warehouseId) : stocks;
  // Skip orphan stocks whose item has been deleted (no item_name resolved)
  return filtered
    .filter((s) => s.item_name != null && s.item_name.trim() !== '')
    .map((s) => ({
      inventory_stock_id: s.inventory_stock_id ?? s._id ?? '',
      item_id: s.item_id,
      item_name: s.item_name ?? null,
      warehouse_id: s.warehouse_id ?? null,
      warehouse_name: s.warehouse_name ?? null,
      available_quantity: s.quantity_available,
      checkoutQuantity: 0,
    }));
}

function FreeCheckoutModal({ visible, token, userId, palette, onClose, onSuccess }: FreeCheckoutModalProps) {
  const [allStocks, setAllStocks] = useState<InventoryStockItem[]>([]);
  const [scopeWarehouseIds, setScopeWarehouseIds] = useState<string[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const [lockedWarehouseId, setLockedWarehouseId] = useState<string | null>(null);
  const [draftItems, setDraftItems] = useState<FreeCheckoutDraftItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restrict display to warehouses scoped to the cleaner's active shift.
  // Falls back to all stocks when the estimate endpoint is unavailable (e.g. BE bug).
  const scopedStocks = useMemo(() => {
    if (scopeWarehouseIds.length === 0) return allStocks;
    return allStocks.filter(
      (s) => s.warehouse_id != null && scopeWarehouseIds.includes(s.warehouse_id),
    );
  }, [allStocks, scopeWarehouseIds]);

  const warehouses = useMemo(() => extractWarehousesFromStocks(scopedStocks), [scopedStocks]);

  const loadStocks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = todayISODate();
      // Step 1: get stocks and roster in parallel first
      const [stocks, rosters] = await Promise.all([
        getAllInventoryStocks(token),
        getMyWorkRosters(token).catch((): StaffWorkRoster[] => []),
      ]);

      // Step 2: resolve cleaner's active location from today's roster
      const activeRoster = rosters.find((r) => {
        if (r.is_active === false) return false;
        if (r.is_temporary) {
          return r.work_date ? String(r.work_date).slice(0, 10) === today : false;
        }
        return true;
      });
      // Prefer nested location.id (populated by API), fall back to flat location_id field
      const locationId =
        String(activeRoster?.location?.id ?? activeRoster?.location_id ?? '').trim() || null;

      // Step 3: fetch warehouses filtered by this location (via query param, not client filter)
      const locationWarehouses = await getWarehouses(token, { locationId }).catch(
        (): Warehouse[] => [],
      );
      const scopeIds = locationWarehouses.map((w) => w.id).filter(Boolean);

      setAllStocks(stocks);
      setScopeWarehouseIds(scopeIds);

      // Auto-select the first warehouse at the cleaner's location
      const defaultWarehouseId = locationWarehouses[0]?.id ?? null;
      setSelectedWarehouseId(defaultWarehouseId);
      setLockedWarehouseId(defaultWarehouseId);

      // Build draft: scoped to location warehouses if found, else show all
      const baseStocks =
        scopeIds.length > 0
          ? stocks.filter((s) => s.warehouse_id != null && scopeIds.includes(s.warehouse_id))
          : stocks;
      setDraftItems(buildFreeDraft(baseStocks, defaultWarehouseId));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (visible) {
      setError(null);
      loadStocks();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleSelectWarehouse(warehouseId: string) {
    const next = selectedWarehouseId === warehouseId ? null : warehouseId;
    setSelectedWarehouseId(next);
    setDraftItems(buildFreeDraft(scopedStocks, next));
  }

  function handleQtyChange(stockId: string, qty: number) {
    setDraftItems((prev) =>
      prev.map((d) => (d.inventory_stock_id === stockId ? { ...d, checkoutQuantity: qty } : d)),
    );
  }

  async function handleConfirm() {
    const submittable = draftItems.filter((d) => d.checkoutQuantity > 0);
    if (submittable.length === 0) {
      Alert.alert('Thông báo', 'Không có vật tư nào được chọn.');
      return;
    }
    Alert.alert(
      'Xác nhận lấy vật tư',
      `Bạn sẽ xuất ${submittable.length} loại vật tư. Tiếp tục?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xác nhận',
          onPress: async () => {
            setSubmitting(true);
            setError(null);
            try {
              const result = await bulkCreateInventoryActivityLogs(token, {
                staff_id: userId,
                logs: submittable.map((d) => ({
                  inventory_stock_id: d.inventory_stock_id,
                  quantity: d.checkoutQuantity,
                  action_type: 'CHECKOUT' as const,
                })),
              });
              onSuccess();
              Alert.alert(
                'Lấy vật tư thành công',
                `Đã xuất ${result.count} loại vật tư thành công!`,
                [{ text: 'OK', onPress: onClose }],
              );
            } catch (err) {
              Alert.alert('Lấy vật tư thất bại', getErrorMessage(err));
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
          <Text style={[styles.modalTitle, { color: palette.text }]}>Lấy vật tư</Text>
          <Pressable onPress={onClose} style={styles.modalCloseBtn} hitSlop={12}>
            <Text style={[styles.modalCloseTxt, { color: palette.textMuted }]}>✕</Text>
          </Pressable>
        </View>

        {loading && allStocks.length === 0 ? (
          <View style={[styles.centered, { backgroundColor: palette.background }]}>
            <ActivityIndicator color={palette.success} size="large" />
            <Text style={[styles.loadingText, { color: palette.textMuted }]}>Đang tải danh sách vật tư...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={loadStocks}
                tintColor={palette.success}
                colors={[palette.success]}
              />
            }>

            {/* Warehouse filter chips — only show the locked default warehouse */}
            {lockedWarehouseId && warehouses.some((wh) => wh.id === lockedWarehouseId) && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>Kho</Text>
                <View style={{ alignItems: 'center' }}>
                  {warehouses.filter((wh) => wh.id === lockedWarehouseId).map((wh) => (
                    <View
                      key={wh.id}
                      style={[styles.warehouseChip, {
                        backgroundColor: palette.success,
                        borderColor: palette.success,
                      }]}>
                      <Text style={[styles.warehouseChipText, { color: palette.white }]}>
                        {wh.name}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Items list */}
            {draftItems.length === 0 && !loading ? (
              <View style={[styles.emptyBox, { backgroundColor: palette.card, borderColor: palette.border }]}>
                <Text style={[styles.emptyText, { color: palette.textMuted }]}>Không có vật tư nào trong kho.</Text>
              </View>
            ) : (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>Tất cả vật tư</Text>
                {draftItems.map((item) => (
                  <FreeItemRow
                    key={item.inventory_stock_id}
                    item={item}
                    onChange={handleQtyChange}
                    palette={palette}
                  />
                ))}
              </View>
            )}

            {/* Error inline */}
            {error ? (
              <View style={[styles.inlineError, { backgroundColor: palette.error + '18', borderColor: palette.error + '44' }]}>
                <Text style={[styles.inlineErrorText, { color: palette.error }]}>{error}</Text>
              </View>
            ) : null}

            <View style={{ height: spacingY._20 }} />
          </ScrollView>
        )}

        {/* Confirm bar */}
        {draftItems.length > 0 && (
          <View style={[styles.confirmBar, { backgroundColor: palette.card, borderTopColor: palette.border }]}>
            <View style={styles.confirmMeta}>
              <Text style={[styles.confirmMetaLabel, { color: palette.textMuted }]}>Tổng lấy:</Text>
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
                        ? palette.success + 'cc'
                        : palette.success,
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

// ─── ReturnModal ──────────────────────────────────────────────────────────────

interface ReturnModalProps {
  visible: boolean;
  token: string;
  userId: string;
  today: string;
  palette: typeof Colors.light;
  onClose: () => void;
  onSuccess: () => void;
}

function ReturnModal({ visible, token, userId, today, palette, onClose, onSuccess }: ReturnModalProps) {
  const [draftItems, setDraftItems] = useState<ReturnDraftItem[]>([]);
  const [heldItems, setHeldItems] = useState<HeldItemSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch raw logs (needed for inventory_stock_id to submit returns)
      // and daily-taken summary (authoritative source for held quantities)
      // in parallel.
      const [data, takenSummary] = await Promise.all([
        getCleanerDailyActivityLogs(token, userId, today),
        getDailyTakenItemsSummary(token, { date: today }).catch(() => null),
      ]);

      const checkoutLogs = (data.logs ?? []).filter(
        (l) => !l.action_type || l.action_type === 'CHECKOUT',
      );
      const returnLogs = (data.logs ?? []).filter((l) => l.action_type === 'RETURN');
      const rawDraft = buildReturnDraftItems(checkoutLogs, returnLogs);

      // Build item_id → net_quantity from takenSummary (accounts for CONSUMED/WASTE)
      const heldByItemId = new Map<string, number>();
      if (takenSummary?.cleaners) {
        for (const cleaner of takenSummary.cleaners) {
          for (const item of cleaner.items ?? []) {
            const id = String(item.item_id || '').trim();
            if (!id) continue;
            heldByItemId.set(id, (heldByItemId.get(id) ?? 0) + Number(item.net_quantity || 0));
          }
        }
      }

      // Patch held_quantity and re-filter: if summary loaded, hide items with net=0
      const patchedDraft = rawDraft
        .map((d) => ({
          ...d,
          held_quantity: d.item_id && heldByItemId.size > 0 ? (heldByItemId.get(d.item_id) ?? 0) : null,
        }))
        .filter((d) =>
          d.held_quantity !== null ? d.held_quantity > 0 : d.checked_out - d.already_returned > 0,
        );

      setDraftItems(patchedDraft);
      setHeldItems(buildHeldItems(takenSummary, data.summary_by_item ?? []));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [token, userId, today]);

  useEffect(() => {
    if (visible) {
      setError(null);
      setHeldItems([]);
      loadLogs();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleQtyChange(key: string, qty: number) {
    setDraftItems((prev) =>
      prev.map((d) => (d.inventory_stock_id === key ? { ...d, returnQuantity: qty } : d)),
    );
  }

  async function handleConfirm() {
    const submittable = draftItems.filter((d) => d.returnQuantity > 0);
    if (submittable.length === 0) {
      Alert.alert('Thông báo', 'Không có vật tư nào cần trả kho.');
      return;
    }
    Alert.alert(
      'Xác nhận trả kho',
      `Bạn sẽ trả lại ${submittable.length} loại vật tư. Tiếp tục?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xác nhận',
          onPress: async () => {
            setSubmitting(true);
            setError(null);
            try {
              const result = await bulkCreateInventoryActivityLogs(token, {
                staff_id: userId,
                logs: submittable.map((d) => ({
                  inventory_stock_id: d.inventory_stock_id,
                  quantity: -Math.abs(d.returnQuantity),
                  action_type: 'RETURN' as const,
                  cleaning_task_id: d.cleaning_task_id ?? undefined,
                })),
              });
              onSuccess();
              Alert.alert(
                'Trả kho thành công',
                `Đã trả lại ${result.count} loại vật tư thành công!`,
                [{ text: 'OK', onPress: onClose }],
              );
            } catch (err) {
              Alert.alert('Trả kho thất bại', getErrorMessage(err));
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  }

  const allZero = draftItems.every((d) => d.returnQuantity === 0);
  const totalReturn = draftItems.reduce((sum, d) => sum + d.returnQuantity, 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalRoot, { backgroundColor: palette.background }]}>
        {/* Modal header */}
        <View style={[styles.modalHeader, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
          <Text style={[styles.modalTitle, { color: palette.text }]}>Trả vật tư hôm nay</Text>
          <Pressable onPress={onClose} style={styles.modalCloseBtn} hitSlop={12}>
            <Text style={[styles.modalCloseTxt, { color: palette.textMuted }]}>✕</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={[styles.centered, { backgroundColor: palette.background }]}>
            <ActivityIndicator color={palette.warning} size="large" />
            <Text style={[styles.loadingText, { color: palette.textMuted }]}>Đang tải lịch sử xuất kho...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={loadLogs}
                tintColor={palette.warning}
                colors={[palette.warning]}
              />
            }>

            <View style={[styles.checkoutBreakdownCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.checkoutBreakdownTitle, { color: palette.primary }]}>Đồ đang giữ</Text>
              {heldItems.length > 0 ? heldItems.map((s) => {
                const net = Number(s.net_quantity || 0);
                const netColor = net <= 0 ? palette.textMuted : palette.primary;
                return (
                  <View key={s.item_id} style={styles.checkoutBreakdownRow}>
                    <Text style={[styles.checkoutBreakdownName, { color: palette.text }]} numberOfLines={1}>
                      {s.item_name || s.item_id}
                    </Text>
                    <View style={[styles.checkoutBreakdownBadge, { backgroundColor: netColor + '18' }]}>
                      <Text style={[styles.checkoutBreakdownQty, { color: netColor }]}>×{net}</Text>
                    </View>
                  </View>
                );
              }) : (
                <Text style={[styles.emptyText, { color: palette.textMuted }]}>Không có món đồ nào đang giữ.</Text>
              )}
            </View>

            {draftItems.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: palette.card, borderColor: palette.border }]}>
                <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                  Không có món đồ nào đang giữ.
                </Text>
              </View>
            ) : (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>Vật tư đang giữ</Text>
                {draftItems.map((item) => {
                  const key = item.inventory_stock_id;
                  return (
                    <ReturnItemRow
                      key={key}
                      item={item}
                      rowKey={key}
                      onChange={handleQtyChange}
                      palette={palette}
                    />
                  );
                })}
              </View>
            )}

            {/* Inline error */}
            {error ? (
              <View style={[styles.inlineError, { backgroundColor: palette.error + '18', borderColor: palette.error + '44' }]}>
                <Text style={[styles.inlineErrorText, { color: palette.error }]}>{error}</Text>
              </View>
            ) : null}

            <View style={{ height: spacingY._20 }} />
          </ScrollView>
        )}

        {/* Confirm bar */}
        {draftItems.length > 0 && (
          <View style={[styles.confirmBar, { backgroundColor: palette.card, borderTopColor: palette.border }]}>
            <View style={styles.confirmMeta}>
              <Text style={[styles.confirmMetaLabel, { color: palette.textMuted }]}>Tổng trả:</Text>
              <Text style={[styles.confirmMetaValue, { color: palette.text }]}>{totalReturn} đơn vị</Text>
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
                        ? palette.warning + 'cc'
                        : palette.warning,
                },
              ]}>
              {submitting ? (
                <ActivityIndicator color={palette.white} size="small" />
              ) : (
                <Text style={[styles.confirmBtnText, { color: palette.white }]}>Xác nhận trả kho</Text>
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
  const [freeCheckoutModalVisible, setFreeCheckoutModalVisible] = useState(false);
  const [returnModalVisible, setReturnModalVisible] = useState(false);
  const [dailyLogs, setDailyLogs] = useState<CleanerDailyActivityLogResponse | null>(null);
  const [dailyTakenSummary, setDailyTakenSummary] = useState<DailyTakenItemsSummaryResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!token || !userId) return;
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const dailyData = await getCleanerDailyActivityLogs(token, userId, today);
      setDailyLogs(dailyData);

      try {
        const takenSummary = await getDailyTakenItemsSummary(token, { date: today });
        setDailyTakenSummary(takenSummary);
      } catch {
        setDailyTakenSummary(null);
      }
    } catch (err) {
      setDailyLogs(null);
      setDailyTakenSummary(null);
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

        {/* CTA buttons */}
        <View style={styles.ctaRow}>
          <Pressable
            onPress={() => setModalVisible(true)}
            style={({ pressed }) => [
              styles.ctaBtn,
              styles.ctaBtnFlex,
              { backgroundColor: pressed ? palette.primaryDark : palette.primary },
            ]}>
            <Text style={[styles.ctaBtnText, { color: palette.white }]}>＋  Lấy đồ hôm nay</Text>
          </Pressable>
        </View>
        <View style={[styles.ctaRow, { marginTop: -spacingY._7 }]}>
          <Pressable
            onPress={() => setFreeCheckoutModalVisible(true)}
            style={({ pressed }) => [
              styles.ctaBtn,
              styles.ctaBtnFlex,
              { backgroundColor: pressed ? palette.success + 'cc' : palette.success },
            ]}>
            <Text style={[styles.ctaBtnText, { color: palette.white }]}>📦  Lấy vật tư</Text>
          </Pressable>
          <Pressable
            onPress={() => setReturnModalVisible(true)}
            style={({ pressed }) => [
              styles.ctaBtn,
              styles.ctaBtnFlex,
              { backgroundColor: pressed ? palette.warning + 'cc' : palette.warning },
            ]}>
            <Text style={[styles.ctaBtnText, { color: palette.white }]}>↩  Trả đồ</Text>
          </Pressable>
        </View>

        {/* Daily summary strip */}
        {(dailyLogs || dailyTakenSummary) && (() => {
          const heldItems = buildHeldItems(dailyTakenSummary, dailyLogs?.summary_by_item ?? []);
          const totalHeld = heldItems.reduce((sum, item) => sum + Number(item.net_quantity || 0), 0);

          return (
            <>
              <View style={[styles.daySummaryStrip, { backgroundColor: palette.card, borderColor: palette.border }]}>
                <View style={styles.daySumItem}>
                  <Text style={[styles.daySumNum, { color: palette.primary }]}>{dailyLogs?.total_log_count ?? 0}</Text>
                  <Text style={[styles.daySumLabel, { color: palette.textMuted }]}>Tổng log</Text>
                </View>
                <View style={[styles.summaryDivider, { backgroundColor: palette.border }]} />
                <View style={styles.daySumItem}>
                  <Text style={[styles.daySumNum, { color: palette.success }]}>{totalHeld}</Text>
                  <Text style={[styles.daySumLabel, { color: palette.textMuted }]}>Đang giữ</Text>
                </View>
              </View>

              <View style={[styles.checkoutBreakdownCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
                <Text style={[styles.checkoutBreakdownTitle, { color: palette.primary }]}>Đồ đang giữ</Text>
                {heldItems.length > 0 ? heldItems.map((s) => {
                  const net = Number(s.net_quantity || 0);
                  const netColor = net <= 0 ? palette.textMuted : palette.primary;
                  return (
                    <View key={s.item_id} style={styles.checkoutBreakdownRow}>
                      <Text style={[styles.checkoutBreakdownName, { color: palette.text }]} numberOfLines={1}>
                        {s.item_name || s.item_id}
                      </Text>
                      <View style={[styles.checkoutBreakdownBadge, { backgroundColor: netColor + '18' }]}>
                        <Text style={[styles.checkoutBreakdownQty, { color: netColor }]}>×{net}</Text>
                      </View>
                    </View>
                  );
                }) : (
                  <Text style={[styles.emptyText, { color: palette.textMuted }]}>Không có món đồ nào đang giữ.</Text>
                )}
              </View>

            </>
          );
        })()}



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
        {(() => {
          const allLogs = dailyLogs?.logs ?? [];

          if (!dailyLogs) return null;

          if (allLogs.length === 0) {
            return !loadingHistory ? (
              <View style={[styles.emptyBox, { backgroundColor: palette.card, borderColor: palette.border }]}>
                <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                  Bạn chưa có hoạt động kho nào hôm nay.
                </Text>
              </View>
            ) : null;
          }

          const groups = groupLogs(allLogs);
          return (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: palette.primary }]}>
                {`Lịch sử kho ngày ${today.split('-').reverse().join('/')}`}
              </Text>
              {groups.map((group, idx) => (
                <LogGroupCard key={`${group.time}-${group.actionType}-${idx}`} group={group} palette={palette} />
              ))}
            </View>
          );
        })()}

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
      {userId ? (
        <ReturnModal
          visible={returnModalVisible}
          token={token}
          userId={userId}
          today={today}
          palette={palette}
          onClose={() => setReturnModalVisible(false)}
          onSuccess={loadHistory}
        />
      ) : null}
      {userId ? (
        <FreeCheckoutModal
          visible={freeCheckoutModalVisible}
          token={token}
          userId={userId}
          palette={palette}
          onClose={() => setFreeCheckoutModalVisible(false)}
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
    textAlign: 'center',
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
  ctaRow: {
    flexDirection: 'row',
    gap: spacingX._10,
    marginBottom: spacingY._15,
  },
  ctaBtn: {
    borderRadius: radius._12,
    paddingVertical: spacingY._15,
    alignItems: 'center',
  },
  ctaBtnFlex: {
    flex: 1,
  },
  ctaBtnText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  // Daily summary strip
  daySummaryStrip: {
    flexDirection: 'row',
    borderRadius: radius._12,
    borderWidth: 1,
    padding: spacingX._12,
    marginBottom: spacingY._10,
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
  // Checkout breakdown card
  checkoutBreakdownCard: {
    borderRadius: radius._12,
    borderWidth: 1,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._10,
    marginBottom: spacingY._15,
  },
  checkoutBreakdownTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    marginBottom: spacingY._7,
    textAlign: 'center',
  },
  checkoutBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacingY._5,
  },
  checkoutBreakdownName: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    flex: 1,
    flexShrink: 1,
    marginRight: spacingX._7,
  },
  checkoutBreakdownBadge: {
    paddingHorizontal: spacingX._7,
    paddingVertical: 2,
    borderRadius: radius.full,
    flexShrink: 0,
  },
  checkoutBreakdownQty: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
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
  // Log group card
  logGroupCard: {
    borderRadius: radius._12,
    borderWidth: 1,
    marginBottom: spacingY._10,
    overflow: 'hidden',
  },
  logGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._7,
    borderBottomWidth: 1,
  },
  logGroupBadge: {
    paddingHorizontal: spacingX._10,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  logGroupBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  logGroupHeaderRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  logGroupTime: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },
  logGroupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._7,
    gap: spacingX._5,
  },
  logGroupItemName: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  logGroupItemSub: {
    fontSize: 11,
    fontFamily: Fonts.sans,
  },
  logGroupItemQtyWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  logGroupItemQty: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  logGroupFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._7,
    borderTopWidth: 1,
  },
  logGroupTotalBadge: {
    paddingHorizontal: spacingX._10,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  logGroupTotalText: {
    fontSize: 12,
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
