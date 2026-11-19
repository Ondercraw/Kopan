import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';

export interface CreateRemittancePayload {
  clienteId: string;
  observaciones?: string;
  transporteDescargaCentavos: number;
  items: Array<{
    productoId: string;
    cantidad: number;
    precioFinalUnitarioCentavos: number;
    bonificacionPuntosBase: number;
  }>;
}

export interface RemittanceRecord {
  _id: string;
  codigo: number;
  clienteNombre: string;
  clienteCodigo: number;
  clienteId: string;
  clienteDireccion: string;
  clienteLocalidad: string;
  actorName: string;
  observaciones: string;
  createdAt: string;
  cancelado?: boolean;
  motivoCancelacion?: string;
  canceladoPorNombre?: string;
  historialCorrecciones?: Array<{ fecha: string; actorName: string }>;
  items: Array<{ productoId: string; productoNombre: string; cantidad: number }>;
}

@Injectable({ providedIn: 'root' })
export class RemittancesService {
  private readonly http = inject(HttpClient);
  findAll(range: { from: string; to: string }) {
    return this.http.get<RemittanceRecord[]>(`${environment.apiUrl}/remittances`, {
      params: range, withCredentials: true,
    });
  }
  findOne(id: string) {
    return this.http.get<RemittanceRecord>(`${environment.apiUrl}/remittances/${id}`, {
      withCredentials: true,
    });
  }
  create(payload: CreateRemittancePayload) {
    return this.http.post<{ codigo: number; createdAt: string }>(
      `${environment.apiUrl}/remittances`, payload, { withCredentials: true },
    );
  }
  update(id: string, payload: { clienteId: string; observaciones: string; items: Array<{ productoId: string; cantidad: number }> }) {
    return this.http.patch<RemittanceRecord>(`${environment.apiUrl}/remittances/${id}`, payload, { withCredentials: true });
  }
  cancel(id: string, reason: string) {
    return this.http.patch<RemittanceRecord>(`${environment.apiUrl}/remittances/${id}/cancel`, { reason }, { withCredentials: true });
  }
}
