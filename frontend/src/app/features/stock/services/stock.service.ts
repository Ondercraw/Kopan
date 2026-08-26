import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import {
  CreateProductPayload,
  Product,
  StockMovement,
  UpdateProductPayload,
} from '../models/product.model';

@Injectable({ providedIn: 'root' })
export class StockService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/stock/products`;

  findAll() {
    return this.http.get<Product[]>(this.baseUrl, { withCredentials: true });
  }

  findInactive() {
    return this.http.get<Product[]>(`${this.baseUrl}/inactive`, { withCredentials: true });
  }

  findMovements(id: string) {
    return this.http.get<StockMovement[]>(`${this.baseUrl}/${id}/movements`, {
      withCredentials: true,
    });
  }

  create(payload: CreateProductPayload) {
    return this.http.post<Product>(this.baseUrl, payload, {
      withCredentials: true,
    });
  }

  update(id: string, payload: UpdateProductPayload) {
    return this.http.patch<Product>(`${this.baseUrl}/${id}`, payload, {
      withCredentials: true,
    });
  }

  adjustQuantity(id: string, delta: -1 | 1) {
    return this.http.patch<Product>(
      `${this.baseUrl}/${id}/quantity`,
      { delta },
      { withCredentials: true },
    );
  }

  deactivateMany(productIds: string[]) {
    return this.http.patch<{ deactivated: number }>(
      `${this.baseUrl}/deactivate`,
      { productIds },
      { withCredentials: true },
    );
  }

  reactivateMany(productIds: string[]) {
    return this.http.patch<{ reactivated: number }>(
      `${this.baseUrl}/reactivate`,
      { productIds },
      { withCredentials: true },
    );
  }
}
