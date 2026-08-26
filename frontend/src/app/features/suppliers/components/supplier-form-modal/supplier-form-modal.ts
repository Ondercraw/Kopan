import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Supplier } from '../../models/supplier.model';
import { SuppliersService } from '../../services/suppliers.service';

@Component({
  selector: 'app-supplier-form-modal',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './supplier-form-modal.html',
  styleUrls: ['./supplier-form-modal.scss', './supplier-form-modal-adjustments.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierFormModal implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SuppliersService);
  @Input() supplier: Supplier | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    cuit: ['', Validators.maxLength(20)],
    contacto: ['', Validators.maxLength(80)],
    telefono: ['', Validators.maxLength(40)],
    email: ['', [Validators.email, Validators.maxLength(254)]],
    direccion: ['', Validators.maxLength(180)],
    localidad: ['', Validators.maxLength(80)],
    observaciones: ['', Validators.maxLength(500)],
  });
  ngOnInit(): void {
    if (this.supplier) this.form.patchValue(this.supplier);
  }
  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const raw = this.form.getRawValue();
    const payload = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, value.trim()]),
    ) as typeof raw;
    const request = this.supplier
      ? this.service.update(this.supplier._id, payload)
      : this.service.create(payload);
    request.subscribe({
      next: () => this.saved.emit(),
      error: (response) => {
        this.error.set(response.error?.message ?? 'No se pudo guardar el proveedor');
        this.saving.set(false);
      },
    });
  }
  close(): void {
    if (!this.saving()) this.closed.emit();
  }
  @HostListener('document:keydown.escape') onEscape(): void {
    this.close();
  }
}
