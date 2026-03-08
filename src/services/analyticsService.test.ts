import { describe, expect, it } from 'vitest';
import {
  buildAnalyticsWorkbook,
  buildTimeSlotBreakdown,
  getWallClockHour,
  type AnalyticsData,
} from './analyticsService';

describe('analyticsService', () => {
  describe('getWallClockHour', () => {
    it('extracts the local hour directly from the ISO string irrespective of the timezone offset', () => {
      // These illustrate that we are now parsing characters 11-13
      expect(getWallClockHour('2026-03-08T08:15:00+08:00')).toBe(8);
      expect(getWallClockHour('2026-03-08T12:30:00+08:00')).toBe(12);
      expect(getWallClockHour('2026-03-08T20:45:00+08:00')).toBe(20);
      expect(getWallClockHour('2026-03-08T20:45:00Z')).toBe(20);
      expect(getWallClockHour('2026-03-08T20:45:00')).toBe(20);
    });
  });

  describe('buildTimeSlotBreakdown', () => {
    it('correctly categorizes orders into predefined time slots using local time', () => {
      const orders = [
        { createdAt: '2026-03-08T08:15:00+08:00', total: 120 },
        { createdAt: '2026-03-08T12:20:00+08:00', total: 220 },
        { createdAt: '2026-03-08T12:50:00+08:00', total: 180 },
        { createdAt: '2026-03-08T15:10:00+08:00', total: 90 },
        { createdAt: '2026-03-08T18:05:00+08:00', total: 260 },
        { createdAt: '2026-03-08T22:40:00+08:00', total: 150 },
      ];

      const breakdown = buildTimeSlotBreakdown(orders);

      expect(breakdown).toEqual([
        expect.objectContaining({ key: 'breakfast', orders: 1, revenue: 120, averageOrderValue: 120 }),
        expect.objectContaining({ key: 'lunch', orders: 2, revenue: 400, averageOrderValue: 200 }),
        expect.objectContaining({ key: 'afternoon', orders: 1, revenue: 90, averageOrderValue: 90 }),
        expect.objectContaining({ key: 'dinner', orders: 1, revenue: 260, averageOrderValue: 260 }),
        expect.objectContaining({ key: 'lateNight', orders: 1, revenue: 150, averageOrderValue: 150 }),
      ]);
    });
  });

  it('builds an Excel-compatible workbook with summary and time slot sheets', () => {
    const data: AnalyticsData = {
      totalRevenue: 1020,
      totalOrders: 6,
      averageOrderValue: 170,
      topItems: [
        { name: '雞腿飯', quantity: 3, revenue: 390 },
      ],
      revenueByDay: [
        { date: '03/08', orders: 6, revenue: 1020 },
      ],
      hourlyBreakdown: [
        { hour: 8, orders: 1, revenue: 120 },
        { hour: 12, orders: 2, revenue: 400 },
      ],
      timeSlotBreakdown: buildTimeSlotBreakdown([
        { createdAt: '2026-03-08T08:15:00+08:00', total: 120 },
        { createdAt: '2026-03-08T12:20:00+08:00', total: 220 },
        { createdAt: '2026-03-08T12:50:00+08:00', total: 180 },
        { createdAt: '2026-03-08T15:10:00+08:00', total: 90 },
        { createdAt: '2026-03-08T18:05:00+08:00', total: 260 },
        { createdAt: '2026-03-08T22:40:00+08:00', total: 150 },
      ]),
      peakTimeSlot: {
        key: 'lunch',
        label: '午餐',
        hoursLabel: '11:00-14:59',
        orders: 2,
        revenue: 400,
        averageOrderValue: 200,
      },
      totalCost: 600,
    };

    const wb = buildAnalyticsWorkbook({
      data,
      currency: 'NT$',
      rangeLabel: '2026/03/08',
      generatedAt: new Date('2026-03-08T12:00:00'),
    });

    // Verify workbook has the expected sheets
    expect(wb.SheetNames).toContain('摘要');
    expect(wb.SheetNames).toContain('時段分析');
    expect(wb.SheetNames).toContain('每日營收');
    expect(wb.SheetNames).toContain('每小時分析');
    expect(wb.SheetNames).toContain('熱銷商品');
    expect(wb.SheetNames).toHaveLength(5);
  });
});
