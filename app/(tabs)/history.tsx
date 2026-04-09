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

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getMyNotifications,
  getDamageReports,
  getMyUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '@/services/cleaner-dashboard.service';
import { connectCleanerNotificationSocket } from '@/services/cleaner-notification-socket';
import {
  decrementNotificationBadge,
  setNotificationBadgeCount,
  subscribeNotificationBadge,
} from '@/services/notification-badge-bus';
import type { CleanerNotification, DamageReportResponse } from '@/types/cleaner-dashboard';

type HistoryTabKey = 'NOTIFICATIONS' | 'INCIDENTS';

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

function sortIncidentsByNewest(items: DamageReportResponse[]) {
  return [...items].sort((a, b) => {
    const aTime = new Date(String(a.created_at || a.updated_at || 0)).getTime() || 0;
    const bTime = new Date(String(b.created_at || b.updated_at || 0)).getTime() || 0;
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

function formatCurrencyVnd(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
}

function getIncidentStatusBadge(status: unknown, palette: typeof Colors.light) {
  const normalized = normalizeToken(typeof status === 'string' ? status : null);

  if (normalized === 'PENDING') {
    return { label: 'Đang chờ duyệt', textColor: palette.warning, bgColor: 'rgba(245, 158, 11, 0.16)' };
  }

  if (normalized === 'RESOLVED') {
    return { label: 'Đã xử lý', textColor: palette.success, bgColor: palette.secondaryBg };
  }

  if (normalized === 'DISMISSED') {
    return { label: 'Bị bác bỏ', textColor: palette.error, bgColor: 'rgba(244, 63, 94, 0.14)' };
  }

  return {
    label: normalized || 'Không xác định',
    textColor: palette.textMuted,
    bgColor: palette.border,
  };
}

function getIncidentSeverityBadge(severity: unknown, palette: typeof Colors.light) {
  const normalized = normalizeToken(typeof severity === 'string' ? severity : null);

  if (normalized === 'LOW') {
    return { label: 'Thấp', textColor: palette.success, bgColor: palette.secondaryBg };
  }

  if (normalized === 'MEDIUM') {
    return { label: 'Trung bình', textColor: palette.warning, bgColor: 'rgba(245, 158, 11, 0.16)' };
  }

  if (normalized === 'HIGH') {
    return { label: 'Cao', textColor: '#b45309', bgColor: 'rgba(251, 191, 36, 0.2)' };
  }

  if (normalized === 'CRITICAL') {
    return { label: 'Nghiêm trọng', textColor: palette.error, bgColor: 'rgba(244, 63, 94, 0.14)' };
  }

  return {
    label: normalized || 'Không xác định',
    textColor: palette.textMuted,
    bgColor: palette.border,
  };
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
  const type = normalizeToken(typeof item.type === 'string' ? item.type : null);
  const event = normalizeToken(typeof item.event_code === 'string' ? item.event_code : null);

  return (
    type === 'CLEANING' ||
    event.startsWith('CLEANING_TASK_') ||
    event === 'SUPPORT_CLEANING_REQUEST'
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { user, token } = useAuth();

  const [activeTab, setActiveTab] = useState<HistoryTabKey>('NOTIFICATIONS');
  const [items, setItems] = useState<CleanerNotification[]>([]);
  const [incidentItems, setIncidentItems] = useState<DamageReportResponse[]>([]);
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
    async (options?: { isRefresh?: boolean }) => {
      if (!token) return;

      const isRefresh = Boolean(options?.isRefresh);
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const [listResult, unread, reportResult] = await Promise.all([
          getMyNotifications(token, { page: 1, limit: 50 }),
          getMyUnreadNotificationCount(token),
          getDamageReports(token, { page: 1, limit: 50 }),
        ]);

        setItems(sortByNewest(listResult.data));
        setIncidentItems(sortIncidentsByNewest(reportResult.items));
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

    loadHistoryData().catch(() => {
      setIsLoading(false);
    });
  }, [canLoad, loadHistoryData]);

  useEffect(() => {
    if (!token || !user?.id) {
      return;
    }

    const disconnect = connectCleanerNotificationSocket({
      token,
      cleanerId: user.id,
      onNotification: () => {
        loadHistoryData({ isRefresh: true }).catch(() => null);
      },
    });

    return () => {
      disconnect();
    };
  }, [loadHistoryData, token, user?.id]);

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

    if (activeTab === 'INCIDENTS') {
      return 'Bạn chưa gửi incident nào.';
    }

    return 'Chưa có thông báo nào.';
  }, [activeTab, canLoad]);

  const handleNotificationPress = useCallback(
    async (item: CleanerNotification) => {
      await handleMarkAsRead(item);

      if (!isCleaningNotification(item)) {
        return;
      }

      const taskId = resolveNotificationTaskId(item);
      if (!taskId) {
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
      const typeBadge = getTypeBadge(item.type, palette);
      const deliveryBadge = getDeliveryStatusBadge(item.delivery_status, palette);

      return (
        <Pressable
          onPress={() => {
            handleNotificationPress(item).catch(() => null);
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
    [handleNotificationPress, palette],
  );

  const renderIncidentItem = useCallback(
    ({ item }: { item: DamageReportResponse }) => {
      const statusBadge = getIncidentStatusBadge(item.status, palette);
      const severityBadge = getIncidentSeverityBadge(item.severity, palette);
      const totalValue = formatCurrencyVnd(item.pricing?.estimated_total_value);
      const podName = item.context?.pod_name || item.context?.pod_id || 'Không rõ Pod';
      const incidentId = String(item.report_id || '').trim();
      const photoCount = Array.isArray(item.photo_urls) ? item.photo_urls.length : 0;

      return (
        <View
          style={[
            styles.itemCard,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}>
          <View style={styles.itemHeaderRow}>
            <Text style={[styles.itemTitle, { color: palette.text }]} numberOfLines={2}>
              {item.description || 'Báo cáo sự cố'}
            </Text>
          </View>

          <View style={styles.badgeRow}>
            <View style={[styles.badgeChip, { backgroundColor: statusBadge.bgColor }]}> 
              <Text style={[styles.badgeText, { color: statusBadge.textColor }]}>{statusBadge.label}</Text>
            </View>
            <View style={[styles.badgeChip, { backgroundColor: severityBadge.bgColor }]}> 
              <Text style={[styles.badgeText, { color: severityBadge.textColor }]}>{severityBadge.label}</Text>
            </View>
          </View>

          <View style={styles.incidentMetaWrap}>
            <Text style={[styles.metaText, { color: palette.textMuted }]}>Pod: {podName}</Text>
            {totalValue ? (
              <Text style={[styles.metaText, { color: palette.textMuted }]}>Ước tính: {totalValue}</Text>
            ) : null}
            <Text style={[styles.metaText, { color: palette.textMuted }]}>Ảnh đính kèm: {photoCount}</Text>
            {incidentId ? (
              <Text style={[styles.metaText, { color: palette.textMuted }]}>Mã report: {incidentId}</Text>
            ) : null}
            <Text style={[styles.metaText, { color: palette.textMuted }]}>
              {formatDateTime(item.created_at || item.updated_at)}
            </Text>
          </View>
        </View>
      );
    },
    [palette],
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
        <Text style={[styles.headerTitle, { color: palette.text }]}>Lịch sử cleaner</Text>
        <Text style={[styles.headerSubtitle, { color: palette.textMuted }]}>
          Xin chào, {user?.name || 'Cleaner'}.
        </Text>
        <View style={styles.summaryRow}>
          <Text style={[styles.unreadText, { color: palette.primary }]}>Chưa đọc: {unreadCount}</Text>
          <Text style={[styles.unreadText, { color: palette.textMuted }]}>Incident: {incidentItems.length}</Text>
          <Pressable
            disabled={activeTab !== 'NOTIFICATIONS' || isMarkingAll || unreadCount <= 0}
            onPress={() => {
              handleMarkAllAsRead().catch(() => null);
            }}
            style={[
              styles.markAllButton,
              {
                backgroundColor:
                  activeTab === 'NOTIFICATIONS' && unreadCount > 0 ? palette.primaryBg : palette.border,
              },
            ]}>
            <Text
              style={[
                styles.markAllText,
                {
                  color:
                    activeTab === 'NOTIFICATIONS' && unreadCount > 0 ? palette.primary : palette.textMuted,
                },
              ]}>
              Đánh dấu tất cả đã đọc
            </Text>
          </Pressable>
        </View>

        <View style={styles.switchRow}>
          <Pressable
            onPress={() => {
              setActiveTab('NOTIFICATIONS');
            }}
            style={[
              styles.switchButton,
              {
                backgroundColor: activeTab === 'NOTIFICATIONS' ? palette.primaryBg : palette.surface,
                borderColor: activeTab === 'NOTIFICATIONS' ? palette.primary : palette.border,
              },
            ]}>
            <Text
              style={[
                styles.switchButtonText,
                { color: activeTab === 'NOTIFICATIONS' ? palette.primary : palette.textMuted },
              ]}>
              Thông báo
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setActiveTab('INCIDENTS');
            }}
            style={[
              styles.switchButton,
              {
                backgroundColor: activeTab === 'INCIDENTS' ? palette.primaryBg : palette.surface,
                borderColor: activeTab === 'INCIDENTS' ? palette.primary : palette.border,
              },
            ]}>
            <Text
              style={[
                styles.switchButtonText,
                { color: activeTab === 'INCIDENTS' ? palette.primary : palette.textMuted },
              ]}>
              Incident của tôi
            </Text>
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : activeTab === 'NOTIFICATIONS' ? (
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
      ) : (
        <FlatList
          data={incidentItems}
          keyExtractor={(item) => String(item.report_id || `${item.created_at}-${item.description}`)}
          contentContainerStyle={styles.listContainer}
          renderItem={renderIncidentItem}
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
  switchRow: {
    marginTop: spacingY._10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingX._10,
  },
  switchButton: {
    flex: 1,
    borderRadius: radius._10,
    borderWidth: 1,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchButtonText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.sans,
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
    marginTop: spacingY._5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingX._10,
  },
  metaText: {
    fontSize: 11,
    fontFamily: Fonts.mono,
  },
  incidentMetaWrap: {
    marginTop: spacingY._5,
    gap: spacingY._5,
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
