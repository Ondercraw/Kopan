import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { normalizeUserRoles, UserRole } from '../../../../core/models/user-role.enum';
import { AuthService } from '../../../../core/services/auth.service';
import { ClientFormModal } from '../../components/client-form-modal/client-form-modal';
import { ConfirmationModal } from '../../../../shared/components/confirmation-modal/confirmation-modal';
import { PaginationControls } from '../../../../shared/components/pagination-controls/pagination-controls';
import { Client, ClientOptions, TAX_LABELS } from '../../models/client.model';
import { ClientsService } from '../../services/clients.service';
import { CsvExportService } from '../../../../shared/services/csv-export.service';

type ClientSort = 'NAME_ASC' | 'NAME_DESC' | 'CODE_ASC' | 'CODE_DESC';
@Component({
  selector: 'app-clients-list',
  standalone: true,
  imports: [ClientFormModal, DatePipe, ConfirmationModal, PaginationControls],
  templateUrl: './clients-list.html',
  styleUrls: [
    './clients-list.scss',
    './clients-list-adjustments.scss',
    './clients-pagination.scss',
    './clients-list-actions.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientsList implements OnInit {
  private readonly service = inject(ClientsService);
  private readonly auth = inject(AuthService);
  private readonly csv = inject(CsvExportService);
  readonly clients = signal<Client[]>([]);
  readonly options = signal<ClientOptions>({
    groups: [],
    locations: [],
    sellers: [],
    priceLists: [],
  });
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly search = signal('');
  readonly group = signal('');
  readonly location = signal('');
  readonly seller = signal('');
  readonly status = signal<'active' | 'inactive' | 'all'>('active');
  readonly sort = signal<ClientSort>('NAME_ASC');
  readonly expanded = signal<string | null>(null);
  readonly editing = signal<Client | null>(null);
  readonly modalOpen = signal(false);
  readonly taxLabels = TAX_LABELS;
  readonly pendingStatus = signal<Client | null>(null);
  readonly actionBusy = signal(false);
  readonly historyPages = signal<Record<string, number>>({});
  readonly historyPageSize = 5;
  readonly canManage = computed(() => {
    const roles = this.auth.currentUser()?.roles ?? [];
    return [UserRole.JEFE, UserRole.VENDEDOR].some((r) => normalizeUserRoles(roles).includes(r));
  });
  readonly filtered = computed(() => {
    const term = this.normalize(this.search());
    const list = this.clients().filter(
      (c) =>
        (this.status() === 'all' || c.activo === (this.status() === 'active')) &&
        (!this.group() || c.grupo === this.group()) &&
        (!this.location() || c.localidad === this.location()) &&
        (!this.seller() || c.vendedorId?._id === this.seller()) &&
        (!term ||
          this.normalize(`${c.nombre} ${c.nombreFantasia} ${c.cuit} ${c.direccion}`).includes(
            term,
          )),
    );
    return list.sort((a, b) => {
      const order = this.sort();
      const direction = order.endsWith('DESC') ? -1 : 1;
      return (
        direction *
        (order.startsWith('CODE')
          ? a.codigo - b.codigo
          : a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
      );
    });
  });
  readonly inactiveCount = computed(() => this.clients().filter((client) => !client.activo).length);
  ngOnInit(): void {
    this.load();
  }
  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.findAll().subscribe({
      next: (v) => {
        this.clients.set(v);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los clientes');
        this.loading.set(false);
      },
    });
    this.service.options().subscribe({
      next: (v) => this.options.set(v),
      error: () => this.options.set({ groups: [], locations: [], sellers: [], priceLists: [] }),
    });
  }
  edit(client: Client): void {
    this.editing.set(client);
    this.modalOpen.set(true);
  }
  close(): void {
    this.editing.set(null);
    this.modalOpen.set(false);
  }
  saved(): void {
    this.close();
    this.load();
  }
  toggleActive(client: Client): void {
    this.pendingStatus.set(client);
  }
  confirmToggleActive(): void {
    const client = this.pendingStatus();
    if (!client) return;
    this.actionBusy.set(true);
    this.service.setActive(client._id, !client.activo).subscribe({
      next: () => {
        this.pendingStatus.set(null);
        this.actionBusy.set(false);
        this.load();
      },
      error: (r) => {
        this.pendingStatus.set(null);
        this.actionBusy.set(false);
        this.error.set(r.error?.message ?? 'No se pudo modificar el cliente');
      },
    });
  }
  clear(): void {
    this.search.set('');
    this.group.set('');
    this.location.set('');
    this.seller.set('');
  }
  exportCsv(): void {
    this.csv.download('clientes', this.filtered(), [
      { header: 'Código', value: (c) => c.codigo },
      { header: 'Razón social', value: (c) => c.nombre },
      { header: 'Nombre de fantasía', value: (c) => c.nombreFantasia },
      { header: 'CUIT / documento', value: (c) => c.cuit },
      { header: 'Condición IVA', value: (c) => this.taxLabels[c.condicionIva] },
      { header: 'Teléfono', value: (c) => c.telefono },
      { header: 'Email', value: (c) => c.email },
      { header: 'Dirección', value: (c) => c.direccion },
      { header: 'Localidad', value: (c) => c.localidad },
      { header: 'Grupo', value: (c) => c.grupo },
      { header: 'Vendedor', value: (c) => c.vendedorId?.nombre ?? 'Sin asignar' },
      {
        header: 'Cuenta corriente',
        value: (c) => (c.permiteCuentaCorriente ? 'Habilitada' : 'No habilitada'),
      },
      { header: 'Límite de crédito', value: (c) => c.limiteCreditoCentavos ?? 0 },
      { header: 'Saldo utilizado', value: (c) => c.saldoCuentaCorrienteCentavos ?? 0 },
      { header: 'Crédito disponible', value: (c) => this.availableCredit(c) },
      { header: 'Estado', value: (c) => (c.activo ? 'Activo' : 'Baja') },
      { header: 'Observaciones', value: (c) => c.observaciones },
    ]);
  }
  historyPage(client: Client): number {
    return this.historyPages()[client._id] ?? 1;
  }
  historyTotalPages(client: Client): number {
    return Math.max(1, Math.ceil(client.historialCambios.length / this.historyPageSize));
  }
  visibleHistory(client: Client) {
    const page = this.historyPage(client);
    const start = (page - 1) * this.historyPageSize;
    return client.historialCambios
      .slice()
      .reverse()
      .slice(start, start + this.historyPageSize);
  }
  changeHistoryPage(client: Client, page: number): void {
    const valid = Math.min(Math.max(1, page), this.historyTotalPages(client));
    this.historyPages.update((current) => ({ ...current, [client._id]: valid }));
  }
  money(cents: number): string {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
      cents / 100,
    );
  }
  availableCredit(client: Client): number {
    return Math.max(
      0,
      (client.limiteCreditoCentavos ?? 0) - (client.saldoCuentaCorrienteCentavos ?? 0),
    );
  }
  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
