import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, filter, finalize, forkJoin, interval, of } from 'rxjs';
import { normalizeUserRoles, UserRole } from '../../../../core/models/user-role.enum';
import { AuthService } from '../../../../core/services/auth.service';
import { ProductDeactivateModal } from '../../components/product-deactivate-modal/product-deactivate-modal';
import { ProductFormModal } from '../../components/product-form-modal/product-form-modal';
import { ProductReactivateModal } from '../../components/product-reactivate-modal/product-reactivate-modal';
import { StockMovementHistory } from '../../components/stock-movement-history/stock-movement-history';
import { ReplenishmentModal } from '../../components/replenishment-modal/replenishment-modal';
import { Product, StockMovement, WeightUnit } from '../../models/product.model';
import { StockService } from '../../services/stock.service';
import { CsvExportService } from '../../../../shared/services/csv-export.service';

type ProductSort =
  | 'ID_ASC'
  | 'ID_DESC'
  | 'NAME_ASC'
  | 'NAME_DESC'
  | 'TYPE_ASC'
  | 'TYPE_DESC'
  | 'SUPPLIER_ASC'
  | 'SUPPLIER_DESC'
  | 'DESCRIPTION_ASC'
  | 'DESCRIPTION_DESC'
  | 'WEIGHT_ASC'
  | 'WEIGHT_DESC'
  | 'STOCK_ASC'
  | 'STOCK_DESC'
  | 'MINIMUM_ASC'
  | 'MINIMUM_DESC'
  | 'STATUS_ASC'
  | 'STATUS_DESC'
  | 'CREATED_ASC'
  | 'CREATED_DESC'
  | 'UPDATED_ASC'
  | 'UPDATED_DESC';

