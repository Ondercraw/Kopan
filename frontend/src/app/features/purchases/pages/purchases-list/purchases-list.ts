import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { argentinaToday } from '../../../../shared/utils/argentina-date';
import { FormsModule } from '@angular/forms';
import { CurrencyInput } from '../../../../shared/components/currency-input/currency-input';
import {
  SearchableSelect,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select';
import { ConfirmationModal } from '../../../../shared/components/confirmation-modal/confirmation-modal';
import { Supplier } from '../../../suppliers/models/supplier.model';
import { SuppliersService } from '../../../suppliers/services/suppliers.service';
import {
  InventoryProduct,
  Purchase,
  PurchaseKind,
  PurchasePaymentMethod,
  SupplierAccount,
} from '../../models/purchase.model';
import { PurchasesService } from '../../services/purchases.service';

interface DraftLine {
  productId: string;
  quantity: number;
  unitCostPesos: number;
}

@Component({
  selector: 'app-purchases-list',
  standalone: true,
  imports: [FormsModule, CurrencyInput, SearchableSelect, ConfirmationModal],
  templateUrl: './purchases-list.html',
  styleUrl: './purchases-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchasesListPage implements OnInit {
  private readonly service = inject(PurchasesService);
  private readonly suppliersService = inject(SuppliersService);
  readonly purchases = signal<Purchase[]>([]);
  readonly inventory = signal<InventoryProduct[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  readonly accounts = signal<SupplierAccount[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly modalMode = signal<PurchaseKind | null>(null);
  readonly saving = signal(false);
  readonly pendingConfirmation = signal(false);
  readonly actionPurchase = signal<Purchase | null>(null);
  readonly accountToPay = signal<SupplierAccount | null>(null);
  readonly actionMode = signal<'PAY' | 'CANCEL' | null>(null);
  supplierId = '';
  paymentMethod: PurchasePaymentMethod = 'EFECTIVO';
  purchaseDate = argentinaToday();
  dueDate = '';
  documentNumber = '';
  notes = '';
  lines: DraftLine[] = [];
  actionPayment: 'EFECTIVO' | 'TRANSFERENCIA' = 'EFECTIVO';
  cancellationReason = '';
  from = '';
  to = '';
  readonly supplierOptions = computed<SearchableSelectOption[]>(() =>
    this.suppliers().map((s) => ({
      value: s._id,
      label: s.nombre,
      meta: `#${s.codigo}${s.cuit ? ` · CUIT ${s.cuit}` : ''}`,
    })),
  );
  readonly productOptions = computed<SearchableSelectOption[]>(() =>
    this.inventory().map((p) => ({
      value: p._id,
      label: p.nombre,
      meta: `#${p.codigo} · Stock ${p.cantidadStock}${p.unvaluedQuantity ? ` · ${p.unvaluedQuantity} sin valorar` : ''}`,
    })),
  );
  readonly openingProductOptions = computed<SearchableSelectOption[]>(() =>
    this.productOptions().filter(
      (option) => this.inventory().find((p) => p._id === option.value)!.unvaluedQuantity > 0,
    ),
  );
  readonly paymentOptions: SearchableSelectOption[] = [
    { value: 'EFECTIVO', label: 'Efectivo' },
    { value: 'TRANSFERENCIA', label: 'Transferencia / Mercado Pago' },
    {
      value: 'CUENTA_CORRIENTE',
      label: 'Cuenta corriente del proveedor',
      meta: 'Queda pendiente hasta pagar la deuda completa',
    },
  ];
  readonly payOptions = this.paymentOptions.slice(0, 2);
  totalCents() {
    return this.lines.reduce(
      (sum, line) =>
        sum + Number(line.quantity || 0) * Math.round(Number(line.unitCostPesos || 0) * 100),
      0,
    );
  }
  openingTarget() {
    return this.modalMode() === 'STOCK_INICIAL' && this.lines[0]
      ? (this.inventory().find((p) => p._id === this.lines[0].productId)?.unvaluedQuantity ?? 0)
      : 0;
  }
  openingAssigned() {
    return this.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  }
  weightedAverageCents() {
    return this.openingAssigned() ? Math.round(this.totalCents() / this.openingAssigned()) : 0;
  }
  readonly totalDebtCents = computed(() =>
    this.accounts().reduce((sum, account) => sum + account.deudaCentavos, 0),
  );

  ngOnInit() {
    this.reload();
    this.suppliersService.findActive().subscribe({ next: (data) => this.suppliers.set(data) });
  }
  reload() {
    this.loading.set(true);
    this.error.set(null);
    this.service.findAll({ from: this.from || undefined, to: this.to || undefined }).subscribe({
      next: (p) => {
        this.purchases.set(p);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar las compras');
        this.loading.set(false);
      },
    });
    this.service.inventory().subscribe({ next: (data) => this.inventory.set(data) });
    this.service.supplierAccounts().subscribe({ next: (data) => this.accounts.set(data) });
  }
  open(mode: PurchaseKind) {
    this.error.set(null);
    this.modalMode.set(mode);
    this.supplierId = '';
    this.paymentMethod = 'EFECTIVO';
    this.purchaseDate = argentinaToday();
    this.dueDate = '';
    this.documentNumber = '';
    this.notes = '';
    this.lines = [{ productId: '', quantity: 1, unitCostPesos: 0 }];
  }
  close() {
    if (!this.saving()) {
      this.modalMode.set(null);
      this.pendingConfirmation.set(false);
    }
  }
  selectOpeningProduct(productId: string) {
    this.lines = [{ productId, quantity: 0, unitCostPesos: 0 }];
  }
  addLine() {
    const productId = this.modalMode() === 'STOCK_INICIAL' ? (this.lines[0]?.productId ?? '') : '';
    this.lines = [...this.lines, { productId, quantity: 1, unitCostPesos: 0 }];
  }
  removeLine(index: number) {
    if (this.lines.length > 1) this.lines = this.lines.filter((_, i) => i !== index);
  }
  requestSave() {
    if (
      !this.supplierId ||
      this.lines.some(
        (x) =>
          !x.productId ||
          !Number.isInteger(Number(x.quantity)) ||
          x.quantity <= 0 ||
          !Number.isFinite(x.unitCostPesos) ||
          x.unitCostPesos < 0 ||
          x.quantity > 1000000,
      )
    ) {
      this.error.set('Completá proveedor, producto, cantidad y costo de cada renglón');
      return;
    }
    if (this.modalMode() === 'STOCK_INICIAL' && this.openingAssigned() !== this.openingTarget()) {
      this.error.set(`La suma debe ser exactamente ${this.openingTarget()} unidades`);
      return;
    }
    if (!this.purchaseDate || this.purchaseDate > argentinaToday()) {
      this.error.set('Elegí una fecha válida, hasta hoy');
      return;
    }
    if (
      this.dueDate &&
      this.paymentMethod === 'CUENTA_CORRIENTE' &&
      this.dueDate < this.purchaseDate
    ) {
      this.error.set('El vencimiento no puede ser anterior a la compra');
      return;
    }
    this.error.set(null);
    this.pendingConfirmation.set(true);
  }
  save() {
    const kind = this.modalMode();
    if (!kind || this.saving()) return;
    this.saving.set(true);
    this.service
      .create({
        supplierId: this.supplierId,
        kind,
        paymentMethod: this.paymentMethod,
        items: this.lines.map((x) => ({
          productId: x.productId,
          quantity: Number(x.quantity),
          unitCostCents: Math.round(Number(x.unitCostPesos) * 100),
        })),
        purchaseDate: this.purchaseDate || undefined,
        dueDate:
          this.paymentMethod === 'CUENTA_CORRIENTE' && this.dueDate
            ? `${this.dueDate}T12:00:00-03:00`
            : undefined,
        documentNumber: this.documentNumber.trim() || undefined,
        notes: this.notes.trim() || undefined,
      })
      .subscribe({
        next: (p) => {
          this.success.set(`${kind === 'COMPRA' ? 'Compra' : 'Valuación'} #${p.codigo} registrada`);
          this.saving.set(false);
          this.close();
          this.reload();
        },
        error: (e) => {
          this.error.set(e.error?.message ?? 'No se pudo registrar la compra');
          this.saving.set(false);
          this.pendingConfirmation.set(false);
        },
      });
  }
  openAction(purchase: Purchase, mode: 'PAY' | 'CANCEL') {
    this.actionPurchase.set(purchase);
    this.actionMode.set(mode);
    this.actionPayment = 'EFECTIVO';
    this.cancellationReason = '';
  }
  openAccountPayment(account: SupplierAccount) {
    this.accountToPay.set(account);
    this.actionPayment = 'EFECTIVO';
  }
  closeAccountPayment() {
    if (!this.saving()) this.accountToPay.set(null);
  }
  payAccount() {
    const account = this.accountToPay();
    if (!account || this.saving()) return;
    this.saving.set(true);
    this.service.paySupplierAccount(account._id, this.actionPayment).subscribe({
      next: (result) => {
        this.success.set(
          `Se pagaron ${result.paidPurchases} compras por ${this.money(result.totalCents)}`,
        );
        this.saving.set(false);
        this.accountToPay.set(null);
        this.reload();
      },
      error: (e) => {
        this.error.set(e.error?.message ?? 'No se pudo pagar la cuenta del proveedor');
        this.saving.set(false);
      },
    });
  }
  closeAction() {
    if (!this.saving()) {
      this.actionPurchase.set(null);
      this.actionMode.set(null);
    }
  }
  confirmAction() {
    const p = this.actionPurchase();
    const mode = this.actionMode();
    if (!p || !mode || this.saving()) return;
    if (mode === 'CANCEL' && this.cancellationReason.trim().length < 3) {
      this.error.set('Ingresá un motivo de al menos 3 caracteres');
      return;
    }
    this.saving.set(true);
    const request =
      mode === 'PAY'
        ? this.service.pay(p._id, this.actionPayment)
        : this.service.cancel(p._id, this.cancellationReason.trim());
    request.subscribe({
      next: () => {
        this.success.set(
          mode === 'PAY' ? 'Deuda pagada completamente' : 'Compra cancelada y stock revertido',
        );
        this.saving.set(false);
        this.closeAction();
        this.reload();
      },
      error: (e) => {
        this.error.set(e.error?.message ?? 'No se pudo completar la acción');
        this.saving.set(false);
      },
    });
  }
  money(cents: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
      cents / 100,
    );
  }
  date(value: string | null) {
    return value
      ? new Intl.DateTimeFormat('es-AR', {
          dateStyle: 'short',
          timeZone: 'America/Argentina/Buenos_Aires',
        }).format(new Date(value))
      : 'Sin fecha';
  }
  productName(id: string) {
    return this.inventory().find((product) => product._id === id)?.nombre ?? 'Producto';
  }
}
