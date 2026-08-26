import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SalesService } from './sales.service';

const SALE_CREATORS = [UserRole.JEFE, UserRole.VENDEDOR];
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly service: SalesService) {}
  @Get() @Roles(UserRole.JEFE) findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('medioPago') medioPago?: string,
  ) {
    return this.service.findAll({ from, to, medioPago });
  }
  @Get('transfers') @Roles(UserRole.JEFE) transfers() {
    return this.service.findTransfers();
  }
  @Post() @Roles(...SALE_CREATORS) create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(dto, {
      id: user.sub,
      name: user.nombre,
      roles: user.roles,
    });
  }
}
