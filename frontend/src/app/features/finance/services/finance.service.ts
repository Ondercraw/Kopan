import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import {
  CreateExpensePayload,
  FinancialMovement,
  FinancialPaymentMethod,
  FinancialResponse,
} from '../models/financial-movement.model';

@Injectable({ providedIn: 'root' })
export class FinanceService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/finance/movements`;

  findAll(range: { from?: string; to?: string }) {
    let params = new HttpParams();
    if (range.from) params = params.set('from', range.from);
    if (range.to) params = params.set('to', range.to);
    return this.http.get<FinancialResponse>(this.base, { withCredentials: true, params });
  }

  createExpense(payload: CreateExpensePayload) {
    return this.http.post(`${this.base}/expenses`, payload, { withCredentials: true });
  }

  payExpense(
    id: string,
    medioPago: Extract<FinancialPaymentMethod, 'EFECTIVO' | 'TRANSFERENCIA'>,
  ) {
    return this.http.patch(`${this.base}/${id}/pay`, { medioPago }, { withCredentials: true });
  }

  cancelReplenishment(id: string, motivo: string) {
    return this.http.patch<FinancialMovement>(
      `${this.base}/${id}/cancel-replenishment`,
      { motivo },
      { withCredentials: true },
    );
  }
}
