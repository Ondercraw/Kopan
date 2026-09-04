export type CheckStatus = 'PENDIENTE' | 'COBRADO';

export interface BankCheck {
  _id: string;
  codigo: number;
  numero: string;
  banco: string;
  domicilioPago: string;
  titular: string;
  domicilioTitular: string;
  libradorCuit: string;
  montoCentavos: number;
  montoLetras: string;
  fechaEmision: string | null;
  lugarEmision: string;
  diferido: boolean;
  fechaCobro: string | null;
  estado: CheckStatus;
  cobradoAt: string | null;
  destinoCobro: 'EFECTIVO' | 'TRANSFERENCIA' | null;
  clienteId: string | null;
  clienteNombre: string;
  ventaId: string | null;
  ventaCodigo: number | null;
  actorName: string;
  createdAt: string;
}

export interface SaveCheckPayload {
  banco: string;
  domicilioPago: string;
  titular: string;
  domicilioTitular: string;
  libradorCuit: string;
  montoCentavos: number;
  fechaEmision?: string;
  lugarEmision?: string;
  numero: string;
  diferido: boolean;
  fechaCobro?: string;
  clienteId?: string;
}
