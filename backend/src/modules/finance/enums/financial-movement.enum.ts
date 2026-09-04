export enum FinancialMovementKind {
  INCOME = 'INGRESO',
  EXPENSE = 'GASTO',
}

export enum FinancialMovementCategory {
  SALE = 'VENTA',
  CHECK = 'CHEQUE',
  REPLENISHMENT = 'REPOSICION_AUTOMATICA',
  MANUAL = 'GASTO_MANUAL',
}

export enum FinancialPaymentMethod {
  CASH = 'EFECTIVO',
  TRANSFER = 'TRANSFERENCIA',
  CREDIT = 'CREDITO',
  CHECK = 'CHEQUE',
}
