import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { AccountsStatement } from '../models/account.model';

@Injectable({ providedIn: 'root' })
export class AccountsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/accounts`;
  private readonly options = { withCredentials: true };
  statement() { return this.http.get<AccountsStatement>(this.base, this.options); }
  pay(kind: 'clients/sales' | 'suppliers/purchases' | 'opening-debts', id: string, amountCents: number, paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA') {
    return this.http.patch(`${this.base}/${kind}/${id}/pay`, { amountCents, paymentMethod }, this.options);
  }
  addOpeningDebt(side: 'CLIENTE' | 'PROVEEDOR', entityId: string, amountCents: number, detail: string) {
    return this.http.post(`${this.base}/${side === 'CLIENTE' ? 'clients' : 'suppliers'}/${entityId}/opening-debts`, { amountCents, detail }, this.options);
  }
  cancelOpeningDebt(id: string, reason: string) {
    return this.http.patch(`${this.base}/opening-debts/${id}/cancel`, { reason }, this.options);
  }
}
