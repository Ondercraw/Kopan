import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Client, ClientOptions } from '../../../clients/models/client.model';
import { ClientsService } from '../../../clients/services/clients.service';
import { Product } from '../../../stock/models/product.model';
import { StockService } from '../../../stock/services/stock.service';
import { CommissionOverview, CommissionRule, CommissionSale } from '../../models/commission.model';
import { SellerCommissionsService } from '../../services/seller-commissions.service';

@Component({ selector: 'app-sellers-list', standalone: true, imports: [FormsModule],
  templateUrl: './sellers-list.html', styleUrls: ['./sellers-list.scss', './sellers-commissions.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush })
export class SellersList implements OnInit {
  private readonly clientsApi = inject(ClientsService);
  private readonly stockApi = inject(StockService);
  private readonly commissionsApi = inject(SellerCommissionsService);
  readonly options = signal<ClientOptions>({ groups: [], locations: [], sellers: [], priceLists: [] });
  readonly clients = signal<Client[]>([]);
  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly expandedSellerId = signal<string | null>(null);
  readonly overview = signal<CommissionOverview | null>(null);
  readonly ruleModal = signal(false);
  readonly payTarget = signal<CommissionSale | null>(null);
  readonly deleteTarget = signal<CommissionRule | null>(null);
  ruleScope: 'RUBRO' | 'PRODUCTO' = 'RUBRO';
  ruleRubro = '';
  ruleProductId = '';
  ruleMode: 'PORCENTAJE' | 'MONTO_FIJO' = 'PORCENTAJE';
  ruleValue = '';
  paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA' = 'EFECTIVO';
  readonly rubros = computed(() => [...new Set(this.products().map((product) => product.tipo))]
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })));
  readonly sellerRows = computed(() => this.options().sellers.map((seller) => ({ ...seller,
    clients: this.clients().filter((client) => client.activo && client.vendedorId?._id === seller._id)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) })));

  ngOnInit(): void {
    let pending = 3;
    const done = () => { if (--pending === 0) this.loading.set(false); };
    this.clientsApi.options().subscribe({ next: (value) => { this.options.set(value); done(); }, error: () => { this.error.set('No se pudieron cargar los vendedores'); done(); } });
    this.clientsApi.findAll().subscribe({ next: (value) => { this.clients.set(value); done(); }, error: () => { this.error.set('No se pudieron cargar los clientes'); done(); } });
    this.stockApi.findAll().subscribe({ next: (value) => { this.products.set(value); done(); }, error: () => { this.error.set('No se pudieron cargar los productos para las reglas'); done(); } });
  }

  toggleSeller(id: string): void {
    if (this.expandedSellerId() === id) { this.expandedSellerId.set(null); this.overview.set(null); return; }
    this.expandedSellerId.set(id);
    this.reloadOverview(id);
  }
  reloadOverview(id = this.expandedSellerId()): void {
    if (!id) return;
    this.commissionsApi.overview(id).subscribe({ next: (value) => this.overview.set(value),
      error: (err) => this.error.set(err?.error?.message ?? 'No se pudieron consultar las comisiones') });
  }
  openRuleModal(): void {
    this.ruleScope = 'RUBRO'; this.ruleRubro = ''; this.ruleProductId = '';
    this.ruleMode = 'PORCENTAJE'; this.ruleValue = ''; this.error.set(null); this.ruleModal.set(true);
  }
  saveRule(): void {
    const sellerId = this.expandedSellerId();
    const value = Number(this.ruleValue.replace(',', '.'));
    if (!sellerId || !Number.isFinite(value) || Math.round(value * 100) <= 0 || (this.ruleMode === 'PORCENTAJE' && value > 100)) {
      this.error.set('Ingresá una comisión válida entre 0 y 100 % o un monto mayor a $0'); return;
    }
    if (this.ruleScope === 'RUBRO' && !this.ruleRubro || this.ruleScope === 'PRODUCTO' && !this.ruleProductId) {
      this.error.set('Elegí un rubro o producto'); return;
    }
    const payload: Omit<CommissionRule, '_id'> = { scope: this.ruleScope,
      ...(this.ruleScope === 'RUBRO' ? { rubro: this.ruleRubro } : { productoId: this.ruleProductId }),
      mode: this.ruleMode, value: Math.round(value * 100) };
    this.saving.set(true);
    this.commissionsApi.saveRule(sellerId, payload).subscribe({ next: () => { this.saving.set(false); this.ruleModal.set(false); this.reloadOverview(sellerId); },
      error: (err) => { this.saving.set(false); this.error.set(err?.error?.message ?? 'No se pudo guardar la regla'); } });
  }
  deleteRule(rule: CommissionRule): void {
    this.deleteTarget.set(rule);
  }
  confirmDeleteRule(): void {
    const sellerId = this.expandedSellerId(); const rule = this.deleteTarget(); if (!sellerId || !rule) return;
    this.commissionsApi.deleteRule(sellerId, rule._id).subscribe({ next: () => this.reloadOverview(sellerId),
      error: (err) => this.error.set(err?.error?.message ?? 'No se pudo eliminar la regla') });
    this.deleteTarget.set(null);
  }
  pay(): void {
    const sale = this.payTarget(); if (!sale || this.saving()) return;
    this.saving.set(true);
    this.commissionsApi.pay(sale.id, this.paymentMethod).subscribe({ next: () => { this.saving.set(false); this.payTarget.set(null); this.reloadOverview(); },
      error: (err) => { this.saving.set(false); this.error.set(err?.error?.message ?? 'No se pudo registrar el pago'); } });
  }
  productName(id?: string): string { return this.products().find((product) => product._id === id)?.nombre ?? 'Producto'; }
  ruleLabel(rule: CommissionRule): string { return rule.scope === 'RUBRO' ? `Rubro ${rule.rubro}` : this.productName(rule.productoId); }
  ruleValueLabel(rule: CommissionRule): string { return rule.mode === 'PORCENTAJE' ? `${(rule.value / 100).toLocaleString('es-AR')} %` : this.money(rule.value); }
  money(cents: number): string { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(cents / 100); }
  date(value: string): string { return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' }).format(new Date(value)); }
}
