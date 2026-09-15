export type AccountStatus = 'PENDIENTE' | 'PARCIAL' | 'PAGADO';
export interface AccountPayment { id: string; montoCentavos: number; medioPago: 'EFECTIVO' | 'TRANSFERENCIA'; fecha: string; actorName: string }
export interface AccountDocument {
  id: string; codigo: number; tipo: 'VENTA' | 'COMPRA'; fecha: string; totalCentavos: number;
  pagadoCentavos: number; saldoCentavos: number; estado: AccountStatus; detalle: string; pagos: AccountPayment[];
}
export interface CurrentAccount {
  entidadId: string; entidadNombre: string; totalCentavos: number; pagadoCentavos: number;
  saldoCentavos: number; documentos: AccountDocument[];
}
export interface AccountsStatement { clients: CurrentAccount[]; suppliers: CurrentAccount[] }
