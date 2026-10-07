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

@Injectable({ providedIn: 'root' })
export class RemittancesService {
  private readonly http = inject(HttpClient);
  create(payload: CreateRemittancePayload) {
    return this.http.post<{ codigo: number; createdAt: string }>(
      `${environment.apiUrl}/remittances`, payload, { withCredentials: true },
    );
  }
}
