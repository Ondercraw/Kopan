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

const EMPTY: FinancialSummary = {
  ingresosCentavos: 0,
  gastosAutomaticosCentavos: 0,
  gastosReposicionPagadosCentavos: 0,
  gastosReposicionPendientesCentavos: 0,
  gastosManualesCentavos: 0,
  gastosManualesPendientesCentavos: 0,
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
  imports: [FormsModule, CurrencyInput, PaginationControls, SearchableSelect],
  templateUrl: './income-expenses.html',
  styleUrls: [
    './income-expenses.scss',
    './income-expenses-responsive.scss',
    './income-expenses-adjustments.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncomeExpensesPage implements OnInit {
  private readonly api = inject(FinanceService);
  private readonly suppliersApi = inject(SuppliersService);
  private readonly checksApi = inject(ChecksService);
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
  readonly cancelAttempted = signal(false);
  readonly expenseAttempted = signal(false);
  page = 1;
  readonly pageSize = 10;
  from = argentinaToday();
  to = argentinaToday();
  search = '';
  kind = '';
  concept = '';
  amount = 0;
  detail = '';
  supplierId = '';
  expenseDate = argentinaToday();
  payMethod: Extract<FinancialPaymentMethod, 'EFECTIVO' | 'TRANSFERENCIA'> = 'EFECTIVO';
  collectionDestination: Extract<FinancialPaymentMethod, 'EFECTIVO' | 'TRANSFERENCIA'> = 'EFECTIVO';
  cancelReason = '';
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
    const t = this.normalize(this.search);
    return this.items().filter(
      (i) =>
        (!this.kind || i.tipo === this.kind) &&
        (!t ||
          this.normalize(
            `${i.concepto} ${i.detalle} ${i.clienteNombre} ${i.proveedorNombre} ${i.chequeNumero}`,
          ).includes(t)),
    );
  });
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly visible = computed(() =>
    this.filtered().slice((this.page - 1) * this.pageSize, this.page * this.pageSize),
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
    this.page = 1;
    this.api.findAll(argentinaRange(this.from, this.to)).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.period.set(r.period);
        this.overall.set(r.overall);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los ingresos y gastos');
        this.loading.set(false);
      },
    });
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
    return this.cancelAttempted() && (length < 3 || length > 300);
  }

  confirmCancellation() {
    const item = this.cancelling();
    this.cancelAttempted.set(true);
    if (!item || this.cancelReason.trim().length < 3 || this.cancelReason.trim().length > 300) return;
    this.saving.set(true);
    this.api.cancelReplenishment(item._id, this.cancelReason.trim()).subscribe({
      next: () => {
        this.cancelling.set(null);
        this.saving.set(false);
        this.success.set('Pago de reposición cancelado y stock actualizado');
        this.load();
      },
      error: (e) => {
        this.error.set(e.error?.message ?? 'No se pudo cancelar la reposición');
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
  setPage(value: number) {
    this.page = Math.min(value, this.pages());
  }
  money(c: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(c / 100);
  }
  date(v: string) {
    return argentinaDateTime(v);
  }
  category(i: FinancialMovement) {
    if (i.categoria === 'REPOSICION_AUTOMATICA' && i.sourceKey?.startsWith('stock:')) {
      return 'Reposición manual desde Gestión de stock';
    }
    if (i.categoria === 'REPOSICION_AUTOMATICA') return 'Reposición automática';
    if (i.categoria === 'GASTO_MANUAL') return 'Gasto extra';
    if (i.categoria === 'CHEQUE') return 'Ingreso de cheque';
    return 'Ingreso de venta';
  }
  method(v: FinancialPaymentMethod | null) {
    if (v === 'TRANSFERENCIA') return 'Transferencia / MP';
    if (v === 'CREDITO') return 'Cuenta corriente';
    if (v === 'CHEQUE') return 'Cheque';
    if (v === 'EFECTIVO') return 'Efectivo';
    return 'Sin pagar';
  }
  private normalize(v: string) {
    return v
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

}
