export enum StockAdjustmentReason {
  PURCHASE_RECEIVED = 'PURCHASE_RECEIVED',
  SALE_OR_DELIVERY = 'SALE_OR_DELIVERY',
  RETURN = 'RETURN',
  BREAKAGE_OR_LOSS = 'BREAKAGE_OR_LOSS',
  INVENTORY_CORRECTION = 'INVENTORY_CORRECTION',
  OTHER = 'OTHER',
}

export const STOCK_ADJUSTMENT_REASON_LABELS: Record<StockAdjustmentReason, string> = {
  [StockAdjustmentReason.PURCHASE_RECEIVED]: 'Compra recibida',
  [StockAdjustmentReason.SALE_OR_DELIVERY]: 'Venta o entrega',
  [StockAdjustmentReason.RETURN]: 'Devolución',
  [StockAdjustmentReason.BREAKAGE_OR_LOSS]: 'Rotura o pérdida',
  [StockAdjustmentReason.INVENTORY_CORRECTION]: 'Corrección de inventario',
  [StockAdjustmentReason.OTHER]: 'Otro',
};
