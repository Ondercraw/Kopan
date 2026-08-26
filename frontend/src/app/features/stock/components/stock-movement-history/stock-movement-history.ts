import { ChangeDetectionStrategy, Component, inject, Input, OnChanges, signal } from '@angular/core';
import { StockMovement, StockMovementType } from '../../models/product.model';
import { PaginationControls } from '../../../../shared/components/pagination-controls/pagination-controls';
import { CsvExportService } from '../../../../shared/services/csv-export.service';

@Component({
  selector: 'app-stock-movement-history',
  standalone: true,
  imports: [PaginationControls],
  templateUrl: './stock-movement-history.html',
  styleUrl: './stock-movement-history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockMovementHistory implements OnChanges {
  private readonly csv = inject(CsvExportService);
  @Input({ required: true }) movements: StockMovement[] = [];
  @Input() loading = false;
  readonly page = signal(1);
  readonly pageSize = 5;

  ngOnChanges(): void {
    const lastPage = Math.max(1, this.totalPages);
    if (this.page() > lastPage) this.page.set(lastPage);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.movements.length / this.pageSize));
  }

  get visibleMovements(): StockMovement[] {
    const start = (this.page() - 1) * this.pageSize;
    return this.movements.slice(start, start + this.pageSize);
  }

  changePage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.totalPages));
  }

  exportCsv(): void {
    const productCode = this.movements[0]?.productCode ?? 'producto';
    this.csv.download(`movimientos-producto-${productCode}`, this.movements, [
      { header: 'Fecha', value: (m) => this.formatDate(m.createdAt) },
      { header: 'Tipo', value: (m) => this.movementLabel(m.type) },
      { header: 'Motivo', value: (m) => m.reason },
      { header: 'Usuario', value: (m) => m.actorName },
      { header: 'Stock anterior', value: (m) => m.previousStock },
      { header: 'Stock actual', value: (m) => m.currentStock },
      { header: 'Mínimo anterior', value: (m) => m.previousMinimumStock ?? '' },
      { header: 'Mínimo actual', value: (m) => m.currentMinimumStock ?? '' },
    ]);
  }

  movementLabel(type: StockMovementType): string {
    const labels: Record<StockMovementType, string> = {
      INITIAL: 'Carga inicial',
      INCREMENT: 'Ingreso',
      DECREMENT: 'Egreso',
      MINIMUM_CHANGE: 'Stock mínimo',
      DEACTIVATION: 'Baja',
      REACTIVATION: 'Reactivación',
    };
    return labels[type];
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }
}
