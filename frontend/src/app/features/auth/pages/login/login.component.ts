import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly cargando = signal(false);
  readonly errorMensaje = signal<string | null>(null);
  readonly cuentaDesactivada = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  onSubmit(): void {
    if (this.form.invalid || this.cargando()) {
      this.form.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    this.errorMensaje.set(null);
    this.cuentaDesactivada.set(false);

    this.authService.login(this.form.getRawValue()).subscribe({
      next: () => {
        this.router.navigateByUrl('/').then((navegoOk) => {
          if (!navegoOk) {
            // La navegación fue bloqueada (guard, error de ruta, etc.)
            this.cargando.set(false);
          }
        });
      },
      error: (error: HttpErrorResponse) => {
        if (error.error?.code === 'ACCOUNT_DISABLED') {
          this.cuentaDesactivada.set(true);
        } else if (error.status === 429) {
          this.errorMensaje.set(
            'Demasiados intentos. Esperá un minuto antes de volver a intentar.',
          );
        } else {
          this.errorMensaje.set('Email o contraseña incorrectos');
        }
        this.cargando.set(false);
      },
    });
  }

  cerrarAvisoCuenta(): void {
    this.cuentaDesactivada.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.cuentaDesactivada()) {
      this.cerrarAvisoCuenta();
    }
  }
}
