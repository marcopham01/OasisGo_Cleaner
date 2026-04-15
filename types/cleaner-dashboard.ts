export const CLEANING_TASK_STATUSES = [
  'ASSIGNED',
  'NOTIFIED',
  'ACCEPTED',
  'ARRIVED',
  'IN_PROGRESS',
  'DONE',
  'CANCELLED',
  'MISSED',
] as const;

export type CleaningTaskStatus = (typeof CLEANING_TASK_STATUSES)[number];

export const CLEANING_REQUEST_SOURCES = [
  'USER_REQUEST',
  'AUTO_AFTER_CHECKOUT',
  'SYSTEM_RETRY',
] as const;

export type CleaningRequestSource = (typeof CLEANING_REQUEST_SOURCES)[number];

export type ShiftAssignmentStatus = 'ASSIGNED' | 'CHECKED_IN' | 'COMPLETED' | 'ABSENT';
export type CleaningPhotoType = 'BEFORE' | 'AFTER';
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'PENDING' | 'RESOLVED' | 'DISMISSED' | 'INVESTIGATING' | 'CLOSED';
export type IncidentType = 'OPERATIONAL' | 'DAMAGE_REPORT';
export type IncidentDetailType = 'ITEM' | 'SERVICE';
export type DamageType = 'BROKEN' | 'SCRATCHED' | 'LOST' | 'STAINED';
export type LostFoundStatus = 'FOUND' | 'CLAIMED' | 'DISPOSED' | 'RETURNED_TO_USER';

export const CLEANER_NOTIFICATION_TYPES = [
  'BOOKING',
  'PAYMENT',
  'PROMOTION',
  'SYSTEM',
  'IDENTITY',
  'CLEANING',
  'SHIFT',
  'INVENTORY',
  'SUPPORT',
  'INCIDENT',
] as const;

export type CleanerNotificationType = (typeof CLEANER_NOTIFICATION_TYPES)[number];

export const CLEANER_NOTIFICATION_EVENT_CODES = [
  'BOOKING_CANCELLED',
  'BOOKING_CHECKIN',
  'BOOKING_CHECKOUT',
  'BOOKING_AUTO_CHECKIN',
  'BOOKING_AUTO_CHECKOUT',
  'BOOKING_NO_SHOW',
  'BOOKING_REMINDER',
  'PAYMENT_SUCCESS',
  'PAYMENT_PENDING_REMAINING',
  'PAYMENT_REFUND_SUCCESS',
  'PROMOTION_BROADCAST',
  'SYSTEM_TEST',
  'SYSTEM_GENERAL',
  'IDENTITY_VERIFIED',
  'CLEANING_TASK_ASSIGNED',
  'CLEANING_TASK_SLA_REMINDER',
  'CLEANING_TASK_CANCELLED_NO_SHOW',
  'CLEANING_TASK_STATUS_CHANGED',
  'SUPPORT_CLEANING_REQUEST',
  'SHIFT_ASSIGNED',
  'SHIFT_START_REMINDER',
  'INVENTORY_CHECKOUT_CONFIRMED',
  'INCIDENT_REPORTED',
  'INCIDENT_REVIEW_REQUIRED',
  'INCIDENT_RESOLVED',
  'POD_AUTO_MIGRATION_ALERT',
  'BOOKING_AUTO_MIGRATED',
  'SUPPORT_ESCALATED',
  'SUPPORT_ROOM_CHANGED',
] as const;

export type CleanerNotificationEventCode = (typeof CLEANER_NOTIFICATION_EVENT_CODES)[number];

export const CLEANER_NOTIFICATION_DELIVERY_STATUSES = [
  'PENDING',
  'SENT',
  'FAILED',
  'SKIPPED_NO_TOKEN',
] as const;

export type CleanerNotificationDeliveryStatus =
  (typeof CLEANER_NOTIFICATION_DELIVERY_STATUSES)[number];

