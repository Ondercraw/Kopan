export type WeightUnit = 'kg' | 'g';
export type VatRate = 0 | 10.5 | 21;
export type StockAdjustmentReason =
  | 'PURCHASE_RECEIVED'
  | 'SALE_OR_DELIVERY'
  | 'RETURN'
  | 'BREAKAGE_OR_LOSS'
  | 'INVENTORY_CORRECTION'
  | 'OTHER';
export interface ProductSupplier { _id: string; codigo: number; nombre: string; activo: boolean; }

export interface Product {
  _id: string;
  codigo: number;

  /*
   * Especificaciones visibles del producto.
   * Si a futuro cambian las unidades, se agregan litros/paquetes o stock por
   * depósito, actualizar este modelo junto con el schema y DTO del backend y
   * el formulario de alta.
   */
  nombre: string;
  tipo: string;
  descripcionAdicional: string;
  cantidadStock: number;
  stockMinimo: number;
  peso: number;
  unidadPeso: WeightUnit;
  alicuotaIva: VatRate;
  costoCentavos: number;
  // El backend entrega la relación poblada bajo proveedorId.
  proveedorId: ProductSupplier | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductPayload {
  nombre: string;
  tipo: string;
  descripcionAdicional?: string;
  cantidadStock: number;
  stockMinimo: number;
  peso: number;
  unidadPeso: WeightUnit;
  proveedorId?: string;
  alicuotaIva: VatRate;
  costoCentavos: number;
}

export interface UpdateProductPayload {
  nombre: string;
  tipo: string;
  descripcionAdicional?: string;
  stockMinimo: number;
  peso: number;
  unidadPeso: WeightUnit;
  proveedorId?: string;
  alicuotaIva: VatRate;
  costoCentavos: number;
  ajusteStock?: number;
  motivoAjuste?: StockAdjustmentReason;
  observacionAjuste?: string;
}

export type StockMovementType =
  'INITIAL' | 'INCREMENT' | 'DECREMENT' | 'MINIMUM_CHANGE' | 'DEACTIVATION' | 'REACTIVATION';

export interface StockMovement {
  _id: string;
  productId: string;
  productCode: number;
  productName: string;
  type: StockMovementType;
  previousStock: number;
  currentStock: number;
  previousMinimumStock?: number;
  currentMinimumStock?: number;
  reason: string;
  actorId: string;
  actorName: string;
  createdAt: string;
}
