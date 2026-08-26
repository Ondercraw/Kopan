import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { CreateEmployeePayload, Employee, UpdateEmployeePayload } from '../models/employee.model';

@Injectable({
  providedIn: 'root',
})
export class EmployeesService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${environment.apiUrl}/employees`;

  findAll() {
    return this.http.get<Employee[]>(this.baseUrl, {
      withCredentials: true,
    });
  }

  create(payload: CreateEmployeePayload) {
    return this.http.post<Employee>(this.baseUrl, payload, {
      withCredentials: true,
    });
  }

  actualizar(id: string, payload: UpdateEmployeePayload) {
    return this.http.patch<Employee>(`${this.baseUrl}/${id}`, payload, {
      withCredentials: true,
    });
  }

  activar(id: string) {
    return this.http.patch<Employee>(
      `${this.baseUrl}/${id}/reactivar`,
      {},
      {
        withCredentials: true,
      },
    );
  }

  desactivar(id: string) {
    return this.http.patch<Employee>(
      `${this.baseUrl}/${id}/desactivar`,
      {},
      {
        withCredentials: true,
      },
    );
  }
}
