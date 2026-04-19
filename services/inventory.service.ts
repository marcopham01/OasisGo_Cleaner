import { AxiosError } from 'axios';

import { apiClient } from '@/services/api';
import type {
    CleanerDailyActivityLogResponse,
    DailyTakenItemsSummaryQuery,
    DailyTakenItemsSummaryResponse,
    InventoryActivityLog,
    InventoryActivityLogBulkPayload,
    InventoryActivityLogBulkResponse,
    InventoryActivityLogQuery,
    InventoryEstimateQuery,
    InventoryEstimateResponse,
    InventoryStockItem,
    InventoryStockQuery,
    Warehouse,
} from '@/types/inventory';
import { normalizeBackendMessage } from '@/utils/validation';

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as AxiosError<{ message?: string }>;
  const serverMessage = axiosError.response?.data?.message;
  if (serverMessage) return normalizeBackendMessage(serverMessage);
  if (error instanceof Error && error.message) return normalizeBackendMessage(error.message);
  return fallback;
}

function compactParams(params: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
}

export async function getInventoryEstimate(
  token: string,
  cleanerId: string,
  query: InventoryEstimateQuery = {},
): Promise<InventoryEstimateResponse> {
  try {
    const response = await apiClient.get(
      `/inventory-activity-logs/estimate/${cleanerId}`,
      {
        headers: authHeader(token),
        params: compactParams({
          date: query.date,
          include_done: query.include_done,
          warehouse_id: query.warehouse_id,
          tz: 'Asia/Ho_Chi_Minh',
        }),
      },
    );

    const body = response.data as { success?: boolean; data?: InventoryEstimateResponse };
    if (body?.data) return body.data;
    return response.data as InventoryEstimateResponse;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    const raw = axiosError.response?.data?.message ?? '';
    const msg = getErrorMessage(error, 'Không thể tải nhu cầu vật tư');
    const wrapped = new Error(msg) as Error & { rawBackendMessage?: string; statusCode?: number };
    if (raw) wrapped.rawBackendMessage = raw;
    wrapped.statusCode = axiosError.response?.status;
    throw wrapped;
  }
}

export async function getWarehouses(token: string): Promise<Warehouse[]> {
  try {
    const response = await apiClient.get('/warehouses', {
      headers: authHeader(token),
    });

    const body = response.data as { success?: boolean; data?: unknown; count?: number };
    if (Array.isArray(body?.data)) return body.data as Warehouse[];
    if (Array.isArray(body)) return body as Warehouse[];
    return [];
  } catch (error) {
    const msg = getErrorMessage(error, 'Không thể tải danh sách kho');
    throw new Error(msg);
  }
}

export async function bulkCreateInventoryActivityLogs(
  token: string,
  payload: InventoryActivityLogBulkPayload,
): Promise<InventoryActivityLogBulkResponse> {
  try {
    const response = await apiClient.post('/inventory-activity-logs/bulk', payload, {
      headers: authHeader(token),
    });

    const body = response.data as {
      success?: boolean;
      count?: number;
      data?: InventoryActivityLog[];
    };

    return {
      count: body.count ?? (body.data?.length ?? 0),
      logs: body.data ?? [],
    };
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    const raw = axiosError.response?.data?.message ?? '';
    const msg = getErrorMessage(error, 'Không thể xuất kho');
    const wrapped = new Error(msg) as Error & { rawBackendMessage?: string; statusCode?: number };
    if (raw) wrapped.rawBackendMessage = raw;
    wrapped.statusCode = axiosError.response?.status;
    throw wrapped;
  }
}

