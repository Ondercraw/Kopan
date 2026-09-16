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
import { Product } from '../../../stock/models/product.model';
import { StockService } from '../../../stock/services/stock.service';
import { PriceList, PriceListDetail } from '../../models/price-list.model';
import { PriceProductHistory, PricesService } from '../../services/prices.service';
import { ConfirmationModal } from '../../../../shared/components/confirmation-modal/confirmation-modal';
import { CurrencyInput } from '../../../../shared/components/currency-input/currency-input';
import { DatePipe } from '@angular/common';
import { forkJoin, switchMap } from 'rxjs';

@Component({
  selector: 'app-price-lists',
  standalone: true,
  imports: [FormsModule, ConfirmationModal, CurrencyInput, DatePipe],
  templateUrl: './price-lists.html',
  styleUrls: ['./price-lists.scss', './price-lists-adjustments.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceListsPage implements OnInit {
  private readonly prices = inject(PricesService);
  private readonly stock = inject(StockService);
  private readonly auth = inject(AuthService);
  readonly lists = signal<PriceList[]>([]);
  readonly products = signal<Product[]>([]);
  readonly selected = signal<PriceListDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly draftPrices = signal<Record<string, number>>({});
  readonly pendingPrice = signal<{ product: Product; amount: number } | null>(null);
  readonly savingPrice = signal(false);
  readonly createAttempted = signal(false);
  readonly derivedMode = signal<'ALL' | 'SELECTED' | null>(null);
  readonly sourceDetail = signal<PriceListDetail | null>(null);
  readonly selectedProductIds = signal<Set<string>>(new Set());
  readonly derivedSaving = signal(false);
  readonly derivedPdfError = signal<string | null>(null);
  derivedName = '';
  derivedPercentage = 0;
  derivedDirection: 'ADD' | 'SUBTRACT' = 'ADD';
  derivedSourceId = '';
  derivedRubro = '';
  readonly canEdit = computed(() =>
    normalizeUserRoles(this.auth.currentUser()?.roles ?? []).includes(UserRole.JEFE),
  );
  newName = '';
  newDescription = '';
  readonly search = signal('');
  readonly historyProductId = signal<string | null>(null);
  readonly historyData = signal<PriceProductHistory | null>(null);
  historyFrom = '';
  historyTo = '';
  readonly visibleProducts = computed(() => {
    const q = this.search().trim().toLocaleLowerCase('es');
    return [...this.products()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base',numeric:true})).filter(
      (p) => !q || p.nombre.toLocaleLowerCase('es').includes(q) || String(p.codigo).includes(q),
    );
  });
  ngOnInit() {
    this.reload();
    this.stock.findAll().subscribe({
      next: (p) => this.products.set(p),
      error: () => this.error.set('No se pudieron cargar los productos'),
    });
  }
  openDerived(mode: 'ALL'|'SELECTED') {
    const source=this.lists().find(l=>l.nombre.trim().toLocaleLowerCase('es-AR')==='general') ?? this.lists().find(l=>l.activo) ?? this.lists()[0];
    if (!source) { this.error.set('Primero creá una lista general'); return; }
    this.derivedMode.set(mode); this.derivedSourceId=source._id; this.derivedName=''; this.derivedPercentage=0; this.derivedDirection='ADD'; this.derivedRubro=''; this.selectedProductIds.set(new Set()); this.derivedPdfError.set(null); this.loadDerivedSource();
  }
  loadDerivedSource() {
    if (!this.derivedSourceId) return;
    this.prices.findOne(this.derivedSourceId).subscribe({next:d=>this.sourceDetail.set(d),error:()=>this.error.set('No se pudo cargar la lista base')});
  }
  derivedProducts() {
    return [...this.products()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base',numeric:true}));
  }
  pricedDerivedProducts() {
    return this.derivedProducts().filter((product) => (this.derivedSourcePrice(product._id) ?? 0) > 0);
  }
  derivedRubros() { return [...new Set(this.derivedProducts().map(p=>p.tipo.trim().toLocaleUpperCase('es-AR'))) ].sort((a,b)=>a.localeCompare(b,'es')); }
  derivedSourcePrice(productId:string) { return this.sourceDetail()?.items.find(item=>item.productoId._id===productId)?.precioCentavos ?? null; }
  derivedDisplayPrice(product: Product) {
    const sourcePrice = this.derivedSourcePrice(product._id);
    if (sourcePrice === null || sourcePrice <= 0) return 'Sin precio';
    const percentage = Math.abs(Number(this.derivedPercentage));
    const validPercentage = Number.isFinite(percentage) ? percentage : 0;
    const factor = 1 + (this.derivedDirection === 'ADD' ? validPercentage : -validPercentage) / 100;
    return factor < 0
      ? 'Ajuste inválido'
      : this.money(this.finalPrice(product, Math.round(sourcePrice * factor)));
  }
  derivedCurrentPrice(product: Product) {
    const sourcePrice = this.derivedSourcePrice(product._id);
    return sourcePrice === null || sourcePrice <= 0
      ? 'Sin precio'
      : this.money(this.finalPrice(product, sourcePrice));
  }
  toggleDerivedProduct(id:string) { this.selectedProductIds.update(current=>{const next=new Set(current); next.has(id)?next.delete(id):next.add(id); return next;}); }
  selectRubro() {
    if (!this.derivedRubro) return;
    this.selectedProductIds.update(current=>{const next=new Set(current); this.derivedProducts().filter(p=>p.tipo===this.derivedRubro).forEach(p=>next.add(p._id)); return next;});
  }
  selectDerivedDirection(direction:'ADD'|'SUBTRACT') { this.derivedDirection=direction; }
  createDerived() {
    const source=this.sourceDetail(), name=this.derivedName.trim(), percentage=Math.abs(Number(this.derivedPercentage));
    if (!source || name.length<2 || !Number.isFinite(percentage) || percentage>1000) { this.error.set('Completá un nombre y un porcentaje válido'); return; }
    const ids=this.derivedMode()==='ALL' ? new Set(this.pricedDerivedProducts().map(p=>p._id)) : this.selectedProductIds();
    if (!ids.size) { this.error.set('Seleccioná al menos un producto'); return; }
    const factor=1+(this.derivedDirection==='ADD'?percentage:-percentage)/100;
    if (factor<0) { this.error.set('El descuento no puede superar el 100%'); return; }
    const pricesByProduct=new Map(source.items.map(item=>[item.productoId._id,item.precioCentavos]));
    const items=[...ids].map(productId=>({productId,precioCentavos:pricesByProduct.get(productId)??0}));
    this.derivedSaving.set(true); this.error.set(null);
    this.prices.create({nombre:name,descripcion:`${this.derivedDirection==='ADD'?'+':'−'}${percentage}% sobre ${source.nombre}`}).pipe(
      switchMap(list=>forkJoin(items.map(item=>this.prices.setPrice(list._id,item.productId,Math.round(item.precioCentavos*factor)))).pipe(switchMap(()=>this.prices.findOne(list._id))))
    ).subscribe({next:list=>{this.derivedSaving.set(false);this.derivedMode.set(null);this.success.set('Lista personalizada creada');this.reload();this.selected.set(list);},error:e=>{this.derivedSaving.set(false);this.error.set(e.error?.message??'No se pudo crear la lista personalizada');}});
  }
  supplierNames(product:Product) { const suppliers=product.proveedorIds?.length?product.proveedorIds:(product.proveedorId?[product.proveedorId]:[]); return suppliers.map(s=>s.nombre).join(' · ')||'Sin proveedor'; }
  exportPdf() {
    const list=this.selected(); if(!list) return;
    const rows=this.visibleProducts().map(p=>{const price=this.currentPrice(p._id);return price===null?'':`<tr><td>${this.escape(p.nombre)}</td><td>${this.escape(this.supplierNames(p))}</td><td>${this.escape(p.tipo)}</td><td>${this.escape(this.money(this.finalPrice(p,price)))}</td></tr>`}).join('');
    const popup=window.open('','_blank','width=900,height=700'); if(!popup){this.error.set('El navegador bloqueó la ventana para generar el PDF');return;}
    popup.document.write(`<!doctype html><html><head><title>${this.escape(this.pdfDocumentTitle(list.nombre))}</title><style>body{font-family:Arial;padding:32px;color:#2d190e}h1{font-family:Georgia}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #d8c2b2;text-align:left}th{background:#f2e7dd}</style></head><body><h1>${this.escape(list.nombre)}</h1><p>${new Date().toLocaleDateString('es-AR')}</p><table><thead><tr><th>Producto</th><th>Proveedor</th><th>Rubro</th><th>Precio final</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`); popup.document.close();
  }
  exportSelectedProductsPdf() {
    const source = this.sourceDetail();
    const selectedIds = this.selectedProductIds();
    if (!source || !selectedIds.size) {
      this.derivedPdfError.set('Seleccioná al menos un producto para generar el PDF.');
      return;
    }

    const selectedProducts = this.derivedProducts().filter((product) => selectedIds.has(product._id));
    const pricesByProduct = new Map(
      source.items.map((item) => [item.productoId._id, item.precioCentavos]),
    );
    const productsWithoutPrice = selectedProducts.filter(
      (product) => (pricesByProduct.get(product._id) ?? 0) <= 0,
    );
    if (productsWithoutPrice.length) {
      this.derivedPdfError.set(
        `No se puede generar el PDF. Falta asignar precio a: ${productsWithoutPrice.map((product) => product.nombre).join(', ')}.`,
      );
      return;
    }

    const percentage = Math.abs(Number(this.derivedPercentage));
    if (!Number.isFinite(percentage) || percentage > 1000) {
      this.derivedPdfError.set('Ingresá un porcentaje válido.');
      return;
    }
    const factor = 1 + (this.derivedDirection === 'ADD' ? percentage : -percentage) / 100;
    if (factor < 0) {
      this.derivedPdfError.set('El descuento no puede superar el 100%.');
      return;
    }

    const rows = selectedProducts
      .map((product) => {
        const adjustedBasePrice = Math.round(pricesByProduct.get(product._id)! * factor);
        return `<tr><td>${this.escape(product.nombre)}</td><td>${this.escape(this.supplierNames(product))}</td><td>${this.escape(product.tipo)}</td><td>${this.escape(this.money(this.finalPrice(product, adjustedBasePrice)))}</td></tr>`;
      })
      .join('');
    const title = this.derivedName.trim() || 'Lista personalizada de productos';
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) {
      this.derivedPdfError.set('El navegador bloqueó la ventana para generar el PDF.');
      return;
    }
    this.derivedPdfError.set(null);
    popup.document.write(`<!doctype html><html><head><title>${this.escape(this.pdfDocumentTitle(title))}</title><style>body{font-family:Arial;padding:32px;color:#2d190e}h1{font-family:Georgia}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #d8c2b2;text-align:left}th{background:#f2e7dd}</style></head><body><h1>${this.escape(title)}</h1><p>${new Date().toLocaleDateString('es-AR')} · Basada en ${this.escape(source.nombre)}</p><table><thead><tr><th>Producto</th><th>Proveedor</th><th>Rubro</th><th>Precio final</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    popup.document.close();
  }
  private escape(value:unknown){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]!));}
  private pdfDocumentTitle(name:string){
    const safeName=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'Lista-de-precios';
    const date=new Intl.DateTimeFormat('es-AR',{timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date()).replaceAll('/','-');
    return `${safeName}-${date}`;
  }
  reload() {
    this.loading.set(true);
    this.prices.findAll().subscribe({
      next: (l) => {
        this.lists.set(l);
        this.loading.set(false);
        if (!this.selected() && l.find((x) => x.activo)) this.open(l.find((x) => x.activo)!);
      },
      error: () => {
        this.error.set('No se pudieron cargar las listas');
        this.loading.set(false);
      },
    });
  }
  open(list: PriceList) {
    this.historyProductId.set(null);
    this.historyData.set(null);
    this.draftPrices.set({});
    this.prices.findOne(list._id).subscribe({
      next: (d) => this.selected.set(d),
      error: () => this.error.set('No se pudo abrir la lista'),
    });
  }
  create() {
    this.createAttempted.set(true);
    const nombre = this.newName.trim();
    if (nombre.length < 2 || nombre.length > 100 || this.newDescription.length > 300) {
      this.error.set('Revisá los campos marcados de la nueva lista');
      return;
    }
    this.prices.create({ nombre, descripcion: this.newDescription.trim() || undefined }).subscribe({
      next: (l) => {
        this.newName = '';
        this.newDescription = '';
        this.createAttempted.set(false);
        this.success.set('Lista creada');
        this.reload();
        this.open({ ...l });
      },
      error: (e) => this.error.set(e.error?.message ?? 'No se pudo crear la lista'),
    });
  }
  currentPrice(productId: string) {
    return (
      (this.selected()?.items ?? []).find((i) => i.productoId._id === productId)?.precioCentavos ??
      null
    );
  }
  draftPrice(product: Product) {
    return (
      this.draftPrices()[product._id] ??
      (this.finalPrice(product, this.currentPrice(product._id)) ?? 0) / 100
    );
  }
  updateDraftPrice(productId: string, value: number) {
    this.draftPrices.update((current) => ({ ...current, [productId]: value }));
  }
  requestPriceSave(product: Product) {
    const amount = this.draftPrice(product);
    if (!Number.isFinite(amount) || amount < 0) {
      this.error.set('Ingresá un precio válido');
      return;
    }
    this.error.set(null);
    this.pendingPrice.set({ product, amount });
  }
  confirmPriceSave() {
    const list = this.selected(),
      pending = this.pendingPrice();
    if (!list || !pending || this.savingPrice()) return;
    this.savingPrice.set(true);
    const finalCents = Math.round(pending.amount * 100);
    const baseCents = this.basePrice(pending.product, finalCents);
    this.prices.setPrice(list._id, pending.product._id, baseCents).subscribe({
      next: () => {
        this.success.set(`Precio de ${pending.product.nombre} actualizado`);
        this.pendingPrice.set(null);
        this.savingPrice.set(false);
        this.open(list);
      },
      error: (e) => {
        this.error.set(e.error?.message ?? 'No se pudo guardar el precio');
        this.savingPrice.set(false);
        this.pendingPrice.set(null);
      },
    });
  }
  money(cents: number | null) {
    return cents === null
      ? 'Sin precio'
      : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(cents / 100);
  }
  finalPrice(product: Product, netCents: number | null): number | null {
    return netCents === null
      ? null
      : Math.round(netCents * (1 + Number(product.alicuotaIva ?? 21) / 100));
  }
  basePrice(product: Product, finalCents: number): number {
    return Math.round(finalCents / (1 + Number(product.alicuotaIva ?? 21) / 100));
  }
  toggleHistory(product: Product) {
    if (this.historyProductId() === product._id) {
      this.historyProductId.set(null);
      this.historyData.set(null);
      return;
    }
    const list = this.selected();
    if (!list) return;
    this.historyProductId.set(product._id);
    this.historyData.set(null);
    this.prices
      .history(list._id, product._id, this.historyFrom || undefined, this.historyTo || undefined)
      .subscribe({
        next: (data) => {
          if (this.historyProductId() === product._id && this.selected()?._id === list._id)
            this.historyData.set(data);
        },
        error: () => this.error.set('No se pudo cargar el historial de costos y precios'),
      });
  }
  reloadHistory() {
    const product = this.products().find((p) => p._id === this.historyProductId());
    if (product) {
      this.historyProductId.set(null);
      this.toggleHistory(product);
    }
  }
  costLayers(productId: string) {
    return this.historyProductId() === productId ? (this.historyData()?.lots ?? []) : [];
  }
}
