import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { cancelOrder, getOrderWithItems, deleteOrder } from '../../services/orderService';
import { useAppSettingsStore } from '../../stores/useAppSettingsStore';
import { formatPrice } from '../../utils/currency';
import { formatDateTime } from '../../utils/date';
import { getShortOrderNumber } from '../../utils/orderNumber';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../../utils/constants';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { IconClipboard, IconMapPin, IconBag, IconDownload, IconTrash } from '../../components/ui/Icons';
import toast from 'react-hot-toast';
import type { Order, OrderItem, OrderStatus } from '../../db/types';

export default function OrderHistoryPage() {
  useAppSettingsStore((state) => state.settings.currency);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<{ order: Order; items: OrderItem[] } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [restoreInventoryOnDelete, setRestoreInventoryOnDelete] = useState(true);

  const orders = useLiveQuery(
    async () => {
      if (statusFilter === 'all') {
        return db.orders.orderBy('createdAt').reverse().limit(200).toArray();
      }
      const results = await db.orders.where('status').equals(statusFilter).sortBy('createdAt');
      return results.reverse();
    },
    [statusFilter]
  );

  const handleViewDetail = async (order: Order) => {
    if (!order.id) return;
    const detail = await getOrderWithItems(order.id);
    if (detail) setSelectedOrder(detail);
  };

  const handleCancel = async () => {
    if (!cancelTarget?.id) return;
    await cancelOrder(cancelTarget.id);
    setCancelTarget(null);
    toast.success('訂單已取消');
  };

  const handleExport = async () => {
    try {
      let exportOrders: Order[];
      if (statusFilter === 'all') {
        exportOrders = await db.orders.orderBy('createdAt').reverse().toArray();
      } else {
        const results = await db.orders.where('status').equals(statusFilter).sortBy('createdAt');
        exportOrders = results.reverse();
      }
      if (!exportOrders.length) {
        toast.error('無訂單可供匯出');
        return;
      }

      // Prepare data for Excel
      const data = exportOrders.map(order => ({
        '單號': order.orderNumber,
        '桌位': order.tableName,
        '狀態': ORDER_STATUS_LABELS[order.status],
        '經手人': order.employeeName,
        '小計': order.subtotal,
        '折扣': order.discount,
        '總計': order.total,
        '收款': order.cashReceived,
        '找零': order.changeGiven,
        '時間': formatDateTime(order.createdAt),
        '備註': order.note || ''
      }));

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(data);
      
      // Set column widths
      const wscols = [
        { wch: 20 }, // Order Number
        { wch: 10 }, // Table
        { wch: 10 }, // Status
        { wch: 15 }, // Employee
        { wch: 10 }, // Subtotal
        { wch: 10 }, // Discount
        { wch: 10 }, // Total
        { wch: 10 }, // Cash
        { wch: 10 }, // Change
        { wch: 20 }, // Time
        { wch: 30 }  // Note
      ];
      ws['!cols'] = wscols;

      // Create workbook and append worksheet
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '訂單記錄');

      // Export file
      const filterSuffix = statusFilter === 'all' ? '' : `_${statusFilter}`;
      const fileName = `orders${filterSuffix}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFileXLSX(wb, fileName);

      toast.success(`訂單匯出成功 (${exportOrders.length} 筆)`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('匯出失敗，請稍後再試');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    try {
      await deleteOrder(deleteTarget.id, { restoreInventory: restoreInventoryOnDelete });
      setDeleteTarget(null);
      setSelectedOrder(null);
      toast.success(restoreInventoryOnDelete ? '訂單已刪除（庫存已回補）' : '訂單已強制刪除（庫存未回補）');
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('刪除失敗');
    }
  };

  const statuses: (OrderStatus | 'all')[] = ['all', 'pending', 'preparing', 'ready', 'completed', 'cancelled'];

  return (
    <div className="h-full flex flex-col">
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <IconClipboard className="w-6 h-6 text-blue-500" /> 訂單記錄
          </h1>
        </div>
        <button
          onClick={handleExport}
          className="btn-secondary flex items-center gap-2 justify-center"
        >
          <IconDownload className="w-4 h-4" />
          <span>匯出訂單 (Excel)</span>
        </button>
      </div>
      <div className="px-4 pb-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                statusFilter === s
                  ? 'bg-blue-600 text-white shadow-md dark:bg-blue-500'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
              }`}
            >
              {s === 'all' ? '全部' : ORDER_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {!orders?.length ? (
          <div className="text-center py-16 text-slate-400 dark:text-slate-600 animate-fade-in">
            <IconClipboard className="w-12 h-12 mx-auto mb-3" />
            <p className="text-lg font-medium">尚無訂單</p>
            <p className="text-sm mt-1">訂單記錄將顯示在此</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order, i) => (
              <div
                key={order.id}
                onClick={() => handleViewDetail(order)}
                className={`card px-4 py-3 flex items-center justify-between cursor-pointer hover:shadow-md transition-all animate-slide-up stagger-${Math.min(i + 1, 6)}`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    #{getShortOrderNumber(order.orderNumber)}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ORDER_STATUS_COLORS[order.status]}`}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-0.5">
                      {order.tableName !== '外帶' ? <><IconMapPin className="w-3.5 h-3.5 inline" />{order.tableName}</> : <><IconBag className="w-3.5 h-3.5 inline" />外帶</>}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-blue-600 dark:text-blue-400">{formatPrice(order.total)}</span>
                  <span className="text-sm text-slate-400 dark:text-slate-500 hidden sm:inline">{formatDateTime(order.createdAt)}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRestoreInventoryOnDelete(true);
                      setDeleteTarget(order);
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                    title="刪除訂單"
                  >
                    <IconTrash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <Modal
          open={true}
          onClose={() => setSelectedOrder(null)}
          title={`訂單 #${selectedOrder.order.orderNumber}`}
          size="md"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500 dark:text-slate-400">狀態</span>
                <p className={`font-medium mt-0.5 inline-block px-2 py-0.5 rounded-full text-xs ${ORDER_STATUS_COLORS[selectedOrder.order.status]}`}>
                  {ORDER_STATUS_LABELS[selectedOrder.order.status]}
                </p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">桌位</span>
                <p className="font-medium text-slate-900 dark:text-white">{selectedOrder.order.tableName}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">經手人</span>
                <p className="font-medium text-slate-900 dark:text-white">{selectedOrder.order.employeeName}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">時間</span>
                <p className="font-medium text-slate-900 dark:text-white">{formatDateTime(selectedOrder.order.createdAt)}</p>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
              <h3 className="font-semibold mb-3 text-slate-900 dark:text-white">訂單明細</h3>
              <div className="space-y-2">
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-white">{item.quantity}x {item.productName}</span>
                      {item.modifiers.length > 0 && (
                        <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                          ({item.modifiers.map(m => m.name).join(', ')})
                        </span>
                      )}
                    </div>
                    <span className="font-medium text-slate-900 dark:text-white">{formatPrice(item.subtotal)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-1">
              <div className="flex justify-between font-bold text-lg">
                <span className="text-slate-900 dark:text-white">總計</span>
                <span className="text-blue-600 dark:text-blue-400">{formatPrice(selectedOrder.order.total)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                <span>收款</span>
                <span>{formatPrice(selectedOrder.order.cashReceived)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                <span>找零</span>
                <span>{formatPrice(selectedOrder.order.changeGiven)}</span>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              {selectedOrder.order.status === 'pending' && (
                <button
                  onClick={() => setCancelTarget(selectedOrder.order)}
                  className="btn-secondary flex-1"
                >
                  取消訂單
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <button
                onClick={() => {
                  setRestoreInventoryOnDelete(true);
                  setDeleteTarget(selectedOrder.order);
                }}
                className="btn-danger flex items-center justify-center gap-2 py-2.5 text-sm"
              >
                <IconTrash className="w-4 h-4" />
                刪除 (補庫存)
              </button>
              <button
                onClick={() => {
                  setRestoreInventoryOnDelete(false);
                  setDeleteTarget(selectedOrder.order);
                }}
                className="bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 rounded-xl flex items-center justify-center gap-2 py-2.5 text-sm transition-colors border border-red-200 dark:border-red-900/50"
              >
                <IconTrash className="w-4 h-4" />
                強制刪除 (不補)
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        title="取消訂單"
        message={`確定要取消訂單 #${cancelTarget?.orderNumber}？庫存將自動回補。`}
        confirmText="確定取消"
        variant="danger"
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title={restoreInventoryOnDelete ? "刪除訂單" : "強制刪除訂單"}
        message={restoreInventoryOnDelete 
          ? `確定要永久刪除訂單 #${deleteTarget?.orderNumber}？此動作無法復原，庫存將自動回補。`
          : `確定要強制刪除訂單 #${deleteTarget?.orderNumber}？此動作無法復原，【庫存將不會補回】。`
        }
        confirmText={restoreInventoryOnDelete ? "確定刪除" : "確定強制刪除"}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
