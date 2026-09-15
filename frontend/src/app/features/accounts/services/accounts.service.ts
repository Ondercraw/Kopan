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
  pay(kind: 'clients/sales' | 'suppliers/purchases', id: string, amountCents: number, paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA') {
    return this.http.patch(`${this.base}/${kind}/${id}/pay`, { amountCents, paymentMethod }, this.options);
  }
}
