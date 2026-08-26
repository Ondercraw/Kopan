export interface Supplier {
  _id: string;
  codigo: number;
  nombre: string;
  cuit: string;
  contacto: string;
  telefono: string;
  email: string;
  direccion: string;
  localidad: string;
  observaciones: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SaveSupplierPayload = Pick<Supplier,
  'nombre' | 'cuit' | 'contacto' | 'telefono' | 'email' | 'direccion' | 'localidad' | 'observaciones'
>;
