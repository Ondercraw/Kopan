import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, inject, Input, Output } from '@angular/core';
import { Product } from '../../models/product.model';
import { CsvExportService } from '../../../../shared/services/csv-export.service';

interface ReplenishmentGroup {
  key: string;
  supplier: string;
  products: Product[];
}

@Component({
  selector: 'app-replenishment-modal',
  standalone: true,
  templateUrl: './replenishment-modal.html',
  styleUrl: './replenishment-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReplenishmentModal {
  private readonly csv = inject(CsvExportService);
  @Input({ required: true }) products: Product[] = [];
  @Output() closed = new EventEmitter<void>();

  get groups(): ReplenishmentGroup[] {
    const grouped = new Map<string, ReplenishmentGroup>();
    for (const product of this.products) {
      const key = product.proveedorId?._id ?? 'unassigned';
      const supplier = product.proveedorId?.nombre ?? 'Sin proveedor asignado';
      const group = grouped.get(key) ?? { key, supplier, products: [] };
      group.products.push(product);
      grouped.set(key, group);
    }
    return [...grouped.values()].sort((a, b) => {
      if (a.key === 'unassigned') return 1;
      if (b.key === 'unassigned') return -1;
      return a.supplier.localeCompare(b.supplier, 'es');
    });
  }

  missingToMinimum(product: Product): number {
    return Math.max(product.stockMinimo - product.cantidadStock, 0);
  }

  exportCsv(): void {
    this.csv.download('lista-reposicion', this.products, [
      { header: 'Proveedor', value: (p) => p.proveedorId?.nombre ?? 'Sin proveedor asignado' },
      { header: 'ID', value: (p) => p.codigo },
      { header: 'Producto', value: (p) => p.nombre },
      { header: 'Tipo', value: (p) => p.tipo },
      { header: 'Stock actual', value: (p) => p.cantidadStock },
      { header: 'Stock mínimo', value: (p) => p.stockMinimo },
      { header: 'Faltan para el mínimo', value: (p) => this.missingToMinimum(p) },
    ]);
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }
}