@Component({
  selector: 'app-stock-list',
  standalone: true,
  imports: [
    ProductFormModal,
    ProductDeactivateModal,
    ProductReactivateModal,
    StockMovementHistory,
    ReplenishmentModal,
  ],
  templateUrl: './stock-list.html',
  styleUrl: './stock-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockList implements OnInit {
  private readonly stockService = inject(StockService);
  private readonly authService = inject(AuthService);
  private readonly csv = inject(CsvExportService);
  private readonly destroyRef = inject(DestroyRef);
  private dataRevision = 0;
  private backgroundRefreshInFlight = false;
  private backgroundRefreshCycle = 0;

  readonly products = signal<Product[]>([]);
  readonly inactiveProducts = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly supplierFilter = signal('');
  readonly typeFilter = signal('');
  readonly weightFilter = signal('');
  readonly sortOrder = signal<ProductSort>('STOCK_ASC');
  readonly expandedProductId = signal<string | null>(null);
  readonly pendingProductIds = signal<Set<string>>(new Set());
  readonly movementsByProduct = signal<Record<string, StockMovement[]>>({});
  readonly loadingMovementIds = signal<Set<string>>(new Set());
  readonly addModalOpen = signal(false);
  readonly editingProduct = signal<Product | null>(null);
  readonly deactivateModalOpen = signal(false);
  readonly reactivateModalOpen = signal(false);
  readonly replenishmentModalOpen = signal(false);

  readonly canManageStock = computed(() => {
    const roles = this.authService.currentUser()?.roles ?? [];
    return [UserRole.JEFE, UserRole.EMPLEADO_STOCK].some((role) =>
      normalizeUserRoles(roles).includes(role),
    );
  });

  readonly typeOptions = computed(() =>
    [
      ...new Set([...this.products(), ...this.inactiveProducts()].map((product) => product.tipo)),
    ].sort((a, b) => a.localeCompare(b, 'es')),
  );

  readonly supplierOptions = computed(() => {
    const unique = new Map<string, NonNullable<Product['proveedorId']>>();
    for (const product of this.products()) {
      if (product.proveedorId) unique.set(product.proveedorId._id, product.proveedorId);
    }
    return [...unique.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });

  readonly weightOptions = computed(() => {
    const uniqueWeights = new Map<string, { value: string; peso: number; unidad: WeightUnit }>();
    for (const product of this.products()) {
      const value = this.weightKey(product);
      uniqueWeights.set(value, { value, peso: product.peso, unidad: product.unidadPeso });
    }
    return [...uniqueWeights.values()].sort(
      (a, b) => this.weightInGrams(a.peso, a.unidad) - this.weightInGrams(b.peso, b.unidad),
    );
  });

  readonly filteredProducts = computed(() => {
    const search = this.normalize(this.searchTerm());
    const supplier = this.supplierFilter();
    const type = this.typeFilter();
    const weight = this.weightFilter();

    const filtered = this.products().filter((product) => {
      const matchesName = !search || this.normalize(product.nombre).includes(search);
      const matchesSupplier = !supplier || product.proveedorId?._id === supplier;
      const matchesType = !type || product.tipo === type;
      const matchesWeight = !weight || this.weightKey(product) === weight;
      return matchesName && matchesSupplier && matchesType && matchesWeight;
    });
    return filtered.sort((a, b) => this.compareProducts(a, b, this.sortOrder()));
  });

  readonly outOfStockCount = computed(
    () => this.products().filter((product) => product.cantidadStock === 0).length,
  );

  readonly lowStockCount = computed(
    () =>
      this.products().filter(
        (product) =>
          product.cantidadStock > 0 &&
          product.stockMinimo > 0 &&
          product.cantidadStock <= product.stockMinimo,
      ).length,
  );

  readonly replenishmentProducts = computed(() =>
    this.products().filter((product) => product.cantidadStock === 0 || this.isLowStock(product)),
  );

  ngOnInit(): void {
    this.loadProducts();
    interval(10_000)
      .pipe(
        filter(
          () =>
            document.visibilityState === 'visible' &&
            this.pendingProductIds().size === 0 &&
            !this.backgroundRefreshInFlight,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.refreshProductsInBackground());
  }

  loadProducts(): void {
    this.loading.set(true);
    this.error.set(null);
    this.stockService.findAll().subscribe({
      next: (products) => {
        this.products.set(products);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el stock');
        this.loading.set(false);
      },
    });
    if (this.canManageStock()) {
      this.stockService.findInactive().subscribe({
        next: (products) => this.inactiveProducts.set(products),
        error: () => this.inactiveProducts.set([]),
      });
    }
  }

  private refreshProductsInBackground(): void {
    this.backgroundRefreshInFlight = true;
    const revisionAtRequest = this.dataRevision;
    this.backgroundRefreshCycle += 1;
    const refreshInactive = this.canManageStock() && this.backgroundRefreshCycle % 6 === 0;

    forkJoin({
      products: this.stockService.findAll(),
      // Los productos inactivos cambian muy poco: se actualizan una vez por minuto,
      // no en cada sondeo de stock activo.
      inactive: refreshInactive
        ? this.stockService.findInactive().pipe(catchError(() => of(null)))
        : of(null),
    })
      .pipe(finalize(() => (this.backgroundRefreshInFlight = false)))
      .subscribe({
        next: ({ products, inactive }) => {
          if (revisionAtRequest !== this.dataRevision) return;
          this.products.set(products);
          if (inactive) this.inactiveProducts.set(inactive);
          const editingId = this.editingProduct()?._id;
          if (editingId) {
            this.editingProduct.set(
              products.find((product) => product._id === editingId) ?? null,
            );
          }
        },
        // Un fallo transitorio no reemplaza los datos visibles ni interrumpe al usuario.
        error: () => undefined,
      });
  }

  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  onTypeFilter(event: Event): void {
    this.typeFilter.set((event.target as HTMLSelectElement).value);
  }

  onSupplierFilter(event: Event): void {
    this.supplierFilter.set((event.target as HTMLSelectElement).value);
  }

  onWeightFilter(event: Event): void {
    this.weightFilter.set((event.target as HTMLSelectElement).value);
  }

  onSortChange(event: Event): void {
    this.sortOrder.set((event.target as HTMLSelectElement).value as ProductSort);
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.supplierFilter.set('');
    this.typeFilter.set('');
    this.weightFilter.set('');
  }

  exportCurrentStock(): void {
    this.csv.download('stock-actual', this.filteredProducts(), [
      { header: 'ID', value: (p) => p.codigo },
      { header: 'Producto', value: (p) => p.nombre },
      { header: 'Tipo', value: (p) => p.tipo },
      { header: 'Proveedor', value: (p) => p.proveedorId?.nombre ?? 'Sin proveedor' },
      { header: 'Descripción', value: (p) => p.descripcionAdicional },
      { header: 'Peso', value: (p) => this.formatWeight(p.peso, p.unidadPeso) },
      { header: 'Stock actual', value: (p) => p.cantidadStock },
      { header: 'Stock mínimo', value: (p) => p.stockMinimo },
      {
        header: 'Estado',
        value: (p) =>
          p.cantidadStock === 0 ? 'Sin stock' : this.isLowStock(p) ? 'Stock bajo' : 'Disponible',
      },
    ]);
  }

  toggleExpanded(productId: string): void {
    const opening = this.expandedProductId() !== productId;
    this.expandedProductId.set(opening ? productId : null);
    if (opening) {
      this.loadMovements(productId);
    }
  }

  adjustQuantity(product: Product, delta: -1 | 1): void {
    if (!this.canManageStock() || this.pendingProductIds().has(product._id)) {
      return;
    }
    if (delta < 0 && product.cantidadStock === 0) {
      this.error.set('No se puede restar: el producto ya no tiene stock');
      return;
    }

    this.dataRevision += 1;
    this.setPending(product._id, true);
    this.error.set(null);
    this.stockService.adjustQuantity(product._id, delta).subscribe({
      next: (updated) => {
        this.products.update((products) =>
          products.map((current) => (current._id === updated._id ? updated : current)),
        );
        this.loadMovements(product._id, true);
        this.setPending(product._id, false);
      },
      error: (error) => {
        this.error.set(
          error.error?.code === 'STOCK_ALREADY_ZERO'
            ? 'No se puede restar: el producto ya no tiene stock'
            : 'No se pudo actualizar la cantidad',
        );
        this.setPending(product._id, false);
      },
    });
  }

  onProductSaved(): void {
    this.dataRevision += 1;
    const editedProductId = this.editingProduct()?._id;
    this.addModalOpen.set(false);
    this.editingProduct.set(null);
    this.loadProducts();
    if (editedProductId) {
      this.loadMovements(editedProductId, true);
    }
  }

  openEdit(product: Product): void {
    this.editingProduct.set(product);
  }

  onProductsDeactivated(): void {
    this.dataRevision += 1;
    this.deactivateModalOpen.set(false);
    this.expandedProductId.set(null);
    this.loadProducts();
  }

  onProductsReactivated(): void {
    this.dataRevision += 1;
    this.reactivateModalOpen.set(false);
    this.loadProducts();
  }

  isLowStock(product: Product): boolean {
    return (
      product.cantidadStock > 0 &&
      product.stockMinimo > 0 &&
      product.cantidadStock <= product.stockMinimo
    );
  }

  formatWeight(weight: number, unit: WeightUnit): string {
    return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 }).format(weight)} ${unit}`;
  }

  formatMoney(cents: number): string {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
      cents / 100,
    );
  }

  private weightKey(product: Product): string {
    return `${product.peso}|${product.unidadPeso}`;
  }

  private weightInGrams(weight: number, unit: WeightUnit): number {
    return unit === 'kg' ? weight * 1000 : weight;
  }

  private compareProducts(a: Product, b: Product, order: ProductSort): number {
    const direction = order.endsWith('_DESC') ? -1 : 1;
    let comparison = 0;

    if (order.startsWith('ID_')) {
      comparison = a.codigo - b.codigo;
    } else if (order.startsWith('NAME_')) {
      comparison = this.compareText(a.nombre, b.nombre);
    } else if (order.startsWith('TYPE_')) {
      comparison = this.compareText(a.tipo, b.tipo);
    } else if (order.startsWith('SUPPLIER_')) {
      comparison = this.compareOptionalText(
        a.proveedorId?.nombre ?? '',
        b.proveedorId?.nombre ?? '',
        direction,
      );
      return comparison || a.codigo - b.codigo;
    } else if (order.startsWith('DESCRIPTION_')) {
      comparison = this.compareOptionalText(
        a.descripcionAdicional,
        b.descripcionAdicional,
        direction,
      );
      return comparison || a.codigo - b.codigo;
    } else if (order.startsWith('WEIGHT_')) {
      comparison =
        this.weightInGrams(a.peso, a.unidadPeso) - this.weightInGrams(b.peso, b.unidadPeso);
    } else if (order.startsWith('STOCK_')) {
      comparison = a.cantidadStock - b.cantidadStock;
    } else if (order.startsWith('MINIMUM_')) {
      comparison = a.stockMinimo - b.stockMinimo;
    } else if (order.startsWith('STATUS_')) {
      comparison = this.stockStatusRank(a) - this.stockStatusRank(b);
    } else if (order.startsWith('CREATED_')) {
      comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    } else if (order.startsWith('UPDATED_')) {
      comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    }

    return comparison * direction || a.codigo - b.codigo;
  }

  private compareText(a: string, b: string): number {
    return a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });
  }

  private compareOptionalText(a: string, b: string, direction: number): number {
    if (!a && !b) {
      return 0;
    }
    if (!a) {
      return 1;
    }
    if (!b) {
      return -1;
    }
    return this.compareText(a, b) * direction;
  }

  private stockStatusRank(product: Product): number {
    if (product.cantidadStock === 0) {
      return 0;
    }
    return this.isLowStock(product) ? 1 : 2;
  }

  private loadMovements(productId: string, refresh = false): void {
    if (
      (!refresh && this.movementsByProduct()[productId]) ||
      this.loadingMovementIds().has(productId)
    ) {
      return;
    }
    const loading = new Set(this.loadingMovementIds());
    loading.add(productId);
    this.loadingMovementIds.set(loading);
    this.stockService.findMovements(productId).subscribe({
      next: (movements) => {
        this.movementsByProduct.update((current) => ({ ...current, [productId]: movements }));
        this.setMovementLoading(productId, false);
      },
      error: () => {
        this.movementsByProduct.update((current) => ({ ...current, [productId]: [] }));
        this.setMovementLoading(productId, false);
      },
    });
  }

  private setMovementLoading(productId: string, loading: boolean): void {
    const next = new Set(this.loadingMovementIds());
    loading ? next.add(productId) : next.delete(productId);
    this.loadingMovementIds.set(next);
  }

  private setPending(productId: string, pending: boolean): void {
    const next = new Set(this.pendingProductIds());
    if (pending) {
      next.add(productId);
    } else {
      next.delete(productId);
    }
    this.pendingProductIds.set(next);
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
