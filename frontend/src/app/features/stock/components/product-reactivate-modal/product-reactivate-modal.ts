import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  inject,
  Input,
  Output,
  signal,
} from '@angular/core';
import { Product } from '../../models/product.model';
import { StockService } from '../../services/stock.service';

@Component({
  selector: 'app-product-reactivate-modal',
  standalone: true,
  templateUrl: './product-reactivate-modal.html',
  styleUrl: './product-reactivate-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductReactivateModal {
  private readonly stockService = inject(StockService);

  @Input({ required: true }) products: Product[] = [];
  @Output() cerrado = new EventEmitter<void>();
  @Output() confirmado = new EventEmitter<void>();

  readonly selectedIds = signal<Set<string>>(new Set());
  readonly processing = signal(false);
  readonly errorMessage = signal<string | null>(null);

  toggle(productId: string): void {
    const next = new Set(this.selectedIds());
    next.has(productId) ? next.delete(productId) : next.add(productId);
    this.selectedIds.set(next);
  }

  toggleAll(): void {
    this.selectedIds.set(
      this.selectedIds().size === this.products.length
        ? new Set()
        : new Set(this.products.map((product) => product._id)),
    );
  }

  confirm(): void {
    if (this.processing() || this.selectedIds().size === 0) {
      return;
    }
    this.processing.set(true);
    this.errorMessage.set(null);
    this.stockService.reactivateMany([...this.selectedIds()]).subscribe({
      next: () => this.confirmado.emit(),
      error: () => {
        this.errorMessage.set('No se pudieron reactivar los productos seleccionados');
        this.processing.set(false);
      },
    });
  }

  close(): void {
    if (!this.processing()) {
      this.cerrado.emit();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
