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
import { ClientsService } from './clients.service';
import { SaveClientDto } from './dto/save-client.dto';

const CLIENT_MANAGERS = [UserRole.JEFE, UserRole.VENDEDOR];

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...CLIENT_MANAGERS)
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly service: ClientsService,
    private readonly audit: AuditService,
  ) {}
  @Get() findAll() {
    return this.service.findAll();
  }
  @Get('options') options() {
    return this.service.options();
  }

  @Post()
  @Roles(...CLIENT_MANAGERS)
  async create(@Body() dto: SaveClientDto, @CurrentUser() user: JwtPayload) {
    const client = await this.service.create(dto, {
      id: user.sub,
      name: user.nombre,
    });
    await this.audit.record({
      actorId: user.sub,
      action: 'client.created',
      entity: 'client',
      entityId: String(client._id),
      metadata: { codigo: client.codigo, nombre: client.nombre },
    });
    return client;
  }

  @Patch(':id')
  @Roles(...CLIENT_MANAGERS)
  async update(
    @Param('id', MongoIdPipe) id: string,
    @Body() dto: SaveClientDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const client = await this.service.update(id, dto, {
      id: user.sub,
      name: user.nombre,
    });
    await this.audit.record({
      actorId: user.sub,
      action: 'client.updated',
      entity: 'client',
      entityId: id,
      metadata: { nombre: client.nombre },
    });
    return client;
  }

  @Patch(':id/deactivate')
  @Roles(...CLIENT_MANAGERS)
  async deactivate(
    @Param('id', MongoIdPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const client = await this.service.setActive(id, false, {
      id: user.sub,
      name: user.nombre,
    });
    await this.audit.record({
      actorId: user.sub,
      action: 'client.deactivated',
      entity: 'client',
      entityId: id,
    });
    return client;
  }

  @Patch(':id/reactivate')
  @Roles(...CLIENT_MANAGERS)
  async reactivate(
    @Param('id', MongoIdPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const client = await this.service.setActive(id, true, {
      id: user.sub,
      name: user.nombre,
    });
    await this.audit.record({
      actorId: user.sub,
      action: 'client.reactivated',
      entity: 'client',
      entityId: id,
    });
    return client;
  }
}
