import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MongoIdPipe } from '../../common/pipes/mongo-id.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AccountsService } from './accounts.service';
import { PayAccountDto } from './dto/pay-account.dto';
import { AddOpeningDebtDto } from './dto/add-opening-debt.dto';
import { CancelOpeningDebtDto } from './dto/cancel-opening-debt.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.JEFE)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}
  @Get() statement() { return this.service.statement(); }
  @Post(':side/:entityId/opening-debts')
  addOpeningDebt(@Param('side') side: 'clients' | 'suppliers', @Param('entityId', MongoIdPipe) entityId: string,
    @Body() dto: AddOpeningDebtDto, @CurrentUser() user: JwtPayload) {
    return this.service.addOpeningDebt(side, entityId, dto.amountCents, dto.detail ?? '', { id: user.sub, name: user.nombre });
  }
  @Patch('opening-debts/:id/cancel')
  cancelOpeningDebt(@Param('id', MongoIdPipe) id: string, @Body() dto: CancelOpeningDebtDto, @CurrentUser() user: JwtPayload) {
    return this.service.cancelOpeningDebt(id, dto.reason ?? '', { id: user.sub, name: user.nombre });
  }
  @Patch('opening-debts/:id/pay')
  payOpeningDebt(@Param('id', MongoIdPipe) id: string, @Body() dto: PayAccountDto, @CurrentUser() user: JwtPayload) {
    return this.service.payOpeningDebt(id, dto.amountCents, dto.paymentMethod, { id: user.sub, name: user.nombre });
  }
  @Patch('clients/sales/:id/pay')
  payClient(@Param('id', MongoIdPipe) id: string, @Body() dto: PayAccountDto, @CurrentUser() user: JwtPayload) {
    return this.service.payClientSale(id, dto.amountCents, dto.paymentMethod, { id: user.sub, name: user.nombre });
  }
  @Patch('suppliers/purchases/:id/pay')
  paySupplier(@Param('id', MongoIdPipe) id: string, @Body() dto: PayAccountDto, @CurrentUser() user: JwtPayload) {
    return this.service.paySupplierPurchase(id, dto.amountCents, dto.paymentMethod, { id: user.sub, name: user.nombre });
  }
}
