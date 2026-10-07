import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MongoIdPipe } from '../../common/pipes/mongo-id.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateRemittanceDto } from './dto/create-remittance.dto';
import { RemittancesService } from './remittances.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('remittances')
export class RemittancesController {
  constructor(private readonly service: RemittancesService) {}
  @Get() @Roles(UserRole.JEFE)
  findAll(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.findAll({ from, to });
  }
  @Get(':id') @Roles(UserRole.JEFE)
  findOne(@Param('id', MongoIdPipe) id: string) {
    return this.service.findOne(id);
  }
  @Post() @Roles(UserRole.JEFE, UserRole.VENDEDOR)
  create(@Body() dto: CreateRemittanceDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, { id: user.sub, name: user.nombre });
  }
}
