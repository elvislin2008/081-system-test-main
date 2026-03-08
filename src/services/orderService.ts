import { format } from 'date-fns';
import { db } from '../db/database';
import type { CartItem, Order, OrderItem, OrderItemStatus, OrderStatus } from '../db/types';
import {
  applyIngredientStockChange,
  getIngredientUsageForProduct,
  mergeIngredientUsages,
} from './bomService';
import { getSettingValue } from './settingsService';
import { toLocalISOString, getTodayRange } from '../utils/date';

async function buildIngredientUsageForItems(
  items: Array<Pick<CartItem, 'productId' | 'quantity' | 'isCombo' | 'comboItems'>>
) {
  const usages = [];

  for (const item of items) {
    if (item.isCombo && item.comboItems?.length) {
      for (const comboItem of item.comboItems) {
        usages.push(
          ...(await getIngredientUsageForProduct(
            comboItem.productId,
            comboItem.quantity * item.quantity
          ))
        );
      }
      continue;
    }

    usages.push(...(await getIngredientUsageForProduct(item.productId, item.quantity)));
  }

  return mergeIngredientUsages(usages);
}

export async function getNextOrderNumber(): Promise<string> {
  const now = new Date();
  const today = format(now, 'yyyyMMdd');
  const prefix = await getSettingValue('orderNumberPrefix');
  
  const range = getTodayRange();
  
  // Find the highest sequence number for today
  const lastOrder = await db.orders
    .where('createdAt')
    .between(range.startISO, range.endISO, true, true)
    .reverse()
    .first();

  let nextSeq = 1;
  if (lastOrder) {
    const lastSeqMatch = lastOrder.orderNumber.match(/-(\d{3})$/);
    if (lastSeqMatch) {
      nextSeq = parseInt(lastSeqMatch[1], 10) + 1;
    }
  }

  const seq = nextSeq.toString().padStart(3, '0');
  return prefix ? `${prefix}-${today}-${seq}` : `${today}-${seq}`;
}

export async function createOrder(params: {
  items: CartItem[];
  employeeId: number;
  employeeName: string;
  tableId: number | null;
  tableName: string;
  discount: number;
  cashReceived: number;
  note: string;
  status?: OrderStatus;
}): Promise<Order> {
  const orderNumber = await getNextOrderNumber();
  const subtotal = params.items.reduce(
    (sum, item) => sum + (item.unitPrice + item.modifiersTotal) * item.quantity,
    0
  );
  const total = subtotal - params.discount;
  const nowISO = toLocalISOString(new Date());

  const order: Order = {
    orderNumber,
    tableId: params.tableId,
    tableName: params.tableName || '外帶',
    status: params.status || 'pending',
    employeeId: params.employeeId,
    employeeName: params.employeeName,
    subtotal,
    discount: params.discount,
    total,
    cashReceived: params.cashReceived,
    changeGiven: params.cashReceived - total,
    note: params.note,
    createdAt: nowISO,
    completedAt: params.status === 'completed' ? nowISO : '',
  };

  const orderId = await db.orders.add(order);

  const orderItems: OrderItem[] = params.items.map((item) => ({
    orderId: orderId as number,
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    modifiers: item.modifiers,
    modifiersTotal: item.modifiersTotal,
    subtotal: (item.unitPrice + item.modifiersTotal) * item.quantity,
    note: item.note,
    itemStatus: 'pending' as OrderItemStatus,
    isCombo: item.isCombo,
    comboItems: item.comboItems,
  }));

  await db.orderItems.bulkAdd(orderItems);

  const ingredientUsages = await buildIngredientUsageForItems(params.items);
  if (ingredientUsages.length > 0) {
    await applyIngredientStockChange({
      usages: ingredientUsages,
      employeeId: params.employeeId,
      note: `訂單 ${orderNumber}`,
      orderId: orderId as number,
      type: 'sale',
    });
  }

  if (params.tableId) {
    const tableStatus = (order.status === 'completed' || order.status === 'cancelled') ? 'cleaning' : 'occupied';
    const currentOrderId = (order.status === 'completed' || order.status === 'cancelled') ? null : (orderId as number);
    
    await db.diningTables.where('id').equals(params.tableId).modify({
      status: tableStatus,
      currentOrderId: currentOrderId,
    });
  }

  return { ...order, id: orderId as number };
}

