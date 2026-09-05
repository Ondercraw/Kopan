export type FinancialMovementKind = 'INGRESO' | 'GASTO';
export type FinancialMovementCategory =
  'VENTA' | 'CHEQUE' | 'REPOSICION_AUTOMATICA' | 'GASTO_MANUAL' | 'COMPRA_PRODUCTOS';
export type FinancialPaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'CREDITO' | 'CHEQUE';
export interface FinancialMovement {
  _id: string;
  sourceKey: string;
  tipo: FinancialMovementKind;
  categoria: FinancialMovementCategory;
  montoCentavos: number;
  concepto: string;
  detalle: string;
  medioPago: FinancialPaymentMethod | null;
  acreditadoEn: Extract<FinancialPaymentMethod, 'EFECTIVO' | 'TRANSFERENCIA'> | null;
  disponible: boolean;
  pagado: boolean;
  pagadoAt: string | null;
  cancelado: boolean;
  motivoCancelacion: string;
  canceladoAt: string | null;
  canceladoPorNombre: string;
  fechaMovimiento: string;
  ventaCodigo: number | null;
  clienteNombre: string;
  proveedorNombre: string;
  chequeNumero: string;
  chequeId: string | null;
  actorName: string;
}
export interface FinancialSummary {
  ingresosCentavos: number;
  gastosAutomaticosCentavos: number;
  gastosReposicionPagadosCentavos: number;
  gastosReposicionPendientesCentavos: number;
  gastosManualesCentavos: number;
  gastosManualesPendientesCentavos: number;
  comprasPagadasCentavos: number;
  comprasPendientesCentavos: number;
  resultadoCentavos: number;
  efectivoDisponibleCentavos: number;
  transferenciaDisponibleCentavos: number;
  chequesCobradosCentavos: number;
  chequesEfectivoCentavos: number;
  chequesTransferenciaCentavos: number;
  chequesPendientesCentavos: number;
  cuentaCorrienteCentavos: number;
  gastosPendientesCentavos: number;
}
export interface FinancialResponse {
  items: FinancialMovement[];
  period: FinancialSummary;
  overall: FinancialSummary;
}
export interface CreateExpensePayload {
  concepto: string;
  montoCentavos: number;
  detalle?: string;
  proveedorId?: string;
  fecha?: string;
}
