import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { CreateSalePayload, PaymentMethod, Sale, UpdateSalePayload } from '../models/sale.model';
export interface SaleFilters {
  from?: string;
  to?: string;
  medioPago?: PaymentMethod | '';
}
@Injectable({ providedIn: 'root' })
export class SalesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/sales`;
  create(payload: CreateSalePayload) {
    return this.http.post<Sale>(this.base, payload, { withCredentials: true });
  }
  findAll(filters: SaleFilters = {}) {
    let params = new HttpParams();
    if (filters.from) params = params.set('from', filters.from);
    if (filters.to) params = params.set('to', filters.to);
    if (filters.medioPago) params = params.set('medioPago', filters.medioPago);
    return this.http.get<Sale[]>(this.base, { withCredentials: true, params });
  }
  findOne(id: string) {
    return this.http.get<Sale>(`${this.base}/${id}`, { withCredentials: true });
  }
  update(id: string, payload: UpdateSalePayload) {
    return this.http.patch<Sale>(`${this.base}/${id}`, payload, { withCredentials: true });
  }
  cancel(id: string, motivo = '') {
    return this.http.patch<{ venta: Sale; stockRepuesto: { productoId: string; unidades: number; stockAnterior: number; stockActual: number }[] }>(
      `${this.base}/${id}/cancel`, { motivo }, { withCredentials: true },
    );
  }
  findTransfers() {
    return this.http.get<Sale[]>(`${this.base}/transfers`, { withCredentials: true });
  }
}
