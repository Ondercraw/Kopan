import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthUser } from '../models/user-role.enum';

interface LoginPayload {
  email: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  // Estado de sesión centralizado. null = no logueado, undefined = todavía no se chequeó
  private readonly currentUserSignal = signal<AuthUser | null | undefined>(undefined);

  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.currentUserSignal());
  readonly isChecking = computed(() => this.currentUserSignal() === undefined);

  login(payload: LoginPayload) {
    return this.http
      .post<AuthUser>(`${this.baseUrl}/login`, payload, {
        withCredentials: true,
      })
      .pipe(tap((user) => this.currentUserSignal.set(user)));
  }

  logout() {
    return this.http.post(`${this.baseUrl}/logout`, {}, { withCredentials: true }).pipe(
      catchError(() => of(null)),
      tap(() => {
        this.invalidarSesion();
        void this.router.navigateByUrl('/auth/login');
      }),
    );
  }

  invalidarSesion(): void {
    this.currentUserSignal.set(null);
  }

  /**
   * Consulta quién está logueado según la cookie httpOnly.
   * Se usa al arrancar la app y en el authGuard para no perder la sesión al refrescar.
   */
  cargarSesion() {
    return this.http.get<AuthUser>(`${this.baseUrl}/me`, { withCredentials: true }).pipe(
      tap((user) => this.currentUserSignal.set(user)),
      catchError(() => {
        this.currentUserSignal.set(null);
        return of(null);
      }),
    );
  }
}
