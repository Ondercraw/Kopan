import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ConfirmationModal } from '../../../../shared/components/confirmation-modal/confirmation-modal';
import { StockService } from '../../../stock/services/stock.service';
import { PendingSaleCost, ReplenishmentCandidate, SaleCostLink } from '../../models/purchase.model';
import { PurchasesService } from '../../services/purchases.service';

@Component({
  selector: 'app-sale-costs', standalone: true,
  imports: [FormsModule, ConfirmationModal],
  templateUrl: './sale-costs.html', styleUrl: './sale-costs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleCostsPage implements OnInit {
  private readonly purchases = inject(PurchasesService);
  private readonly stock = inject(StockService);
  readonly pending = signal<PendingSaleCost[]>([]);
  readonly rubros = signal(new Map<string, string>());
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly selected = signal<PendingSaleCost | null>(null);
  readonly candidates = signal<ReplenishmentCandidate[]>([]);
  readonly links = signal<SaleCostLink[]>([]);
  readonly unlinkTarget = signal<SaleCostLink | null>(null);
  search = '';
  rubro = '';
  showCompleted = false;
  purchaseSearch = '';
  from = '';
  to = '';
  quantityInput = '';
  manualCostInput = '';
  quantityValue() { return /^\d+$/.test(this.quantityInput.trim()) ? Number(this.quantityInput.trim()) : 0; }
  manualCostCents() {
    const value = this.manualCostInput.trim().replace(',', '.');
    return /^\d+(?:\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : 0;
  }
  readonly rubroOptions = computed(() => [...new Set(this.rubros().values())].sort((a,b) => a.localeCompare(b, 'es')));
  visible() {
    const term = this.normal(this.search);
    return this.pending().filter((row) => (this.showCompleted || row.pendingQuantity > 0)
      && (!this.rubro || this.rubros().get(row.productId) === this.rubro)
      && (!term || this.normal(`${row.productName} ${row.clientName} ${row.saleCode} ${row.productCode}`).includes(term)));
  }
  visibleCandidates() {
    const term = this.normal(this.purchaseSearch);
    return this.candidates().filter((row) => (!term || this.normal(`${row.purchaseCode} ${row.supplierName} ${row.purchaseKind}`).includes(term))
      && (!this.from || row.date.slice(0, 10) >= this.from)
      && (!this.to || row.date.slice(0, 10) <= this.to));
  }

  ngOnInit() { this.reload(); }
  reload() {
    this.loading.set(true);
    forkJoin({ pending: this.purchases.pendingSaleCosts(), products: this.stock.findAll(), inactive: this.stock.findInactive() }).subscribe({
      next: ({ pending, products, inactive }) => {
        this.pending.set(pending);
        this.rubros.set(new Map([...products, ...inactive].map((product) => [product._id, product.tipo])));
        this.loading.set(false);
      },
      error: (error) => { this.error.set(error.error?.message ?? 'No se pudieron cargar las ventas pendientes'); this.loading.set(false); },
    });
  }
  open(row: PendingSaleCost) {
    this.selected.set(row);
    this.error.set('');
    this.purchaseSearch = '';
    this.from = '';
    this.to = '';
    this.quantityInput = '';
    this.manualCostInput = '';
    this.loadModal(row);
  }
  private loadModal(row: PendingSaleCost) {
    forkJoin({ candidates: this.purchases.replenishmentCandidates(row.productId),
      links: this.purchases.saleCostLinks(row.saleId, row.saleItemIndex) }).subscribe({
      next: ({ candidates, links }) => { this.candidates.set(candidates); this.links.set(links); },
      error: (error) => this.error.set(error.error?.message ?? 'No se pudieron cargar las compras'),
    });
  }
  close() { if (!this.saving()) this.selected.set(null); }
  assign(row: ReplenishmentCandidate) {
    const selected = this.selected();
    const quantity = this.quantityValue();
    if (!selected || !this.quantityInput.trim() || !Number.isInteger(quantity) || quantity < 1
      || quantity > selected.pendingQuantity || quantity > row.availableQuantity) {
      this.error.set('Ingresá una cantidad entera que no supere las unidades pendientes ni las disponibles en la compra.');
      return;
    }
    this.saving.set(true); this.error.set('');
    this.purchases.assignSaleCost({ saleId: selected.saleId, saleItemIndex: selected.saleItemIndex,
      purchaseId: row.purchaseId, purchaseLineNumber: row.purchaseLineNumber, quantity }).subscribe({
      next: () => { this.saving.set(false); this.selected.set(null);
        this.success.set(`Se vincularon ${quantity} unidades de la venta #${selected.saleCode}. El informe financiero tomará el costo de la compra.`);
        this.reload(); },
      error: (error) => { this.saving.set(false); this.error.set(error.error?.message ?? 'No se pudo vincular la compra'); },
    });
  }
  assignManual() {
    const sale = this.selected();
    const quantity = this.quantityValue();
    const unitCostCents = this.manualCostCents();
    if (!sale || !this.quantityInput.trim() || !Number.isInteger(quantity) || quantity < 1 || quantity > sale.pendingQuantity
      || !Number.isSafeInteger(unitCostCents) || unitCostCents < 1) {
      this.error.set('Ingresá unidades pendientes y un costo por unidad mayor a $0.');
      return;
    }
    this.saving.set(true); this.error.set('');
    this.purchases.assignManualSaleCost({ saleId: sale.saleId, saleItemIndex: sale.saleItemIndex, quantity, unitCostCents }).subscribe({
      next: () => { this.saving.set(false); this.selected.set(null);
        this.success.set(`Se asignó un costo manual a ${quantity} unidades de la venta #${sale.saleCode}.`); this.reload(); },
      error: (error) => { this.saving.set(false); this.error.set(error.error?.message ?? 'No se pudo asignar el costo'); },
    });
  }
  unlink() {
    const target = this.unlinkTarget();
    if (!target) return;
    this.saving.set(true);
    this.purchases.unlinkSaleCost(target._id).subscribe({
      next: () => { this.saving.set(false); this.unlinkTarget.set(null); this.selected.set(null);
        this.success.set('Vinculación quitada. El costo volverá a quedar pendiente.'); this.reload(); },
      error: (error) => { this.saving.set(false); this.unlinkTarget.set(null);
        this.error.set(error.error?.message ?? 'No se pudo quitar la vinculación'); },
    });
  }
  money(cents: number) { return (cents / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' }); }
  date(value: string) { return new Date(value).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }); }
  private normal(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR'); }
}
