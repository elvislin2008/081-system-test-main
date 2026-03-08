import { db } from './src/db/database';
import { format } from 'date-fns';

async function debug() {
  const orders = await db.orders.toArray();
  console.log('Total orders:', orders.length);
  orders.forEach(o => {
    console.log(`Order #${o.orderNumber}: createdAt=${o.createdAt}, status=${o.status}`);
  });
}

debug();
