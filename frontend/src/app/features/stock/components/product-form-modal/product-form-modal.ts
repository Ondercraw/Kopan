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
import { Product, StockAdjustmentReason, VatRate, WeightUnit } from '../../models/product.model';
import { StockService } from '../../services/stock.service';
import { Supplier } from '../../../suppliers/models/supplier.model';
import { SuppliersService } from '../../../suppliers/services/suppliers.service';
import {
  SearchableSelect,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select';

@Component({
  selector: 'app-product-form-modal',
  standalone: true,
  imports: [ReactiveFormsModule, SearchableSelect],
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
  @Input() typeOptions: string[] = [];
  @Output() cerrado = new EventEmitter<void>();
  @Output() guardado = new EventEmitter<void>();

  readonly guardando = signal(false);
  readonly errorMensaje = signal<string | null>(null);
  readonly intentoGuardar = signal(false);
  readonly suppliers = signal<Supplier[]>([]);
  readonly selectedSupplierIds = signal<string[]>([]);
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
  readonly supplierSelectOptions = computed<SearchableSelectOption[]>(() =>
    this.suppliers().map((supplier) => ({
      value: supplier._id,
      label: supplier.nombre,
      meta: `#${supplier.codigo}${supplier.cuit ? ` · CUIT ${supplier.cuit}` : ''}`,
    })),
  );
  readonly weightUnitOptions: SearchableSelectOption[] = [
    { value: 'kg', label: 'kg', meta: 'Kilogramos' },
    { value: 'g', label: 'g', meta: 'Gramos' },
  ];
  readonly vatOptions: SearchableSelectOption[] = [
    { value: '21', label: '21%', meta: 'Alícuota general' },
    { value: '10.5', label: '10,5%', meta: 'Alícuota reducida' },
    { value: '0', label: '0%', meta: 'Sin IVA aplicado' },
  ];
  readonly stockOperationOptions: SearchableSelectOption[] = [
    { value: 'ADD', label: 'Sumar', meta: 'Agregar unidades al stock' },
    { value: 'SUBTRACT', label: 'Restar', meta: 'Descontar unidades del stock' },
  ];
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
    cantidadAjuste: [0, [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)]],
    operacionStock: this.fb.nonNullable.control<'ADD' | 'SUBTRACT'>('ADD'),
    motivoAjuste: this.fb.nonNullable.control<StockAdjustmentReason | ''>(''),
    observacionAjuste: ['', [Validators.maxLength(200)]],
    stockMinimo: [0, [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)]],
    peso: [1, [Validators.required, Validators.min(0.001)]],
    unidadPeso: this.fb.nonNullable.control<WeightUnit>('kg', Validators.required),
    alicuotaIva: this.fb.nonNullable.control<string>('21', Validators.required),
    costo: this.fb.nonNullable.control({ value: 0, disabled: true }),
    proveedorId: [''],
    descripcionAdicional: ['', [Validators.maxLength(500)]],
  });

  get typeSelectOptions(): SearchableSelectOption[] {
    return this.typeOptions.map((type) => ({ value: type, label: type }));
  }

  get visibleAdjustmentReasonOptions(): SearchableSelectOption[] {
    const allowed =
      this.form.controls.operacionStock.value === 'ADD'
        ? ['RETURN', 'INVENTORY_CORRECTION']
        : ['RETURN', 'BREAKAGE_OR_LOSS', 'INVENTORY_CORRECTION', 'OTHER'];
    return this.adjustmentReasonOptions.filter((option) => allowed.includes(option.value));
  }

  ngOnInit(): void {
    this.selectedSupplierIds.set(
      this.product?.proveedorIds?.length
        ? this.product.proveedorIds.map((s) => s._id)
        : this.product?.proveedorId
          ? [this.product.proveedorId._id]
          : [],
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
      });
    this.suppliersService.findActive().subscribe({
      next: (suppliers) => {
        this.suppliers.set(suppliers);
      },
      error: () => this.suppliers.set([]),
    });
    if (!this.product) return;
    this.form.patchValue({
      nombre: this.product.nombre,
      tipo: this.product.tipo,
      cantidadStock: this.product.cantidadStock,
      stockMinimo: this.product.stockMinimo,
      peso: this.product.peso,
      unidadPeso: this.product.unidadPeso,
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

    this.guardando.set(true);
    this.errorMensaje.set(null);

    const sharedValues = {
      nombre: values.nombre.trim(),
      tipo: values.tipo.trim(),
      stockMinimo: Number(values.stockMinimo),
      peso: Number(values.peso),
      unidadPeso: values.unidadPeso,
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
          motivoAjuste: adjustmentAmount > 0 ? values.motivoAjuste || undefined : undefined,
          observacionAjuste:
            adjustmentAmount > 0 ? values.observacionAjuste.trim() || undefined : undefined,
        })
      : this.stockService.create({
          ...sharedValues,
          cantidadStock: Number(values.cantidadStock),
        });

    request.subscribe({
      next: () => this.guardado.emit(),
      error: (error) => {
        this.errorMensaje.set(
          error.error?.code === 'INSUFFICIENT_STOCK'
            ? 'No se pueden restar más unidades que las disponibles'
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
    this.onCancelar();
  }
}
