import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ClientsService } from '../../../clients/services/clients.service';
import { Client } from '../../../clients/models/client.model';
import { Product } from '../../../stock/models/product.model';
import { StockService } from '../../../stock/services/stock.service';

interface CountItem { label:string; count:number; }
@Component({selector:'app-operational-reports',standalone:true,templateUrl:'./operational-reports.html',styleUrl:'./operational-reports.scss',changeDetection:ChangeDetectionStrategy.OnPush})
export class OperationalReports implements OnInit{
  private readonly stockService=inject(StockService);private readonly clientsService=inject(ClientsService);
  readonly products=signal<Product[]>([]);readonly clients=signal<Client[]>([]);readonly loading=signal(true);readonly error=signal<string|null>(null);
  readonly noStock=computed(()=>this.products().filter(p=>p.cantidadStock===0));
  readonly lowStock=computed(()=>this.products().filter(p=>p.cantidadStock>0&&p.stockMinimo>0&&p.cantidadStock<=p.stockMinimo));
  readonly bySupplier=computed(()=>this.group(this.products().map(p=>p.proveedorId?.nombre||'Sin proveedor')));
  readonly byType=computed(()=>this.group(this.products().map(p=>p.tipo||'Sin tipo')));
  readonly byLocation=computed(()=>this.group(this.clients().filter(c=>c.activo).map(c=>c.localidad||'Sin localidad')));
  readonly byGroup=computed(()=>this.group(this.clients().filter(c=>c.activo).map(c=>c.grupo||'Sin grupo')));
  readonly bySeller=computed(()=>this.group(this.clients().filter(c=>c.activo).map(c=>c.vendedorId?.nombre||'Sin vendedor')));
  readonly maxCount=(items:CountItem[])=>Math.max(1,...items.map(item=>item.count));
  ngOnInit():void{let pending=2;const done=()=>{pending--;if(pending===0)this.loading.set(false);};this.stockService.findAll().subscribe({next:v=>{this.products.set(v);done();},error:()=>{this.error.set('No se pudo cargar la información de stock');done();}});this.clientsService.findAll().subscribe({next:v=>{this.clients.set(v);done();},error:()=>{this.error.set('No se pudo cargar la información de clientes');done();}});}
  private group(values:string[]):CountItem[]{const counts=new Map<string,number>();for(const value of values)counts.set(value,(counts.get(value)??0)+1);return[...counts].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'es'));}
}
