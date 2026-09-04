import { SaveCheckPayload } from '../../checks/models/check.model';
export type PaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'CREDITO' | 'CHEQUE';
export interface SaleItemPayload {
  productoId: string;
  cantidad: number;
  precioUnitarioCentavos?: number;
  bonificacionPuntosBase?: number;
}
export interface CreateSalePayload {
  clienteId: string;
  vendedorId?: string;
  listaPreciosId: string;
  medioPago: PaymentMethod;
  referenciaTransferencia?: string;
  observaciones?: string;
  cheque?: SaveCheckPayload;
  items: SaleItemPayload[];
}
export interface SaleItem {
  productoId: string;
  productoCodigo: number;
  productoNombre: string;
  cantidad: number;
  precioUnitarioCentavos: number;
  bonificacionPuntosBase: number;
  alicuotaIva: 0 | 10.5 | 21;
  netoCentavos: number;
  ivaCentavos: number;
  costoUnitarioCentavos: number;
  totalCentavos: number;
}
export interface Sale {
  _id: string;
  codigo: number;
  clienteCodigo?: number;
  clienteNombre: string;
  listaPreciosNombre: string;
  items: SaleItem[];
  netoCentavos: number;
  ivaCentavos: number;
  costoCentavos: number;
  totalCentavos: number;
  medioPago: PaymentMethod;
  referenciaTransferencia: string;
  chequeId?: string | null;
  chequeNumero?: string;
  chequeCobradoAt?: string | null;
  estado: string;
  estadoFiscal: string;
  actorName: string;
  createdAt: string;
}
