import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { normalizeUserRoles, UserRole } from '../../../../core/models/user-role.enum';
import { AuthService } from '../../../../core/services/auth.service';
import {
  SearchableSelect,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select';
import { Client } from '../../../clients/models/client.model';
import { ClientsService } from '../../../clients/services/clients.service';
import { PriceListDetail } from '../../../prices/models/price-list.model';
import { PricesService } from '../../../prices/services/prices.service';
import { Product } from '../../../stock/models/product.model';
import { StockService } from '../../../stock/services/stock.service';
import { PaymentMethod } from '../../models/sale.model';
import { SalesService } from '../../services/sales.service';
import { CurrencyInput } from '../../../../shared/components/currency-input/currency-input';
import { argentinaToday } from '../../../../shared/utils/argentina-date';
import { amountInWords } from '../../../checks/utils/amount-in-words';
interface DraftLine {
  product: Product;
  quantity: number;
  unitPriceCents: number;
  discountPercent: number;
}
@Component({
  selector: 'app-sales-entry',
  standalone: true,
  imports: [FormsModule, SearchableSelect, CurrencyInput],
  templateUrl: './sales-entry.html',
  styleUrls: ['./sales-entry.scss', './sales-entry-adjustments.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesEntryPage implements OnInit {
  private readonly clientsApi = inject(ClientsService);
  private readonly stockApi = inject(StockService);
  private readonly pricesApi = inject(PricesService);
  private readonly salesApi = inject(SalesService);
  private readonly auth = inject(AuthService);
  readonly clients = signal<Client[]>([]);
  readonly products = signal<Product[]>([]);
  readonly priceList = signal<PriceListDetail | null>(null);
  readonly lines = signal<DraftLine[]>([]);
  readonly saving = signal(false);
  readonly reviewing = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly reviewAttempted = signal(false);
  clientId = '';
  productId = '';
  paymentMethod: PaymentMethod = 'EFECTIVO';
  transferReference = '';
  observations = '';
  checkBank = '';
  checkPaymentAddress = '';
  checkHolder = '';
  checkHolderAddress = '';
  checkDrawerTaxId = '';
  checkIssueDate = argentinaToday();
  checkIssuePlace = '';
  checkNumber = '';
  checkDeferred = false;
  checkCollectionDate = '';
  readonly canChangePrice = computed(() =>
    normalizeUserRoles(this.auth.currentUser()?.roles ?? []).includes(UserRole.JEFE),
  );
  readonly clientOptions = computed<SearchableSelectOption[]>(() =>
    this.clients()
      .filter((c) => c.activo)
      .map((c) => ({
        value: c._id,
        label: c.nombre,
        meta: `#${c.codigo}${c.listaPreciosId ? ` · ${c.listaPreciosId.nombre}` : ' · Sin lista'}`,
      })),
  );
  readonly productOptions = computed<SearchableSelectOption[]>(() =>
    this.products()
      .filter((p) => p.activo && p.cantidadStock > 0)
      .map((p) => ({
        value: p._id,
        label: p.nombre,
        meta: `#${p.codigo} · Stock ${p.cantidadStock}`,
      })),
  );
  readonly total = computed(() =>
    this.lines().reduce((sum, line) => sum + this.lineTotal(line), 0),
  );
  selectedClient(): Client | null {
    return this.clients().find((client) => client._id === this.clientId) ?? null;
  }
  creditAvailable(client = this.selectedClient()): number {
    if (!client?.permiteCuentaCorriente) return 0;
    return Math.max(
      0,
      (client.limiteCreditoCentavos ?? 0) - (client.saldoCuentaCorrienteCentavos ?? 0),
    );
  }
  ngOnInit() {
    this.clientsApi.findAll().subscribe({
      next: (v) => this.clients.set(v),
      error: () => this.error.set('No se pudieron cargar los clientes'),
    });
    this.stockApi.findAll().subscribe({
      next: (v) => this.products.set(v),
      error: () => this.error.set('No se pudieron cargar los productos'),
    });
  }
  onClient(clientId: string) {
    this.clientId = clientId;
    this.lines.set([]);
    this.priceList.set(null);
    const c = this.clients().find((client) => client._id === clientId);
    if (this.paymentMethod === 'CHEQUE') this.prefillCheck(c ?? null);
    if (!c?.permiteCuentaCorriente && this.paymentMethod === 'CREDITO') {
      this.paymentMethod = 'EFECTIVO';
    }
    if (!c?.listaPreciosId) {
      this.error.set('El cliente no tiene una lista de precios asignada');
      return;
    }
    this.error.set(null);
    this.pricesApi.findOne(c.listaPreciosId._id).subscribe({
      next: (v) => this.priceList.set(v),
      error: () => this.error.set('No se pudo cargar la lista de precios'),
    });
  }
  onPaymentMethod(): void {
    if (this.paymentMethod === 'CHEQUE') this.prefillCheck(this.selectedClient());
  }
  addProduct() {
    const product = this.products().find((p) => p._id === this.productId),
      list = this.priceList();
    if (!product || !list) return;
    const price = list.items.find((i) => i.productoId._id === product._id)?.precioCentavos;
    if (price === undefined) {
      this.error.set(`${product.nombre} no tiene precio en esta lista`);
      return;
    }
    this.lines.update((lines) =>
      lines.some((l) => l.product._id === product._id)
        ? lines.map((l) =>
            l.product._id === product._id
              ? { ...l, quantity: Math.min(l.quantity + 1, product.cantidadStock) }
              : l,
          )
        : [...lines, { product, quantity: 1, unitPriceCents: price, discountPercent: 0 }],
    );
    this.productId = '';
    this.error.set(null);
  }
  updateQuantity(id: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const requested = Math.floor(Number(input.value));
    const line = this.lines().find((item) => item.product._id === id);
    if (!line) return;
    const quantity = Math.max(1, Math.min(requested || 1, line.product.cantidadStock));
    // `max` guía los controles y esta asignación también corrige inmediatamente
    // los valores escritos manualmente que superen el stock disponible.
    input.value = String(quantity);
    this.lines.update((lines) => lines.map((l) => (l.product._id === id ? { ...l, quantity } : l)));
  }
  updatePrice(id: string, value: number) {
    if (!this.canChangePrice()) return;
    const cents = Math.round(Math.max(0, Number(value)) * 100);
    this.lines.update((lines) =>
      lines.map((l) => (l.product._id === id ? { ...l, unitPriceCents: cents } : l)),
    );
  }
  updateDiscount(id: string, event: Event) {
    const discount = Math.max(0, Math.min(100, Number((event.target as HTMLInputElement).value)));
    this.lines.update((lines) =>
      lines.map((l) => (l.product._id === id ? { ...l, discountPercent: discount } : l)),
    );
  }
  remove(id: string) {
    this.lines.update((lines) => lines.filter((l) => l.product._id !== id));
  }
  review() {
    this.reviewAttempted.set(true);
    if (!this.selectedClient() || !this.priceList() || !this.lines().length) {
      this.error.set('Revisá los campos marcados antes de continuar');
      return;
    }
    if (this.paymentMethod === 'TRANSFERENCIA' && !this.transferReference.trim()) {
      this.error.set('Revisá la referencia de la transferencia antes de continuar');
      return;
    }
    if (this.paymentMethod === 'CREDITO') {
      const client = this.selectedClient();
      if (!client?.permiteCuentaCorriente) {
        this.error.set('El cliente no tiene cuenta corriente habilitada');
        return;
      }
      if (this.total() > this.creditAvailable(client)) {
        this.error.set('La venta supera el crédito disponible del cliente');
        return;
      }
    }
    if (this.paymentMethod === 'CHEQUE') {
      const required = [this.checkBank, this.checkPaymentAddress, this.checkHolder, this.checkHolderAddress, this.checkDrawerTaxId, this.checkNumber];
      if (required.some((value) => !value.trim()) || !/^\d{11}$/.test(this.checkDrawerTaxId.replace(/\D/g, ''))) {
        this.error.set('Revisá los campos marcados del cheque antes de continuar');
        return;
      }
      if (this.checkDeferred && !this.checkCollectionDate) {
        this.error.set('Indicá la fecha de cobro del cheque diferido');
        return;
      }
    }
    this.reviewing.set(true);
  }

  invalidSaleSelection(value: unknown): boolean {
    return this.reviewAttempted() && !value;
  }
  invalidTransferReference(): boolean {
    return this.reviewAttempted() && this.paymentMethod === 'TRANSFERENCIA' && !this.transferReference.trim();
  }
  invalidCheckRequired(value: string): boolean {
    return this.reviewAttempted() && this.paymentMethod === 'CHEQUE' && !value.trim();
  }
  invalidCheckCuit(): boolean {
    return this.reviewAttempted() && this.paymentMethod === 'CHEQUE' && !/^\d{11}$/.test(this.checkDrawerTaxId.replace(/\D/g, ''));
  }
  invalidCheckDate(): boolean {
    return this.reviewAttempted() && this.paymentMethod === 'CHEQUE' && this.checkDeferred && !this.checkCollectionDate;
  }
  confirm() {
    const client = this.selectedClient(),
      list = this.priceList();
    if (!client || !list || this.saving()) return;
    this.saving.set(true);
    this.salesApi
      .create({
        clienteId: client._id,
        vendedorId: client.vendedorId?._id,
        listaPreciosId: list._id,
        medioPago: this.paymentMethod,
        referenciaTransferencia:
          this.paymentMethod === 'TRANSFERENCIA' ? this.transferReference.trim() : undefined,
        observaciones: this.observations.trim() || undefined,
        cheque: this.paymentMethod === 'CHEQUE' ? {
          banco: this.checkBank.trim(), domicilioPago: this.checkPaymentAddress.trim(),
          titular: this.checkHolder.trim(), domicilioTitular: this.checkHolderAddress.trim(),
          libradorCuit: this.checkDrawerTaxId.replace(/\D/g, ''), montoCentavos: this.total(),
          fechaEmision: this.checkIssueDate || undefined, lugarEmision: this.checkIssuePlace.trim() || undefined,
          numero: this.checkNumber.trim(), diferido: this.checkDeferred,
          fechaCobro: this.checkDeferred ? this.checkCollectionDate : undefined,
        } : undefined,
        items: this.lines().map((l) => ({
          productoId: l.product._id,
          cantidad: l.quantity,
          precioUnitarioCentavos: l.unitPriceCents,
          bonificacionPuntosBase: Math.round(l.discountPercent * 100),
        })),
      })
      .subscribe({
        next: (s) => {
          this.success.set(
            `Venta #${s.codigo} confirmada. La factura de ARCA queda pendiente con el contador.`,
          );
          this.lines.set([]);
          this.reviewing.set(false);
          this.saving.set(false);
          this.transferReference = '';
          this.observations = '';
          this.resetCheck();
          this.paymentMethod = 'EFECTIVO';
          this.reviewAttempted.set(false);
          this.stockApi.findAll().subscribe((p) => this.products.set(p));
          this.clientsApi.findAll().subscribe((clients) => this.clients.set(clients));
        },
        error: (e) => {
          this.error.set(e.error?.message ?? 'No se pudo confirmar la venta');
          this.reviewing.set(false);
          this.saving.set(false);
        },
      });
  }
  money(cents: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
      cents / 100,
    );
  }
  lineTotal(l: DraftLine) {
    return this.lineNet(l) + this.lineVat(l);
  }
  lineNet(l: DraftLine) {
    return Math.round((l.unitPriceCents * l.quantity * (100 - l.discountPercent)) / 100);
  }
  lineVat(l: DraftLine) {
    return Math.round((this.lineNet(l) * Number(l.product.alicuotaIva ?? 21)) / 100);
  }
  finalUnitPrice(l: DraftLine) {
    return Math.round(l.unitPriceCents * (1 + Number(l.product.alicuotaIva ?? 21) / 100));
  }
  paymentLabel(): string {
    if (this.paymentMethod === 'TRANSFERENCIA') return 'transferencia / Mercado Pago';
    if (this.paymentMethod === 'CREDITO') return 'crédito en cuenta corriente';
    if (this.paymentMethod === 'CHEQUE') return `cheque #${this.checkNumber}`;
    return 'efectivo';
  }
  checkAmountWords(): string { return amountInWords(this.total()); }
  private prefillCheck(client: Client | null): void {
    if (!client) return;
    if (!this.checkHolder) this.checkHolder = client.nombre;
    if (!this.checkHolderAddress) this.checkHolderAddress = client.direccion;
    if (!this.checkDrawerTaxId) this.checkDrawerTaxId = client.cuit.replace(/\D/g, '');
  }
  private resetCheck(): void {
    this.checkBank=''; this.checkPaymentAddress=''; this.checkHolder=''; this.checkHolderAddress='';
    this.checkDrawerTaxId=''; this.checkIssueDate=argentinaToday(); this.checkIssuePlace='';
    this.checkNumber=''; this.checkDeferred=false; this.checkCollectionDate='';
  }
}
