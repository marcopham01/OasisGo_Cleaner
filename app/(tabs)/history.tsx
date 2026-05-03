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
import {
    CATEGORY_DEFS,
    formatRelativeTime,
    getTypeVisual,
    isCleaningNotification,
    isInventoryNotification,
    isShiftNotification,
    matchesCategory,
    resolveNotificationEventCode,
    resolveNotificationTaskId,
    resolveNotificationType,
    sanitizeNotificationText,
    sortByNewest,
} from '@/utils/notifications';

export default function HistoryScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { token } = useAuth();

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

  const categoryItems = useMemo(
    () =>
      CATEGORY_DEFS.map((cat) => {
        const unread = items.filter(
          (item) => item.is_read === false && matchesCategory(item, cat.key),
        ).length;
        const visual = getTypeVisual(cat.key, '', palette);
        return { ...cat, unread, visual };
      }),
    [items, palette],
  );

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
      const timeText = formatRelativeTime(item.createdAt || item.sent_at);

      return (
        <Pressable
          onPress={() => {
            handleNotificationPress(item).catch(() => null);
          }}
          style={[styles.notifRow, isUnread && { backgroundColor: typeVisual.cardBgColor }]}>
          <View style={[styles.notifIconWrap, { backgroundColor: typeVisual.iconBgColor }]}>
            <MaterialIcons name={typeVisual.iconName} size={20} color={typeVisual.iconColor} />
          </View>
          <View style={styles.notifContent}>
            <View style={styles.notifTitleRow}>
              <Text style={[styles.notifTitle, { color: palette.text }]} numberOfLines={1}>
                {titleText}
              </Text>
              {timeText ? (
                <Text style={[styles.notifTime, { color: palette.textMuted }]}>{timeText}</Text>
              ) : null}
            </View>
            <Text style={[styles.notifMessage, { color: palette.textMuted }]} numberOfLines={2}>
              {messageText}
            </Text>
          </View>
          {isUnread && (
            <View style={[styles.notifUnreadDot, { backgroundColor: typeVisual.iconColor }]} />
          )}
        </Pressable>
      );
    },
    [handleNotificationPress, palette],
  );

  const listHeader = (
    <>
      {/* Page header */}
      <View style={styles.pageHeaderWrap}>
        <Text style={[styles.pageTitle, { color: palette.text }]}>Thông báo</Text>
        <View style={styles.pageSubRow}>
          <View style={[styles.unreadPill, { backgroundColor: palette.primaryBg }]}>
            <Text style={[styles.unreadPillText, { color: palette.primary }]}>
              Chưa đọc ({unreadCount})
            </Text>
          </View>
          <Pressable
            disabled={isMarkingAll || unreadCount <= 0}
            onPress={() => {
              handleMarkAllAsRead().catch(() => null);
            }}>
            <Text
              style={[
                styles.markAllText,
                { color: unreadCount > 0 ? palette.primary : palette.textMuted },
              ]}>
              Đánh dấu đã xem tất cả
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Category list */}
      <View
        style={[
          styles.categoriesCard,
          { backgroundColor: palette.card, borderColor: palette.border },
        ]}>
        {categoryItems.map((cat, index) => (
          <View key={cat.key}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/notifications/[category]',
                  params: { category: cat.key },
                })
              }
              style={styles.catRow}>
              <View style={[styles.catIconWrap, { backgroundColor: cat.visual.iconBgColor }]}>
                <MaterialIcons name={cat.visual.iconName} size={20} color={cat.visual.iconColor} />
              </View>
              <View style={styles.catContent}>
                <Text style={[styles.catLabel, { color: palette.text }]}>{cat.label}</Text>
                <Text
                  style={[styles.catDesc, { color: palette.textMuted }]}
                  numberOfLines={1}>
                  {cat.description}
                </Text>
              </View>
              {cat.unread > 0 && (
                <View style={[styles.catBadge, { backgroundColor: cat.visual.iconColor }]}>
                  <Text style={styles.catBadgeText}>{cat.unread}</Text>
                </View>
              )}
              <MaterialIcons name="chevron-right" size={20} color={palette.textMuted} />
            </Pressable>
            {index < categoryItems.length - 1 && (
              <View style={[styles.catDivider, { backgroundColor: palette.border }]} />
            )}
          </View>
        ))}
      </View>

      {/* Section header */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Thông báo mới nhận</Text>
      </View>
    </>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top']}>
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) =>
            String(
              item.id ||
                item._id ||
                `${resolveNotificationEventCode(item)}-${item.createdAt}`,
            )
          }
          contentContainerStyle={styles.listContainer}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
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
                styles.emptyCard,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}>
              <Text style={[styles.emptyTitle, { color: palette.text }]}>Chưa có dữ liệu</Text>
              <Text style={[styles.emptyDesc, { color: palette.textMuted }]}>{emptyText}</Text>
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
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContainer: {
    paddingBottom: spacingY._20,
  },

  // ─── Page header ──────────────────────────────────────────────────────────
  pageHeaderWrap: {
    paddingTop: spacingY._15,
    paddingHorizontal: spacingX._20,
    paddingBottom: spacingY._10,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    marginBottom: spacingY._7,
  },
  pageSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  unreadPill: {
    borderRadius: radius.full,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._5,
  },
  unreadPillText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  markAllText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: Fonts.sans,
  },

  // ─── Category rows ─────────────────────────────────────────────────────────
  categoriesCard: {
    marginHorizontal: spacingX._20,
    marginTop: spacingY._5,
    borderRadius: radius._15,
    borderWidth: 1,
    overflow: 'hidden',
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacingX._15,
    paddingVertical: spacingY._12,
    gap: spacingX._12,
  },
  catIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  catContent: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  catLabel: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  catDesc: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  catBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    flexShrink: 0,
  },
  catBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  catDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 71,
  },

  // ─── Section header ────────────────────────────────────────────────────────
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._17,
    paddingBottom: spacingY._7,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  clearFilter: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: Fonts.sans,
  },

  // ─── Notification rows ─────────────────────────────────────────────────────
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._12,
    gap: spacingX._12,
  },
  notifIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  notifContent: {
    flex: 1,
    minWidth: 0,
    gap: spacingY._5,
  },
  notifTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._10,
  },
  notifTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  notifTime: {
    fontSize: 11,
    fontFamily: Fonts.mono,
    flexShrink: 0,
  },
  notifMessage: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.sans,
  },
  notifUnreadDot: {
    width: 9,
    height: 9,
    borderRadius: radius.full,
    flexShrink: 0,
    alignSelf: 'center',
  },

  // ─── Empty state ───────────────────────────────────────────────────────────
  emptyCard: {
    marginHorizontal: spacingX._20,
    borderRadius: radius._15,
    borderWidth: 1,
    padding: spacingX._15,
    gap: spacingY._7,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  emptyDesc: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Fonts.sans,
  },
});
