import { Colors } from '@/constants/theme';
import type { CleanerNotification } from '@/types/cleaner-dashboard';

export function normalizeToken(value?: string | null) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

export function isInternalCodeText(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return false;
  const normalized = normalizeToken(text);
  return /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(normalized);
}

export function sanitizeNotificationText(value: unknown, fallback: string) {
  const text = String(value || '').trim();
  if (!text) return fallback;
  if (isInternalCodeText(text)) return fallback;
  return text;
}

export function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function resolveNotificationType(item: CleanerNotification) {
  const normalizedType = normalizeToken(typeof item.type === 'string' ? item.type : null);
  if (normalizedType) return normalizedType;
  const data = toRecord(item.data);
  const fallbackType = String(data.type || data.notification_type || data.category || '').trim();
  return normalizeToken(fallbackType);
}

export function resolveNotificationEventCode(item: CleanerNotification) {
  const normalizedEventCode = normalizeToken(
    typeof item.event_code === 'string' ? item.event_code : null,
  );
  if (normalizedEventCode) return normalizedEventCode;
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

export function getTypeVisual(type: unknown, eventCode: unknown, palette: typeof Colors.light) {
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

export function getDeliveryStatusBadge(status: unknown, palette: typeof Colors.light) {
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

export function getEventCodeLabel(eventCode: unknown) {
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

export function sortByNewest(items: CleanerNotification[]) {
  return [...items].sort((a, b) => {
    const aTime =
      new Date(String(a.createdAt || a.sent_at || a.updatedAt || 0)).getTime() || 0;
    const bTime =
      new Date(String(b.createdAt || b.sent_at || b.updatedAt || 0)).getTime() || 0;
    return bTime - aTime;
  });
}

export function formatRelativeTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const CATEGORY_DEFS = [
  { key: 'CLEANING', label: 'Nhiệm vụ vệ sinh', description: 'Phân công và cập nhật nhiệm vụ' },
  { key: 'SHIFT', label: 'Lịch ca làm việc', description: 'Phân công ca và nhắc nhở giờ làm' },
  { key: 'INCIDENT', label: 'Sự cố & Báo cáo', description: 'Thông báo sự cố và hư hại' },
  { key: 'INVENTORY', label: 'Kho vật tư', description: 'Xuất nhập kho và quản lý vật tư' },
  { key: 'SYSTEM', label: 'Hệ thống', description: 'Cập nhật hệ thống và tài khoản' },
  { key: 'SUPPORT', label: 'Hỗ trợ', description: 'Thông báo hỗ trợ và yêu cầu' },
] as const;

export type CategoryKey = (typeof CATEGORY_DEFS)[number]['key'];

export function isCleaningNotification(item: CleanerNotification) {
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

export function isShiftNotification(item: CleanerNotification) {
  const type = resolveNotificationType(item);
  const event = resolveNotificationEventCode(item);
  return type === 'SHIFT' || event.startsWith('SHIFT_');
}

export function isInventoryNotification(item: CleanerNotification) {
  const type = resolveNotificationType(item);
  const event = resolveNotificationEventCode(item);
  return type === 'INVENTORY' || event.startsWith('INVENTORY_');
}

export function matchesCategory(item: CleanerNotification, categoryKey: CategoryKey): boolean {
  if (categoryKey === 'CLEANING') return isCleaningNotification(item);
  if (categoryKey === 'SHIFT') return isShiftNotification(item);
  if (categoryKey === 'INVENTORY') return isInventoryNotification(item);
  const type = resolveNotificationType(item);
  const event = resolveNotificationEventCode(item);
  if (categoryKey === 'INCIDENT') {
    return type === 'INCIDENT' || event.startsWith('INCIDENT_');
  }
  if (categoryKey === 'SUPPORT') {
    return type === 'SUPPORT' || event.startsWith('SUPPORT_');
  }
  if (categoryKey === 'SYSTEM') {
    return (
      type === 'SYSTEM' ||
      event.startsWith('SYSTEM_') ||
      event === 'PROMOTION_BROADCAST' ||
      event === 'IDENTITY_VERIFIED'
    );
  }
  return type === categoryKey;
}

export function resolveNotificationTaskId(item: CleanerNotification) {
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
