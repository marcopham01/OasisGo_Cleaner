import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
    markAllNotificationsAsRead,
    markNotificationAsRead,
} from '@/services/cleaner-dashboard.service';
import { subscribeCleanerRealtimeEvent } from '@/services/cleaner-realtime-bus';
import type { CleanerNotification } from '@/types/cleaner-dashboard';
import {
    type CategoryKey,
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

export default function NotificationCategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { token } = useAuth();

  const [items, setItems] = useState<CleanerNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const categoryKey = String(category || '').toUpperCase() as CategoryKey;
  const categoryDef = CATEGORY_DEFS.find((c) => c.key === categoryKey) ?? null;
  const categoryVisual = useMemo(
    () => getTypeVisual(categoryKey, '', palette),
    [categoryKey, palette],
  );

  const loadData = useCallback(
    async (options?: { isRefresh?: boolean; silent?: boolean }) => {
      if (!token) return;
      if (options?.silent) {
        // no-op: silent refresh
      } else if (options?.isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      try {
        const result = await getMyNotifications(token, { page: 1, limit: 100 });
        const all = sortByNewest(result.data);
        const filtered = categoryDef
          ? all.filter((item) => matchesCategory(item, categoryKey))
          : all;
        setItems(filtered);
      } finally {
        if (options?.isRefresh) {
          setIsRefreshing(false);
        } else if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [token, categoryKey, categoryDef],
  );

  useEffect(() => {
    loadData().catch(() => setIsLoading(false));
  }, [loadData]);

  useEffect(() => {
    if (!token) return;
    const unsubscribe = subscribeCleanerRealtimeEvent(() => {
      loadData({ silent: true }).catch(() => null);
    });
    return () => {
      unsubscribe();
    };
  }, [loadData, token]);

  const unreadCount = useMemo(
    () => items.filter((i) => i.is_read === false).length,
    [items],
  );

  const handleMarkAsRead = useCallback(
    async (item: CleanerNotification) => {
      if (!token || item.is_read) return;
      const notificationId = String(item.id || item._id || '').trim();
      if (!notificationId) return;
      await markNotificationAsRead(token, notificationId);
      setItems((prev) =>
        prev.map((entry) => {
          const entryId = String(entry.id || entry._id || '').trim();
          if (entryId !== notificationId) return entry;
          return { ...entry, is_read: true, read_at: new Date().toISOString() };
        }),
      );
    },
    [token],
  );

  const handleMarkAllAsRead = useCallback(async () => {
    if (!token || isMarkingAll || unreadCount <= 0) return;
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
    } finally {
      setIsMarkingAll(false);
    }
  }, [isMarkingAll, token, unreadCount]);

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
      if (!taskId && !isCleaningNotification(item)) return;

      if (!taskId) {
        router.push('/(tabs)/history');
        return;
      }

      router.push({ pathname: '/task/[id]', params: { id: taskId } });
    },
    [handleMarkAsRead, router],
  );

  const renderItem = useCallback(
    ({ item }: { item: CleanerNotification }) => {
      const isUnread = item.is_read === false;
      const resolvedType = resolveNotificationType(item);
      const resolvedEventCode = resolveNotificationEventCode(item);
      const titleText = sanitizeNotificationText(item.title, 'Thông báo mới');
      const messageText = sanitizeNotificationText(
        item.message,
        'Bạn có cập nhật mới cần xem.',
      );
      const typeVisual = getTypeVisual(resolvedType, resolvedEventCode, palette);
      const timeText = formatRelativeTime(item.createdAt || item.sent_at);

      return (
        <Pressable
          onPress={() => {
            handleNotificationPress(item).catch(() => null);
          }}
          style={[
            styles.notifRow,
            isUnread && { backgroundColor: typeVisual.cardBgColor },
          ]}>
          <View style={[styles.notifIconWrap, { backgroundColor: typeVisual.iconBgColor }]}>
            <MaterialIcons
              name={typeVisual.iconName}
              size={20}
              color={typeVisual.iconColor}
            />
          </View>
          <View style={styles.notifContent}>
            <View style={styles.notifTitleRow}>
              <Text
                style={[styles.notifTitle, { color: palette.text }]}
                numberOfLines={1}>
                {titleText}
              </Text>
              {timeText ? (
                <Text style={[styles.notifTime, { color: palette.textMuted }]}>
                  {timeText}
                </Text>
              ) : null}
            </View>
            <Text
              style={[styles.notifMessage, { color: palette.textMuted }]}
              numberOfLines={2}>
              {messageText}
            </Text>
          </View>
          {isUnread && (
            <View
              style={[styles.notifUnreadDot, { backgroundColor: typeVisual.iconColor }]}
            />
          )}
        </Pressable>
      );
    },
    [handleNotificationPress, palette],
  );

  const listHeader = (
    <View style={styles.headerWrap}>
      {/* Category banner */}
      <View
        style={[
          styles.bannerCard,
          {
            backgroundColor: categoryVisual.cardBgColor,
            borderColor: categoryVisual.cardBorderColor,
          },
        ]}>
        <View
          style={[styles.bannerIcon, { backgroundColor: categoryVisual.iconBgColor }]}>
          <MaterialIcons
            name={categoryVisual.iconName}
            size={26}
            color={categoryVisual.iconColor}
          />
        </View>
        <View style={styles.bannerInfo}>
          <Text style={[styles.bannerTitle, { color: palette.text }]}>
            {categoryDef?.label ?? 'Thông báo'}
          </Text>
          <Text style={[styles.bannerDesc, { color: palette.textMuted }]}>
            {categoryDef?.description ?? ''}
          </Text>
        </View>
      </View>

      {/* Unread row */}
      <View style={styles.subRow}>
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

      {/* List label */}
      <Text style={[styles.listLabel, { color: palette.text }]}>
        Tất cả thông báo ({items.length})
      </Text>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: palette.background }]}
      edges={['bottom']}>
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
                loadData({ isRefresh: true }).catch(() => null);
              }}
            />
          }
          ListEmptyComponent={
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}>
              <Text style={[styles.emptyTitle, { color: palette.text }]}>
                Chưa có thông báo
              </Text>
              <Text style={[styles.emptyDesc, { color: palette.textMuted }]}>
                Không có thông báo nào trong mục này.
              </Text>
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

  // ─── Header ───────────────────────────────────────────────────────────────
  headerWrap: {
    paddingTop: spacingY._15,
    gap: spacingY._10,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacingX._20,
    borderRadius: radius._15,
    borderWidth: 1,
    padding: spacingX._15,
    gap: spacingX._12,
  },
  bannerIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bannerInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  bannerTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: Fonts.sans,
  },
  bannerDesc: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacingX._20,
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
  listLabel: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._7,
    paddingBottom: spacingY._5,
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
