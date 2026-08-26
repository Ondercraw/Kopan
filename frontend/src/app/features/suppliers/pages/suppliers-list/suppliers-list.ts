import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { SupplierFormModal } from '../../components/supplier-form-modal/supplier-form-modal';
import { ConfirmationModal } from '../../../../shared/components/confirmation-modal/confirmation-modal';
import { Supplier } from '../../models/supplier.model';
import { SuppliersService } from '../../services/suppliers.service';
import { CsvExportService } from '../../../../shared/services/csv-export.service';

type SupplierSort =
  | 'NAME_ASC' | 'NAME_DESC'
  | 'CODE_ASC' | 'CODE_DESC'
  | 'CUIT_ASC' | 'CUIT_DESC'
  | 'LOCATION_ASC' | 'LOCATION_DESC'
  | 'CREATED_ASC' | 'CREATED_DESC'
  | 'UPDATED_ASC' | 'UPDATED_DESC';

@Component({ selector:'app-suppliers-list', standalone:true, imports:[SupplierFormModal,ConfirmationModal], templateUrl:'./suppliers-list.html', styleUrls:['./suppliers-list.scss','./suppliers-list-adjustments.scss','./suppliers-list-actions.scss'], changeDetection:ChangeDetectionStrategy.OnPush })
export class SuppliersList implements OnInit {
  private readonly service=inject(SuppliersService);
  private readonly csv=inject(CsvExportService);
  readonly suppliers=signal<Supplier[]>([]); readonly loading=signal(true); readonly error=signal<string|null>(null);
  readonly search=signal(''); readonly status=signal<'active'|'inactive'|'all'>('active'); readonly sort=signal<SupplierSort>('NAME_ASC'); readonly editing=signal<Supplier|null>(null); readonly modalOpen=signal(false); readonly expanded=signal<string|null>(null);
  readonly pendingStatus=signal<Supplier|null>(null); readonly actionBusy=signal(false);
  readonly filtered=computed(()=>{const term=this.normalize(this.search());return this.suppliers().filter(s=>(this.status()==='all'||s.activo===(this.status()==='active'))&&(!term||this.normalize(`${s.nombre} ${s.cuit} ${s.localidad}`).includes(term))).sort((a,b)=>this.compareSuppliers(a,b));});
  ngOnInit():void{this.load();}
  load():void{this.loading.set(true);this.service.findAll().subscribe({next:v=>{this.suppliers.set(v);this.loading.set(false);},error:()=>{this.error.set('No se pudieron cargar los proveedores');this.loading.set(false);}});}
  edit(supplier:Supplier):void{this.editing.set(supplier);this.modalOpen.set(true);}
  close():void{this.editing.set(null);this.modalOpen.set(false);}
  saved():void{this.close();this.load();}
  toggleActive(supplier:Supplier):void{this.pendingStatus.set(supplier);}
  confirmToggleActive():void{const supplier=this.pendingStatus();if(!supplier)return;this.actionBusy.set(true);this.service.setActive(supplier._id,!supplier.activo).subscribe({next:()=>{this.pendingStatus.set(null);this.actionBusy.set(false);this.load();},error:r=>{this.pendingStatus.set(null);this.actionBusy.set(false);this.error.set(r.error?.message??'No se pudo modificar el proveedor');}});}
  exportCsv():void{this.csv.download('proveedores',this.filtered(),[
    {header:'ID',value:s=>s.codigo},{header:'Proveedor',value:s=>s.nombre},{header:'CUIT',value:s=>s.cuit},
    {header:'Contacto',value:s=>s.contacto},{header:'Teléfono',value:s=>s.telefono},{header:'Email',value:s=>s.email},
    {header:'Dirección',value:s=>s.direccion},{header:'Localidad',value:s=>s.localidad},{header:'Estado',value:s=>s.activo?'Activo':'Baja'},
    {header:'Observaciones',value:s=>s.observaciones},
  ]);}
  private compareSuppliers(a:Supplier,b:Supplier):number{
    const order=this.sort();const direction=order.endsWith('DESC')?-1:1;let comparison=0;
    if(order.startsWith('CODE'))comparison=a.codigo-b.codigo;
    else if(order.startsWith('CUIT')){comparison=this.compareOptionalText(a.cuit,b.cuit,direction);return comparison||a.codigo-b.codigo;}
    else if(order.startsWith('LOCATION')){comparison=this.compareOptionalText(a.localidad,b.localidad,direction);return comparison||a.codigo-b.codigo;}
    else if(order.startsWith('CREATED'))comparison=new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime();
    else if(order.startsWith('UPDATED'))comparison=new Date(a.updatedAt).getTime()-new Date(b.updatedAt).getTime();
    else comparison=a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base',numeric:true});
    return comparison*direction||a.codigo-b.codigo;
  }
  private compareOptionalText(a:string,b:string,direction:number):number{
    if(!a&&!b)return 0;if(!a)return 1;if(!b)return-1;
    return a.localeCompare(b,'es',{sensitivity:'base',numeric:true})*direction;
  }
  private normalize(value:string):string{return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
}
