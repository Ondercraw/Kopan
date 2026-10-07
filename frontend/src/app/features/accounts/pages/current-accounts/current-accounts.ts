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
  readonly openingTarget = signal<{ side: 'CLIENTE' | 'PROVEEDOR'; account: CurrentAccount } | null>(null);
  readonly cancellationTarget = signal<AccountDocument | null>(null);
  openingAmountPesos = 0; openingDetail = ''; cancellationReason = '';
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
    this.saving.set(true); const kind = target.document.tipo === 'SALDO_INICIAL' ? 'opening-debts' : target.side === 'CLIENTE' ? 'clients/sales' : 'suppliers/purchases';
    this.service.pay(kind, target.document.id, cents, this.paymentMethod as 'EFECTIVO' | 'TRANSFERENCIA').subscribe({ next: () => { this.saving.set(false); this.paymentTarget.set(null); this.load(); }, error: (err) => { this.saving.set(false); this.error.set(err?.error?.message ?? 'No se pudo registrar el pago'); } });
  }
  openOpeningDebt(side: 'CLIENTE' | 'PROVEEDOR', account: CurrentAccount) {
    this.openingTarget.set({ side, account }); this.openingAmountPesos = 0; this.openingDetail = ''; this.error.set(null);
  }
  addOpeningDebt() {
    const target = this.openingTarget(); const cents = Math.round(this.openingAmountPesos * 100);
    if (!target) return;
    if (!Number.isSafeInteger(cents) || cents <= 0) { this.error.set('Ingresá un importe mayor a cero'); return; }
    this.saving.set(true);
    this.service.addOpeningDebt(target.side, target.account.entidadId, cents, this.openingDetail.trim()).subscribe({
      next: () => { this.saving.set(false); this.openingTarget.set(null); this.load(); },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message ?? 'No se pudo agregar la deuda'); },
    });
  }
  openCancellation(doc: AccountDocument) { this.cancellationTarget.set(doc); this.cancellationReason = ''; this.error.set(null); }
  cancelOpeningDebt() {
    const doc = this.cancellationTarget(); if (!doc) return;
    this.saving.set(true);
    this.service.cancelOpeningDebt(doc.id, this.cancellationReason.trim()).subscribe({
      next: () => { this.saving.set(false); this.cancellationTarget.set(null); this.load(); },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message ?? 'No se pudo cancelar la deuda'); },
    });
  }
  money(cents: number) { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(cents / 100); }
  paymentLabel(method: AccountDocument['pagos'][number]['medioPago']) {
    if (method === 'EFECTIVO') return 'efectivo';
    if (method === 'TRANSFERENCIA') return 'transferencia';
    if (method === 'CHEQUE') return 'cheque';
    return 'pagado antes de usar el sistema';
  }
  date(value: string) { return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
  printAccount(account: CurrentAccount, side: 'CLIENTE' | 'PROVEEDOR') {
    const popup = window.open('', '_blank', 'width=900,height=760');
    if (!popup) { this.error.set('El navegador bloqueó la ventana del extracto'); return; }
    const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
    const day = (value: string) => new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(new Date(value));
    const events = account.documentos.flatMap((doc) => [
      { fecha: doc.fecha, label: doc.tipo === 'SALDO_INICIAL' ? (doc.estado === 'CANCELADO' ? 'Saldo anterior cancelado' : 'Saldo anterior') : `${doc.tipo === 'VENTA' ? 'Venta' : 'Compra'} #${doc.codigo}`, detail: doc.detalle, amount: doc.estado === 'CANCELADO' ? 0 : doc.totalCentavos, kind: doc.estado === 'CANCELADO' ? 'cancelled' : 'debt' },
      ...doc.pagos.map((payment) => ({ fecha: payment.fecha, label: `Pago de ${doc.tipo.toLowerCase()} #${doc.codigo}`, detail: `${this.paymentLabel(payment.medioPago)} · ${payment.actorName}`, amount: payment.montoCentavos, kind: 'payment' })),
    ]).sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    const groups = new Map<string, typeof events>();
    for (const event of events) groups.set(day(event.fecha), [...(groups.get(day(event.fecha)) ?? []), event]);
    const sections = [...groups].map(([date, entries]) => `<section class="day"><h2>${escape(date)}</h2>${entries.map((event) =>
      `<div class="entry"><div><strong>${escape(event.label)}</strong><small>${escape(event.detail)}</small></div><b class="${event.kind}">${event.kind === 'payment' ? '− ' : '+ '}${escape(this.money(event.amount))}</b></div>`).join('')}</section>`).join('');
    const title = `Cuenta corriente - ${account.entidadNombre}`;
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escape(title)}</title><style>@page{size:A4;margin:14mm 12mm 18mm;@bottom-right{content:'Página ' counter(page);font-size:10px;color:#7b6251}}*{box-sizing:border-box}body{margin:0;color:#2d190e;font:13px Arial,sans-serif}header{border-bottom:3px solid #713508;padding-bottom:12px;margin-bottom:18px}h1{font:700 24px Georgia,serif;margin:4px 0}header small{color:#806858}.summary{display:flex;gap:24px;padding:12px;background:#f6ece3;margin-bottom:18px}.summary b{color:#713508}.day{break-inside:avoid-page;margin:0 0 18px}.day h2{font:700 16px Georgia,serif;background:#ead6c4;padding:7px 10px;margin:0}.entry{display:flex;justify-content:space-between;gap:18px;padding:9px 10px;border-bottom:1px solid #e5d7ca}.entry div{display:grid;gap:3px}.entry small{color:#756150}.entry b{white-space:nowrap}.entry b.payment{color:#26713c}.entry b.debt{color:#a1362d}@media print{.day{break-inside:avoid-page}}</style></head><body><header><small>DISTRIBUIDORA KOPAN · ${side === 'CLIENTE' ? 'CLIENTE' : 'PROVEEDOR'}</small><h1>${escape(account.entidadNombre)}</h1><small>Extracto de cuenta corriente</small></header><div class="summary"><span>Total: <b>${escape(this.money(account.totalCentavos))}</b></span><span>Pagado: <b>${escape(this.money(account.pagadoCentavos))}</b></span><span>Saldo: <b>${escape(this.money(account.saldoCentavos))}</b></span></div>${sections}<script>window.onload=()=>setTimeout(()=>window.print(),150);<\/script></body></html>`);
    popup.document.close();
  }
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
        totalCentavos: documents.reduce((sum, item) => sum + (item.estado === 'CANCELADO' ? 0 : item.totalCentavos), 0),
        pagadoCentavos: documents.reduce((sum, item) => sum + (item.estado === 'CANCELADO' ? 0 : item.pagadoCentavos), 0),
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