export interface CleanerNotification {
  id?: string;
  _id?: string;
  user_id?: string;
  title: string;
  message: string;
  type?: CleanerNotificationType | string;
  event_code?: CleanerNotificationEventCode | string;
  delivery_status?: CleanerNotificationDeliveryStatus | string;
  is_read?: boolean;
  read_at?: string | null;
  data?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  sent_at?: string | null;
  [key: string]: unknown;
}

export interface CleanerNotificationQuery {
  page?: number;
  limit?: number;
  is_read?: boolean;
  type?: CleanerNotificationType | string;
  event_code?: CleanerNotificationEventCode | string;
}

export interface CleanerNotificationListResponse {
  data: CleanerNotification[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CleanerUnreadCountResponse {
  unread_count: number;
}

export interface CleanerMarkAllReadResponse {
  matched_count: number;
  modified_count: number;
}

export interface CleanerRealtimeNotification {
  user_id?: string;
  sent_at?: string;
  event?: CleanerNotificationEventCode | string;
  payload?: {
    title?: string;
    message?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface IncidentDamagedItem {
  incident_id?: string;
  item_id: string;
  item_name_snapshot?: string | null;
  unit_cost_snapshot?: number | null;
  quantity_damaged?: number;
  total_damage_cost?: number | null;
  damage_type?: DamageType | string;
  note?: string | null;
  [key: string]: unknown;
}

export interface IncidentDetailLine {
  type: IncidentDetailType | string;
  item_id?: string | null;
  service_catalog_id?: string | null;
  name_snapshot?: string | null;
  unit_cost_snapshot?: number | null;
  quantity?: number;
  total_cost?: number | null;
  note?: string | null;
  [key: string]: unknown;
}

export interface ShiftInfo {
  id?: string;
  name?: string;
  shift_name?: string;
  role?: string;
  start_time?: string;
  end_time?: string;
  [key: string]: unknown;
}

export interface LocationInfo {
  id?: string;
  name?: string;
  type?: string;
  parent_id?: string | null;
  [key: string]: unknown;
}

export interface StaffShiftAssignment {
  id?: string;
  _id?: string;
  assignment_id?: string;
  shift_assignment_id?: string;
  work_date?: string;
  start_date?: string;
  end_date?: string;
  status?: ShiftAssignmentStatus | string;
  checkin_at?: string | null;
  checkout_at?: string | null;
  location_shift_id?: string;
  shift?: ShiftInfo | null;
  location?: LocationInfo | null;
  [key: string]: unknown;
}

export interface StaffShiftAssignmentQuery {
  work_date?: string;
  from_date?: string;
  to_date?: string;
  status?: string;
}

export type StaffAttendanceAction = 'CHECKIN' | 'CHECKOUT';

export interface StaffAttendanceLog {
  id?: string;
  _id?: string;
  staff_id?: string;
  shift_assignment_id?: string;
  work_date?: string;
  action?: StaffAttendanceAction | string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface StaffAttendanceLogQuery {
  action?: StaffAttendanceAction | string;
  from_date?: string;
  to_date?: string;
  date?: string;
  work_date?: string;
  shift_assignment_id?: string;
  page?: number;
  limit?: number;
}

export interface StaffAssignmentAttendanceStatus {
  shift_assignment_id: string;
  date: string;
  checked_in: boolean;
  checked_out: boolean;
  checkin_at: string | null;
  checkout_at: string | null;
}

export interface StaffTodayAttendanceStatus {
  date: string;
  checked_in_today: boolean;
  checked_out_today: boolean;
  checkin_count: number;
  checkout_count: number;
  latest_checkin_at: string | null;
  latest_checkout_at: string | null;
  checkin_assignment_ids: string[];
  checkout_assignment_ids: string[];
}

export interface StaffAttendanceLogListResponse {
  data: StaffAttendanceLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  } | null;
}

export interface StaffWorkRoster {
  id?: string;
  _id?: string;
  staff_id: string;
  location_shift_id: string;
  day_of_week: number;
  is_active?: boolean;
  created_at?: string;
  [key: string]: unknown;
}

export interface StaffWorkRosterQuery {
  staff_id?: string;
  location_shift_id?: string;
  day_of_week?: number;
  is_active?: boolean | string;
}

export interface CleaningTask {
  id?: string;
  _id?: string;
  pod_id?: string;
  booking_id?: string | null;
  cleaner_id?: string;
  shift_assignment_id?: string | null;
  request_source?: CleaningRequestSource | string;
  estimated_start_time?: string | null;
  due_at?: string | null;
  assigned_at?: string | null;
  notified_at?: string | null;
  accepted_at?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: CleaningTaskStatus | string;
  note?: string | null;
  rejection_reason?: string | null;
  reassigned_from_cleaner_id?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface CleaningTaskQuery {
  status?: CleaningTaskStatus | string;
  request_source?: CleaningRequestSource | string;
  due_from?: string;
  due_to?: string;
  shift_assignment_id?: string;
  pod_id?: string;
  booking_id?: string;
}

export interface UpdateCleaningTaskPayload {
  pod_id?: string;
  booking_id?: string | null;
  cleaner_id?: string;
  shift_assignment_id?: string | null;
  request_source?: CleaningRequestSource | string;
  estimated_start_time?: string | null;
  due_at?: string | null;
  assigned_at?: string | null;
  notified_at?: string | null;
  accepted_at?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: CleaningTaskStatus | string;
  note?: string | null;
  rejection_reason?: string | null;
  reassigned_from_cleaner_id?: string | null;
}

export interface CleaningPhoto {
  id?: string;
  cleaning_task_id: string;
  photo_url: string;
  type: CleaningPhotoType;
  created_at?: string;
  [key: string]: unknown;
}

export interface CreateCleaningPhotoPayload {
  cleaning_task_id: string;
  photo_url: string;
  type: CleaningPhotoType;
}

export interface CreateCleaningPhotoUploadPayload {
  cleaning_task_id: string;
  local_uri: string;
  type: CleaningPhotoType;
}

export interface UpdateCleaningPhotoPayload {
  cleaning_task_id?: string;
  photo_url?: string;
  type?: CleaningPhotoType;
}

export interface Incident {
  id?: string;
  pod_id?: string;
  booking_id?: string | null;
  cleaning_task_id?: string | null;
  shift_assignment_id?: string | null;
  reported_by?: string;
  description: string;
  severity?: IncidentSeverity | string;
  status?: IncidentStatus | string;
  incident_type?: IncidentType | string;
  details?: IncidentDetailLine[];
  damaged_items?: IncidentDamagedItem[];
  item_id?: string | null;
  item_name_snapshot?: string | null;
  unit_cost_snapshot?: number | null;
  quantity_affected?: number | null;
  estimated_item_value?: number | null;
  estimated_service_fee?: number | null;
  estimated_total_value?: number | null;
  pricing_source?: string | null;
  has_lost_found?: boolean;
  photo_urls?: string[];
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface CreateOperationalIncidentPayload {
  cleaning_task_id?: string;
  pod_id?: string;
  booking_id?: string;
  description: string;
  severity?: IncidentSeverity;
  local_uris: string[];
}

export interface CreateIncidentFromCleaningTaskPayload extends CreateOperationalIncidentPayload {}

/**
 * Deprecated: Use CreateOperationalIncidentPayload instead.
 * Kept for backward compatibility.
 */

export interface DamageReportItem {
  id?: string;
  name?: string;
  unit_cost?: number;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface DamageServiceCatalogItem {
  id?: string;
  name?: string;
  category?: 'CONSTRUCTION' | 'CLEANING' | 'PENALTY' | string | null;
  base_price?: number;
  unit_name?: string | null;
  description?: string | null;
  is_active?: boolean;
  created_at?: string;
  [key: string]: unknown;
}

export interface CreateDamageReportPayload {
  cleaning_task_id?: string;
  pod_id?: string;
  booking_id?: string;
  description: string;
  details?: IncidentDetailLine[];
  // Legacy fallback fields retained for older payload mapping.
  damaged_items?: Array<{
    item_id: string;
    quantity_damaged?: number;
    damage_type?: DamageType;
    note?: string;
  }>;
  item_id?: string;
  quantity_damaged?: number;
  quantity_affected?: number;
  damage_type?: DamageType;
  note?: string;
  estimated_service_fee?: number;
  severity?: IncidentSeverity;
  local_uris: string[];
}

export interface DamageReportResponse {
  report_id?: string;
  incident_type?: 'DAMAGE_REPORT' | string;
  status?: IncidentStatus | string;
  severity?: IncidentSeverity | string;
  description?: string;
  context?: {
    pod_id?: string | null;
    pod_name?: string | null;
    booking_id?: string | null;
    cleaning_task_id?: string | null;
    reported_by?: string | null;
    user_id?: string | null;
    user_name?: string | null;
    cleaner_name?: string | null;
    [key: string]: unknown;
  };
  details?: IncidentDetailLine[];
  damaged_items?: IncidentDamagedItem[];
  pricing?: {
    estimated_item_value?: number;
    estimated_service_fee?: number;
    estimated_total_value?: number;
    currency?: string;
    pricing_source?: string | null;
    [key: string]: unknown;
  };
  photo_urls?: string[];
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface IncidentQuery {
  pod_id?: string;
  pod_ids?: string;
  cleaning_task_id?: string;
  booking_id?: string;
  reported_by?: string;
  incident_type?: IncidentType | string;
  item_id?: string;
  severity?: IncidentSeverity | string;
  status?: IncidentStatus | string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PaginationInfo {
  current_page: number;
  total_pages: number;
  total_items: number;
  items_per_page: number;
}

export interface DamageReportListResponse {
  items: DamageReportResponse[];
  pagination: PaginationInfo | null;
}

export interface LostFoundItem {
  id?: string;
  _id?: string;
  pod_id?: string | null;
  booking_id?: string | null;
  found_by_user_id?: string;
  warehouse_id?: string | null;
  item_name: string;
  description?: string | null;
  photo_url?: string | null;
  found_at?: string;
  status?: LostFoundStatus | string;
  claimed_by_user_id?: string | null;
  claimed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  // Populated fields from backend
  pod_name?: string | null;
  warehouse_name?: string | null;
  found_by_user_name?: string | null;
  claimed_by_user_name?: string | null;
  [key: string]: unknown;
}

export interface LostFoundQuery {
  pod_id?: string;
  booking_id?: string;
  found_by_user_id?: string;
  warehouse_id?: string;
  status?: LostFoundStatus | string;
  page?: number;
  limit?: number;
}

export interface CreateLostFoundItemPayload {
  pod_id?: string | null;
  booking_id?: string | null;
  warehouse_id?: string | null;
  item_name: string;
  description?: string;
  found_at?: string;
}

export interface WarehouseListItem {
  id?: string;
  name?: string;
  address?: string | null;
  [key: string]: unknown;
}

export interface UpdateLostFoundStatusPayload {
  status: LostFoundStatus;
}

export interface PodCluster {
  id?: string;
  name?: string;
  location_id?: string;
  description?: string | null;
  [key: string]: unknown;
}

export interface PodDetails {
  id?: string;
  code?: string;
  name?: string;
  status?: string;
  cluster_id?: string;
  [key: string]: unknown;
}

export interface BookingDetails {
  id?: string;
  pod_id?: string;
  order_id?: string;
  start_time?: string;
  end_time?: string;
  status?: string;
  cleaner_access_allowed?: boolean;
  checkin_state?: string;
  [key: string]: unknown;
}

export interface CleanerOnlineKey {
  id?: string;
  booking_id?: string;
  pod_id?: string;
  user_id?: string;
  key_type?: string;
  key_token?: string;
  valid_from?: string;
  valid_to?: string;
  is_revoked?: boolean;
  role?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface MyCleanerKeyByBookingData {
  booking_id?: string;
  booking_status?: string;
  booking_checkin_state?: string;
  online_key?: CleanerOnlineKey;
  [key: string]: unknown;
}

export interface MyCleanerKeyByTaskData extends MyCleanerKeyByBookingData {
  task_id?: string;
  cleaner_id?: string;
}

export type CleanerTaskAction = 'accept' | 'start' | 'complete' | 'reject';
