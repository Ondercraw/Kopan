import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';

export type ConfirmationTone = 'danger' | 'success' | 'warning';

@Component({
  selector: 'app-confirmation-modal',
  standalone: true,
  templateUrl: './confirmation-modal.html',
  styleUrl: './confirmation-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmationModal {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly detail = input<string>('');
  readonly confirmLabel = input<string>('Confirmar');
  readonly tone = input<ConfirmationTone>('warning');
  readonly loading = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  @HostListener('document:keydown.escape')
  close(): void {
    if (!this.loading()) this.cancelled.emit();
  }

  confirm(): void {
    if (!this.loading()) this.confirmed.emit();
  }
}
