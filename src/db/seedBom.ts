import { db } from './database';
import type { Ingredient, ProductRecipeItem } from './types';
import { extractedIngredients } from './inventoryData';

interface SeedIngredientInput {
  name: string;
  unit: string;
  costPerUnit: number;
  lowStockThreshold: number;
  currentStock: number;
}

const SEED_INGREDIENTS: SeedIngredientInput[] = extractedIngredients.map(item => ({
  name: item.name,
  unit: item.unit,
  costPerUnit: 0,
  lowStockThreshold: 10,
  currentStock: 100
}));

const PRODUCT_RECIPES_BY_INDEX: Array<Array<{ ingredient: string; quantity: number }>> = [];

export async function seedIngredientData(now: string): Promise<void> {
  if ((await db.ingredients.count()) > 0) {
    return;
  }

  await db.ingredients.bulkAdd(
    SEED_INGREDIENTS.map((ingredient, index): Ingredient => ({
      ...ingredient,
      isActive: true,
      sortOrder: index + 1,
      createdAt: now,
      updatedAt: now,
    }))
  );

  const ingredients = await db.ingredients.orderBy('sortOrder').toArray();
  const ingredientIdByName = new Map(
    ingredients.map((ingredient) => [ingredient.name, ingredient.id ?? 0])
  );

  await db.inventory.bulkAdd(
    ingredients.map((ingredient) => ({
      ingredientId: ingredient.id!,
      ingredientName: ingredient.name,
      currentStock: SEED_INGREDIENTS.find((item) => item.name === ingredient.name)?.currentStock ?? 0,
      lowStockThreshold: ingredient.lowStockThreshold,
      unit: ingredient.unit,
      lastUpdated: now,
    }))
  );

  const products = await db.products.orderBy('sortOrder').toArray();
  const recipeItems: ProductRecipeItem[] = [];

  products.forEach((product, index) => {
    if (!product.id || !product.trackInventory || product.isCombo) {
      return;
    }

    (PRODUCT_RECIPES_BY_INDEX[index] ?? []).forEach((item) => {
      const ingredientId = ingredientIdByName.get(item.ingredient);
      if (!ingredientId) {
        return;
      }

      recipeItems.push({
        productId: product.id!,
        ingredientId,
        ingredientName: item.ingredient,
        quantity: item.quantity,
      });
    });
  });

  if (recipeItems.length > 0) {
    await db.productRecipes.bulkAdd(recipeItems);
  }
}
