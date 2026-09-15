import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { CurrencyInput } from '../../../../shared/components/currency-input/currency-input';
import { SearchableSelect, SearchableSelectOption } from '../../../../shared/components/searchable-select/searchable-select';
import { AccountDocument, CurrentAccount } from '../../models/account.model';
import { AccountsService } from '../../services/accounts.service';

@Component({ selector: 'app-current-accounts', standalone: true, imports: [FormsModule, NgTemplateOutlet, CurrencyInput, SearchableSelect], templateUrl: './current-accounts.html', styleUrl: './current-accounts.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class CurrentAccountsPage {
  private readonly service = inject(AccountsService);
  readonly clients = signal<CurrentAccount[]>([]); readonly suppliers = signal<CurrentAccount[]>([]);
  readonly loading = signal(true); readonly error = signal<string | null>(null); readonly expanded = signal<string | null>(null);
  readonly period = signal<'TODAY' | 'WEEK' | 'MONTH' | 'YEAR' | null>(null);
  readonly exactDate = signal('');
  readonly searchTerm = signal('');
  readonly filteredClients = computed(() => this.filterAccounts(this.clients()));
  readonly filteredSuppliers = computed(() => this.filterAccounts(this.suppliers()));
  readonly paymentTarget = signal<{ side: 'CLIENTE' | 'PROVEEDOR'; entity: string; document: AccountDocument } | null>(null);
  readonly saving = signal(false); amountPesos = 0; paymentMethod = '';
  readonly paymentOptions = computed<SearchableSelectOption[]>(() => [{ value: 'EFECTIVO', label: 'Efectivo' }, { value: 'TRANSFERENCIA', label: 'Transferencia' }]);
  constructor() { this.load(); }
  load() { this.loading.set(true); this.service.statement().subscribe({ next: (data) => { this.clients.set(data.clients); this.suppliers.set(data.suppliers); this.loading.set(false); }, error: (err) => { this.error.set(err?.error?.message ?? 'No se pudieron cargar las cuentas corrientes'); this.loading.set(false); } }); }
  toggle(id: string) { this.expanded.update((current) => current === id ? null : id); }
  selectPeriod(value: 'TODAY' | 'WEEK' | 'MONTH' | 'YEAR') { this.period.set(value); this.exactDate.set(''); }
  selectDate(event: Event) { this.exactDate.set((event.target as HTMLInputElement).value); this.period.set(null); }
  search(event: Event) { this.searchTerm.set((event.target as HTMLInputElement).value); }
  clearDateFilters() { this.period.set(null); this.exactDate.set(''); }
  openPayment(side: 'CLIENTE' | 'PROVEEDOR', entity: string, document: AccountDocument) { this.paymentTarget.set({ side, entity, document }); this.amountPesos = document.saldoCentavos / 100; this.paymentMethod = ''; this.error.set(null); }
  closePayment() { if (!this.saving()) this.paymentTarget.set(null); }
  pay() {
    const target = this.paymentTarget(); const cents = Math.round(this.amountPesos * 100);
    if (!target || !['EFECTIVO', 'TRANSFERENCIA'].includes(this.paymentMethod)) { this.error.set('Elegí el medio de pago'); return; }
    if (cents <= 0 || cents > target.document.saldoCentavos) { this.error.set('El importe debe ser mayor a cero y no superar el saldo pendiente'); return; }
    this.saving.set(true); const kind = target.side === 'CLIENTE' ? 'clients/sales' : 'suppliers/purchases';
    this.service.pay(kind, target.document.id, cents, this.paymentMethod as 'EFECTIVO' | 'TRANSFERENCIA').subscribe({ next: () => { this.saving.set(false); this.paymentTarget.set(null); this.load(); }, error: (err) => { this.saving.set(false); this.error.set(err?.error?.message ?? 'No se pudo registrar el pago'); } });
  }
  money(cents: number) { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(cents / 100); }
  date(value: string) { return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
  private filterAccounts(accounts: CurrentAccount[]) {
    const range = this.dateRange();
    const term = this.normalize(this.searchTerm());
    return accounts.filter((account) => !term || this.normalize(account.entidadNombre).includes(term)).map((account) => {
      if (!range) return account;
      const documents = account.documentos.filter((document) => {
        const date = new Date(document.fecha).getTime();
        return date >= range.start.getTime() && date < range.end.getTime();
      });
      return {
        ...account,
        documentos: documents,
        totalCentavos: documents.reduce((sum, item) => sum + item.totalCentavos, 0),
        pagadoCentavos: documents.reduce((sum, item) => sum + item.pagadoCentavos, 0),
        saldoCentavos: documents.reduce((sum, item) => sum + item.saldoCentavos, 0),
      };
    }).filter((account) => account.documentos.length > 0);
  }
  private normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim(); }
  private dateRange(): { start: Date; end: Date } | null {
    const exact = this.exactDate();
    if (exact) {
      const [year, month, day] = exact.split('-').map(Number);
      const start = new Date(year, month - 1, day);
      return { start, end: new Date(year, month - 1, day + 1) };
    }
    const selected = this.period();
    if (!selected) return null;
    const now = new Date();
    let start: Date;
    if (selected === 'TODAY') start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (selected === 'WEEK') {
      const mondayOffset = (now.getDay() + 6) % 7;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
    } else if (selected === 'MONTH') start = new Date(now.getFullYear(), now.getMonth(), 1);
    else start = new Date(now.getFullYear(), 0, 1);
    return { start, end: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) };
  }
}
