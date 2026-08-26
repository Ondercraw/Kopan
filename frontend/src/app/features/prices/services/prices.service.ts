import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { PriceList, PriceListDetail, PriceListItem } from '../models/price-list.model';
@Injectable({providedIn:'root'})
export class PricesService {
  private readonly http=inject(HttpClient);private readonly base=`${environment.apiUrl}/price-lists`;private readonly options={withCredentials:true};
  findAll(){return this.http.get<PriceList[]>(this.base,this.options);}
  findOne(id:string){return this.http.get<PriceListDetail>(`${this.base}/${id}`,this.options);}
  create(payload:{nombre:string;descripcion?:string}){return this.http.post<PriceList>(this.base,payload,this.options);}
  setPrice(listId:string,productId:string,precioCentavos:number){return this.http.put<PriceListItem>(`${this.base}/${listId}/products/${productId}`,{precioCentavos},this.options);}
  setActive(id:string,activo:boolean){return this.http.patch<PriceList>(`${this.base}/${id}/active`,{activo},this.options);}
}
