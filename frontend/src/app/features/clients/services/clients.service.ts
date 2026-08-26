import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { Client, ClientOptions, SaveClientPayload } from '../models/client.model';

@Injectable({providedIn:'root'})
export class ClientsService {
  private readonly http=inject(HttpClient); private readonly baseUrl=`${environment.apiUrl}/clients`;
  findAll(){return this.http.get<Client[]>(this.baseUrl,{withCredentials:true});}
  options(){return this.http.get<ClientOptions>(`${this.baseUrl}/options`,{withCredentials:true});}
  create(payload:SaveClientPayload){return this.http.post<Client>(this.baseUrl,payload,{withCredentials:true});}
  update(id:string,payload:SaveClientPayload){return this.http.patch<Client>(`${this.baseUrl}/${id}`,payload,{withCredentials:true});}
  setActive(id:string,active:boolean){return this.http.patch<Client>(`${this.baseUrl}/${id}/${active?'reactivate':'deactivate'}`,{},{withCredentials:true});}
}
