import { toLocalISOString } from '../utils/date';
import { db } from './database';
import { seedIngredientData } from './seedBom';
import { generatedCategories, generatedProducts } from './menuData';

export async function seedDatabase() {
  const now = toLocalISOString(new Date());

  // ==================== 預設設定 ====================
  await db.settings.bulkAdd([
    { key: 'storeName', value: '美味餐廳' },
    { key: 'storeAddress', value: '台北市中山區中山北路100號' },
    { key: 'storePhone', value: '02-2345-6789' },
    { key: 'receiptFooter', value: '謝謝光臨，歡迎再來！' },
    { key: 'receiptHeader', value: '' },
    { key: 'currency', value: 'NT$' },
    { key: 'orderNumberPrefix', value: '' },
    { key: 'autoLogoutMinutes', value: 30 },
    { key: 'lowStockDefaultThreshold', value: 10 },
    { key: 'enableSound', value: true },
    { key: 'themeColor', value: '#1e40af' },
    { key: 'initialized', value: true },
  ]);

  // ==================== 預設管理員 ====================
  const pinHash = await hashPin('0000');
  await db.employees.bulkAdd([
    {
      username: 'admin',
      pin: pinHash,
      name: '管理員',
      role: 'admin',
      isActive: true,
      createdAt: now,
    },
    {
      username: 'cashier1',
      pin: await hashPin('1234'),
      name: '收銀員小明',
      role: 'cashier',
      isActive: true,
      createdAt: now,
    },
    {
      username: 'kitchen1',
      pin: await hashPin('5678'),
      name: '廚師阿華',
      role: 'kitchen',
      isActive: true,
      createdAt: now,
    },
  ]);

  // ==================== 分類 ====================
  const mappedCategories = generatedCategories.map(c => ({
    ...c,
    createdAt: now,
    updatedAt: now
  }));
  await db.categories.bulkAdd(mappedCategories as any);

  // ==================== 修改群組 ====================
  await db.modifierGroups.bulkAdd([
    { name: '辣度', required: false, multiSelect: false, maxSelections: 1 },
    { name: '加料', required: false, multiSelect: true, maxSelections: 5 },
    { name: '溫度', required: false, multiSelect: false, maxSelections: 1 },
    { name: '甜度', required: false, multiSelect: false, maxSelections: 1 },
    { name: '份量', required: false, multiSelect: false, maxSelections: 1 },
  ]);

  // ==================== 修改選項 ====================
  await db.modifiers.bulkAdd([
    // 辣度 (groupId: 1)
    { groupId: 1, name: '不辣', price: 0, isActive: true },
    { groupId: 1, name: '小辣', price: 0, isActive: true },
    { groupId: 1, name: '中辣', price: 0, isActive: true },
    { groupId: 1, name: '大辣', price: 0, isActive: true },
    // 加料 (groupId: 2)
    { groupId: 2, name: '加蛋', price: 15, isActive: true },
    { groupId: 2, name: '加起司', price: 20, isActive: true },
    { groupId: 2, name: '加青菜', price: 10, isActive: true },
    { groupId: 2, name: '加滷肉', price: 25, isActive: true },
    { groupId: 2, name: '加豆腐', price: 15, isActive: true },
    // 溫度 (groupId: 3)
    { groupId: 3, name: '熱', price: 0, isActive: true },
    { groupId: 3, name: '溫', price: 0, isActive: true },
    { groupId: 3, name: '冰', price: 0, isActive: true },
    { groupId: 3, name: '去冰', price: 0, isActive: true },
    // 甜度 (groupId: 4)
    { groupId: 4, name: '正常甜', price: 0, isActive: true },
    { groupId: 4, name: '半糖', price: 0, isActive: true },
    { groupId: 4, name: '微糖', price: 0, isActive: true },
    { groupId: 4, name: '無糖', price: 0, isActive: true },
    // 份量 (groupId: 5)
    { groupId: 5, name: '小份', price: -20, isActive: true },
    { groupId: 5, name: '正常', price: 0, isActive: true },
    { groupId: 5, name: '大份', price: 30, isActive: true },
  ]);

  // ==================== 商品 ====================
  const mappedProducts = generatedProducts.map(p => ({
    ...p,
    createdAt: now,
    updatedAt: now
  }));
  await db.products.bulkAdd(mappedProducts as any);

  // ==================== 桌位 ====================
  await db.diningTables.bulkAdd([
    { number: 'A1', name: '窗邊1', capacity: 4, x: 50, y: 50, width: 100, height: 100, shape: 'square', status: 'available', currentOrderId: null, floor: 1, isActive: true },
    { number: 'A2', name: '窗邊2', capacity: 4, x: 200, y: 50, width: 100, height: 100, shape: 'square', status: 'available', currentOrderId: null, floor: 1, isActive: true },
    { number: 'A3', name: '窗邊3', capacity: 2, x: 350, y: 50, width: 80, height: 80, shape: 'square', status: 'available', currentOrderId: null, floor: 1, isActive: true },
    { number: 'B1', name: '中央1', capacity: 6, x: 50, y: 200, width: 140, height: 100, shape: 'rectangle', status: 'available', currentOrderId: null, floor: 1, isActive: true },
    { number: 'B2', name: '中央2', capacity: 6, x: 240, y: 200, width: 140, height: 100, shape: 'rectangle', status: 'available', currentOrderId: null, floor: 1, isActive: true },
    { number: 'C1', name: '圓桌1', capacity: 8, x: 100, y: 370, width: 120, height: 120, shape: 'round', status: 'available', currentOrderId: null, floor: 1, isActive: true },
    { number: 'C2', name: '圓桌2', capacity: 8, x: 280, y: 370, width: 120, height: 120, shape: 'round', status: 'available', currentOrderId: null, floor: 1, isActive: true },
    { number: 'D1', name: '包廂', capacity: 10, x: 450, y: 50, width: 160, height: 160, shape: 'rectangle', status: 'available', currentOrderId: null, floor: 1, isActive: true },
  ]);

  // ==================== BOM 食材庫存 ====================
  await seedIngredientData(now);
}

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
