import { AxiosError } from 'axios';

import { apiClient } from '@/services/api';
import type {
    CleanerDailyCheckoutResponse,
    InventoryCheckoutLog,
    InventoryCheckoutLogBulkPayload,
    InventoryCheckoutLogBulkResponse,
    InventoryCheckoutLogQuery,
    InventoryEstimateQuery,
    InventoryEstimateResponse,
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
      `/inventory-checkout-logs/estimate/${cleanerId}`,
      {
        headers: authHeader(token),
        params: compactParams({
          date: query.date,
          include_done: query.include_done,
          warehouse_id: query.warehouse_id,
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

export async function bulkCheckoutInventory(
  token: string,
  payload: InventoryCheckoutLogBulkPayload,
): Promise<InventoryCheckoutLogBulkResponse> {
  try {
    const response = await apiClient.post('/inventory-checkout-logs/bulk', payload, {
      headers: authHeader(token),
    });

    const body = response.data as {
      success?: boolean;
      count?: number;
      data?: InventoryCheckoutLog[];
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

export async function getInventoryCheckoutLogs(
  token: string,
  query: InventoryCheckoutLogQuery = {},
): Promise<InventoryCheckoutLog[]> {
  try {
    const response = await apiClient.get('/inventory-checkout-logs', {
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
    if (Array.isArray(body?.data)) return body.data as InventoryCheckoutLog[];
    if (Array.isArray(body)) return body as InventoryCheckoutLog[];
    return [];
  } catch (error) {
    const msg = getErrorMessage(error, 'Không thể tải lịch sử xuất kho');
    throw new Error(msg);
  }
}

export async function getCleanerDailyCheckoutLogs(
  token: string,
  cleanerId: string,
  date?: string,
): Promise<CleanerDailyCheckoutResponse> {
  try {
    const response = await apiClient.get(
      `/inventory-checkout-logs/daily/${cleanerId}`,
      {
        headers: authHeader(token),
        params: compactParams({ date: date ?? '' }),
      },
    );

    const body = response.data as { success?: boolean; data?: CleanerDailyCheckoutResponse };
    if (body?.data) return body.data;
    return response.data as CleanerDailyCheckoutResponse;
  } catch (error) {
    const msg = getErrorMessage(error, 'Không thể tải lịch sử xuất kho trong ngày');
    throw new Error(msg);
  }
}
