import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CreateProductPayload,
  Product,
  InventoryLotOption,
  StockMovement,
  UpdateProductPayload,
} from '../models/product.model';

@Injectable({ providedIn: 'root' })
export class StockService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/stock/products`;

  findAll() {
    return this.http.get<Product[]>(this.baseUrl, { withCredentials: true }).pipe(map(this.normalizeProducts));
  }

  findInactive() {
    return this.http.get<Product[]>(`${this.baseUrl}/inactive`, { withCredentials: true }).pipe(map(this.normalizeProducts));
  }

  findMovements(id: string) {
    return this.http.get<StockMovement[]>(`${this.baseUrl}/${id}/movements`, {
      withCredentials: true,
    });
  }

  findLots(id: string) {
    return this.http.get<InventoryLotOption[]>(`${this.baseUrl}/${id}/lots`, {
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

  private readonly normalizeProducts = (products: Product[]) =>
    products.map((product) => ({ ...product, tipo: product.tipo.trim().toLocaleUpperCase('es-AR') }))
      .sort((a,b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base', numeric: true }));
}
