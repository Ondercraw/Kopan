import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { SaveSupplierPayload, Supplier } from '../models/supplier.model';

@Injectable({ providedIn: 'root' })
export class SuppliersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/suppliers`;

  findAll() { return this.http.get<Supplier[]>(this.baseUrl, { withCredentials: true }); }
  findActive() { return this.http.get<Supplier[]>(`${this.baseUrl}/active`, { withCredentials: true }); }
  create(payload: SaveSupplierPayload) { return this.http.post<Supplier>(this.baseUrl, payload, { withCredentials: true }); }
  update(id: string, payload: SaveSupplierPayload) { return this.http.patch<Supplier>(`${this.baseUrl}/${id}`, payload, { withCredentials: true }); }
  setActive(id: string, active: boolean) {
    return this.http.patch<Supplier>(`${this.baseUrl}/${id}/${active ? 'reactivate' : 'deactivate'}`, {}, { withCredentials: true });
  }
}