export async function updateOrderStatus(orderId: number, status: OrderStatus): Promise<void> {
  const updates: Partial<Order> = { status };
  if (status === 'completed') {
    updates.completedAt = toLocalISOString(new Date());
  }
  await db.orders.update(orderId, updates);

  if (status === 'completed' || status === 'cancelled') {
    const order = await db.orders.get(orderId);
    if (order?.tableId) {
      await db.diningTables.where('id').equals(order.tableId).modify({
        status: 'cleaning',
        currentOrderId: null,
      });
    }
  }
}

export async function getOrderWithItems(orderId: number) {
  const order = await db.orders.get(orderId);
  if (!order) {
    return null;
  }
  const items = await db.orderItems.where('orderId').equals(orderId).toArray();
  return { order, items };
}

export async function getTodayOrders(): Promise<Order[]> {
  const range = getTodayRange();
  return db.orders
    .where('createdAt')
    .between(range.startISO, range.endISO, true, true)
    .reverse()
    .toArray();
}

export async function cancelOrder(orderId: number): Promise<void> {
  const order = await db.orders.get(orderId);
  if (!order) {
    return;
  }

  const items = await db.orderItems.where('orderId').equals(orderId).toArray();
  const ingredientUsages = await buildIngredientUsageForItems(items);

  if (ingredientUsages.length > 0) {
    await applyIngredientStockChange({
      usages: ingredientUsages,
      employeeId: order.employeeId,
      note: `取消訂單 ${order.orderNumber}`,
      orderId,
      type: 'adjustment',
      restore: true,
    });
  }

  await updateOrderStatus(orderId, 'cancelled');
}

export async function deleteOrder(orderId: number, options: { restoreInventory?: boolean } = { restoreInventory: true }): Promise<void> {
  const order = await db.orders.get(orderId);
  if (!order) return;

  // 1. Restore inventory if not already cancelled and restoration is requested
  if (order.status !== 'cancelled' && options.restoreInventory !== false) {
    const items = await db.orderItems.where('orderId').equals(orderId).toArray();
    const ingredientUsages = await buildIngredientUsageForItems(items);
    if (ingredientUsages.length > 0) {
      await applyIngredientStockChange({
        usages: ingredientUsages,
        employeeId: order.employeeId,
        note: `刪除訂單 ${order.orderNumber}`,
        orderId,
        type: 'adjustment',
        restore: true,
      });
    }
  }

  // 2. Clear table status if occupied by this order
  if (order.tableId) {
    const table = await db.diningTables.get(order.tableId);
    if (table?.currentOrderId === orderId) {
      await db.diningTables.update(order.tableId, {
        status: 'available',
        currentOrderId: null
      });
    }
  }

  // 3. Delete related records
  await db.transaction('rw', [db.orders, db.orderItems, db.inventoryTransactions], async () => {
    await db.orderItems.where('orderId').equals(orderId).delete();
    await db.inventoryTransactions.where('orderId').equals(orderId).delete();
    await db.orders.delete(orderId);
  });
}

export async function updateOrderItemStatus(
  orderItemId: number,
  status: OrderItemStatus
): Promise<void> {
  await db.orderItems.update(orderItemId, { itemStatus: status });

  const item = await db.orderItems.get(orderItemId);
  if (!item) {
    return;
  }

  const allItems = await db.orderItems.where('orderId').equals(item.orderId).toArray();
  const allCompleted = allItems.every((orderItem) => orderItem.itemStatus === 'completed');
  const order = await db.orders.get(item.orderId);
  if (!order) {
    return;
  }

  if (allCompleted) {
    if (order.status === 'pending' || order.status === 'preparing') {
      await updateOrderStatus(item.orderId, 'ready');
    }
    return;
  }

  if (order.status === 'ready') {
    await updateOrderStatus(item.orderId, 'preparing');
  }
}
