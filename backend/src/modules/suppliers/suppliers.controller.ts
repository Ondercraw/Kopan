import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MongoIdPipe } from '../../common/pipes/mongo-id.pipe';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SaveSupplierDto } from './dto/save-supplier.dto';
import { SuppliersService } from './suppliers.service';

const SUPPLIER_MANAGERS = [UserRole.JEFE, UserRole.EMPLEADO_STOCK];

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...SUPPLIER_MANAGERS)
@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly service: SuppliersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('active')
  findActive() {
    return this.service.findActive();
  }

  @Post()
  @Roles(...SUPPLIER_MANAGERS)
  async create(@Body() dto: SaveSupplierDto, @CurrentUser() user: JwtPayload) {
    const supplier = await this.service.create(dto);
    await this.audit.record({
      actorId: user.sub,
      action: 'supplier.created',
      entity: 'supplier',
      entityId: String(supplier._id),
      metadata: { nombre: supplier.nombre },
    });
    return supplier;
  }

  @Patch(':id')
  @Roles(...SUPPLIER_MANAGERS)
  async update(
    @Param('id', MongoIdPipe) id: string,
    @Body() dto: SaveSupplierDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const supplier = await this.service.update(id, dto);
    await this.audit.record({
      actorId: user.sub,
      action: 'supplier.updated',
      entity: 'supplier',
      entityId: id,
      metadata: { nombre: supplier.nombre },
    });
    return supplier;
  }

  @Patch(':id/deactivate')
  @Roles(...SUPPLIER_MANAGERS)
  async deactivate(
    @Param('id', MongoIdPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const supplier = await this.service.setActive(id, false);
    await this.audit.record({
      actorId: user.sub,
      action: 'supplier.deactivated',
      entity: 'supplier',
      entityId: id,
    });
    return supplier;
  }

  @Patch(':id/reactivate')
  @Roles(...SUPPLIER_MANAGERS)
  async reactivate(
    @Param('id', MongoIdPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const supplier = await this.service.setActive(id, true);
    await this.audit.record({
      actorId: user.sub,
      action: 'supplier.reactivated',
      entity: 'supplier',
      entityId: id,
    });
    return supplier;
  }
}
