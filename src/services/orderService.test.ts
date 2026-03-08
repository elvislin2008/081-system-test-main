import { format } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { db } from '../db/database';
import type { Order } from '../db/types';
import { getNextOrderNumber } from './orderService';
import { saveAppSettings } from './settingsService';

function buildOrder(partial: Partial<Order>): Order {
  const now = format(new Date(), "yyyy-MM-dd'T'HH:mm:ssxxx");

  return {
    orderNumber: partial.orderNumber ?? 'TEMP-001',
    tableId: null,
    tableName: '外帶',
    status: 'completed',
    employeeId: 1,
    employeeName: '測試員工',
    subtotal: 100,
    discount: 0,
    total: 100,
    cashReceived: 100,
    changeGiven: 0,
    note: '',
    createdAt: partial.createdAt ?? now,
    completedAt: partial.completedAt ?? now,
  };
}

describe('orderService.getNextOrderNumber', () => {
  it('uses the saved prefix and increments based on today orders', async () => {
    await saveAppSettings({ orderNumberPrefix: 'POS' });

    const today = new Date();
    const todayIso = format(today, "yyyy-MM-dd'T'HH:mm:ssxxx");
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = format(yesterday, "yyyy-MM-dd'T'HH:mm:ssxxx");

    await db.orders.bulkAdd([
      buildOrder({ orderNumber: 'POS-OLD-001', createdAt: yesterdayIso }),
      buildOrder({ orderNumber: 'POS-TODAY-001', createdAt: todayIso }),
      buildOrder({ orderNumber: 'POS-TODAY-002', createdAt: todayIso }),
    ]);

    await expect(getNextOrderNumber()).resolves.toBe(
      `POS-${format(today, 'yyyyMMdd')}-003`
    );
  });
});
