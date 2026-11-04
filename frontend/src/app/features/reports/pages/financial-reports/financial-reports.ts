import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  argentinaMonthStart,
  argentinaRange,
  argentinaToday,
  shiftDate,
} from '../../../../shared/utils/argentina-date';
import { Sale } from '../../../sales/models/sale.model';
import { SalesService } from '../../../sales/services/sales.service';
import { FinanceService } from '../../../finance/services/finance.service';
import { SearchableSelect, SearchableSelectOption } from '../../../../shared/components/searchable-select/searchable-select';
import { StockService } from '../../../stock/services/stock.service';
import { Product } from '../../../stock/models/product.model';

@Component({
  selector: 'app-financial-reports',
  standalone: true,
  imports: [FormsModule, SearchableSelect],
  templateUrl: './financial-reports.html',
  styleUrls: ['./financial-reports.scss', './financial-reports-dashboard.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinancialReports implements OnInit {
  private readonly api = inject(SalesService);
  private readonly financeApi = inject(FinanceService);
  private readonly stockApi = inject(StockService);
  readonly products = signal<Product[]>([]);
  readonly allSales = signal<Sale[]>([]);
  readonly totalExpenses = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  from = argentinaMonthStart();
  to = argentinaToday();
  readonly rubro = signal('');
  readonly selectedProductIds = signal<string[]>([]);
  readonly productSearch = signal('');
  readonly rubroOptions = computed<SearchableSelectOption[]>(() => [...new Set(this.products().map((product) => product.tipo))]
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })).map((value) => ({ value, label: value })));
  readonly productOptions = computed<SearchableSelectOption[]>(() => {
    const allowed = this.rubro() ? new Set(this.products().filter((product) => product.tipo === this.rubro()).map((product) => product._id)) : null;
    const products = new Map<string, string>();
    for (const product of this.products())
      if (!allowed || allowed.has(product._id)) products.set(product._id, `#${product.codigo} · ${product.nombre}`);
    for (const sale of this.allSales())
      for (const item of sale.items ?? [])
        if (!allowed || allowed.has(String(item.productoId))) products.set(String(item.productoId), `#${item.productoCodigo} · ${item.productoNombre}`);
    return [...products].map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
  });
  readonly visibleProductOptions = computed(() => {
    const term = this.productSearch().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim();
    return term ? this.productOptions().filter((option) => option.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').includes(term)) : this.productOptions();
  });
  readonly rows = computed(() => this.allSales().flatMap((sale) => {
    const selected = this.selectedProductIds();
    const allowed = selected.length ? new Set(selected) : this.rubro()
      ? new Set(this.products().filter((product) => product.tipo === this.rubro()).map((product) => product._id)) : null;
    const items = allowed
      ? (sale.items ?? []).filter((item) => allowed.has(String(item.productoId)))
      : sale.items ?? [];
    if (allowed && !items.length) return [];
    const amount = allowed ? items.reduce((sum, item) => sum + item.totalCentavos, 0) : sale.totalCentavos;
    const cost = allowed
      ? items.reduce((sum, item) => sum + (item.costoPromedioUnitarioCentavos ?? item.costoUnitarioCentavos ?? 0) * item.cantidad, 0)
      : sale.costoPromedioCentavos ?? sale.costoCentavos ?? 0;
    const detailed = items.some((item) => (item.netoCentavos ?? 0) > 0 || (item.ivaCentavos ?? 0) > 0 || (item.costoUnitarioCentavos ?? 0) > 0)
      || (!allowed && ((sale.netoCentavos ?? 0) > 0 || (sale.ivaCentavos ?? 0) > 0 || cost > 0));
    return [{ sale, items, amount, cost, detailed }];
  }));
  readonly sales = computed(() => this.rows().map((row) => row.sale));
  readonly revenue = computed(() =>
    this.rows().reduce((sum, row) => sum + row.amount, 0),
  );
  readonly cost = computed(() =>
    this.rows().reduce((sum, row) => sum + row.cost, 0),
  );
  readonly detailedRows = computed(() => this.rows().filter((row) => row.detailed));
  readonly legacyCount = computed(() => this.rows().length - this.detailedRows().length);
  readonly detailedRevenue = computed(() =>
    this.detailedRows().reduce((sum, row) => sum + row.amount, 0),
  );
  readonly margin = computed(
    () =>
      this.detailedRevenue() -
      this.detailedRows().reduce((sum, row) => sum + row.cost, 0),
  );
  readonly average = computed(() =>
    this.sales().length ? Math.round(this.revenue() / this.sales().length) : 0,
  );
  readonly cash = computed(() =>
    this.rows().reduce((sum, row) => sum + this.methodAmount(row.sale, row.amount, 'EFECTIVO'), 0),
  );
  readonly transfers = computed(() =>
    this.rows().reduce((sum, row) => sum + this.methodAmount(row.sale, row.amount, 'TRANSFERENCIA'), 0),
  );
  readonly credit = computed(() =>
    this.rows().reduce((sum, row) => sum + this.methodAmount(row.sale, row.amount, 'CREDITO'), 0),
  );
  readonly checks = computed(() =>
    this.rows().reduce((sum, row) => sum + this.methodAmount(row.sale, row.amount, 'CHEQUE'), 0),
  );
  private methodAmount(sale: Sale, selectedAmount: number, method: Sale['medioPago']): number {
    if (sale.medioPago !== 'CREDITO') return sale.medioPago === method ? selectedAmount : 0;
    const initial = sale.montoCobradoInicialCentavos ?? 0;
    const check = sale.montoChequeCentavos ?? 0;
    const full = sale.totalCentavos || 1;
    const amounts = {
      EFECTIVO: sale.medioPagoInformado === 'EFECTIVO' ? initial : 0,
      TRANSFERENCIA: sale.medioPagoInformado === 'TRANSFERENCIA' ? initial : 0,
      CHEQUE: check,
      CREDITO: Math.max(0, sale.totalCentavos - initial - check),
    };
    return Math.round(amounts[method] * selectedAmount / full);
  }
  readonly topProducts = computed(() => {
    const map = new Map<string, { name: string; quantity: number; amount: number }>();
    for (const row of this.rows())
      for (const item of row.items) {
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
    for (const row of this.rows()) {
      const sale = row.sale;
      const current = map.get(sale.clienteNombre) ?? {
        name: sale.clienteNombre,
        sales: 0,
        amount: 0,
      };
      current.sales++;
      current.amount += row.amount;
      map.set(sale.clienteNombre, current);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 8);
  });
  readonly daily = computed(() => {
    const map = new Map<string, { date: string; count: number; amount: number }>();
    for (const row of this.rows()) {
      const key = this.dateKey(row.sale.fechaFacturacion ?? row.sale.createdAt);
      const current = map.get(key) ?? { date: key, count: 0, amount: 0 };
      current.count++;
      current.amount += row.amount;
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  });
  readonly maxDaily = computed(() => Math.max(1, ...this.daily().map((day) => day.amount)));
  ngOnInit() {
    forkJoin({ active: this.stockApi.findAll(), inactive: this.stockApi.findInactive() }).subscribe({
      next: ({ active, inactive }) => this.products.set([...active, ...inactive]),
      error: () => this.error.set('No se pudieron cargar los rubros'),
    });
    this.load();
  }
  selectRubro(value: string) { this.rubro.set(value); this.selectedProductIds.set([]); this.productSearch.set(''); }
  toggleProduct(id: string) { this.selectedProductIds.update((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]); }
  selectAllProducts() { this.selectedProductIds.set(this.visibleProductOptions().map((option) => option.value)); }
  load() {
    if (!this.from || !this.to || this.from > this.to) {
      this.error.set('Revisá el período seleccionado');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const range = argentinaRange(this.from, this.to);
    forkJoin({
      sales: this.api.findFinancialReport(range),
      expenses: this.financeApi.totalExpenses(range),
    }).subscribe({
      next: ({ sales, expenses }) => {
        this.allSales.set(sales);
        this.totalExpenses.set(expenses.totalCentavos);
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
  printSales() {
    if (!this.sales().length) { this.error.set('No hay ventas en el período elegido para imprimir'); return; }
    const popup = window.open('', '_blank', 'width=900,height=760');
    if (!popup) { this.error.set('El navegador bloqueó la ventana del informe'); return; }
    const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
    const rows = [...this.rows()].sort((a, b) => (a.sale.fechaFacturacion ?? a.sale.createdAt).localeCompare(b.sale.fechaFacturacion ?? b.sale.createdAt)).map(({ sale, amount }) =>
      `<tr><td>${escape(this.dateKey(sale.fechaFacturacion ?? sale.createdAt))}</td><td>#${sale.codigo}</td><td>${escape(sale.clienteNombre)}</td><td>${escape(sale.modalidadEntrega === 'REPARTO' ? 'Reparto · cuenta corriente' : sale.medioPago)}</td><td class="amount">${escape(this.money(amount))}</td></tr>`,
    ).join('');
    const selectedProduct = this.selectedProductIds().length ? `${this.selectedProductIds().length} productos` : this.rubro();
    const title = `Ventas-${this.from}-${this.to}${selectedProduct ? '-filtradas' : ''}`;
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escape(title)}</title><style>@page{size:A4;margin:14mm 12mm 18mm;@bottom-right{content:'Página ' counter(page);font-size:10px;color:#7b6251}}*{box-sizing:border-box}body{margin:0;color:#2d190e;font:12px Arial,sans-serif}header{border-bottom:3px solid #713508;margin-bottom:18px;padding-bottom:12px}h1{margin:4px 0;font:700 25px Georgia,serif}small{color:#765b4b}.summary{padding:12px;background:#f5e8dc;margin-bottom:18px;font-weight:700}table{width:100%;border-collapse:collapse}thead{display:table-header-group}th{background:#713508;color:#fff;text-align:left;padding:9px}td{border-bottom:1px solid #e6d6ca;padding:8px;overflow-wrap:anywhere}tr{break-inside:avoid}.amount{text-align:right;white-space:nowrap}tfoot td{background:#ead6c4;font-weight:800}</style></head><body><header><small>DISTRIBUIDORA KOPAN</small><h1>Ventas del período</h1><small>${escape(this.from)} al ${escape(this.to)}${selectedProduct ? ` · ${escape(selectedProduct)}` : ''}</small></header><div class="summary">${this.sales().length} ventas · Total ${escape(this.money(this.revenue()))}</div><table><thead><tr><th>Fecha</th><th>Número</th><th>Cliente</th><th>Modalidad / pago</th><th class="amount">Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="4">TOTAL</td><td class="amount">${escape(this.money(this.revenue()))}</td></tr></tfoot></table><script>window.onload=()=>setTimeout(()=>window.print(),150);<\/script></body></html>`);
    popup.document.close();
  }
}
