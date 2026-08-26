export type TaxCondition =
  'NO_DEFINIDA' | 'CONSUMIDOR_FINAL' | 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTO' | 'EXENTO';
export interface ClientSeller {
  _id: string;
  nombre: string;
  email: string;
  activo?: boolean;
}
export interface ClientPriceList {
  _id: string;
  codigo: number;
  nombre: string;
  activo?: boolean;
}
export interface ClientChange {
  actorId: string;
  actorName: string;
  action: string;
  detail: string;
  date: string;
}
export interface Client {
  _id: string;
  codigo: number;
  nombre: string;
  nombreFantasia: string;
  cuit: string;
  telefono: string;
  email: string;
  direccion: string;
  localidad: string;
  grupo: string;
  vendedorId: ClientSeller | null;
  condicionIva: TaxCondition;
  observaciones: string;
  activo: boolean;
  historialCambios: ClientChange[];
  listaPreciosId: ClientPriceList | null;
  permiteCuentaCorriente: boolean;
  limiteCreditoCentavos: number;
  saldoCuentaCorrienteCentavos: number;
  createdAt: string;
  updatedAt: string;
}
export interface ClientOptions {
  groups: string[];
  locations: string[];
  sellers: ClientSeller[];
  priceLists: ClientPriceList[];
}
export interface SaveClientPayload {
  nombre: string;
  nombreFantasia?: string;
  cuit?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  localidad?: string;
  grupo?: string;
  vendedorId?: string;
  condicionIva: TaxCondition;
  observaciones?: string;
  listaPreciosId?: string;
  permiteCuentaCorriente: boolean;
  limiteCreditoCentavos: number;
}
export const TAX_LABELS: Record<TaxCondition, string> = {
  NO_DEFINIDA: 'Sin definir',
  CONSUMIDOR_FINAL: 'Consumidor final',
  RESPONSABLE_INSCRIPTO: 'Responsable inscripto',
  MONOTRIBUTO: 'Monotributo',
  EXENTO: 'Exento',
};
