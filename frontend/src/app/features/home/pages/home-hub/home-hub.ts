import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import {
  ETIQUETAS_ROL,
  normalizeUserRoles,
  UserRole,
} from '../../../../core/models/user-role.enum';

@Component({
  selector: 'app-home-hub',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home-hub.html',
  styleUrls: ['./home-hub.scss', './home-hub-adjustments.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeHub {
  private readonly auth = inject(AuthService);
  readonly user = this.auth.currentUser;
  readonly roleLabels = computed(() =>
    normalizeUserRoles(this.user()?.roles ?? [])
      .map((role) => ETIQUETAS_ROL[role])
      .join(' · '),
  );
  readonly roles = computed(() => normalizeUserRoles(this.user()?.roles ?? []));
  readonly isOwner = computed(() => this.roles().includes(UserRole.JEFE));
  readonly isStockEmployee = computed(
    () => !this.isOwner() && this.roles().includes(UserRole.EMPLEADO_STOCK),
  );
  readonly isSeller = computed(() => !this.isOwner() && this.roles().includes(UserRole.VENDEDOR));
}
