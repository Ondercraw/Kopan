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
  selector: 'app-product-deactivate-modal',
  standalone: true,
  templateUrl: './product-deactivate-modal.html',
  styleUrl: './product-deactivate-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDeactivateModal {
  private readonly stockService = inject(StockService);

  @Input({ required: true }) products: Product[] = [];
  @Output() cerrado = new EventEmitter<void>();
  @Output() confirmado = new EventEmitter<void>();

  readonly step = signal<'selection' | 'confirmation'>('selection');
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly processing = signal(false);
  readonly errorMessage = signal<string | null>(null);

  get selectedProducts(): Product[] {
    const ids = this.selectedIds();
    return this.products.filter((product) => ids.has(product._id));
  }

  toggle(productId: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(productId)) {
      next.delete(productId);
    } else {
      next.add(productId);
    }
    this.selectedIds.set(next);
  }

  toggleAll(): void {
    if (this.selectedIds().size === this.products.length) {
      this.selectedIds.set(new Set());
      return;
    }
    this.selectedIds.set(new Set(this.products.map((product) => product._id)));
  }

  continueToConfirmation(): void {
    if (this.selectedIds().size > 0) {
      this.step.set('confirmation');
      this.errorMessage.set(null);
    }
  }

  backToSelection(): void {
    this.step.set('selection');
    this.errorMessage.set(null);
  }

  confirmDeactivation(): void {
    if (this.processing() || this.selectedIds().size === 0) {
      return;
    }

    this.processing.set(true);
    this.errorMessage.set(null);
    this.stockService.deactivateMany([...this.selectedIds()]).subscribe({
      next: () => this.confirmado.emit(),
      error: () => {
        this.errorMessage.set('No se pudieron dar de baja los productos seleccionados');
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
    if (this.step() === 'confirmation') {
      this.backToSelection();
    } else {
      this.close();
    }
  }
}
