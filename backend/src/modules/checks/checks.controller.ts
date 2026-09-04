import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MongoIdPipe } from '../../common/pipes/mongo-id.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ChecksService } from './checks.service';
import { SaveCheckDto } from './dto/save-check.dto';
import { CollectCheckDto } from './dto/collect-check.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.JEFE)
@Controller('checks')
export class ChecksController {
  constructor(private readonly service: ChecksService) {}
  @Get() findAll() { return this.service.findAll(); }
  @Post() create(@Body() dto: SaveCheckDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, { id: user.sub, name: user.nombre });
  }
  @Patch(':id/collect') collect(
    @Param('id', MongoIdPipe) id: string,
    @Body() dto: CollectCheckDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.collect(id, dto.destinoCobro, { id: user.sub, name: user.nombre });
  }
  @Patch(':id/allocate') allocate(
    @Param('id', MongoIdPipe) id: string,
    @Body() dto: CollectCheckDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.allocateCollected(id, dto.destinoCobro, { id: user.sub, name: user.nombre });
  }
}
