import * as fs from 'fs';
import { toLocalISOString } from '../utils/date';

function generate() {
  const data = JSON.parse(fs.readFileSync('excel_dump.json', 'utf8'));
  const sheetData = data['主食系列'] || [];

  const categoriesSet = new Set<string>();
  const products: any[] = [];

  sheetData.forEach((row: any) => {
    if (!row['類別'] || !row['品項']) return;
    
    // Skip headers or description rows if price is not a number
    if (typeof row['單價'] === 'string' && row['單價'].includes('+')) {
       // These are combo upgrade descriptions
       return;
    }
    if (row['單價'] === '單價' || !row['單價']) {
       if (typeof row['單價'] !== 'number' && !Number(row['單價'])) return;
    }

    const categoryName = row['類別'].trim();
    const productName = row['品項'].trim();
    const price = Number(row['單價']) || 0;

    categoriesSet.add(categoryName);

    products.push({
      categoryName,
      name: productName,
      description: row['說明'] || '',
      price: price
    });
  });

  const categories = Array.from(categoriesSet).map((name, index) => ({
    id: index + 1,
    name,
    description: name,
    sortOrder: index + 1,
    isActive: true,
    icon: 'rice', // Default icon
    color: '#ef4444', // Default color
  }));

  const categoryMap = new Map();
  categories.forEach(c => categoryMap.set(c.name, c.id));

  const finalProducts = products.map((p, index) => ({
    categoryId: categoryMap.get(p.categoryName),
    name: p.name,
    description: p.description,
    price: p.price,
    imageUrl: '',
    isActive: true,
    modifierGroupIds: [],
    trackInventory: false,
    sortOrder: index + 1,
  }));

  const outCode = `
import { toLocalISOString } from '../utils/date';

export const generatedCategories = ${JSON.stringify(categories, null, 2)};
export const generatedProducts = ${JSON.stringify(finalProducts, null, 2)};
`;

  fs.writeFileSync('src/db/menuData.ts', outCode, 'utf8');
  console.log('Successfully generated src/db/menuData.ts');
}

try {
  generate();
} catch (e) {
  console.error(e);
}