export async function getAllInventoryStocks(
  token: string,
  query: InventoryStockQuery = {},
): Promise<InventoryStockItem[]> {
  try {
    // Fetch stocks + item catalog + warehouses in parallel to join names
    const [stocksRes, itemsRes, warehousesRes] = await Promise.all([
      apiClient.get('/inventory-stocks', {
        headers: authHeader(token),
        params: compactParams({ warehouse_id: query.warehouse_id }),
      }),
      apiClient.get('/items', { headers: authHeader(token) }).catch(() => ({ data: [] })),
      apiClient.get('/warehouses', { headers: authHeader(token) }).catch(() => ({ data: [] })),
    ]);

    const stocksBody = stocksRes.data as { success?: boolean; data?: unknown };
    const rawStocks: Array<Record<string, unknown>> = Array.isArray(stocksBody?.data)
      ? (stocksBody.data as Array<Record<string, unknown>>)
      : Array.isArray(stocksBody)
        ? (stocksBody as unknown as Array<Record<string, unknown>>)
        : [];

    const itemsBody = itemsRes.data as { success?: boolean; data?: unknown };
    const rawItems: Array<{ id?: string; _id?: string; name?: string; item_type?: string }> = Array.isArray(itemsBody?.data)
      ? (itemsBody.data as Array<{ id?: string; _id?: string; name?: string; item_type?: string }>)
      : [];
    // Index by both custom `id` AND `_id` to handle Mongoose virtual id collision
    const itemMap = new Map<string, { id?: string; _id?: string; name?: string; item_type?: string }>();
    for (const i of rawItems) {
      if (i.id) itemMap.set(i.id, i);
      if (i._id && String(i._id) !== i.id) itemMap.set(String(i._id), i);
    }

    const whBody = warehousesRes.data as { success?: boolean; data?: unknown };
    const rawWarehouses: Array<{ id?: string; _id?: string; name?: string }> = Array.isArray(whBody?.data)
      ? (whBody.data as Array<{ id?: string; _id?: string; name?: string }>)
      : [];
    // Same dual-key for warehouses
    const warehouseMap = new Map<string, { id?: string; _id?: string; name?: string }>();
    for (const w of rawWarehouses) {
      if (w.id) warehouseMap.set(w.id, w);
      if (w._id && String(w._id) !== w.id) warehouseMap.set(String(w._id), w);
    }

    return rawStocks.map((s) => {
      const itemId = String(s.item_id ?? '');
      const warehouseId = String(s.warehouse_id ?? '');
      const itemRecord = itemMap.get(itemId);
      const warehouseRecord = warehouseMap.get(warehouseId);
      return {
        _id: String(s._id ?? ''),
        inventory_stock_id: String(s.id ?? s._id ?? ''),
        item_id: itemId,
        item_name: itemRecord?.name ?? null,
        item_type: itemRecord?.item_type ?? null,
        warehouse_id: warehouseId || null,
        warehouse_name: warehouseRecord?.name ?? null,
        quantity_available: Number(s.quantity_available ?? 0),
      } satisfies InventoryStockItem;
    });
  } catch (error) {
    const msg = getErrorMessage(error, 'Không thể tải danh sách vật tư');
    throw new Error(msg);
  }
}

export async function getInventoryActivityLogs(
  token: string,
  query: InventoryActivityLogQuery = {},
): Promise<InventoryActivityLog[]> {
  try {
    const response = await apiClient.get('/inventory-activity-logs', {
      headers: authHeader(token),
      params: compactParams({
        staff_id: query.staff_id,
        inventory_stock_id: query.inventory_stock_id,
        action_type: query.action_type,
        from: query.from,
        to: query.to,
      }),
    });

    const body = response.data as { success?: boolean; data?: unknown; count?: number };
    if (Array.isArray(body?.data)) return body.data as InventoryActivityLog[];
    if (Array.isArray(body)) return body as InventoryActivityLog[];
    return [];
  } catch (error) {
    const msg = getErrorMessage(error, 'Không thể tải lịch sử xuất kho');
    throw new Error(msg);
  }
}

export async function getCleanerDailyActivityLogs(
  token: string,
  cleanerId: string,
  date?: string,
): Promise<CleanerDailyActivityLogResponse> {
  try {
    const response = await apiClient.get(
      `/inventory-activity-logs/daily/${cleanerId}`,
      {
        headers: authHeader(token),
        params: compactParams({ date: date ?? '', tz: 'Asia/Ho_Chi_Minh' }),
      },
    );

    const body = response.data as { success?: boolean; data?: CleanerDailyActivityLogResponse };
    const raw: CleanerDailyActivityLogResponse = body?.data ?? (response.data as CleanerDailyActivityLogResponse);
    return {
      ...raw,
      logs: Array.isArray(raw?.logs) ? raw.logs : [],
      summary_by_item: Array.isArray(raw?.summary_by_item) ? raw.summary_by_item : [],
    };
  } catch (error) {
    const msg = getErrorMessage(error, 'Không thể tải lịch sử xuất kho trong ngày');
    throw new Error(msg);
  }
}

export async function getDailyTakenItemsSummary(
  token: string,
  query: DailyTakenItemsSummaryQuery = {},
): Promise<DailyTakenItemsSummaryResponse> {
  try {
    const response = await apiClient.get('/inventory-activity-logs/daily-taken-summary', {
      headers: authHeader(token),
      params: compactParams({
        date: query.date,
        cleaner_id: query.cleaner_id,
        tz: 'Asia/Ho_Chi_Minh',
      }),
    });

    const body = response.data as { success?: boolean; data?: DailyTakenItemsSummaryResponse };
    const raw = body?.data ?? (response.data as DailyTakenItemsSummaryResponse);

    return {
      ...raw,
      cleaners: Array.isArray(raw?.cleaners) ? raw.cleaners : [],
    } as DailyTakenItemsSummaryResponse;
  } catch (error) {
    const msg = getErrorMessage(error, 'Không thể tải danh sách vật tư đang giữ');
    throw new Error(msg);
  }
}
