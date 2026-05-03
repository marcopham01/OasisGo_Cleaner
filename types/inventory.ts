export interface InventorySuggestedStock {
  inventory_stock_id: string;
  warehouse_id: string | null;
  warehouse_name: string | null;
  quantity_available: number;
}

export interface InventoryEstimationItem {
  item_id: string;
  item_name: string | null;
  required_quantity: number;
  available_quantity: number;
  shortage_quantity: number;
  suggested_stocks: InventorySuggestedStock[];
}

export interface InventoryEstimateSummary {
  total_required_quantity: number;
  total_available_quantity: number;
  total_shortage_quantity: number;
}

export interface InventoryEstimateResponse {
  cleaner_id: string;
  date: string;
  day_start: string;
  day_end: string;
  shift_assignment_ids: string[];
  location_ids: string[];
  task_count: number;
  pod_count: number;
  warehouse_scope_ids: string[];
  items: InventoryEstimationItem[];
  summary: InventoryEstimateSummary;
}

export interface InventoryEstimateQuery {
  date?: string;
  include_done?: boolean;
  warehouse_id?: string;
}

export interface Warehouse {
  id: string;
  name: string;
  location_id?: string | null;
  [key: string]: unknown;
}

export type InventoryActionType = 'CHECKOUT' | 'RETURN' | 'WASTE' | 'INITIAL' | 'ADJUSTMENT' | 'CONSUMED';

export interface InventoryActivityLogEntry {
  inventory_stock_id: string;
  quantity: number;
  action_type?: InventoryActionType;
  cleaning_task_id?: string | null;
  maintenance_task_id?: string | null;
  shift_assignment_id?: string | null;
  reason?: string | null;
}

export interface InventoryActivityLogBulkPayload {
  staff_id?: string;
  logs: InventoryActivityLogEntry[];
}

export interface InventoryActivityLog {
  id?: string;
  inventory_stock_id: string;
  staff_id: string;
  actor_id?: string | null;
  cleaning_task_id?: string | null;
  maintenance_task_id?: string | null;
  quantity: number;
  action_type: InventoryActionType | string;
  reason?: string | null;
  created_at?: string;
}

export interface InventoryActivityLogBulkResponse {
  count: number;
  logs: InventoryActivityLog[];
}

export interface InventoryActivityLogQuery {
  staff_id?: string;
  inventory_stock_id?: string;
  action_type?: InventoryActionType | string;
  from?: string;
  to?: string;
}

export interface DailyTakenItemsSummaryQuery {
  date?: string;
  cleaner_id?: string;
}

export interface DailyTakenItemSummaryItem {
  item_id: string;
  item_name: string | null;
  checkout_quantity: number;
  return_quantity: number;
  net_quantity: number;
}

export interface DailyTakenItemsSummaryCleaner {
  cleaner_id: string;
  cleaner_name: string | null;
  cleaner_role: string | null;
  total_checkout_quantity: number;
  total_return_quantity: number;
  total_net_quantity: number;
  item_count: number;
  items: DailyTakenItemSummaryItem[];
}

export interface DailyTakenItemsSummaryResponse {
  date: string;
  day_start: string;
  day_end: string;
  cleaner_count: number;
  total_item_count: number;
  total_net_quantity: number;
  cleaners: DailyTakenItemsSummaryCleaner[];
}

// --- Daily activity log (GET /api/inventory-activity-logs/daily/:cleaner_id) ---

export interface DailyActivityLogSummaryItem {
  item_id: string;
  item_name: string | null;
  checkout_quantity: number;
  return_quantity: number;
  waste_quantity: number;
  log_count: number;
}

export interface DailyActivityLogEntry extends InventoryActivityLog {
  item_id: string | null;
  item_name: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
}

export interface CleanerDailyActivityLogResponse {
  cleaner_id: string;
  date: string;
  day_start: string;
  day_end: string;
  /** Total number of logs (all action types) */
  total_log_count: number;
  total_quantity: number;
  summary_by_item: DailyActivityLogSummaryItem[];
  logs: DailyActivityLogEntry[];
}

/** UI-level item with user-editable checkout quantity */
export interface CheckoutDraftItem {
  item_id: string;
  item_name: string;
  required_quantity: number;
  available_quantity: number;
  shortage_quantity: number;
  /** The selected/best stock entry from suggested_stocks */
  selectedStock: InventorySuggestedStock | null;
  /** Quantity the cleaner intends to check out (editable) */
  checkoutQuantity: number;
}

/** UI-level item with user-editable return quantity */
export interface ReturnDraftItem {
  inventory_stock_id: string;
  item_id: string | null;
  cleaning_task_id: string | null;
  item_name: string | null;
  warehouse_name: string | null;
  /** Total quantity checked out today for this stock+task combination */
  checked_out: number;
  /** Total quantity already returned today for this stock+task combination */
  already_returned: number;
  /** Net quantity currently held according to getDailyTakenItemsSummary (CHECKOUT - RETURN - CONSUMED - WASTE).
   *  null = summary API not yet loaded / failed. */
  held_quantity: number | null;
  /** Quantity the cleaner intends to return */
  returnQuantity: number;
}

// --- Free checkout (all items in warehouse) ---

export interface InventoryStockItem {
  _id?: string;
  inventory_stock_id?: string;
  item_id: string;
  item_name?: string | null;
  warehouse_id?: string | null;
  warehouse_name?: string | null;
  quantity_available: number;
  item_type?: string | null;
}

export interface InventoryStockQuery {
  warehouse_id?: string;
}

/** UI-level item for free (non-task) checkout */
export interface FreeCheckoutDraftItem {
  inventory_stock_id: string;
  item_id: string;
  item_name: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  available_quantity: number;
  checkoutQuantity: number;
}
