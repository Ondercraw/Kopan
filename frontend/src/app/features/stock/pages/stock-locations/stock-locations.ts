import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';

type Place = 'PENDING' | 'COUNTER' | 'DEPOT' | 'WAREHOUSE';
interface Row { id: string; codigo: number; nombre: string; rubro: string; total: number;
  pendiente: number; mostrador: number; deposito: number; galpon: number; }

@Component({ selector: 'app-stock-locations', standalone: true, imports: [FormsModule],
  templateUrl: './stock-locations.html', styleUrl: './stock-locations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush })
export class StockLocationsPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiUrl}/stock/products`;
  readonly rows = signal<Row[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly selected = signal<Row | null>(null);
  search = '';
  source: Place = 'PENDING';
  destination: Place = 'COUNTER';
  quantity: number | null = null;
  readonly places: { value: Place; label: string }[] = [
    { value: 'PENDING', label: 'Pendiente de asignación' },
    { value: 'COUNTER', label: 'Mostrador' },
    { value: 'DEPOT', label: 'Depósito' },
    { value: 'WAREHOUSE', label: 'Galpón' },
  ];
  ngOnInit(): void { this.load(); }
  get filtered(): Row[] {
    const term = this.search.trim().toLocaleLowerCase('es-AR');
    return term ? this.rows().filter(row => `${row.codigo} ${row.nombre} ${row.rubro}`.toLocaleLowerCase('es-AR').includes(term)) : this.rows();
  }
  load(): void {
    this.loading.set(true); this.error.set('');
    this.http.get<Row[]>(`${this.endpoint}/locations`, { withCredentials: true }).subscribe({
      next: rows => { this.rows.set(rows); this.loading.set(false); },
      error: () => { this.error.set('No se pudieron cargar las ubicaciones.'); this.loading.set(false); },
    });
  }
  open(row: Row): void { this.selected.set(row); this.source = 'PENDING'; this.destination = 'COUNTER'; this.quantity = null; this.error.set(''); this.success.set(''); }
  close(): void { if (!this.saving()) this.selected.set(null); }
  available(row: Row, place: Place): number { return place === 'PENDING' ? row.pendiente : place === 'COUNTER' ? row.mostrador : place === 'DEPOT' ? row.deposito : row.galpon; }
  transfer(): void {
    const row = this.selected();
    if (!row || this.saving()) return;
    if (this.source === this.destination) { this.error.set('Elegí un origen y un destino diferentes.'); return; }
    if (!Number.isSafeInteger(this.quantity) || !this.quantity || this.quantity <= 0 || this.quantity > this.available(row, this.source)) {
      this.error.set(`Ingresá una cantidad entre 1 y ${this.available(row, this.source)}.`); return;
    }
    this.saving.set(true); this.error.set('');
    this.http.post<Row>(`${this.endpoint}/${row.id}/locations/transfer`,
      { source: this.source, destination: this.destination, quantity: this.quantity }, { withCredentials: true }).subscribe({
      next: updated => { this.rows.update(rows => rows.map(item => item.id === updated.id ? updated : item));
        this.saving.set(false); this.selected.set(null); this.success.set(`Se movieron ${this.quantity} unidades de ${row.nombre}.`); },
      error: err => { this.error.set(err.error?.message ?? 'No se pudo mover la mercadería.'); this.saving.set(false); },
    });
  }
}
