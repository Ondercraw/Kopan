import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientsService } from '../../../clients/services/clients.service';
import { Client } from '../../../clients/models/client.model';
import { CurrencyInput } from '../../../../shared/components/currency-input/currency-input';
import { SearchableSelect, SearchableSelectOption } from '../../../../shared/components/searchable-select/searchable-select';
import { ConfirmationModal } from '../../../../shared/components/confirmation-modal/confirmation-modal';
import { argentinaDateTime, argentinaToday } from '../../../../shared/utils/argentina-date';
import { BankCheck, SaveCheckPayload } from '../../models/check.model';
import { ChecksService } from '../../services/checks.service';
import { amountInWords } from '../../utils/amount-in-words';

@Component({
  selector: 'app-checks-list',
  standalone: true,
  imports: [FormsModule, CurrencyInput, SearchableSelect, ConfirmationModal],
  templateUrl: './checks-list.html',
  styleUrls: ['./checks-list.scss', './checks-list-adjustments.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChecksListPage implements OnInit {
  private readonly api = inject(ChecksService);
  private readonly clientsApi = inject(ClientsService);

  readonly checks = signal<BankCheck[]>([]);
  readonly clients = signal<Client[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly modalOpen = signal(false);
  readonly collecting = signal<BankCheck | null>(null);
  readonly createAttempted = signal(false);

  statusFilter = '';
  search = '';
  collectionDestination: 'EFECTIVO' | 'TRANSFERENCIA' = 'EFECTIVO';

  banco = '';
  domicilioPago = '';
  titular = '';
  domicilioTitular = '';
  libradorCuit = '';
  monto = 0;
  fechaEmision = '';
  lugarEmision = '';
  numero = '';
  diferido = false;
  fechaCobro = '';
  clienteId = '';

  readonly clientOptions = computed<SearchableSelectOption[]>(() =>
    this.clients()
      .filter((c) => c.activo)
      .map((c) => ({
        value: c._id,
        label: c.nombre,
        meta: `#${c.codigo} · ${c.cuit || 'Sin CUIT'}`,
      }))
  );

  readonly filtered = computed(() => {
    const term = this.normalize(this.search);
    return this.checks().filter(
      (c) =>
        (!this.statusFilter || c.estado === this.statusFilter) &&
        (!term ||
          this.normalize(
            `${c.numero} ${c.banco} ${c.titular} ${c.clienteNombre}`
          ).includes(term))
    );
  });

  readonly filteredPending = computed(() =>
    this.filtered().filter((check) => check.estado === 'PENDIENTE')
  );

  readonly filteredCollected = computed(() =>
    this.filtered().filter((check) => check.estado === 'COBRADO')
  );

  readonly pendingTotal = computed(() =>
    this.checks()
      .filter((c) => c.estado === 'PENDIENTE')
      .reduce((a, c) => a + c.montoCentavos, 0)
  );

  readonly collectedTotal = computed(() =>
    this.checks()
      .filter((c) => c.estado === 'COBRADO')
      .reduce((a, c) => a + c.montoCentavos, 0)
  );

  ngOnInit() {
    this.load();
    this.clientsApi.findAll().subscribe({ next: (v) => this.clients.set(v) });
  }

  load() {
    this.loading.set(true);
    this.api.findAll().subscribe({
      next: (v) => {
        this.checks.set(v);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los cheques');
        this.loading.set(false);
      },
    });
  }

  openCreate() {
    this.reset();
    this.modalOpen.set(true);
  }

  close() {
    if (!this.saving()) this.modalOpen.set(false);
  }

  save() {
    this.createAttempted.set(true);
    if (
      !this.banco.trim() ||
      !this.domicilioPago.trim() ||
      !this.titular.trim() ||
      !this.domicilioTitular.trim() ||
      !/^[0-9]{11}$/.test(this.libradorCuit.replace(/\D/g, '')) ||
      !this.numero.trim() ||
      this.monto <= 0 ||
      (this.diferido && !this.fechaCobro)
    ) {
      this.error.set('Revisá los campos marcados antes de agregar el cheque');
      return;
    }
    this.saving.set(true);
    this.api.create(this.payload()).subscribe({
      next: (c) => {
        this.checks.update((v) => [c, ...v]);
        this.modalOpen.set(false);
        this.saving.set(false);
        this.success.set(`Cheque #${c.numero} agregado`);
      },
      error: (e) => {
        this.error.set(
          e.error?.message ?? 'No se pudo agregar el cheque'
        );
        this.saving.set(false);
      },
    });
  }

  invalidRequired(value: string): boolean {
    return this.createAttempted() && !value.trim();
  }

  invalidCuit(): boolean {
    return this.createAttempted() && !/^[0-9]{11}$/.test(this.libradorCuit.replace(/\D/g, ''));
  }

  invalidAmount(): boolean {
    return this.createAttempted() && (!Number.isFinite(this.monto) || this.monto <= 0);
  }

  invalidCollectionDate(): boolean {
    return this.createAttempted() && this.diferido && !this.fechaCobro;
  }

  openCollection(check: BankCheck) {
    this.collectionDestination = 'EFECTIVO';
    this.collecting.set(check);
  }

  confirmCollect() {
    const c = this.collecting();
    if (!c) return;
    this.saving.set(true);
    const request =
      c.estado === 'COBRADO'
        ? this.api.allocate(c._id, this.collectionDestination)
        : this.api.collect(c._id, this.collectionDestination);

    request.subscribe({
      next: (u) => {
        this.checks.update((v) => v.map((item) => (item._id === u._id ? u : item)));
        this.collecting.set(null);
        this.saving.set(false);
        this.success.set(
          c.estado === 'COBRADO'
            ? `El cheque #${u.numero} fue acreditado`
            : `Cheque #${u.numero} marcado como cobrado`
        );
      },
      error: (e) => {
        this.error.set(
          e.error?.message ?? 'No se pudo acreditar el cheque'
        );
        this.collecting.set(null);
        this.saving.set(false);
      },
    });
  }

  destinationLabel(value: BankCheck['destinoCobro']) {
    return value === 'TRANSFERENCIA'
      ? 'Transferencia / Mercado Pago'
      : value === 'EFECTIVO'
      ? 'Efectivo'
      : 'Destino pendiente';
  }

  words() {
    return amountInWords(Math.round(this.monto * 100));
  }

  displayedWords(check: BankCheck) {
    return amountInWords(check.montoCentavos);
  }

  money(c: number) {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(c / 100);
  }

  date(v: string | null) {
    return v ? argentinaDateTime(v) : '-';
  }

  canCollect(check: BankCheck) {
    if (!check.diferido || !check.fechaCobro) return true;
    const due = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
    }).format(new Date(check.fechaCobro));
    return due <= argentinaToday();
  }

  shortDate(v: string | null) {
    return v
      ? new Intl.DateTimeFormat('es-AR', {
          timeZone: 'America/Argentina/Buenos_Aires',
        }).format(new Date(v))
      : '-';
  }

  private payload(): SaveCheckPayload {
    return {
      banco: this.banco.trim(),
      domicilioPago: this.domicilioPago.trim(),
      titular: this.titular.trim(),
      domicilioTitular: this.domicilioTitular.trim(),
      libradorCuit: this.libradorCuit.replace(/\D/g, ''),
      montoCentavos: Math.round(this.monto * 100),
      fechaEmision: this.fechaEmision || undefined,
      lugarEmision: this.lugarEmision.trim() || undefined,
      numero: this.numero.trim(),
      diferido: this.diferido,
      fechaCobro: this.diferido ? this.fechaCobro : undefined,
      clienteId: this.clienteId || undefined,
    };
  }

  private reset() {
    this.createAttempted.set(false);
    this.banco = '';
    this.domicilioPago = '';
    this.titular = '';
    this.domicilioTitular = '';
    this.libradorCuit = '';
    this.monto = 0;
    this.fechaEmision = argentinaToday();
    this.lugarEmision = '';
    this.numero = '';
    this.diferido = false;
    this.fechaCobro = '';
    this.clienteId = '';
    this.error.set(null);
  }

  private normalize(v: string) {
    return v
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
}
