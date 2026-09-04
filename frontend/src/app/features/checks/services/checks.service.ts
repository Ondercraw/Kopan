import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { BankCheck, SaveCheckPayload } from '../models/check.model';

@Injectable({ providedIn: 'root' })
export class ChecksService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/checks`;
  findAll() { return this.http.get<BankCheck[]>(this.base, { withCredentials: true }); }
  create(payload: SaveCheckPayload) {
    return this.http.post<BankCheck>(this.base, payload, { withCredentials: true });
  }
  collect(id: string, destinoCobro: 'EFECTIVO' | 'TRANSFERENCIA') {
    return this.http.patch<BankCheck>(`${this.base}/${id}/collect`, { destinoCobro }, { withCredentials: true });
  }
  allocate(id: string, destinoCobro: 'EFECTIVO' | 'TRANSFERENCIA') {
    return this.http.patch<BankCheck>(`${this.base}/${id}/allocate`, { destinoCobro }, { withCredentials: true });
  }
}
