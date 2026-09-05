import { Product } from '../../stock/models/product.model';

export type PurchaseKind = 'COMPRA' | 'STOCK_INICIAL';
export type PurchasePaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'CUENTA_CORRIENTE';
export interface PurchaseItem {
  productId: string;
  productCode: number;
  productName: string;
  quantity: number;
  unitCostCents: number;
  subtotalCents: number;
  previousStock: number;
  currentStock: number;
  previousAverageCostCents: number;
  currentAverageCostCents: number;
  lineNumber: number;
}
export interface Purchase {
  _id: string;
  codigo: number;
  tipo: PurchaseKind;
  proveedorId: string;
  proveedorNombre: string;
  items: PurchaseItem[];
  totalCentavos: number;
  medioPago: PurchasePaymentMethod;
  pagada: boolean;
  pagadaAt: string | null;
  vencimiento: string | null;
  numeroComprobante: string;
  observaciones: string;
  fechaCompra: string;
  estado: 'CONFIRMADA' | 'CANCELADA';
  motivoCancelacion: string;
  actorName: string;
}
export interface InventoryLot {
  _id: string;
  purchaseCode: number;
  supplierName: string;
  initialQuantity: number;
  remainingQuantity: number;
  unitCostCents: number;
  receivedAt: string;
  kind: PurchaseKind;
}
export interface InventoryProduct extends Product {
  trackedQuantity: number;
  unvaluedQuantity: number;
  averageCostCents: number;
  lots: InventoryLot[];
}
export interface SupplierAccount {
  _id: string;
  proveedorNombre: string;
  deudaCentavos: number;
  compras: number;
  proximoVencimiento: string | null;
}
