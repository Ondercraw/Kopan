import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  Client,
  ClientOptions,
  SaveClientPayload,
  TAX_LABELS,
  TaxCondition,
} from '../../models/client.model';
import { ClientsService } from '../../services/clients.service';
import {
  SearchableSelect,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select';
import { CurrencyInput } from '../../../../shared/components/currency-input/currency-input';

@Component({
  selector: 'app-client-form-modal',
  standalone: true,
  imports: [ReactiveFormsModule, SearchableSelect, CurrencyInput],
  templateUrl: './client-form-modal.html',
  styleUrls: ['./client-form-modal.scss', './client-form-modal-selects.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientFormModal implements OnInit, OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ClientsService);
  @Input() client: Client | null = null;
  @Input() options: ClientOptions = { groups: [], locations: [], sellers: [], priceLists: [] };
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<Client>();
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly taxOptions: SearchableSelectOption[] = Object.entries(TAX_LABELS).map(
    ([value, label]) => ({ value, label }),
  );
  get locationOptions(): SearchableSelectOption[] {
    return this.options.locations.map((value) => ({
      value,
      label: value,
      meta: 'Localidad existente',
    }));
  }
  get groupOptions(): SearchableSelectOption[] {
    return this.options.groups.map((value) => ({ value, label: value, meta: 'Grupo existente' }));
  }
  get sellerOptions(): SearchableSelectOption[] {
    return [
      { value: '', label: 'Sin vendedor', meta: 'Cliente sin asignación' },
      ...this.options.sellers.map((seller) => ({
        value: seller._id,
        label: seller.nombre,
        meta: seller.email,
      })),
    ];
  }
  get priceListOptions(): SearchableSelectOption[] {
    return this.options.priceLists.map((list) => ({
        value: list._id,
        label: list.nombre,
        meta: `Lista #${list.codigo}`,
      }));
  }
  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.pattern(/\S/), Validators.minLength(2), Validators.maxLength(120)]],
    nombreFantasia: ['', Validators.maxLength(120)],
    cuit: ['', Validators.maxLength(20)],
    telefono: ['', Validators.maxLength(40)],
    email: ['', [Validators.email, Validators.maxLength(254)]],
    direccion: ['', Validators.maxLength(180)],
    localidad: ['', Validators.maxLength(80)],
    grupo: ['', Validators.maxLength(80)],
    vendedorId: [''],
    condicionIva: this.fb.nonNullable.control<TaxCondition>('NO_DEFINIDA'),
    observaciones: ['', Validators.maxLength(500)],
    listaPreciosId: ['', Validators.required],
    permiteCuentaCorriente: [false],
    limiteCredito: [0, [Validators.required, Validators.min(0)]],
  });
  ngOnInit(): void {
    const generalListId = this.defaultPriceListId();
    if (this.client)
      this.form.patchValue({
        ...this.client,
        vendedorId: this.client.vendedorId?._id ?? '',
        listaPreciosId: this.client.listaPreciosId?._id ?? generalListId,
        limiteCredito: (this.client.limiteCreditoCentavos ?? 0) / 100,
      });
    else this.form.controls.listaPreciosId.setValue(generalListId);
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options'] && !this.form.controls.listaPreciosId.value) {
      this.form.controls.listaPreciosId.setValue(this.defaultPriceListId());
    }
  }
  private defaultPriceListId(): string {
    return this.options.priceLists.find(
      (list) => list.nombre.trim().toLocaleLowerCase('es') === 'general',
    )?._id ?? this.options.priceLists[0]?._id ?? '';
  }
  submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const raw = this.form.getRawValue();
    const payload: SaveClientPayload = {
      nombre: raw.nombre.trim(),
      nombreFantasia: raw.nombreFantasia.trim() || undefined,
      cuit: raw.cuit.trim() || undefined,
      telefono: raw.telefono.trim() || undefined,
      email: raw.email.trim() || undefined,
      direccion: raw.direccion.trim() || undefined,
      localidad: raw.localidad.trim() || undefined,
      grupo: raw.grupo.trim() || undefined,
      vendedorId: raw.vendedorId || undefined,
      condicionIva: raw.condicionIva,
      observaciones: raw.observaciones.trim() || undefined,
      listaPreciosId: raw.listaPreciosId,
      permiteCuentaCorriente: raw.permiteCuentaCorriente,
      limiteCreditoCentavos: raw.permiteCuentaCorriente
        ? Math.round(Number(raw.limiteCredito) * 100)
        : 0,
    };
    const request = this.client
      ? this.service.update(this.client._id, payload)
      : this.service.create(payload);
    request.subscribe({
      next: (client) => this.saved.emit(client),
      error: (r) => {
        const message = r.error?.message;
        this.error.set(Array.isArray(message) ? message.join('. ') : message || 'No se pudo guardar el cliente');
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
