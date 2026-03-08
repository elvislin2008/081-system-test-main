import { buildTimeSlotBreakdown } from './src/services/analyticsService';

const orders = [
  { createdAt: '2026-03-08T08:15:00+08:00', total: 120 },
  { createdAt: '2026-03-08T12:20:00+08:00', total: 220 },
  { createdAt: '2026-03-08T12:50:00+08:00', total: 180 },
  { createdAt: '2026-03-08T15:10:00+08:00', total: 90 },
  { createdAt: '2026-03-08T18:05:00+08:00', total: 260 },
  { createdAt: '2026-03-08T22:40:00+08:00', total: 150 },
];

const breakdown = buildTimeSlotBreakdown(orders);
console.log(JSON.stringify(breakdown, null, 2));
