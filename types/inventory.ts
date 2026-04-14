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
  [key: string]: unknown;
}

export type InventoryActionType = 'CHECKOUT' | 'RETURN' | 'WASTE' | 'INITIAL' | 'ADJUSTMENT';

export interface InventoryCheckoutLogEntry {
  inventory_stock_id: string;
  quantity: number;
  action_type?: InventoryActionType;
  cleaning_task_id?: string | null;
  maintenance_task_id?: string | null;
  shift_assignment_id?: string | null;
  reason?: string | null;
}

export interface InventoryCheckoutLogBulkPayload {
  staff_id?: string;
  logs: InventoryCheckoutLogEntry[];
}

export interface InventoryCheckoutLog {
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

export interface InventoryCheckoutLogBulkResponse {
  count: number;
  logs: InventoryCheckoutLog[];
}

export interface InventoryCheckoutLogQuery {
  staff_id?: string;
  inventory_stock_id?: string;
  action_type?: InventoryActionType | string;
  from?: string;
  to?: string;
}

// --- Daily checkout log (GET /api/inventory-checkout-logs/daily/:cleaner_id) ---

export interface DailyCheckoutLogSummaryItem {
  item_id: string;
  item_name: string | null;
  total_quantity: number;
  log_count: number;
}

export interface DailyCheckoutLogEntry extends InventoryCheckoutLog {
  item_id: string | null;
  item_name: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
}

export interface CleanerDailyCheckoutResponse {
  cleaner_id: string;
  date: string;
  day_start: string;
  day_end: string;
  total_checkout_count: number;
  total_quantity: number;
  summary_by_item: DailyCheckoutLogSummaryItem[];
  logs: DailyCheckoutLogEntry[];
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
