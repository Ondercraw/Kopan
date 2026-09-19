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
import { Client, ClientOptions } from '../../../clients/models/client.model';
import { ClientsService } from '../../../clients/services/clients.service';
import { ClientFormModal } from '../../../clients/components/client-form-modal/client-form-modal';
import { ProductFormModal } from '../../../stock/components/product-form-modal/product-form-modal';
import { PriceListDetail } from '../../../prices/models/price-list.model';
import { PricesService } from '../../../prices/services/prices.service';
import { Product } from '../../../stock/models/product.model';
import { StockService } from '../../../stock/services/stock.service';
import { PaymentMethod } from '../../models/sale.model';
import { SalesService } from '../../services/sales.service';
import { argentinaToday } from '../../../../shared/utils/argentina-date';
import { amountInWords } from '../../../checks/utils/amount-in-words';
interface DraftLine {
  product: Product;
  quantity: number;
  quantityInput: string;
  unitPriceCents: number;
  priceInput: string;
  discountPercent: number;
}
interface ReceiptView {
  date: Date;
  clientCode: number;
  clientName: string;
  sellerName: string;
  priceListName: string;
  paymentMethod: PaymentMethod;
  items: Array<{ quantity: number; name: string; unitPriceCents: number; totalCents: number }>;
  totalCents: number;
}
@Component({
  selector: 'app-sales-entry',
  standalone: true,
  imports: [FormsModule, SearchableSelect, ClientFormModal, ProductFormModal],
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
  readonly clientModalOpen = signal(false);
  readonly editingClient = signal<Client | null>(null);
  readonly clientFormOptions = signal<ClientOptions>({groups:[],locations:[],sellers:[],priceLists:[]});
  readonly productModalOpen = signal(false);
  readonly editingProduct = signal<Product | null>(null);
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
      .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base',numeric:true}))
      .map((c) => ({
        value: c._id,
        label: c.nombre,
        meta: `#${c.codigo}${c.listaPreciosId ? ` · ${c.listaPreciosId.nombre}` : ' · Sin lista'}`,
      })),
  );
  readonly productOptions = computed<SearchableSelectOption[]>(() =>
    this.products()
      .filter((p) => p.activo && p.cantidadStock > 0)
      .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base',numeric:true}))
      .map((p) => ({
        value: p._id,
        label: p.nombre,
        meta: `#${p.codigo} · Stock ${p.cantidadStock} · ${this.productPriceLabel(p)}`,
      })),
  );
  readonly total = computed(() =>
    this.lines().reduce((sum, line) => sum + this.lineTotal(line), 0),
  );
  readonly hasInvalidQuantities = computed(() =>
    this.lines().some((line) => this.quantityError(line) !== null),
  );
  productTypeOptions() { return [...new Set(this.products().map(p=>p.tipo))].sort((a,b)=>a.localeCompare(b,'es')); }
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
    this.clientsApi.options().subscribe({next:o=>this.clientFormOptions.set(o)});
  }
  openClientCreate() {
    this.editingClient.set(null);
    this.clientModalOpen.set(true);
  }
  openClientEdit() {
    const client = this.selectedClient();
    if (!client) return;
    this.editingClient.set(client);
    this.clientModalOpen.set(true);
  }
  closeClientModal() {
    this.clientModalOpen.set(false);
    this.editingClient.set(null);
  }
  onClientSaved(client: Client) {
    this.clientModalOpen.set(false);
    // El alta devuelve las referencias como IDs; al recargar se obtienen la
    // lista de precios y el vendedor poblados, igual que al entrar a Ventas.
    this.clientsApi.findAll().subscribe({
      next: (items) => {
        this.clients.set(items);
        this.editingClient.set(null);
        this.onClient(client._id);
      },
      error: () => this.error.set('El cliente se guardó, pero no se pudieron recargar sus datos'),
    });
  }
  openProductCreate() { this.editingProduct.set(null); this.productModalOpen.set(true); }
  openProductEdit(product: Product) { this.editingProduct.set(product); this.productModalOpen.set(true); }
  onProductSaved(product: Product) {
    this.products.update(items=>[...items.filter(x=>x._id!==product._id),product]);
    this.lines.update(lines=>lines.map(line=>line.product._id===product._id?{...line,product}:line));
    if (!this.editingProduct()) this.productId=product._id;
    this.editingProduct.set(null); this.productModalOpen.set(false);
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
    const listedPrice = list.items.find((i) => i.productoId._id === product._id)?.precioCentavos;
    if ((!listedPrice || listedPrice <= 0) && !this.canChangePrice()) {
      this.error.set(`${product.nombre} no tiene precio en esta lista. Consultá con un Dueño.`);
      return;
    }
    const price = listedPrice && listedPrice > 0 ? listedPrice : 0;
    this.lines.update((lines) =>
      lines.some((l) => l.product._id === product._id)
        ? lines.map((l) =>
            l.product._id === product._id
              ? (() => {
                  const quantity = Math.min(l.quantity + 1, product.cantidadStock);
                  return { ...l, quantity, quantityInput: String(quantity) };
                })()
              : l,
          )
        : [...lines, { product, quantity: 0, quantityInput: '', unitPriceCents: Math.round(price * (1 + Number(product.alicuotaIva ?? 21) / 100)), priceInput: price > 0 ? String(Math.round(price * (1 + Number(product.alicuotaIva ?? 21) / 100)) / 100) : '', discountPercent: 0 }],
    );
    this.productId = '';
    this.error.set(
      price === 0
        ? `${product.nombre} fue agregado sin precio. Ingresá su precio final antes de confirmar.`
        : null,
    );
  }
  updateQuantity(id: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const cleaned = input.value.replace(/\D/g, '');
    input.value = cleaned;
    const requested = cleaned === '' ? 0 : Number(cleaned);
    const line = this.lines().find((item) => item.product._id === id);
    if (!line) return;
    this.lines.update((lines) =>
      lines.map((l) =>
        l.product._id === id ? { ...l, quantity: requested, quantityInput: cleaned } : l,
      ),
    );
  }
  quantityError(line: DraftLine): string | null {
    if (line.quantityInput === '') return 'Ingresá la cantidad.';
    if (line.quantity === 0) return 'No se acepta 0 como una cantidad válida.';
    if (!Number.isInteger(line.quantity) || line.quantity < 0) {
      return 'Ingresá una cantidad entera mayor a 0.';
    }
    if (line.quantity > line.product.cantidadStock) {
      return `La cantidad supera el stock existente. Hay ${line.product.cantidadStock} ${line.product.cantidadStock === 1 ? 'unidad disponible' : 'unidades disponibles'}.`;
    }
    return null;
  }
  updatePrice(id: string, event: Event) {
    if (!this.canChangePrice()) return;
    const input = event.target as HTMLInputElement;
    const cleaned = input.value.replace(/\D/g, '');
    input.value = cleaned;
    const finalCents = cleaned ? Number(cleaned) * 100 : 0;
    this.lines.update((lines) =>
      lines.map((l) => (l.product._id === id ? { ...l, unitPriceCents: finalCents, priceInput: cleaned } : l)),
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
    if (this.hasInvalidQuantities()) {
      this.error.set('Las cantidades deben ser enteras, mayores a cero y no superar el stock disponible');
      return;
    }
    if (this.lines().some((line) => line.unitPriceCents <= 0)) {
      this.error.set('Todos los productos deben tener un precio final mayor a $0');
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
          precioFinalUnitarioCentavos: l.unitPriceCents,
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
  exportDraftReceipt(): void {
    const client = this.selectedClient();
    const list = this.priceList();
    if (!client || !list || !this.lines().length) {
      this.error.set('Seleccioná un cliente, su lista y al menos un producto para preparar el comprobante.');
      return;
    }
    const popup = window.open('', '_blank', 'width=900,height=760');
    if (!popup) {
      this.error.set('El navegador bloqueó la ventana del comprobante. Habilitá las ventanas emergentes e intentá nuevamente.');
      return;
    }
    this.renderReceipt({
      date: new Date(),
      clientCode: client.codigo,
      clientName: client.nombre,
      sellerName: client.vendedorId?.nombre || this.auth.currentUser()?.nombre || 'Venta mostrador',
      priceListName: list.nombre,
      paymentMethod: this.paymentMethod,
      items: this.lines().map((line) => ({
        quantity: line.quantity,
        name: line.product.nombre,
        unitPriceCents: this.finalUnitPrice(line),
        totalCents: this.lineTotal(line),
      })),
      totalCents: this.total(),
    }, popup);
  }
  private renderReceipt(receipt: ReceiptView, popup: Window): void {
    const rows = receipt.items.map((item) => {
      return `<tr><td class="quantity">${item.quantity}</td><td>${this.escapeHtml(item.name)}</td><td class="money">${this.escapeHtml(this.money(item.unitPriceCents))}</td><td class="money total-line">${this.escapeHtml(this.money(item.totalCents))}</td></tr>`;
    }).join('');
    const date = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(receipt.date);
    const payment = this.receiptPaymentLabel(receipt.paymentMethod);
    const fileDate = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(receipt.date).replaceAll('/', '-');
    const title = `${this.filenamePart(receipt.clientName)}-Comprobante-${fileDate}`;
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${this.escapeHtml(title)}</title><style>
      @page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#f4ece5;color:#2d190e;font-family:Arial,sans-serif}.ticket{width:min(100%,820px);min-height:calc(100vh - 48px);margin:24px auto;padding:34px;border:1px solid #d8c2b2;background:#fff;box-shadow:0 12px 34px #3f210f20}.brand{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:18px;border-bottom:3px solid #713508}.brand-mark{display:flex;align-items:center;gap:12px}.logo{display:grid;place-items:center;width:48px;height:48px;background:#713508;color:#fff;font:700 28px Georgia,serif}.brand h1{margin:0;font:700 25px Georgia,serif}.brand p{margin:4px 0 0;color:#8a654d;font-size:12px;letter-spacing:.08em}.number{text-align:right}.number strong{display:block;font:700 24px Georgia,serif;color:#713508}.number span{font-size:12px;color:#765d4d}.internal{margin:16px 0;padding:9px 12px;border-left:4px solid #b86719;background:#fbf1e7;color:#713508;font-size:12px;font-weight:700}.data{display:grid;grid-template-columns:1fr 1fr;gap:10px 28px;margin:18px 0 24px}.data div{display:grid;grid-template-columns:110px 1fr;gap:8px;padding-bottom:7px;border-bottom:1px solid #eaded5}.data span{color:#846b5b;font-size:11px;font-weight:700;text-transform:uppercase}.data strong{font-size:13px}table{width:100%;border-collapse:collapse}th{padding:10px 9px;background:#713508;color:#fff;font-size:11px;letter-spacing:.06em;text-align:left;text-transform:uppercase}td{padding:12px 9px;border-bottom:1px solid #eaded5;font-size:13px}.quantity{width:72px;text-align:center}.money{width:145px;text-align:right;font-variant-numeric:tabular-nums}.total-line{font-weight:700}.grand-total{display:flex;justify-content:flex-end;align-items:center;gap:30px;margin-top:28px;padding:20px 22px;background:#f1e2d4;border:2px solid #713508}.grand-total span{font-size:14px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.grand-total strong{font:700 32px Georgia,serif;color:#713508}.footer{margin-top:26px;padding-top:14px;border-top:1px dashed #cbb5a4;color:#806858;font-size:11px;text-align:center}@media(max-width:650px){.ticket{margin:0;padding:20px;box-shadow:none}.brand,.data{grid-template-columns:1fr;display:grid}.number{text-align:left}.data div{grid-template-columns:90px 1fr}.money{width:auto}.grand-total{justify-content:space-between}.grand-total strong{font-size:25px}}@media print{body{background:#fff}.ticket{width:100%;min-height:auto;margin:0;padding:12mm;border:0;box-shadow:none}.no-print{display:none!important}}
    </style></head><body><main class="ticket"><header class="brand"><div class="brand-mark"><div class="logo">K</div><div><h1>Distribuidora Kopan</h1><p>COMPROBANTE DE VENTA</p></div></div><div class="number"><strong>COMPROBANTE</strong><span>${this.escapeHtml(date)}</span></div></header><p class="internal">COMPROBANTE INTERNO · NO VÁLIDO COMO FACTURA</p><section class="data"><div><span>Cliente</span><strong>#${receipt.clientCode} · ${this.escapeHtml(receipt.clientName)}</strong></div><div><span>Vendedor</span><strong>${this.escapeHtml(receipt.sellerName)}</strong></div><div><span>Lista</span><strong>${this.escapeHtml(receipt.priceListName)}</strong></div><div><span>Pago</span><strong>${this.escapeHtml(payment)}</strong></div></section><table><thead><tr><th class="quantity">Cantidad</th><th>Producto</th><th class="money">Precio unitario</th><th class="money">Total</th></tr></thead><tbody>${rows}</tbody></table><section class="grand-total"><span>Total de la compra</span><strong>${this.escapeHtml(this.money(receipt.totalCents))}</strong></section><p class="footer">Gracias por su compra · Distribuidora Kopan.</p></main><script>window.onload=()=>{document.title=${JSON.stringify(title)};setTimeout(()=>window.print(),150)};<\/script></body></html>`);
    popup.document.close();
    popup.focus();
  }
  private receiptPaymentLabel(method: PaymentMethod): string {
    if (method === 'TRANSFERENCIA') return 'Transferencia / Mercado Pago';
    if (method === 'CREDITO') return 'Cuenta corriente';
    if (method === 'CHEQUE') return 'Cheque';
    return 'Efectivo';
  }
  private escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    })[character]!);
  }
  private filenamePart(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'Cliente';
  }
  money(cents: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
      cents / 100,
    );
  }
  productPriceLabel(product: Product) {
    const basePrice = this.priceList()?.items.find(
      (item) => item.productoId._id === product._id,
    )?.precioCentavos;
    if (!basePrice || basePrice <= 0) return 'Sin precio';
    return this.money(
      Math.round(basePrice * (1 + Number(product.alicuotaIva ?? 21) / 100)),
    );
  }
  lineTotal(l: DraftLine) {
    return Math.round((l.unitPriceCents * l.quantity * (100 - l.discountPercent)) / 100);
  }
  lineNet(l: DraftLine) {
    return Math.round(this.lineTotal(l) / (1 + Number(l.product.alicuotaIva ?? 21) / 100));
  }
  lineVat(l: DraftLine) {
    return this.lineTotal(l) - this.lineNet(l);
  }
  finalUnitPrice(l: DraftLine) {
    return l.unitPriceCents;
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
