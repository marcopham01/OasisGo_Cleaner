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

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { connectCleanerNotificationSocket } from '@/services/cleaner-notification-socket';
import {
  getMyNotifications,
  getMyUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '@/services/cleaner-dashboard.service';
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

function getTypeBadge(type: unknown, palette: typeof Colors.light) {
  const normalized = normalizeToken(typeof type === 'string' ? type : null);

  if (normalized === 'SHIFT') {
    return { label: 'Ca làm', textColor: palette.primaryDark, bgColor: palette.primaryBg };
  }
  if (normalized === 'CLEANING') {
    return { label: 'Vệ sinh', textColor: palette.success, bgColor: palette.secondaryBg };
  }
  if (normalized === 'INCIDENT') {
    return { label: 'Sự cố', textColor: palette.error, bgColor: 'rgba(244, 63, 94, 0.14)' };
  }
  if (normalized === 'BOOKING') {
    return { label: 'Đặt chỗ', textColor: palette.warning, bgColor: 'rgba(245, 158, 11, 0.16)' };
  }
  if (normalized === 'SYSTEM') {
    return { label: 'Hệ thống', textColor: palette.textMuted, bgColor: palette.border };
  }

  return {
    label: normalized || 'Khác',
    textColor: palette.textMuted,
    bgColor: palette.border,
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
    return { label: 'Bỏ qua', textColor: palette.textMuted, bgColor: palette.border };
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
    case 'INCIDENT_RESOLVED':
      return 'Sự cố đã được xử lý';
    case 'POD_AUTO_MIGRATION_ALERT':
      return 'Cảnh báo chuyển pod tự động';
    case 'BOOKING_AUTO_MIGRATED':
      return 'Đặt chỗ đã được chuyển tự động';
    case 'SUPPORT_ESCALATED':
      return 'Yêu cầu đã được escalation';
    case 'SUPPORT_ROOM_CHANGED':
      return 'Phòng đã thay đổi';
    default:
      return code || 'Thông báo hệ thống';
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

export default function HistoryScreen() {
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

  const loadNotifications = useCallback(
    async (options?: { isRefresh?: boolean }) => {
      if (!token) return;

      const isRefresh = Boolean(options?.isRefresh);
      if (isRefresh) {
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
        } else {
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

    loadNotifications().catch(() => {
      setIsLoading(false);
    });
  }, [canLoad, loadNotifications]);

  useEffect(() => {
    if (!token || !user?.id) {
      return;
    }

    const disconnect = connectCleanerNotificationSocket({
      token,
      cleanerId: user.id,
      onNotification: () => {
        loadNotifications({ isRefresh: true }).catch(() => null);
      },
    });

    return () => {
      disconnect();
    };
  }, [loadNotifications, token, user?.id]);

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
      return 'Vui lòng đăng nhập để xem thông báo.';
    }
    return 'Chưa có thông báo nào.';
  }, [canLoad]);

  const renderItem = useCallback(
    ({ item }: { item: CleanerNotification }) => {
      const isUnread = item.is_read === false;
      const typeBadge = getTypeBadge(item.type, palette);
      const deliveryBadge = getDeliveryStatusBadge(item.delivery_status, palette);

      return (
        <Pressable
          onPress={() => {
            handleMarkAsRead(item).catch(() => null);
          }}
          style={[
            styles.itemCard,
            {
              backgroundColor: palette.surface,
              borderColor: isUnread ? palette.primary : palette.border,
            },
          ]}>
          <View style={styles.itemHeaderRow}>
            <Text style={[styles.itemTitle, { color: palette.text }]} numberOfLines={2}>
              {item.title || 'Thông báo'}
            </Text>
            {isUnread ? (
              <View style={[styles.unreadDot, { backgroundColor: palette.primary }]} />
            ) : null}
          </View>

          <Text style={[styles.itemMessage, { color: palette.textMuted }]}>{item.message || '-'}</Text>

          <View style={styles.badgeRow}>
            <View style={[styles.badgeChip, { backgroundColor: typeBadge.bgColor }]}> 
              <Text style={[styles.badgeText, { color: typeBadge.textColor }]}>{typeBadge.label}</Text>
            </View>
            {deliveryBadge ? (
              <View style={[styles.badgeChip, { backgroundColor: deliveryBadge.bgColor }]}>
                <Text style={[styles.badgeText, { color: deliveryBadge.textColor }]}>
                  {deliveryBadge.label}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: palette.textMuted }]}>
              {getEventCodeLabel(item.event_code)}
            </Text>
            <Text style={[styles.metaText, { color: palette.textMuted }]}>
              {formatDateTime(item.createdAt || item.sent_at)}
            </Text>
          </View>
        </Pressable>
      );
    },
    [handleMarkAsRead, palette.border, palette.primary, palette.surface, palette.text, palette.textMuted],
  );

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}> 
      <View
        style={[
          styles.headerCard,
          {
            backgroundColor: palette.card,
            borderColor: palette.border,
          },
        ]}>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Thông báo</Text>
        <Text style={[styles.headerSubtitle, { color: palette.textMuted }]}>
          Xin chào, {user?.name || 'Cleaner'}.
        </Text>
        <View style={styles.summaryRow}>
          <Text style={[styles.unreadText, { color: palette.primary }]}>Chưa đọc: {unreadCount}</Text>
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
            <Text style={[styles.markAllText, { color: unreadCount > 0 ? palette.primary : palette.textMuted }]}>
              Đánh dấu tất cả đã đọc
            </Text>
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id || item._id || `${item.event_code}-${item.createdAt}`)}
          contentContainerStyle={styles.listContainer}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              tintColor={palette.primary}
              onRefresh={() => {
                loadNotifications({ isRefresh: true }).catch(() => null);
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContainer: {
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._15,
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
  },
  headerSubtitle: {
    marginTop: spacingY._7,
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  summaryRow: {
    marginTop: spacingY._10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._10,
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
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  itemCard: {
    borderRadius: radius._15,
    borderWidth: 1,
    padding: spacingX._15,
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
    marginTop: spacingY._3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._10,
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
