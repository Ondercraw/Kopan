import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MongoIdPipe } from '../../common/pipes/mongo-id.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AccountsService } from './accounts.service';
import { PayAccountDto } from './dto/pay-account.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.JEFE)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}
  @Get() statement() { return this.service.statement(); }
  @Patch('clients/sales/:id/pay')
  payClient(@Param('id', MongoIdPipe) id: string, @Body() dto: PayAccountDto, @CurrentUser() user: JwtPayload) {
    return this.service.payClientSale(id, dto.amountCents, dto.paymentMethod, { id: user.sub, name: user.nombre });
  }
  @Patch('suppliers/purchases/:id/pay')
  paySupplier(@Param('id', MongoIdPipe) id: string, @Body() dto: PayAccountDto, @CurrentUser() user: JwtPayload) {
    return this.service.paySupplierPurchase(id, dto.amountCents, dto.paymentMethod, { id: user.sub, name: user.nombre });
  }
}
