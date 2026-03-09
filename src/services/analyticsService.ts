import { eachDayOfInterval, format } from 'date-fns';
import * as XLSX from 'xlsx';
import { db } from '../db/database';
import type { DailySummary } from '../db/types';
import { toLocalISOString } from '../utils/date';

export interface AnalyticsTopItem {
  name: string;
  quantity: number;
  revenue: number;
}

export interface RevenueByDayPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface HourlyBreakdownPoint {
  hour: number;
  orders: number;
  revenue: number;
}

export interface TimeSlotBreakdownPoint {
  key: string;
  label: string;
  hoursLabel: string;
  orders: number;
  revenue: number;
  averageOrderValue: number;
}

export interface AnalyticsData {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  topItems: AnalyticsTopItem[];
  revenueByDay: RevenueByDayPoint[];
  hourlyBreakdown: HourlyBreakdownPoint[];
  timeSlotBreakdown: TimeSlotBreakdownPoint[];
  peakTimeSlot: TimeSlotBreakdownPoint | null;
  totalCost: number;
}

export interface AnalyticsWorkbookParams {
  data: AnalyticsData;
  currency: string;
  rangeLabel: string;
  generatedAt?: Date;
}

interface AnalyticsOrderLike {
  createdAt: string;
  total: number;
}

interface TimeSlotDefinition {
  key: string;
  label: string;
  hoursLabel: string;
  includesHour: (hour: number) => boolean;
}

/**
 * Extracts the local hour part from an ISO 8601 string (e.g. "2026-03-08T12:00:00+08:00")
 * without being affected by the current system's timezone.
 */
export function getWallClockHour(isoString: string): number {
  // Directly extract hour from ISO string like "2026-03-08T20:45:00+08:00" or "2026-03-08T20:45:00Z"
  const tIndex = isoString.indexOf('T');
  if (tIndex === -1) return new Date(isoString).getHours();

  const hourStr = isoString.slice(tIndex + 1, tIndex + 3);
  const hour = parseInt(hourStr, 10);
  return isNaN(hour) ? new Date(isoString).getHours() : hour;
}


const TIME_SLOT_DEFINITIONS: TimeSlotDefinition[] = [
  {
    key: 'breakfast',
    label: '早餐',
    hoursLabel: '06:00-10:59',
    includesHour: (hour) => hour >= 6 && hour < 11,
  },
  {
    key: 'lunch',
    label: '午餐',
    hoursLabel: '11:00-14:59',
    includesHour: (hour) => hour >= 11 && hour < 15,
  },
  {
    key: 'afternoon',
    label: '下午茶',
    hoursLabel: '15:00-16:59',
    includesHour: (hour) => hour >= 15 && hour < 17,
  },
  {
    key: 'dinner',
    label: '晚餐',
    hoursLabel: '17:00-20:59',
    includesHour: (hour) => hour >= 17 && hour < 21,
  },
  {
    key: 'lateNight',
    label: '宵夜',
    hoursLabel: '21:00-05:59',
    includesHour: (hour) => hour >= 21 || hour < 6,
  },
];

