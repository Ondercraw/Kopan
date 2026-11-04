import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { CommissionOverview, CommissionRule } from '../models/commission.model';

@Injectable({ providedIn: 'root' })
export class SellerCommissionsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/seller-commissions`;
  private readonly options = { withCredentials: true };
  overview(sellerId: string) { return this.http.get<CommissionOverview>(`${this.base}/${sellerId}`, this.options); }
  saveRule(sellerId: string, rule: Omit<CommissionRule, '_id'>) {
    return this.http.post<CommissionRule>(`${this.base}/${sellerId}/rules`, rule, this.options);
  }
  deleteRule(sellerId: string, ruleId: string) {
    return this.http.delete(`${this.base}/${sellerId}/rules/${ruleId}`, this.options);
  }
  pay(saleId: string, paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA') {
    return this.http.post(`${this.base}/sales/${saleId}/pay`, { paymentMethod }, this.options);
  }
}
