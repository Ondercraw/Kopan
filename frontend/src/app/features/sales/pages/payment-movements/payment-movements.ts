import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  argentinaDateTime,
  argentinaMonthStart,
  argentinaRange,
  argentinaToday,
  shiftDate,
} from '../../../../shared/utils/argentina-date';
import { PaymentMethod, Sale } from '../../models/sale.model';
import { SalesService } from '../../services/sales.service';
import { StockService } from '../../../stock/services/stock.service';
import { Product } from '../../../stock/models/product.model';
import { forkJoin, of, catchError } from 'rxjs';

@Component({
  selector: 'app-payment-movements',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './payment-movements.html',
  styleUrls: ['./payment-movements.scss', './payment-movements-filters.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentMovementsPage implements OnInit {
  private readonly api = inject(SalesService);
  private readonly stockApi = inject(StockService);
  readonly sales = signal<Sale[]>([]);
  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  from = argentinaToday();
  to = argentinaToday();
  payment: PaymentMethod | '' = '';
  private readonly searchTerm = signal('');
  get search() { return this.searchTerm(); }
  set search(value: string) { this.searchTerm.set(value); }
  readonly filtered = computed(() => {
    const term = this.searchTerm().trim().toLocaleLowerCase('es');
    return this.sales().filter(
      (s) =>
        !term ||
        `${s.codigo} ${s.clienteNombre} ${s.referenciaTransferencia}`
          .toLocaleLowerCase('es')
          .includes(term),
    );
  });
  readonly cashTotal = computed(() =>
    this.filtered()
      .filter((s) => s.medioPago === 'EFECTIVO')
      .reduce((a, s) => a + s.totalCentavos, 0),
  );
  readonly transferTotal = computed(() =>
    this.filtered()
      .filter((s) => s.medioPago === 'TRANSFERENCIA')
      .reduce((a, s) => a + s.totalCentavos, 0),
  );
  readonly creditTotal = computed(() =>
    this.filtered()
      .filter((s) => s.medioPago === 'CREDITO')
      .reduce((a, s) => a + s.totalCentavos, 0),
  );
  readonly collectedCheckTotal = computed(() =>
    this.filtered().filter((s) => s.medioPago === 'CHEQUE' && s.chequeCobradoAt).reduce((a, s) => a + s.totalCentavos, 0),
  );
  readonly pendingCheckTotal = computed(() =>
    this.filtered().filter((s) => s.medioPago === 'CHEQUE' && !s.chequeCobradoAt).reduce((a, s) => a + s.totalCentavos, 0),
  );
  readonly checkTotal = computed(() => this.collectedCheckTotal() + this.pendingCheckTotal());
  readonly collectedTotal = computed(() => this.cashTotal() + this.transferTotal() + this.collectedCheckTotal());
  readonly total = computed(() => this.cashTotal() + this.transferTotal() + this.creditTotal() + this.checkTotal());
  readonly average = computed(() =>
    this.filtered().length ? Math.round(this.total() / this.filtered().length) : 0,
  );
  readonly rubroGroups = computed(() => {
    const sugarIds = new Set(this.products().filter(product => /^AZUCAR(?:ES)?(?:\b|$)/.test(product.tipo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase())).map(product => product._id));
    const groups = [
      { key: 'azucares', label: 'AZÚCARES', rows: [] as { sale: Sale; amount: number }[], sold: 0, cash: 0, transfer: 0, credit: 0, check: 0 },
      { key: 'varios', label: 'PRODUCTOS VARIOS', rows: [] as { sale: Sale; amount: number }[], sold: 0, cash: 0, transfer: 0, credit: 0, check: 0 },
    ];
    for (const sale of this.filtered()) {
      const sugar = sale.items.reduce((sum, item) => sum + (sugarIds.has(String(item.productoId)) ? item.totalCentavos : 0), 0);
      for (const [index, amount] of [sugar, sale.totalCentavos - sugar].entries()) {
        if (!amount) continue;
        const group = groups[index];
        group.rows.push({ sale, amount });
        group.sold += amount;
        if (sale.medioPago === 'EFECTIVO') group.cash += amount;
        else if (sale.medioPago === 'TRANSFERENCIA') group.transfer += amount;
        else if (sale.medioPago === 'CREDITO') group.credit += amount;
        else group.check += amount;
      }
    }
    return groups;
  });
  ngOnInit() {
    this.load();
    forkJoin({ active: this.stockApi.findAll(), inactive: this.stockApi.findInactive().pipe(catchError(() => of([] as Product[]))) }).subscribe({
      next: ({ active, inactive }) => this.products.set([...active, ...inactive]),
      error: () => this.error.set('No se pudieron cargar los rubros de los productos'),
    });
  }
  load() {
    if (!this.from || !this.to || this.from > this.to) {
      this.error.set('Revisá el período seleccionado');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const range = argentinaRange(this.from, this.to);
    this.api.findAll({ ...range, medioPago: this.payment }).subscribe({
      next: (s) => {
        this.sales.set(s);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los movimientos');
        this.loading.set(false);
      },
    });
  }
  preset(value: 'TODAY' | 'YESTERDAY' | '7D' | 'MONTH') {
    const today = argentinaToday();
    if (value === 'TODAY') this.from = this.to = today;
    else if (value === 'YESTERDAY') this.from = this.to = shiftDate(today, -1);
    else if (value === '7D') {
      this.from = shiftDate(today, -6);
      this.to = today;
    } else {
      this.from = argentinaMonthStart(today);
      this.to = today;
    }
    this.load();
  }
  clearSearch() {
    this.search = '';
  }
  money(c: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(c / 100);
  }
  date(v: string) {
    return argentinaDateTime(v);
  }
  paymentLabel(method: PaymentMethod): string {
    if (method === 'TRANSFERENCIA') return 'Transferencia / MP';
    if (method === 'CREDITO') return 'Crédito / cuenta corriente';
    if (method === 'CHEQUE') return 'Cheque';
    return 'Efectivo';
  }
}
