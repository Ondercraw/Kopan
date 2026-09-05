import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MongoIdPipe } from '../../common/pipes/mongo-id.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CancelPurchaseDto } from './dto/cancel-purchase.dto';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { PayPurchaseDto } from './dto/pay-purchase.dto';
import { PurchasesService } from './purchases.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.JEFE)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly service: PurchasesService) {}
  @Get() findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.service.findAll({ from, to, supplierId });
  }
  @Get('inventory') inventory() {
    return this.service.inventory();
  }
  @Get('supplier-accounts') supplierAccounts() {
    return this.service.supplierAccounts();
  }
  @Post() create(
    @Body() dto: CreatePurchaseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(dto, { id: user.sub, name: user.nombre });
  }
  @Patch('supplier/:id/pay-all') paySupplierAccount(
    @Param('id', MongoIdPipe) id: string,
    @Body() dto: PayPurchaseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.paySupplierAccount(id, dto.paymentMethod, {
      id: user.sub,
      name: user.nombre,
    });
  }
  @Patch(':id/pay') pay(
    @Param('id', MongoIdPipe) id: string,
    @Body() dto: PayPurchaseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.pay(id, dto.paymentMethod, {
      id: user.sub,
      name: user.nombre,
    });
  }
  @Patch(':id/cancel') cancel(
    @Param('id', MongoIdPipe) id: string,
    @Body() dto: CancelPurchaseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.cancel(id, dto.reason, {
      id: user.sub,
      name: user.nombre,
    });
  }
}
