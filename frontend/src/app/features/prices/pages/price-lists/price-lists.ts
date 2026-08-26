import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { normalizeUserRoles, UserRole } from '../../../../core/models/user-role.enum';
import { AuthService } from '../../../../core/services/auth.service';
import { Product } from '../../../stock/models/product.model';
import { StockService } from '../../../stock/services/stock.service';
import { PriceList, PriceListDetail } from '../../models/price-list.model';
import { PricesService } from '../../services/prices.service';
import { ConfirmationModal } from '../../../../shared/components/confirmation-modal/confirmation-modal';
import { CurrencyInput } from '../../../../shared/components/currency-input/currency-input';

@Component({
  selector: 'app-price-lists',
  standalone: true,
  imports: [FormsModule, ConfirmationModal, CurrencyInput],
  templateUrl: './price-lists.html',
  styleUrls: ['./price-lists.scss', './price-lists-adjustments.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceListsPage implements OnInit {
  private readonly prices = inject(PricesService);
  private readonly stock = inject(StockService);
  private readonly auth = inject(AuthService);
  readonly lists = signal<PriceList[]>([]);
  readonly products = signal<Product[]>([]);
  readonly selected = signal<PriceListDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly draftPrices = signal<Record<string, number>>({});
  readonly pendingPrice = signal<{ product: Product; amount: number } | null>(null);
  readonly savingPrice = signal(false);
  readonly canEdit = computed(() =>
    normalizeUserRoles(this.auth.currentUser()?.roles ?? []).includes(UserRole.JEFE),
  );
  newName = '';
  newDescription = '';
  readonly search = signal('');
  readonly visibleProducts = computed(() => {
    const q = this.search().trim().toLocaleLowerCase('es');
    return this.products().filter(
      (p) => !q || p.nombre.toLocaleLowerCase('es').includes(q) || String(p.codigo).includes(q),
    );
  });
  ngOnInit() {
    this.reload();
    this.stock.findAll().subscribe({
      next: (p) => this.products.set(p),
      error: () => this.error.set('No se pudieron cargar los productos'),
    });
  }
  reload() {
    this.loading.set(true);
    this.prices.findAll().subscribe({
      next: (l) => {
        this.lists.set(l);
        this.loading.set(false);
        if (!this.selected() && l.find((x) => x.activo)) this.open(l.find((x) => x.activo)!);
      },
      error: () => {
        this.error.set('No se pudieron cargar las listas');
        this.loading.set(false);
      },
    });
  }
  open(list: PriceList) {
    this.prices.findOne(list._id).subscribe({
      next: (d) => this.selected.set(d),
      error: () => this.error.set('No se pudo abrir la lista'),
    });
  }
  create() {
    const nombre = this.newName.trim();
    if (nombre.length < 2) return;
    this.prices.create({ nombre, descripcion: this.newDescription.trim() || undefined }).subscribe({
      next: (l) => {
        this.newName = '';
        this.newDescription = '';
        this.success.set('Lista creada');
        this.reload();
        this.open({ ...l });
      },
      error: (e) => this.error.set(e.error?.message ?? 'No se pudo crear la lista'),
    });
  }
  currentPrice(productId: string) {
    return (
      (this.selected()?.items ?? []).find((i) => i.productoId._id === productId)?.precioCentavos ??
      null
    );
  }
  draftPrice(productId: string) {
    return this.draftPrices()[productId] ?? (this.currentPrice(productId) ?? 0) / 100;
  }
  updateDraftPrice(productId: string, value: number) {
    this.draftPrices.update((current) => ({ ...current, [productId]: value }));
  }
  requestPriceSave(product: Product) {
    const amount = this.draftPrice(product._id);
    if (!Number.isFinite(amount) || amount < 0) {
      this.error.set('Ingresá un precio válido');
      return;
    }
    this.error.set(null);
    this.pendingPrice.set({ product, amount });
  }
  confirmPriceSave() {
    const list = this.selected(),
      pending = this.pendingPrice();
    if (!list || !pending || this.savingPrice()) return;
    this.savingPrice.set(true);
    this.prices
      .setPrice(list._id, pending.product._id, Math.round(pending.amount * 100))
      .subscribe({
        next: () => {
          this.success.set(`Precio de ${pending.product.nombre} actualizado`);
          this.pendingPrice.set(null);
          this.savingPrice.set(false);
          this.open(list);
        },
        error: (e) => {
          this.error.set(e.error?.message ?? 'No se pudo guardar el precio');
          this.savingPrice.set(false);
          this.pendingPrice.set(null);
        },
      });
  }
  money(cents: number | null) {
    return cents === null
      ? 'Sin precio'
      : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(cents / 100);
  }
  finalPrice(product: Product, netCents: number | null): number | null {
    return netCents === null
      ? null
      : Math.round(netCents * (1 + Number(product.alicuotaIva ?? 21) / 100));
  }
}
