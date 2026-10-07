import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyInput } from '../../../../shared/components/currency-input/currency-input';
import { PaginationControls } from '../../../../shared/components/pagination-controls/pagination-controls';
import {
  SearchableSelect,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select';
import {
  argentinaDateTime,
  argentinaRange,
  argentinaToday,
  shiftDate,
} from '../../../../shared/utils/argentina-date';
import { Supplier } from '../../../suppliers/models/supplier.model';
import { SuppliersService } from '../../../suppliers/services/suppliers.service';
import {
  FinancialMovement,
  FinancialPaymentMethod,
  FinancialSummary,
} from '../../models/financial-movement.model';
import { FinanceService } from '../../services/finance.service';
import { ChecksService } from '../../../checks/services/checks.service';
import { RouterLink } from '@angular/router';
import { PaymentMethod, Sale } from '../../../sales/models/sale.model';
import { SalesService } from '../../../sales/services/sales.service';
import { PurchasesService } from '../../../purchases/services/purchases.service';
import { ClientsService } from '../../../clients/services/clients.service';
import { forkJoin } from 'rxjs';
import { RemittancesService, RemittanceRecord } from '../../../sales/services/remittances.service';

interface EditableSaleLine {
  productoId: string;
  productoNombre: string;
  cantidad: number | null;
  precioFinalPesos: number | null;
}

const EMPTY: FinancialSummary = {
  ingresosCentavos: 0,
  gastosAutomaticosCentavos: 0,
  gastosReposicionPagadosCentavos: 0,
  gastosReposicionPendientesCentavos: 0,
  gastosManualesCentavos: 0,
  gastosManualesPendientesCentavos: 0,
  comprasPagadasCentavos: 0,
  comprasPendientesCentavos: 0,
  resultadoCentavos: 0,
  efectivoDisponibleCentavos: 0,
  transferenciaDisponibleCentavos: 0,
  chequesCobradosCentavos: 0,
  chequesEfectivoCentavos: 0,
  chequesTransferenciaCentavos: 0,
  chequesPendientesCentavos: 0,
  cuentaCorrienteCentavos: 0,
  gastosPendientesCentavos: 0,
};
@Component({
  selector: 'app-income-expenses',
  standalone: true,
  imports: [FormsModule, CurrencyInput, PaginationControls, SearchableSelect, RouterLink],
  templateUrl: './income-expenses.html',
  styleUrls: [
    './income-expenses.scss',
    './income-expenses-responsive.scss',
    './income-expenses-adjustments.scss',
    './income-expenses-purchases.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncomeExpensesPage implements OnInit {
  private readonly api = inject(FinanceService);
  private readonly suppliersApi = inject(SuppliersService);
  private readonly checksApi = inject(ChecksService);
  private readonly salesApi = inject(SalesService);
  private readonly purchasesApi = inject(PurchasesService);
  private readonly clientsApi = inject(ClientsService);
  private readonly remittancesApi = inject(RemittancesService);
  readonly items = signal<FinancialMovement[]>([]);
  readonly period = signal<FinancialSummary>(EMPTY);
  readonly overall = signal<FinancialSummary>(EMPTY);
  readonly suppliers = signal<Supplier[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly expenseOpen = signal(false);
  readonly paying = signal<FinancialMovement | null>(null);
  readonly collecting = signal<FinancialMovement | null>(null);
  readonly cancelling = signal<FinancialMovement | null>(null);
  readonly editingSale = signal<Sale | null>(null);
  readonly cancellingSale = signal<FinancialMovement | null>(null);
  readonly saleToCancel = signal<Sale | null>(null);
  readonly cancellingPurchase = signal<FinancialMovement | null>(null);
  purchaseCancelReason = '';
  openPurchaseCancellation(movement: FinancialMovement) {
    this.error.set(null);
    this.purchaseCancelReason = '';
    this.cancellingPurchase.set(movement);
  }
  openSaleCancellation(movement: FinancialMovement) {
    if (!movement.ventaId) return;
    this.error.set(null);
    this.saleToCancel.set(null);
    this.saleCancelReason = '';
    this.salesApi.findOne(movement.ventaId).subscribe({
      next: (sale) => { this.saleToCancel.set(sale); this.cancellingSale.set(movement); },
      error: (e) => this.error.set(e.error?.message ?? 'No se pudo consultar la venta'),
    });
  }
  saleCollectedCents(): number {
    const sale = this.saleToCancel();
    return sale?.montoCobradoCuentaCorrienteCentavos ?? 0;
  }
  reprintSale(movement: FinancialMovement) {
    if (!movement.ventaId) return;
    const popup = window.open('', '_blank', 'width=900,height=760');
    if (!popup) { this.error.set('Habilitá las ventanas emergentes para reimprimir el comprobante.'); return; }
    this.salesApi.findOne(movement.ventaId).subscribe({
      next: (sale) => this.clientsApi.findAll().subscribe({
        next: (clients) => {
          const client = clients.find((item) => item.codigo === sale.clienteCodigo);
          const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
          const amount = (cents: number) => this.money(cents);
          const rows = sale.items.map((item) => `<tr><td>${item.cantidad}</td><td>${esc(item.productoNombre)}</td><td>${esc(amount(Math.round(item.totalCentavos / item.cantidad)))}</td><td>${esc(amount(item.totalCentavos))}</td></tr>`).join('');
          const transport = (sale.transporteDescargaCentavos ?? 0) > 0
            ? `<tr><td>1</td><td>TRANSPORTE Y DESCARGA</td><td>${esc(amount(sale.transporteDescargaCentavos!))}</td><td>${esc(amount(sale.transporteDescargaCentavos!))}</td></tr>` : '';
          const date = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short' }).format(new Date(sale.createdAt));
          const filename = `${sale.clienteNombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-')}-COMPROBANTE-${date.replaceAll('/', '-')}`;
          popup.document.open();
          popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(filename)}</title><style>@page{size:A4;margin:12mm}body{font:13px Arial,sans-serif;color:#2d190e}.ticket{max-width:820px;margin:auto}.brand{display:flex;justify-content:space-between;border-bottom:3px solid #713508;padding-bottom:16px}.brand h1{font:700 26px Georgia,serif;margin:0}.brand p{color:#713508}.date{text-align:right;font-size:20px;font-weight:700}.number{font-size:22px}.notice{background:#fbf1e7;border-left:4px solid #b86719;padding:10px;margin:16px 0}.details div{border-bottom:1px solid #eaded5;padding:7px 0}.details span{display:inline-block;width:100px;color:#846b5b;text-transform:uppercase;font-size:11px}table{width:100%;border-collapse:collapse;margin-top:22px}th{background:#713508;color:white;text-align:left;padding:10px}td{padding:10px;border-bottom:1px solid #eaded5}th:nth-child(n+3),td:nth-child(n+3){text-align:right}.total{text-align:right;background:#f1e2d4;border:2px solid #713508;padding:16px;margin-top:26px;font:700 28px Georgia,serif}.footer{text-align:center;margin-top:24px;color:#806858}.notes{margin-top:20px;padding:12px;background:#fbf6f1;white-space:pre-wrap}@media print{button{display:none}}</style></head><body><main class="ticket"><header class="brand"><div><h1>Distribuidora Kopan</h1><p>COMPROBANTE</p></div><div class="date"><div class="number">Numero: ${String(sale.codigo).padStart(8, '0')}</div>${esc(date)}</div></header><p class="notice">COMPROBANTE INTERNO · NO VÁLIDO COMO FACTURA</p><section class="details"><div><span>Cliente</span>${esc(sale.clienteNombre)}</div><div><span>Dirección</span>${esc(client?.direccion || 'Sin informar')}</div><div><span>Localidad</span>${esc(client?.localidad || 'Sin informar')}</div><div><span>Pago</span>${esc(sale.medioPago)}</div><div><span>Vendedor</span>${esc(sale.actorName)}</div></section><table><thead><tr><th>Cantidad</th><th>Producto</th><th>Precio unitario</th><th>Total</th></tr></thead><tbody>${rows}${transport}</tbody></table><div class="total">Total ${esc(amount(sale.totalCentavos))}</div><p class="footer">Gracias por su compra · Distribuidora Kopan.</p>${sale.observaciones ? `<section class="notes">Observaciones: ${esc(sale.observaciones)}</section>` : ''}</main><script>window.onload=()=>{setTimeout(()=>window.print(),150)};<\/script></body></html>`);
          popup.document.head.insertAdjacentHTML('beforeend', '<style>.brand{display:flex!important;align-items:center;justify-content:space-between;gap:18px}.brand h1{font-size:22px;white-space:nowrap}.date{display:flex;align-items:center;gap:12px;white-space:nowrap;font-size:16px}.number{font-size:16px}</style>');
          popup.document.close();
        },
        error: () => { popup.close(); this.error.set('No se pudieron cargar los datos del cliente para el comprobante'); },
      }),
      error: () => { popup.close(); this.error.set('No se pudo cargar la venta para reimprimir'); },
    });
  }
  reprintRemittance(movement: FinancialMovement) {
    if (!movement.remitoId) return;
    const popup = window.open('', '_blank', 'width=900,height=760');
    if (!popup) { this.error.set('Habilitá las ventanas emergentes para reimprimir el remito.'); return; }
    this.remittancesApi.findOne(movement.remitoId).subscribe({
      next: (remittance) => {
        const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
        const date = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short' }).format(new Date(remittance.createdAt));
        const rows = remittance.items.map((item) => `<tr><td>${item.cantidad}</td><td>${esc(item.productoNombre)}</td></tr>`).join('');
        const title = `${remittance.clienteNombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-')}-REMITO-${date.replaceAll('/', '-')}`;
        popup.document.open();
        popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:12mm}body{font:13px Arial,sans-serif;color:#2d190e}.ticket{max-width:820px;margin:auto}.brand{display:flex;align-items:center;justify-content:space-between;gap:18px;border-bottom:3px solid #713508;padding-bottom:16px}.brand h1{font:700 25px Georgia,serif;margin:0;white-space:nowrap}.number{display:flex;gap:18px;align-items:center;white-space:nowrap;font-size:18px;font-weight:700}.notice{background:#fbf1e7;border-left:4px solid #b86719;padding:10px;margin:16px 0}.details div{border-bottom:1px solid #eaded5;padding:7px 0}.details span{display:inline-block;width:100px;color:#846b5b;text-transform:uppercase;font-size:11px}table{width:100%;border-collapse:collapse;margin-top:22px}th{background:#713508;color:white;text-align:left;padding:10px}td{padding:10px;border-bottom:1px solid #eaded5}th:first-child,td:first-child{width:100px;text-align:center}.notes{margin-top:20px;padding:12px;background:#fbf6f1;white-space:pre-wrap}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Imprimir o guardar PDF</button><main class="ticket"><header class="brand"><h1>Distribuidora Kopan</h1><div class="number"><span>Numero: ${String(remittance.codigo).padStart(8, '0')}</span><span>${esc(date)}</span></div></header><p class="notice">REMITO INTERNO · NO VÁLIDO COMO FACTURA</p><section class="details"><div><span>Cliente</span>${esc(remittance.clienteNombre)}</div><div><span>Dirección</span>${esc(remittance.clienteDireccion || 'Sin informar')}</div><div><span>Localidad</span>${esc(remittance.clienteLocalidad || 'Sin informar')}</div><div><span>Vendedor</span>${esc(remittance.actorName)}</div></section><table><thead><tr><th>Cantidad</th><th>Producto</th></tr></thead><tbody>${rows}</tbody></table>${remittance.observaciones ? `<section class="notes">Observaciones: ${esc(remittance.observaciones)}</section>` : ''}</main><script>window.onload=()=>{setTimeout(()=>window.print(),150)};<\/script></body></html>`);
        popup.document.close();
      },
      error: () => { popup.close(); this.error.set('No se pudo cargar el remito para reimprimir'); },
    });
  }
  confirmPurchaseCancellation() {
    const movement = this.cancellingPurchase();
    if (!movement?.compraId || this.saving()) return;
    this.saving.set(true);
    this.purchasesApi.cancel(movement.compraId, this.purchaseCancelReason.trim()).subscribe({
      next: () => {
        this.cancellingPurchase.set(null);
        this.saving.set(false);
        this.success.set('Compra anulada. Se actualizó el stock y la cuenta del proveedor.');
        this.load();
      },
      error: (e) => { this.saving.set(false); this.error.set(e.error?.message ?? 'No se pudo anular la compra'); },
    });
  }
  readonly editSaleReview = signal(false);
  readonly editSaleAttempted = signal(false);
  readonly cancelAttempted = signal(false);
  readonly expenseAttempted = signal(false);
  readonly page = signal(1);
  readonly pageSize = 10;
  from = argentinaToday();
  to = argentinaToday();
  private readonly searchTerm = signal('');
  private readonly kindFilter = signal('');
  get search() { return this.searchTerm(); }
  set search(value: string) { this.searchTerm.set(value); this.page.set(1); }
  get kind() { return this.kindFilter(); }
  set kind(value: string) { this.kindFilter.set(value); this.page.set(1); }
  concept = '';
  amount = 0;
  detail = '';
  supplierId = '';
  expenseDate = argentinaToday();
  payMethod: Extract<FinancialPaymentMethod, 'EFECTIVO' | 'TRANSFERENCIA'> = 'EFECTIVO';
  collectionDestination: Extract<FinancialPaymentMethod, 'EFECTIVO' | 'TRANSFERENCIA'> = 'EFECTIVO';
  cancelReason = '';
  saleCancelReason = '';
  confirmSaleCancellation() {
    const movement = this.cancellingSale();
    if (!movement?.ventaId || this.saving()) return;
    this.saving.set(true);
    this.salesApi.cancel(movement.ventaId, this.saleCancelReason.trim()).subscribe({
      next: (result) => {
        if (result.venta.estado !== 'ANULADA' || result.stockRepuesto.length !== result.venta.items.length) {
          this.saving.set(false);
          this.error.set('No se pudo verificar la devolución del stock. Actualizá la pantalla y revisá la venta antes de intentar de nuevo.');
          return;
        }
        this.cancellingSale.set(null);
        this.saving.set(false);
        this.success.set(`Venta #${movement.ventaCodigo} anulada. Se devolvió el stock y se revirtió el saldo.`);
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(e.error?.message ?? 'No se pudo anular la venta');
      },
    });
  }
  editSaleLines: EditableSaleLine[] = [];
  editSalePayment: Exclude<PaymentMethod, 'CHEQUE'> = 'EFECTIVO';
  editSaleTransferReference = '';
  editSaleBillingDate = '';
  readonly supplierOptions = computed<SearchableSelectOption[]>(() =>
    this.suppliers()
      .filter((s) => s.activo)
      .map((s) => ({
        value: s._id,
        label: s.nombre,
        meta: `#${s.codigo} · ${s.cuit || 'Sin CUIT'}`,
      })),
  );
  readonly filtered = computed(() => {
    const t = this.normalize(this.searchTerm());
    return this.items().filter(
      (i) =>
        (!this.kindFilter() || i.tipo === this.kindFilter()) &&
        (!t ||
          this.normalize(
            `${i.concepto} ${i.detalle} ${i.clienteNombre} ${i.proveedorNombre} ${i.chequeNumero}`,
          ).includes(t)),
    );
  });
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly visible = computed(() =>
    this.filtered().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize),
  );
  ngOnInit() {
    this.load();
    this.suppliersApi.findActive().subscribe({ next: (v) => this.suppliers.set(v) });
  }
  load() {
    if (!this.from || !this.to || this.from > this.to) {
      this.error.set('Revisá el período seleccionado');
      return;
    }
    this.loading.set(true);
    this.page.set(1);
    const range = argentinaRange(this.from, this.to);
    forkJoin({ finance: this.api.findAll(range), remittances: this.remittancesApi.findAll(range) }).subscribe({
      next: ({ finance, remittances }) => {
        const documents = remittances.map((remittance) => this.remittanceMovement(remittance));
        this.items.set([...finance.items, ...documents].sort((a, b) =>
          new Date(b.fechaMovimiento).getTime() - new Date(a.fechaMovimiento).getTime()));
        this.period.set(finance.period);
        this.overall.set(finance.overall);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los ingresos y egresos');
        this.loading.set(false);
      },
    });
  }
  private remittanceMovement(remittance: RemittanceRecord): FinancialMovement {
    return {
      _id: `remittance:${remittance._id}`, sourceKey: `remittance:${remittance._id}`,
      tipo: 'DOCUMENTO', categoria: 'REMITO', montoCentavos: 0,
      concepto: `Remito #${remittance.codigo}`,
      detalle: `${remittance.clienteNombre} · ${remittance.items.map((item) => `${item.productoNombre} x${item.cantidad}`).join(', ')}`,
      medioPago: null, acreditadoEn: null, disponible: false, pagado: false,
      pagadoAt: null, cancelado: false, motivoCancelacion: '', canceladoAt: null,
      canceladoPorNombre: '', fechaMovimiento: remittance.createdAt, ventaCodigo: null,
      remitoId: remittance._id, clienteNombre: remittance.clienteNombre,
      proveedorNombre: '', chequeNumero: '', chequeId: null, actorName: remittance.actorName,
    };
  }
  preset(value: 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'YEAR') {
    const today = argentinaToday();
    this.to = today;
    if (value === 'TODAY') this.from = today;
    else if (value === 'YESTERDAY') this.from = this.to = shiftDate(today, -1);
    else if (value === 'WEEK') this.from = shiftDate(today, -6);
    else if (value === 'MONTH') this.from = `${today.slice(0, 8)}01`;
    else this.from = `${today.slice(0, 4)}-01-01`;
    this.load();
  }
  openExpense() {
    this.expenseAttempted.set(false);
    this.concept = '';
    this.amount = 0;
    this.detail = '';
    this.supplierId = '';
    this.expenseDate = argentinaToday();
    this.expenseOpen.set(true);
  }
  saveExpense() {
    this.expenseAttempted.set(true);
    if (!this.concept.trim() || this.amount <= 0) {
      this.error.set('Revisá los campos marcados antes de agregar el gasto');
      return;
    }
    this.saving.set(true);
    this.api
      .createExpense({
        concepto: this.concept.trim(),
        montoCentavos: Math.round(this.amount * 100),
        detalle: this.detail.trim() || undefined,
        proveedorId: this.supplierId || undefined,
        fecha: this.expenseDate,
      })
      .subscribe({
        next: () => {
          this.expenseOpen.set(false);
          this.saving.set(false);
          this.success.set('Gasto manual agregado');
          this.load();
        },
        error: (e) => {
          this.error.set(e.error?.message ?? 'No se pudo agregar el gasto');
          this.saving.set(false);
        },
      });
  }
  invalidExpenseConcept() {
    return this.expenseAttempted() && !this.concept.trim();
  }
  invalidExpenseAmount() {
    return this.expenseAttempted() && (!Number.isFinite(this.amount) || this.amount <= 0);
  }
  invalidExpenseDate() {
    return this.expenseAttempted() && !this.expenseDate;
  }
  openPay(item: FinancialMovement) {
    this.payMethod = 'EFECTIVO';
    this.paying.set(item);
  }
  balanceAfter() {
    const item = this.paying();
    if (!item) return 0;
    return (
      (this.payMethod === 'EFECTIVO'
        ? this.overall().efectivoDisponibleCentavos
        : this.overall().transferenciaDisponibleCentavos) - item.montoCentavos
    );
  }
  confirmPay() {
    const item = this.paying();
    if (!item) return;
    this.saving.set(true);
    this.api.payExpense(item._id, this.payMethod).subscribe({
      next: () => {
        this.paying.set(null);
        this.saving.set(false);
        this.success.set('Gasto marcado como pagado');
        this.load();
      },
      error: (e) => {
        this.error.set(e.error?.message ?? 'No se pudo pagar el gasto');
        this.paying.set(null);
        this.saving.set(false);
      },
    });
  }

  isManualReplenishment(item: FinancialMovement) {
    return item.categoria === 'REPOSICION_AUTOMATICA' && item.sourceKey?.startsWith('stock:');
  }

  openCancellation(item: FinancialMovement) {
    this.cancelReason = '';
    this.cancelAttempted.set(false);
    this.cancelling.set(item);
  }

  invalidCancelReason() {
    const length = this.cancelReason.trim().length;
    return this.cancelAttempted() && length > 300;
  }

  confirmCancellation() {
    const item = this.cancelling();
    this.cancelAttempted.set(true);
    if (!item || this.cancelReason.trim().length > 300) return;
    this.saving.set(true);
    this.api.cancelExpense(item._id, this.cancelReason.trim()).subscribe({
      next: () => {
        this.cancelling.set(null);
        this.saving.set(false);
        this.success.set(
          this.isManualReplenishment(item)
            ? 'Movimiento cancelado y stock actualizado'
            : 'Gasto cancelado correctamente',
        );
        this.load();
      },
      error: (e) => {
        this.error.set(e.error?.message ?? 'No se pudo cancelar la reposición');
        this.cancelling.set(null);
        this.saving.set(false);
      },
    });
  }

  openCheckCollection(item: FinancialMovement) {
    this.collectionDestination = 'EFECTIVO';
    this.collecting.set(item);
  }

  confirmCheckCollection() {
    const item = this.collecting();
    if (!item?.chequeId) return;
    this.saving.set(true);
    this.checksApi.collect(item.chequeId, this.collectionDestination).subscribe({
      next: () => {
        this.collecting.set(null);
        this.saving.set(false);
        this.success.set(`Cheque #${item.chequeNumero} cobrado y acreditado`);
        this.load();
      },
      error: (e) => {
        this.error.set(e.error?.message ?? 'No se pudo cobrar el cheque');
        this.collecting.set(null);
        this.saving.set(false);
      },
    });
  }

  openSaleEdit(item: FinancialMovement) {
    if (!item.ventaId) return;
    this.saving.set(true);
    this.error.set(null);
    this.salesApi.findOne(item.ventaId).subscribe({
      next: (sale) => {
        this.editSalePayment = sale.medioPago === 'CHEQUE' ? 'EFECTIVO' : sale.medioPago;
        this.editSaleTransferReference = sale.referenciaTransferencia ?? '';
        this.editSaleBillingDate = sale.fechaFacturacion?.slice(0, 10) ?? '';
        this.editSaleLines = sale.items.map((line) => {
          const discountFactor = (10000 - line.bonificacionPuntosBase) / 10000;
          const finalUnitCents = Math.round(line.totalCentavos / line.cantidad / discountFactor);
          return {
            productoId: line.productoId,
            productoNombre: line.productoNombre,
            cantidad: line.cantidad,
            precioFinalPesos: finalUnitCents / 100,
          };
        });
        this.editSaleAttempted.set(false);
        this.editSaleReview.set(false);
        this.editingSale.set(sale);
        this.saving.set(false);
      },
      error: (e) => {
        this.error.set(e.error?.message ?? 'No se pudo cargar la venta');
        this.saving.set(false);
      },
    });
  }

  invalidEditLine(line: EditableSaleLine) {
    return !Number.isInteger(line.cantidad) || (line.cantidad ?? 0) < 1 ||
      !Number.isFinite(line.precioFinalPesos) || (line.precioFinalPesos ?? 0) < 0;
  }

  editSaleTotalCents() {
    const sale = this.editingSale();
    return this.editSaleLines.reduce(
      (sum, line, index) => {
        const discount = sale?.items[index]?.bonificacionPuntosBase ?? 0;
        return sum + Math.round(
          (line.precioFinalPesos ?? 0) * 100 * (line.cantidad ?? 0) * (10000 - discount) / 10000,
        );
      },
      sale?.transporteDescargaCentavos ?? 0,
    );
  }

  reviewSaleEdit() {
    this.editSaleAttempted.set(true);
    if (
      this.editSaleLines.some((line) => this.invalidEditLine(line)) ||
      (this.editSalePayment === 'TRANSFERENCIA' && !this.editSaleTransferReference.trim())
    ) return;
    this.editSaleReview.set(true);
  }

  saveSaleEdit() {
    const sale = this.editingSale();
    if (!sale) return;
    this.saving.set(true);
    this.salesApi.update(sale._id, {
      medioPago: this.editSalePayment,
      fechaFacturacion: this.editSaleBillingDate || undefined,
      referenciaTransferencia: this.editSalePayment === 'TRANSFERENCIA'
        ? this.editSaleTransferReference.trim()
        : undefined,
      items: this.editSaleLines.map((line) => ({
        productoId: line.productoId,
        cantidad: line.cantidad!,
        precioFinalUnitarioCentavos: Math.round(line.precioFinalPesos! * 100),
      })),
    }).subscribe({
      next: () => {
        this.editingSale.set(null);
        this.editSaleReview.set(false);
        this.saving.set(false);
        this.success.set(`Venta #${sale.codigo} actualizada correctamente`);
        this.load();
      },
      error: (e) => {
        this.error.set(e.error?.message ?? 'No se pudo modificar la venta');
        this.editSaleReview.set(false);
        this.saving.set(false);
      },
    });
  }
  setPage(value: number) {
    this.page.set(Math.max(1, Math.min(value, this.pages())));
  }
  money(c: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(c / 100);
  }
  date(v: string) {
    return argentinaDateTime(v);
  }
  category(i: FinancialMovement) {
    if (i.categoria === 'REMITO') return 'Remito (sin movimiento de dinero ni stock)';
    if (i.categoria === 'REPOSICION_AUTOMATICA' && i.sourceKey?.startsWith('stock:')) {
      return 'Reposición manual desde Gestión de stock';
    }
    if (i.categoria === 'REPOSICION_AUTOMATICA') return 'Reposición automática';
    if (i.categoria === 'GASTO_MANUAL') return 'Gasto extra';
    if (i.categoria === 'COMPRA_PRODUCTOS') return 'Compra de productos';
    if (i.categoria === 'CHEQUE') return 'Ingreso de cheque';
    if (i.categoria === 'COBRO_CUENTA_CORRIENTE') return 'Cobro de cuenta corriente';
    if (i.categoria === 'PAGO_CUENTA_PROVEEDOR') return 'Pago de cuenta a proveedor';
    return 'Ingreso de venta';
  }
  method(v: FinancialPaymentMethod | null) {
    if (v === 'PAGADO_ANTES_SISTEMA') return 'Pagado antes del sistema';
    if (v === 'TRANSFERENCIA') return 'Transferencia / MP';
    if (v === 'CREDITO') return 'Cuenta corriente';
    if (v === 'CHEQUE') return 'Cheque';
    if (v === 'EFECTIVO') return 'Efectivo';
    return 'Sin pagar';
  }
  movementPaidCents(item: FinancialMovement) {
    return item.montoPagadoCentavos ?? (item.pagado ? item.montoCentavos : 0);
  }
  movementRemainingCents(item: FinancialMovement) {
    return Math.max(0, item.montoCentavos - this.movementPaidCents(item));
  }
  private normalize(v: string) {
    return v
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
}
