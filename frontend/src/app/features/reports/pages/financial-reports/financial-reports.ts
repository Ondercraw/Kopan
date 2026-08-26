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
  argentinaMonthStart,
  argentinaRange,
  argentinaToday,
  shiftDate,
} from '../../../../shared/utils/argentina-date';
import { PaymentMethod, Sale } from '../../../sales/models/sale.model';
import { SalesService } from '../../../sales/services/sales.service';

@Component({
  selector: 'app-financial-reports',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './financial-reports.html',
  styleUrls: ['./financial-reports.scss', './financial-reports-dashboard.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinancialReports implements OnInit {
  private readonly api = inject(SalesService);
  readonly sales = signal<Sale[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  from = argentinaMonthStart();
  to = argentinaToday();
  payment: PaymentMethod | '' = '';
  readonly revenue = computed(() =>
    this.sales().reduce((sum, sale) => sum + sale.totalCentavos, 0),
  );
  readonly net = computed(() => this.sales().reduce((sum, sale) => sum + this.saleNet(sale), 0));
  readonly vat = computed(() =>
    this.sales().reduce((sum, sale) => sum + (sale.ivaCentavos ?? 0), 0),
  );
  readonly cost = computed(() =>
    this.sales().reduce((sum, sale) => sum + (sale.costoCentavos ?? 0), 0),
  );
  readonly detailedSales = computed(() =>
    this.sales().filter(
      (sale) =>
        (sale.netoCentavos ?? 0) > 0 ||
        (sale.ivaCentavos ?? 0) > 0 ||
        (sale.costoCentavos ?? 0) > 0,
    ),
  );
  readonly legacyCount = computed(() => this.sales().length - this.detailedSales().length);
  readonly detailedRevenue = computed(() =>
    this.detailedSales().reduce((sum, sale) => sum + sale.totalCentavos, 0),
  );
  readonly margin = computed(
    () =>
      this.detailedRevenue() -
      this.detailedSales().reduce((sum, sale) => sum + (sale.costoCentavos ?? 0), 0),
  );
  readonly average = computed(() =>
    this.sales().length ? Math.round(this.revenue() / this.sales().length) : 0,
  );
  readonly cash = computed(() =>
    this.sales()
      .filter((s) => s.medioPago === 'EFECTIVO')
      .reduce((sum, s) => sum + s.totalCentavos, 0),
  );
  readonly transfers = computed(() =>
    this.sales()
      .filter((s) => s.medioPago === 'TRANSFERENCIA')
      .reduce((sum, s) => sum + s.totalCentavos, 0),
  );
  readonly credit = computed(() =>
    this.sales()
      .filter((s) => s.medioPago === 'CREDITO')
      .reduce((sum, s) => sum + s.totalCentavos, 0),
  );
  readonly topProducts = computed(() => {
    const map = new Map<string, { name: string; quantity: number; amount: number }>();
    for (const sale of this.sales())
      for (const item of sale.items ?? []) {
        const key = String(item.productoId);
        const current = map.get(key) ?? {
          name: `#${item.productoCodigo} · ${item.productoNombre}`,
          quantity: 0,
          amount: 0,
        };
        current.quantity += item.cantidad;
        current.amount += item.totalCentavos;
        map.set(key, current);
      }
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 8);
  });
  readonly topClients = computed(() => {
    const map = new Map<string, { name: string; sales: number; amount: number }>();
    for (const sale of this.sales()) {
      const current = map.get(sale.clienteNombre) ?? {
        name: sale.clienteNombre,
        sales: 0,
        amount: 0,
      };
      current.sales++;
      current.amount += sale.totalCentavos;
      map.set(sale.clienteNombre, current);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 8);
  });
  readonly vatBreakdown = computed(() => {
    const map = new Map<number, { rate: number; net: number; vat: number; total: number }>();
    for (const sale of this.detailedSales())
      for (const item of sale.items ?? []) {
        const rate = Number(item.alicuotaIva ?? 0);
        const current = map.get(rate) ?? { rate, net: 0, vat: 0, total: 0 };
        current.net += item.netoCentavos ?? 0;
        current.vat += item.ivaCentavos ?? 0;
        current.total += item.totalCentavos;
        map.set(rate, current);
      }
    return [...map.values()].sort((a, b) => b.rate - a.rate);
  });
  readonly daily = computed(() => {
    const map = new Map<string, { date: string; count: number; amount: number }>();
    for (const sale of this.sales()) {
      const key = this.dateKey(sale.createdAt);
      const current = map.get(key) ?? { date: key, count: 0, amount: 0 };
      current.count++;
      current.amount += sale.totalCentavos;
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  });
  readonly maxDaily = computed(() => Math.max(1, ...this.daily().map((day) => day.amount)));
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
    this.api.findAll({ ...argentinaRange(this.from, this.to), medioPago: this.payment }).subscribe({
      next: (s) => {
        this.sales.set(s);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo generar el informe');
        this.loading.set(false);
      },
    });
  }
  preset(value: 'TODAY' | 'WEEK' | 'MONTH' | 'YEAR') {
    const today = argentinaToday();
    this.to = today;
    if (value === 'TODAY') this.from = today;
    else if (value === 'WEEK') this.from = shiftDate(today, -6);
    else if (value === 'YEAR') this.from = `${today.slice(0, 4)}-01-01`;
    else this.from = argentinaMonthStart(today);
    this.load();
  }
  saleNet(sale: Sale) {
    return (
      sale.netoCentavos ||
      ((sale.ivaCentavos ?? 0) > 0
        ? sale.totalCentavos - (sale.ivaCentavos ?? 0)
        : sale.totalCentavos)
    );
  }
  money(cents: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
      cents / 100,
    );
  }
  percent(value: number, total: number) {
    return total
      ? `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format((value * 100) / total)}%`
      : '0%';
  }
  barWidth(amount: number) {
    return `${Math.max(3, (amount * 100) / this.maxDaily())}%`;
  }
  dateLabel(date: string) {
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' }).format(
      new Date(`${date}T12:00:00-03:00`),
    );
  }
  private dateKey(value: string) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value));
  }
}
