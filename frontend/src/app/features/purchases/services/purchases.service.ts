import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import {
  InventoryProduct,
  Purchase,
  PurchaseKind,
  PurchasePaymentMethod,
  SupplierAccount,
} from '../models/purchase.model';

@Injectable({ providedIn: 'root' })
export class PurchasesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/purchases`;
  private readonly options = { withCredentials: true };
  findAll(filters: { from?: string; to?: string; supplierId?: string } = {}) {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params = params.set(key, value);
    });
    return this.http.get<Purchase[]>(this.base, { ...this.options, params });
  }
  inventory() {
    return this.http.get<InventoryProduct[]>(`${this.base}/inventory`, this.options);
  }
  supplierAccounts() {
    return this.http.get<SupplierAccount[]>(`${this.base}/supplier-accounts`, this.options);
  }
  create(payload: {
    supplierId: string;
    kind: PurchaseKind;
    paymentMethod: PurchasePaymentMethod;
    items: { productId: string; quantity: number; unitCostCents: number }[];
    purchaseDate?: string;
    dueDate?: string;
    documentNumber?: string;
    notes?: string;
  }) {
    return this.http.post<Purchase>(this.base, payload, this.options);
  }
  pay(id: string, paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA') {
    return this.http.patch<Purchase>(`${this.base}/${id}/pay`, { paymentMethod }, this.options);
  }
  paySupplierAccount(id: string, paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA') {
    return this.http.patch<{ paidPurchases: number; totalCents: number }>(
      `${this.base}/supplier/${id}/pay-all`,
      { paymentMethod },
      this.options,
    );
  }
  cancel(id: string, reason: string) {
    return this.http.patch<Purchase>(`${this.base}/${id}/cancel`, { reason }, this.options);
  }
}
