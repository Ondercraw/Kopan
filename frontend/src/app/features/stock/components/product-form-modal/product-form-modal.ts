import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  InventoryLotOption,
  Product,
  StockAdjustmentReason,
  VatRate,
} from '../../models/product.model';
import { StockService } from '../../services/stock.service';
import { Supplier } from '../../../suppliers/models/supplier.model';
import { SuppliersService } from '../../../suppliers/services/suppliers.service';
import { SupplierFormModal } from '../../../suppliers/components/supplier-form-modal/supplier-form-modal';
import {
  SearchableSelect,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select';

@Component({
  selector: 'app-product-form-modal',
  standalone: true,
  imports: [ReactiveFormsModule, SearchableSelect, SupplierFormModal],
  templateUrl: './product-form-modal.html',
  styleUrl: './product-form-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductFormModal implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly stockService = inject(StockService);
  private readonly suppliersService = inject(SuppliersService);
  private readonly destroyRef = inject(DestroyRef);

  @Input() product: Product | null = null;
  @Input() initialSupplierIds: string[] = [];
  @Input() typeOptions: string[] = [];
  @Input() disableStockSubtraction = false;
  @Output() cerrado = new EventEmitter<void>();
  @Output() guardado = new EventEmitter<Product>();

  readonly guardando = signal(false);
  readonly errorMensaje = signal<string | null>(null);
  readonly intentoGuardar = signal(false);
  readonly suppliers = signal<Supplier[]>([]);
  readonly selectedSupplierIds = signal<string[]>([]);
  readonly inventoryLots = signal<InventoryLotOption[]>([]);
  readonly loadingLots = signal(false);
  readonly supplierModalOpen = signal(false);
  supplierLabel(id: string) {
    return (
      this.suppliers().find((s) => s._id === id)?.nombre ??
      this.product?.proveedorIds?.find((s) => s._id === id)?.nombre ??
      this.product?.proveedorId?.nombre ??
      id
    );
  }
  removeSupplier(id: string) {
    this.selectedSupplierIds.update((ids) => ids.filter((value) => value !== id));
  }
  openSupplierCreate(): void {
    this.supplierModalOpen.set(true);
  }
  onSupplierSaved(supplier: Supplier): void {
    this.suppliers.update((items) =>
      [...items.filter((item) => item._id !== supplier._id), supplier].sort((a, b) =>
        a.nombre.localeCompare(b.nombre, 'es'),
      ),
    );
    this.selectedSupplierIds.update((ids) => [...new Set([...ids, supplier._id])]);
    this.form.controls.proveedorId.setValue('', { emitEvent: false });
    this.supplierModalOpen.set(false);
  }
  readonly supplierSelectOptions = computed<SearchableSelectOption[]>(() =>
    [...this.suppliers()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).map((supplier) => ({
      value: supplier._id,
      label: supplier.nombre,
      meta: `#${supplier.codigo}${supplier.cuit ? ` · CUIT ${supplier.cuit}` : ''}`,
    })),
  );
  readonly vatOptions: SearchableSelectOption[] = [
    { value: '21', label: '21%', meta: 'Alícuota general' },
    { value: '10.5', label: '10,5%', meta: 'Alícuota reducida' },
    { value: '0', label: '0%', meta: 'Sin IVA aplicado' },
  ];
  readonly lotSelectOptions = computed<SearchableSelectOption[]>(() =>
    this.inventoryLots().map((lot) => ({
      value: lot._id,
      label:
        lot.kind === 'SIN_VALORAR'
          ? 'Unidades sin valorar'
          : lot.purchaseCode
            ? `Compra #${lot.purchaseCode} · ${lot.supplierName || 'Sin proveedor'}`
            : `${lot.kind === 'AJUSTE' ? 'Ajuste manual' : 'Valuación inicial'} · ${lot.supplierName || 'Sin proveedor'}`,
      meta:
        lot.kind === 'SIN_VALORAR'
          ? `${lot.remainingQuantity} disponibles · sin costo asignado`
          : `${lot.remainingQuantity} disponibles · ${this.formatMoney(lot.unitCostCents)} c/u · ${new Date(lot.receivedAt).toLocaleDateString('es-AR')}`,
    })),
  );
  readonly adjustmentReasonOptions: SearchableSelectOption[] = [
    {
      value: 'SALE_OR_DELIVERY',
      label: 'Venta o entrega',
      meta: 'Egreso por mercadería entregada',
    },
    { value: 'RETURN', label: 'Devolución', meta: 'Ingreso o egreso por devolución' },
    { value: 'BREAKAGE_OR_LOSS', label: 'Rotura o pérdida', meta: 'Mercadería dañada o faltante' },
    {
      value: 'INVENTORY_CORRECTION',
      label: 'Corrección de inventario',
      meta: 'Diferencia detectada al contar',
    },
    { value: 'OTHER', label: 'Otro', meta: 'Otra causa documentada' },
  ];

  readonly form = this.fb.nonNullable.group({
    nombre: [
      '',
      [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.minLength(2),
        Validators.maxLength(120),
      ],
    ],
    tipo: [
      '',
      [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.minLength(2),
        Validators.maxLength(80),
      ],
    ],
    cantidadStock: [0, [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)]],
    cantidadAjuste: ['', [Validators.min(0), Validators.pattern(/^\d+$/)]],
    operacionStock: this.fb.nonNullable.control<'ADD' | 'SUBTRACT'>('ADD'),
    loteId: this.fb.nonNullable.control(''),
    motivoAjuste: this.fb.nonNullable.control<StockAdjustmentReason | ''>(''),
    observacionAjuste: ['', [Validators.maxLength(200)]],
    stockMinimo: [0, [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)]],
    alicuotaIva: this.fb.nonNullable.control<string>('21', Validators.required),
    costo: this.fb.nonNullable.control({ value: 0, disabled: true }),
    proveedorId: [''],
    descripcionAdicional: ['', [Validators.maxLength(500)]],
  });

  get typeSelectOptions(): SearchableSelectOption[] {
    return [...new Set(this.typeOptions.map((type) => type.trim().toLocaleUpperCase('es-AR')))]
      .sort((a,b)=>a.localeCompare(b,'es'))
      .map((type) => ({ value: type, label: type }));
  }

  get visibleAdjustmentReasonOptions(): SearchableSelectOption[] {
    const allowed =
      this.form.controls.operacionStock.value === 'ADD'
        ? ['RETURN', 'INVENTORY_CORRECTION']
        : ['RETURN', 'BREAKAGE_OR_LOSS', 'INVENTORY_CORRECTION', 'OTHER'];
    return this.adjustmentReasonOptions.filter((option) => allowed.includes(option.value));
  }

  selectStockOperation(operation: 'ADD' | 'SUBTRACT'): void {
    if (operation === 'SUBTRACT' && this.disableStockSubtraction) return;
    this.form.controls.operacionStock.setValue(operation);
  }

  ngOnInit(): void {
    this.selectedSupplierIds.set(
      this.product?.proveedorIds?.length
        ? this.product.proveedorIds.map((s) => s._id)
        : this.product?.proveedorId
          ? [this.product.proveedorId._id]
          : this.initialSupplierIds,
    );
    this.form.controls.proveedorId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((id) => {
        if (id) {
          this.selectedSupplierIds.update((ids) => [...new Set([...ids, id])]);
          this.form.controls.proveedorId.setValue('', { emitEvent: false });
        }
      });
    this.form.controls.operacionStock.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.form.controls.motivoAjuste.setValue('');
        this.form.controls.motivoAjuste.markAsUntouched();
        this.form.controls.loteId.setValue('');
        this.form.controls.loteId.markAsUntouched();
      });
    this.suppliersService.findActive().subscribe({
      next: (suppliers) => {
        this.suppliers.set(suppliers);
      },
      error: () => this.suppliers.set([]),
    });
    if (!this.product) return;
    this.loadingLots.set(true);
    this.stockService.findLots(this.product._id).subscribe({
      next: (lots) => {
        this.inventoryLots.set(lots);
        this.loadingLots.set(false);
      },
      error: () => {
        this.inventoryLots.set([]);
        this.loadingLots.set(false);
        this.errorMensaje.set('No se pudieron cargar los lotes disponibles del producto');
      },
    });
    this.form.patchValue({
      nombre: this.product.nombre,
      tipo: this.product.tipo,
      cantidadStock: this.product.cantidadStock,
      stockMinimo: this.product.stockMinimo,
      alicuotaIva: String(this.product.alicuotaIva ?? 21),
      costo: (this.product.costoCentavos ?? 0) / 100,
      proveedorId: '',
      descripcionAdicional: this.product.descripcionAdicional,
    });
  }

  onSubmit(): void {
    this.intentoGuardar.set(true);
    if (this.form.invalid || this.guardando()) {
      this.form.markAllAsTouched();
      return;
    }

    const values = this.form.getRawValue();
    const projectedStock = this.projectedStock();
    if (this.product && projectedStock !== null && projectedStock < 0) {
      this.errorMensaje.set('No se pueden restar más unidades que las disponibles');
      this.form.controls.cantidadAjuste.markAsTouched();
      return;
    }
    if (
      this.product &&
      values.operacionStock === 'SUBTRACT' &&
      Number(values.cantidadAjuste) > 0 &&
      !values.loteId
    ) {
      this.form.controls.loteId.markAsTouched();
      this.errorMensaje.set('Seleccioná el lote del cual se restarán las unidades');
      return;
    }
    if (this.lotQuantityExceeded()) {
      this.form.controls.cantidadAjuste.markAsTouched();
      this.errorMensaje.set(
        `El lote seleccionado tiene solamente ${this.selectedLot()?.remainingQuantity ?? 0} unidades disponibles`,
      );
      return;
    }

    this.guardando.set(true);
    this.errorMensaje.set(null);

    const sharedValues = {
      nombre: values.nombre.trim(),
      tipo: values.tipo.trim().toLocaleUpperCase('es-AR'),
      stockMinimo: Number(values.stockMinimo),
      alicuotaIva: Number(values.alicuotaIva) as VatRate,
      proveedorId: this.selectedSupplierIds()[0],
      proveedorIds: this.selectedSupplierIds(),
      descripcionAdicional: values.descripcionAdicional.trim() || undefined,
    };
    const adjustmentAmount = Number(values.cantidadAjuste);
    if (this.product && adjustmentAmount > 0 && !values.motivoAjuste) {
      this.form.controls.motivoAjuste.markAsTouched();
      this.errorMensaje.set('Revisá el campo marcado antes de guardar');
      this.guardando.set(false);
      return;
    }
    const stockAdjustment =
      adjustmentAmount === 0
        ? undefined
        : values.operacionStock === 'ADD'
          ? adjustmentAmount
          : -adjustmentAmount;
    const request = this.product
      ? this.stockService.update(this.product._id, {
          ...sharedValues,
          ajusteStock: stockAdjustment,
          loteId:
            stockAdjustment && stockAdjustment < 0 ? values.loteId || undefined : undefined,
          motivoAjuste: adjustmentAmount > 0 ? values.motivoAjuste || undefined : undefined,
          observacionAjuste:
            adjustmentAmount > 0 ? values.observacionAjuste.trim() || undefined : undefined,
        })
      : this.stockService.create({
          ...sharedValues,
          cantidadStock: Number(values.cantidadStock),
        });

    request.subscribe({
      next: (product) => this.guardado.emit(product),
      error: (error) => {
        const backendMessage = Array.isArray(error.error?.message)
          ? error.error.message.join('. ')
          : error.error?.message;
        this.errorMensaje.set(
          error.error?.code === 'INSUFFICIENT_STOCK'
            ? 'No se pueden restar más unidades que las disponibles'
            : typeof backendMessage === 'string' && backendMessage.trim()
              ? backendMessage
              : this.product
                ? 'No se pudo actualizar el producto'
                : 'No se pudo agregar el producto',
        );
        this.guardando.set(false);
      },
    });
  }

  projectedStock(): number | null {
    if (!this.product) {
      return null;
    }
    const amount = Number(this.form.controls.cantidadAjuste.value);
    if (!Number.isInteger(amount) || amount < 0) {
      return null;
    }
    return (
      this.product.cantidadStock +
      (this.form.controls.operacionStock.value === 'ADD' ? amount : -amount)
    );
  }

  hasStockAdjustment(): boolean {
    return !!this.product && Number(this.form.controls.cantidadAjuste.value) > 0;
  }

  selectedLot(): InventoryLotOption | null {
    return (
      this.inventoryLots().find((lot) => lot._id === this.form.controls.loteId.value) ?? null
    );
  }

  lotQuantityExceeded(): boolean {
    if (this.form.controls.operacionStock.value !== 'SUBTRACT') return false;
    const lot = this.selectedLot();
    const amount = Number(this.form.controls.cantidadAjuste.value);
    return !!lot && Number.isFinite(amount) && amount > lot.remainingQuantity;
  }

  formatMoney(cents: number): string {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
      cents / 100,
    );
  }

  projectedStockStatus(): 'available' | 'low-stock' | 'no-stock' | 'invalid' | null {
    const projectedStock = this.projectedStock();
    if (projectedStock === null) {
      return null;
    }
    if (projectedStock < 0) {
      return 'invalid';
    }
    if (projectedStock === 0) {
      return 'no-stock';
    }

    const minimumStock = Number(this.form.controls.stockMinimo.value);
    return Number.isInteger(minimumStock) && minimumStock > 0 && projectedStock <= minimumStock
      ? 'low-stock'
      : 'available';
  }

  onCancelar(): void {
    if (!this.guardando()) {
      this.cerrado.emit();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.supplierModalOpen()) return;
    this.onCancelar();
  }
}
