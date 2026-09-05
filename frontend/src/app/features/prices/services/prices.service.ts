import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { PriceList, PriceListDetail, PriceListItem } from '../models/price-list.model';
@Injectable({ providedIn: 'root' })
export class PricesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/price-lists`;
  private readonly options = { withCredentials: true };
  findAll() {
    return this.http.get<PriceList[]>(this.base, this.options);
  }
  findOne(id: string) {
    return this.http.get<PriceListDetail>(`${this.base}/${id}`, this.options);
  }
  create(payload: { nombre: string; descripcion?: string }) {
    return this.http.post<PriceList>(this.base, payload, this.options);
  }
  setPrice(listId: string, productId: string, precioCentavos: number) {
    return this.http.put<PriceListItem>(
      `${this.base}/${listId}/products/${productId}`,
      { precioCentavos },
      this.options,
    );
  }
  setActive(id: string, activo: boolean) {
    return this.http.patch<PriceList>(`${this.base}/${id}/active`, { activo }, this.options);
  }
  history(listId: string, productId: string, from?: string, to?: string) {
    let params: any = {};
    if (from) params.from = from;
    if (to) params.to = to;
    return this.http.get<PriceProductHistory>(
      `${this.base}/${listId}/products/${productId}/history`,
      { ...this.options, params },
    );
  }
}

export interface PriceProductHistory {
  closingSnapshot: {
    date: string;
    price: { precioCentavos: number } | null;
    stock: { currentStock: number; currentAverageCostCents: number | null } | null;
  } | null;
  lots: {
    _id: string;
    purchaseCode: number;
    supplierName: string;
    initialQuantity: number;
    remainingQuantity: number;
    unitCostCents: number;
    receivedAt: string;
  }[];
  prices: {
    _id: string;
    precioCentavos: number;
    precioAnteriorCentavos: number | null;
    actorName: string;
    vigenteDesde: string;
  }[];
  purchases: {
    status: string;
    kind: string;
    purchaseId: string;
    purchaseCode: number;
    date: string;
    supplierName: string;
    quantity: number;
    unitCostCents: number;
    previousStock: number;
    currentStock: number;
    previousAverageCostCents: number;
    currentAverageCostCents: number;
  }[];
  movements: {
    _id: string;
    type: string;
    previousStock: number;
    currentStock: number;
    reason: string;
    previousAverageCostCents: number | null;
    currentAverageCostCents: number | null;
    createdAt: string;
  }[];
}
