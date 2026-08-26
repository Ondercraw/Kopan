import { Product } from '../../stock/models/product.model';
export interface PriceList { _id:string; codigo:number; nombre:string; descripcion:string; activo:boolean; createdAt:string; updatedAt:string; }
export interface PriceListItem { _id:string; listaId:string; productoId:Product; precioCentavos:number; actorName:string; updatedAt:string; }
export interface PriceListDetail extends PriceList { items:PriceListItem[]; }