function buildTopItems(
  orderItemsByOrder: Array<Array<{ productName: string; quantity: number; subtotal: number }>>
): AnalyticsTopItem[] {
  const itemMap = new Map<string, { quantity: number; revenue: number }>();

  orderItemsByOrder.forEach((items) => {
    items.forEach((item) => {
      const current = itemMap.get(item.productName) ?? { quantity: 0, revenue: 0 };
      current.quantity += item.quantity;
      current.revenue += item.subtotal;
      itemMap.set(item.productName, current);
    });
  });

  return Array.from(itemMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((left, right) => right.quantity - left.quantity || right.revenue - left.revenue)
    .slice(0, 10);
}

function buildRevenueByDay(orders: AnalyticsOrderLike[], startDate: Date | string, endDate: Date | string): RevenueByDayPoint[] {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  const dayMap = new Map<string, { revenue: number; orders: number }>();

  eachDayOfInterval({ start, end }).forEach((day) => {
    dayMap.set(format(day, 'MM/dd'), { revenue: 0, orders: 0 });
  });

  orders.forEach((order) => {
    const key = format(new Date(order.createdAt), 'MM/dd');
    const current = dayMap.get(key) ?? { revenue: 0, orders: 0 };
    current.revenue += order.total;
    current.orders += 1;
    dayMap.set(key, current);
  });

  return Array.from(dayMap.entries()).map(([date, data]) => ({
    date,
    ...data,
  }));
}

function buildHourlyBreakdown(orders: AnalyticsOrderLike[]): HourlyBreakdownPoint[] {
  const hourMap = new Map<number, { orders: number; revenue: number }>();

  for (let hour = 0; hour < 24; hour += 1) {
    hourMap.set(hour, { orders: 0, revenue: 0 });
  }

  orders.forEach((order) => {
    const hour = getWallClockHour(order.createdAt);
    const current = hourMap.get(hour);
    if (!current) {
      return;
    }

    current.orders += 1;
    current.revenue += order.total;
  });

  return Array.from(hourMap.entries())
    .map(([hour, data]) => ({ hour, ...data }))
    .filter((entry) => entry.hour >= 6 && entry.hour <= 23);
}

export function buildTimeSlotBreakdown(orders: AnalyticsOrderLike[]): TimeSlotBreakdownPoint[] {
  const slotMap = new Map<string, { orders: number; revenue: number }>();

  TIME_SLOT_DEFINITIONS.forEach((slot) => {
    slotMap.set(slot.key, { orders: 0, revenue: 0 });
  });

  orders.forEach((order) => {
    const hour = getWallClockHour(order.createdAt);
    const slot = TIME_SLOT_DEFINITIONS.find((definition) => definition.includesHour(hour));
    if (!slot) {
      return;
    }

    const current = slotMap.get(slot.key);
    if (!current) {
      return;
    }

    current.orders += 1;
    current.revenue += order.total;
  });

  return TIME_SLOT_DEFINITIONS.map((slot) => {
    const current = slotMap.get(slot.key) ?? { orders: 0, revenue: 0 };
    return {
      key: slot.key,
      label: slot.label,
      hoursLabel: slot.hoursLabel,
      orders: current.orders,
      revenue: current.revenue,
      averageOrderValue: current.orders > 0 ? Math.round(current.revenue / current.orders) : 0,
    };
  });
}

function getPeakTimeSlot(timeSlotBreakdown: TimeSlotBreakdownPoint[]): TimeSlotBreakdownPoint | null {
  return timeSlotBreakdown.reduce<TimeSlotBreakdownPoint | null>((best, current) => {
    if (!best) {
      return current.orders > 0 ? current : null;
    }

    if (current.revenue > best.revenue) {
      return current;
    }

    if (current.revenue === best.revenue && current.orders > best.orders) {
      return current;
    }

    return best;
  }, null);
}

export async function getAnalytics(startDate: Date | string, endDate: Date | string): Promise<AnalyticsData> {
  const startISO = typeof startDate === 'string' ? startDate : toLocalISOString(startDate);
  const endISO = typeof endDate === 'string' ? endDate : toLocalISOString(endDate);

  const orders = await db.orders
    .where('createdAt')
    .between(startISO, endISO, true, true)
    .filter((order) => order.status !== 'cancelled')
    .toArray();

  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  const totalOrders = orders.length;
  const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  const orderItemsByOrder = await Promise.all(
    orders
      .filter((order): order is typeof order & { id: number } => typeof order.id === 'number')
      .map((order) => db.orderItems.where('orderId').equals(order.id).toArray())
  );

  const topItems = buildTopItems(orderItemsByOrder);
  const revenueByDay = buildRevenueByDay(orders, startDate, endDate);
  const hourlyBreakdown = buildHourlyBreakdown(orders);
  const timeSlotBreakdown = buildTimeSlotBreakdown(orders);

  // --- Calculate Total Ingredient Cost ---
  const [ingredients, recipes, allProducts] = await Promise.all([
    db.ingredients.toArray(),
    db.productRecipes.toArray(),
    db.products.toArray(),
  ]);

  const ingredientCostMap = new Map(ingredients.map((ing) => [ing.id!, ing.costPerUnit]));
  const recipeMap = new Map<number, typeof recipes>();
  recipes.forEach((r) => {
    const list = recipeMap.get(r.productId) || [];
    list.push(r);
    recipeMap.set(r.productId, list);
  });
  const productMap = new Map(allProducts.map((p) => [p.id!, p]));

  const calculateItemCost = (productId: number, quantity: number): number => {
    const product = productMap.get(productId);
    if (!product) return 0;

    if (product.isCombo && product.comboItems) {
      return (
        product.comboItems.reduce((sum, comboItem) => {
          return sum + calculateItemCost(comboItem.productId, comboItem.quantity);
        }, 0) * quantity
      );
    }

    const itemRecipes = recipeMap.get(productId) || [];
    return (
      itemRecipes.reduce((sum, r) => {
        const costPerUnit = ingredientCostMap.get(r.ingredientId) || 0;
        return sum + costPerUnit * r.quantity;
      }, 0) * quantity
    );
  };

  let totalCost = 0;
  orderItemsByOrder.forEach((orderItems) => {
    orderItems.forEach((item) => {
      totalCost += calculateItemCost(item.productId, item.quantity);
    });
  });

  return {
    totalRevenue,
    totalOrders,
    averageOrderValue,
    topItems,
    revenueByDay,
    hourlyBreakdown,
    timeSlotBreakdown,
    peakTimeSlot: getPeakTimeSlot(timeSlotBreakdown),
    totalCost,
  };
}


export function buildAnalyticsWorkbook({
  data,
  currency,
  rangeLabel,
  generatedAt = new Date(),
}: AnalyticsWorkbookParams): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // 1. Summary Sheet
  const summaryData = [
    ['欄位', '數值'],
    ['報表區間', rangeLabel],
    ['匯出時間', format(generatedAt, 'yyyy/MM/dd HH:mm')],
    ['總營收', data.totalRevenue],
    ['總訂單數', data.totalOrders],
    ['平均客單價', data.averageOrderValue],
    ['貨幣符號', currency],
    ['尖峰時段', data.peakTimeSlot ? `${data.peakTimeSlot.label} (${data.peakTimeSlot.hoursLabel})` : '-'],
    ['總食材成本', data.totalCost],
    ['毛利', data.totalRevenue - data.totalCost],
    ['毛利率', data.totalRevenue > 0 ? `${(((data.totalRevenue - data.totalCost) / data.totalRevenue) * 100).toFixed(1)}%` : '0%'],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 16 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, '摘要');

  // 2. Time Slot Analysis Sheet
  const timeSlotData = [
    ['時段', '時間範圍', '訂單數', '營收', '平均客單價'],
    ...data.timeSlotBreakdown.map((slot) => [
      slot.label,
      slot.hoursLabel,
      slot.orders,
      slot.revenue,
      slot.averageOrderValue,
    ]),
  ];
  const wsTimeSlot = XLSX.utils.aoa_to_sheet(timeSlotData);
  wsTimeSlot['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsTimeSlot, '時段分析');

  // 3. Daily Revenue Sheet
  const dailyData = [
    ['日期', '訂單數', '營收'],
    ...data.revenueByDay.map((entry) => [entry.date, entry.orders, entry.revenue]),
  ];
  const wsDaily = XLSX.utils.aoa_to_sheet(dailyData);
  wsDaily['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsDaily, '每日營收');

  // 4. Hourly Breakdown Sheet
  const hourlyData = [
    ['小時', '訂單數', '營收'],
    ...data.hourlyBreakdown.map((entry) => [`${entry.hour}:00`, entry.orders, entry.revenue]),
  ];
  const wsHourly = XLSX.utils.aoa_to_sheet(hourlyData);
  wsHourly['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsHourly, '每小時分析');

  // 5. Top Items Sheet
  const topItemsData = [
    ['商品', '數量', '營收'],
    ...data.topItems.map((item) => [item.name, item.quantity, item.revenue]),
  ];
  const wsTopItems = XLSX.utils.aoa_to_sheet(topItemsData);
  wsTopItems['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsTopItems, '熱銷商品');

  return wb;
}



export async function generateDailySummary(date: string): Promise<DailySummary> {
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59`);
  const analytics = await getAnalytics(dayStart, dayEnd);

  const summary: DailySummary = {
    date,
    totalOrders: analytics.totalOrders,
    totalRevenue: analytics.totalRevenue,
    totalDiscount: 0,
    averageOrderValue: analytics.averageOrderValue,
    topSellingItems: analytics.topItems.map((item) => ({
      productId: 0,
      name: item.name,
      quantity: item.quantity,
    })),
    hourlyBreakdown: analytics.hourlyBreakdown,
    createdAt: new Date().toISOString(),
  };

  const existing = await db.dailySummaries.where('date').equals(date).first();
  if (existing?.id) {
    await db.dailySummaries.put({ ...summary, id: existing.id });
  } else {
    await db.dailySummaries.add(summary);
  }

  return summary;
}
