import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MongoIdPipe } from '../../common/pipes/mongo-id.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { CancelSaleDto } from './dto/cancel-sale.dto';
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
  @Get(':id') @Roles(UserRole.JEFE) findOne(@Param('id', MongoIdPipe) id: string) {
    return this.service.findOne(id);
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
  @Patch(':id') @Roles(UserRole.JEFE) update(
    @Param('id', MongoIdPipe) id: string,
    @Body() dto: UpdateSaleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, {
      id: user.sub,
      name: user.nombre,
      roles: user.roles,
    });
  }
  @Patch(':id/cancel') @Roles(UserRole.JEFE) cancel(
    @Param('id', MongoIdPipe) id: string,
    @Body() dto: CancelSaleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.cancel(id, dto.motivo ?? '', {
      id: user.sub, name: user.nombre, roles: user.roles,
    });
  }
}
