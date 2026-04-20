import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
    getMyNotifications,
    getMyUnreadNotificationCount,
    markAllNotificationsAsRead,
    markNotificationAsRead,
} from '@/services/cleaner-dashboard.service';
import { subscribeCleanerRealtimeEvent } from '@/services/cleaner-realtime-bus';
import {
    decrementNotificationBadge,
    setNotificationBadgeCount,
    subscribeNotificationBadge,
} from '@/services/notification-badge-bus';
import type { CleanerNotification } from '@/types/cleaner-dashboard';

function normalizeToken(value?: string | null) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function isInternalCodeText(value: unknown) {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }

  const normalized = normalizeToken(text);
  return /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(normalized);
}

function sanitizeNotificationText(value: unknown, fallback: string) {
  const text = String(value || '').trim();
  if (!text) {
    return fallback;
  }

  if (isInternalCodeText(text)) {
    return fallback;
  }

  return text;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function resolveNotificationType(item: CleanerNotification) {
  const normalizedType = normalizeToken(typeof item.type === 'string' ? item.type : null);
  if (normalizedType) {
    return normalizedType;
  }

  const data = toRecord(item.data);
  const fallbackType = String(data.type || data.notification_type || data.category || '').trim();
  return normalizeToken(fallbackType);
}

function resolveNotificationEventCode(item: CleanerNotification) {
  const normalizedEventCode = normalizeToken(
    typeof item.event_code === 'string' ? item.event_code : null,
  );
  if (normalizedEventCode) {
    return normalizedEventCode;
  }

  const data = toRecord(item.data);
  const fallbackEventCode = String(
    item.event ||
      item.code ||
      data.event_code ||
      data.event ||
      data.code ||
      data.notification_event ||
      '',
  ).trim();

  return normalizeToken(fallbackEventCode);
}

function getTypeVisual(type: unknown, eventCode: unknown, palette: typeof Colors.light) {
  const normalized = normalizeToken(typeof type === 'string' ? type : null);
  const normalizedEventCode = normalizeToken(typeof eventCode === 'string' ? eventCode : null);

  if (normalized === 'SHIFT') {
    return {
      iconName: 'schedule' as const,
      iconColor: '#1d4ed8',
      iconBgColor: 'rgba(37, 99, 235, 0.16)',
      cardBgColor: 'rgba(37, 99, 235, 0.08)',
      cardBorderColor: 'rgba(37, 99, 235, 0.22)',
      unreadBorderColor: 'rgba(37, 99, 235, 0.45)',
    };
  }

  if (normalized === 'CLEANING') {
    if (
      normalizedEventCode === 'CLEANING_TASK_CANCELLED_NO_SHOW' ||
      normalizedEventCode === 'CLEANING_TASK_CANCELLED_BOOKING_CANCELLED' ||
      normalizedEventCode === 'CLEANING_TASK_CANCENLLED_BOOKING_CANCELLED'
    ) {
      return {
        iconName: 'event-busy' as const,
        iconColor: '#334155',
        iconBgColor: 'rgba(100, 116, 139, 0.18)',
        cardBgColor: 'rgba(148, 163, 184, 0.12)',
        cardBorderColor: 'rgba(100, 116, 139, 0.3)',
        unreadBorderColor: 'rgba(51, 65, 85, 0.5)',
      };
    }

    if (normalizedEventCode === 'CLEANING_TASK_ASSIGNED') {
      return {
        iconName: 'assignment-late' as const,
        iconColor: '#0f766e',
        iconBgColor: 'rgba(20, 184, 166, 0.16)',
        cardBgColor: 'rgba(20, 184, 166, 0.08)',
        cardBorderColor: 'rgba(20, 184, 166, 0.22)',
        unreadBorderColor: 'rgba(20, 184, 166, 0.45)',
      };
    }

    if (normalizedEventCode === 'CLEANING_TASK_SLA_REMINDER') {
      return {
        iconName: 'warning-amber' as const,
        iconColor: '#b45309',
        iconBgColor: 'rgba(245, 158, 11, 0.2)',
        cardBgColor: 'rgba(245, 158, 11, 0.1)',
        cardBorderColor: 'rgba(245, 158, 11, 0.28)',
        unreadBorderColor: 'rgba(180, 83, 9, 0.5)',
      };
    }

    return {
      iconName: 'cleaning-services' as const,
      iconColor: '#15803d',
      iconBgColor: 'rgba(22, 163, 74, 0.16)',
      cardBgColor: 'rgba(22, 163, 74, 0.08)',
      cardBorderColor: 'rgba(22, 163, 74, 0.22)',
      unreadBorderColor: 'rgba(22, 163, 74, 0.45)',
    };
  }

  if (normalized === 'INCIDENT') {
    return {
      iconName: 'warning-amber' as const,
      iconColor: '#e11d48',
      iconBgColor: 'rgba(244, 63, 94, 0.16)',
      cardBgColor: 'rgba(244, 63, 94, 0.08)',
      cardBorderColor: 'rgba(244, 63, 94, 0.22)',
      unreadBorderColor: 'rgba(244, 63, 94, 0.45)',
    };
  }

  if (normalized === 'BOOKING') {
    return {
      iconName: 'event-note' as const,
      iconColor: '#b45309',
      iconBgColor: 'rgba(245, 158, 11, 0.18)',
      cardBgColor: 'rgba(245, 158, 11, 0.08)',
      cardBorderColor: 'rgba(245, 158, 11, 0.24)',
      unreadBorderColor: 'rgba(245, 158, 11, 0.5)',
    };
  }

  if (normalized === 'SUPPORT') {
    return {
      iconName: 'support-agent' as const,
      iconColor: '#0369a1',
      iconBgColor: 'rgba(14, 165, 233, 0.16)',
      cardBgColor: 'rgba(14, 165, 233, 0.08)',
      cardBorderColor: 'rgba(14, 165, 233, 0.22)',
      unreadBorderColor: 'rgba(14, 165, 233, 0.45)',
    };
  }

  if (normalized === 'INVENTORY') {
    return {
      iconName: 'inventory-2' as const,
      iconColor: '#6d28d9',
      iconBgColor: 'rgba(124, 58, 237, 0.16)',
      cardBgColor: 'rgba(124, 58, 237, 0.08)',
      cardBorderColor: 'rgba(124, 58, 237, 0.22)',
      unreadBorderColor: 'rgba(124, 58, 237, 0.45)',
    };
  }

  if (normalized === 'SYSTEM') {
    return {
      iconName: 'settings' as const,
      iconColor: palette.textMuted,
      iconBgColor: palette.border,
      cardBgColor: palette.surface,
      cardBorderColor: palette.border,
      unreadBorderColor: palette.primary,
    };
  }

  return {
    iconName: 'notifications-active' as const,
    iconColor: palette.primary,
    iconBgColor: palette.primaryBg,
    cardBgColor: palette.surface,
    cardBorderColor: palette.border,
    unreadBorderColor: palette.primary,
  };
}

function getDeliveryStatusBadge(status: unknown, palette: typeof Colors.light) {
  const normalized = normalizeToken(typeof status === 'string' ? status : null);
  if (!normalized) return null;

  if (normalized === 'SENT') {
    return { label: 'Đã gửi', textColor: palette.success, bgColor: palette.secondaryBg };
  }
  if (normalized === 'PENDING') {
    return { label: 'Đang chờ', textColor: palette.warning, bgColor: 'rgba(245, 158, 11, 0.16)' };
  }
  if (normalized === 'FAILED') {
    return { label: 'Thất bại', textColor: palette.error, bgColor: 'rgba(244, 63, 94, 0.14)' };
  }
  if (normalized === 'SKIPPED_NO_TOKEN') {
    return null;
  }

  return { label: normalized, textColor: palette.textMuted, bgColor: palette.border };
}

function getEventCodeLabel(eventCode: unknown) {
  const code = normalizeToken(typeof eventCode === 'string' ? eventCode : null);

  switch (code) {
    case 'BOOKING_CANCELLED':
      return 'Đặt chỗ đã hủy';
    case 'BOOKING_CHECKIN':
      return 'Đặt chỗ check-in';
    case 'BOOKING_CHECKOUT':
      return 'Đặt chỗ check-out';
    case 'BOOKING_AUTO_CHECKIN':
      return 'Tự động check-in';
    case 'BOOKING_AUTO_CHECKOUT':
      return 'Tự động check-out';
    case 'BOOKING_NO_SHOW':
      return 'Khách vắng mặt';
    case 'BOOKING_REMINDER':
      return 'Nhắc lịch đặt chỗ';
    case 'PAYMENT_SUCCESS':
      return 'Thanh toán thành công';
    case 'PAYMENT_PENDING_REMAINING':
      return 'Còn khoản cần thanh toán';
    case 'PAYMENT_REFUND_SUCCESS':
      return 'Hoàn tiền thành công';
    case 'PROMOTION_BROADCAST':
      return 'Thông báo khuyến mãi';
    case 'SYSTEM_TEST':
      return 'Thông báo hệ thống (test)';
    case 'SYSTEM_GENERAL':
      return 'Thông báo hệ thống';
    case 'IDENTITY_VERIFIED':
      return 'Xác minh danh tính thành công';
    case 'CLEANING_TASK_ASSIGNED':
      return 'Nhiệm vụ vệ sinh mới';
    case 'CLEANING_TASK_SLA_REMINDER':
      return 'Cảnh báo sắp quá hạn SLA';
    case 'CLEANING_TASK_CANCELLED_NO_SHOW':
      return 'Hủy nhiệm vụ do NO_SHOW';
    case 'CLEANING_TASK_CANCELLED_BOOKING_CANCELLED':
      return 'Nhiệm vụ đã hủy do đặt phòng bị hủy';
    // Backward compatibility for backend typo variant.
    case 'CLEANING_TASK_CANCENLLED_BOOKING_CANCELLED':
      return 'Nhiệm vụ đã hủy do đặt phòng bị hủy';
    case 'CLEANING_TASK_STATUS_CHANGED':
      return 'Trạng thái nhiệm vụ đã thay đổi';
    case 'SUPPORT_CLEANING_REQUEST':
      return 'Yêu cầu hỗ trợ vệ sinh';
    case 'SHIFT_ASSIGNED':
      return 'Được phân công ca làm';
    case 'SHIFT_START_REMINDER':
      return 'Nhắc giờ vào ca';
    case 'INVENTORY_CHECKOUT_CONFIRMED':
      return 'Xác nhận xuất kho';
    case 'INCIDENT_REPORTED':
      return 'Báo cáo sự cố thành công';
    case 'INCIDENT_REVIEW_REQUIRED':
      return 'Báo cáo sự cố cần được duyệt';
    case 'INCIDENT_RESOLVED':
      return 'Sự cố đã được xử lý';
    case 'INCIDENT_DISMISSED':
      return 'Báo cáo sự cố đã bị từ chối';
    case 'POD_AUTO_MIGRATION_ALERT':
      return 'Cảnh báo chuyển pod tự động';
    case 'BOOKING_AUTO_MIGRATED':
      return 'Đặt chỗ đã được chuyển tự động';
    case 'SUPPORT_ESCALATED':
      return 'Yêu cầu đã được escalation';
    case 'SUPPORT_ROOM_CHANGED':
      return 'Phòng đã thay đổi';
    case 'ROOM_CHANGE_VACATED':
      return 'Khách đã đổi phòng (dọn pod cũ)';
    default:
      return '';
  }
}

function sortByNewest(items: CleanerNotification[]) {
  return [...items].sort((a, b) => {
    const aTime =
      new Date(String(a.createdAt || a.sent_at || a.updatedAt || 0)).getTime() ||
      0;
    const bTime =
      new Date(String(b.createdAt || b.sent_at || b.updatedAt || 0)).getTime() ||
      0;
    return bTime - aTime;
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Không xác định';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Không xác định';

  return date.toLocaleString('vi-VN', {
    hour12: false,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}


function resolveNotificationTaskId(item: CleanerNotification) {
  const data = (item.data || {}) as Record<string, unknown>;

  const candidate =
    item.cleaning_task_id ||
    item.task_id ||
    item.taskId ||
    item.entity_id ||
    data.cleaning_task_id ||
    data.task_id ||
    data.taskId ||
    data.entity_id;

  return String(candidate || '').trim();
}

function isCleaningNotification(item: CleanerNotification) {
  const type = resolveNotificationType(item);
  const event = resolveNotificationEventCode(item);

  return (
    type === 'CLEANING' ||
    event.startsWith('CLEANING_TASK_') ||
    event === 'SUPPORT_CLEANING_REQUEST' ||
    event === 'ROOM_CHANGE_VACATED' ||
    event === 'SUPPORT_ROOM_CHANGED'
  );
}

function isShiftNotification(item: CleanerNotification) {
  const type = resolveNotificationType(item);
  const event = resolveNotificationEventCode(item);

  return type === 'SHIFT' || event.startsWith('SHIFT_');
}

function isInventoryNotification(item: CleanerNotification) {
  const type = resolveNotificationType(item);
  const event = resolveNotificationEventCode(item);

  return type === 'INVENTORY' || event.startsWith('INVENTORY_');
}

export default function HistoryScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { user, token } = useAuth();

  const [items, setItems] = useState<CleanerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const canLoad = Boolean(token);

  useEffect(() => {
    const unsubscribe = subscribeNotificationBadge((count) => {
      setUnreadCount(count);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const loadHistoryData = useCallback(
    async (options?: { isRefresh?: boolean; silent?: boolean }) => {
      if (!token) return;

      const isRefresh = Boolean(options?.isRefresh);
      const isSilent = Boolean(options?.silent);
      if (isSilent) {
        // no loading indicator
      } else if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const [listResult, unread] = await Promise.all([
          getMyNotifications(token, { page: 1, limit: 50 }),
          getMyUnreadNotificationCount(token),
        ]);

        setItems(sortByNewest(listResult.data));
        setNotificationBadgeCount(unread);
      } finally {
        if (isRefresh) {
          setIsRefreshing(false);
        } else if (!isSilent) {
          setIsLoading(false);
        }
      }
    },
    [token],
  );

  useEffect(() => {
    if (!canLoad) {
      setItems([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    loadHistoryData().catch(() => {
      setIsLoading(false);
    });
  }, [canLoad, loadHistoryData]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const unsubscribe = subscribeCleanerRealtimeEvent(() => {
      loadHistoryData({ silent: true }).catch(() => null);
    });

    return () => {
      unsubscribe();
    };
  }, [loadHistoryData, token]);

  const handleMarkAsRead = useCallback(
    async (item: CleanerNotification) => {
      if (!token || item.is_read) {
        return;
      }

      const notificationId = String(item.id || item._id || '').trim();
      if (!notificationId) {
        return;
      }

      await markNotificationAsRead(token, notificationId);
      setItems((prev) =>
        prev.map((entry) => {
          const entryId = String(entry.id || entry._id || '').trim();
          if (entryId !== notificationId) {
            return entry;
          }

          return {
            ...entry,
            is_read: true,
            read_at: new Date().toISOString(),
          };
        }),
      );
      decrementNotificationBadge(1);
    },
    [token],
  );

  const handleMarkAllAsRead = useCallback(async () => {
    if (!token || isMarkingAll || unreadCount <= 0) {
      return;
    }

    setIsMarkingAll(true);
    try {
      await markAllNotificationsAsRead(token);
      setItems((prev) =>
        prev.map((entry) => ({
          ...entry,
          is_read: true,
          read_at: entry.read_at || new Date().toISOString(),
        })),
      );
      setNotificationBadgeCount(0);
    } finally {
      setIsMarkingAll(false);
    }
  }, [isMarkingAll, token, unreadCount]);

  const emptyText = useMemo(() => {
    if (!canLoad) {
      return 'Vui lòng đăng nhập để xem lịch sử.';
    }

    return 'Chưa có thông báo nào.';
  }, [canLoad]);

  const handleNotificationPress = useCallback(
    async (item: CleanerNotification) => {
      await handleMarkAsRead(item);

      if (isShiftNotification(item)) {
        router.push('/(tabs)/shifts');
        return;
      }

      if (isInventoryNotification(item)) {
        router.push('/(tabs)/supplies');
        return;
      }

      const taskId = resolveNotificationTaskId(item);
      if (!taskId && !isCleaningNotification(item)) {
        return;
      }

      if (!taskId) {
        router.push('/(tabs)/history');
        return;
      }

      router.push({
        pathname: '/task/[id]',
        params: { id: taskId },
      });
    },
    [handleMarkAsRead, router],
  );

  const renderItem = useCallback(
    ({ item }: { item: CleanerNotification }) => {
      const isUnread = item.is_read === false;
      const resolvedType = resolveNotificationType(item);
      const resolvedEventCode = resolveNotificationEventCode(item);
      const titleText = sanitizeNotificationText(item.title, 'Thông báo mới');
      const messageText = sanitizeNotificationText(item.message, 'Bạn có cập nhật mới cần xem.');
      const typeVisual = getTypeVisual(resolvedType, resolvedEventCode, palette);
      const deliveryBadge = getDeliveryStatusBadge(item.delivery_status, palette);

      return (
        <Pressable
          onPress={() => {
            handleNotificationPress(item).catch(() => null);
          }}
          style={[
            styles.itemCard,
            {
              backgroundColor: typeVisual.cardBgColor,
              borderColor: isUnread ? typeVisual.unreadBorderColor : typeVisual.cardBorderColor,
            },
          ]}>
          <View style={styles.itemMainRow}>
            <View style={[styles.itemTypeIconWrap, { backgroundColor: typeVisual.iconBgColor }]}>
              <MaterialIcons name={typeVisual.iconName} size={18} color={typeVisual.iconColor} />
            </View>

            <View style={styles.itemContentWrap}>
              <View style={styles.itemHeaderRow}>
                <Text style={[styles.itemTitle, { color: palette.text }]} numberOfLines={2}>
                  {titleText}
                </Text>
                {isUnread ? (
                  <View style={[styles.unreadDot, { backgroundColor: typeVisual.iconColor }]} />
                ) : null}
              </View>

              <Text style={[styles.itemMessage, { color: palette.textMuted }]}>{messageText}</Text>

              {deliveryBadge ? (
                <View style={styles.badgeRow}>
                  <View style={[styles.badgeChip, { backgroundColor: deliveryBadge.bgColor }]}>
                    <Text style={[styles.badgeText, { color: deliveryBadge.textColor }]}>
                      {deliveryBadge.label}
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={[styles.metaRow, styles.metaRowOnlyDate]}>
                <Text style={[styles.metaText, { color: palette.textMuted }]}>
                  {formatDateTime(item.createdAt || item.sent_at)}
                </Text>
              </View>
            </View>
          </View>
        </Pressable>
      );
    },
    [handleNotificationPress, palette],
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
      <View style={styles.headerWrap}>
        <View
          style={[
            styles.headerCard,
            {
              backgroundColor: palette.card,
              borderColor: palette.border,
            },
          ]}>
          <Text style={[styles.headerTitle, { color: palette.primary }]}>
            Thông báo của {user?.name || 'Cleaner'}
          </Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryStats}>
              <Text style={[styles.unreadText, { color: palette.white }]}>Chưa đọc: {unreadCount}</Text>
            </View>
            <Pressable
              disabled={isMarkingAll || unreadCount <= 0}
              onPress={() => {
                handleMarkAllAsRead().catch(() => null);
              }}
              style={[
                styles.markAllButton,
                {
                  backgroundColor: unreadCount > 0 ? palette.primaryBg : palette.border,
                },
              ]}>
              <Text
                style={[
                  styles.markAllText,
                  {
                    color: unreadCount > 0 ? palette.primary : palette.textMuted,
                  },
                ]}
                numberOfLines={1}>
                Đánh dấu đã đọc
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id || item._id || `${resolveNotificationEventCode(item)}-${item.createdAt}`)}
          contentContainerStyle={styles.listContainer}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              tintColor={palette.primary}
              onRefresh={() => {
                loadHistoryData({ isRefresh: true }).catch(() => null);
              }}
            />
          }
          ListEmptyComponent={
            <View
              style={[
                styles.infoCard,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}>
              <Text style={[styles.infoTitle, { color: palette.text }]}>Chưa có dữ liệu</Text>
              <Text style={[styles.infoDescription, { color: palette.textMuted }]}>{emptyText}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerWrap: {
    paddingTop: spacingY._12,
    paddingHorizontal: spacingX._20,
    paddingBottom: spacingY._10,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContainer: {
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._12,
    paddingBottom: spacingY._15,
    gap: spacingY._15,
  },
  headerCard: {
    borderRadius: radius._20,
    borderWidth: 1,
    padding: spacingX._20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    textAlign: 'center',
  },
  summaryRow: {
    marginTop: spacingY._10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacingX._10,
  },
  summaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacingX._10,
    flexShrink: 1,
    minWidth: 0,
  },
  unreadText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  markAllButton: {
    borderRadius: radius._10,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._7,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  markAllText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  itemCard: {
    borderRadius: radius._15,
    borderWidth: 1,
    padding: spacingX._15,
  },
  itemMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacingX._10,
  },
  itemTypeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: spacingY._5,
  },
  itemContentWrap: {
    flex: 1,
    minWidth: 0,
    gap: spacingY._7,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._10,
  },
  itemTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  itemMessage: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.sans,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacingX._7,
  },
  badgeChip: {
    borderRadius: radius.full,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  metaRow: {
    marginTop: spacingY._5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._10,
  },
  metaRowOnlyDate: {
    justifyContent: 'flex-end',
  },
  metaText: {
    fontSize: 11,
    fontFamily: Fonts.mono,
  },
  infoCard: {
    borderRadius: radius._15,
    borderWidth: 1,
    padding: spacingX._15,
    gap: spacingY._7,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  infoDescription: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Fonts.sans,
  },
});
