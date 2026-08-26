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
  readonly sales = signal<Sale[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  from = argentinaToday();
  to = argentinaToday();
  payment: PaymentMethod | '' = '';
  search = '';
  readonly filtered = computed(() => {
    const term = this.search.trim().toLocaleLowerCase('es');
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
  readonly collectedTotal = computed(() => this.cashTotal() + this.transferTotal());
  readonly total = computed(() => this.collectedTotal() + this.creditTotal());
  readonly average = computed(() =>
    this.filtered().length ? Math.round(this.total() / this.filtered().length) : 0,
  );
  ngOnInit() {
    this.load();
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
    return 'Efectivo';
  }
}
