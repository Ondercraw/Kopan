import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MongoIdPipe } from '../../common/pipes/mongo-id.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuditService } from '../audit/audit.service';

import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

import { EmployeesService } from './employees.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.JEFE)
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const empleado = await this.employeesService.create(dto);
    await this.auditService.record({
      actorId: user.sub,
      action: 'employee.created',
      entity: 'employee',
      entityId: String(empleado._id),
      metadata: { roles: empleado.roles },
    });
    return empleado;
  }

  @Get()
  findAll() {
    return this.employeesService.findAll();
  }

  @Patch(':id')
  async actualizar(
    @Param('id', MongoIdPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const empleado = await this.employeesService.actualizar(id, dto);
    await this.auditService.record({
      actorId: user.sub,
      action: 'employee.updated',
      entity: 'employee',
      entityId: id,
      metadata: { roles: empleado.roles },
    });
    return empleado;
  }

  @Patch(':id/desactivar')
  async desactivar(
    @Param('id', MongoIdPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const empleado = await this.employeesService.desactivar(id);
    await this.auditService.record({
      actorId: user.sub,
      action: 'employee.deactivated',
      entity: 'employee',
      entityId: id,
    });
    return empleado;
  }

  @Patch(':id/reactivar')
  async reactivar(
    @Param('id', MongoIdPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const empleado = await this.employeesService.reactivar(id);
    await this.auditService.record({
      actorId: user.sub,
      action: 'employee.reactivated',
      entity: 'employee',
      entityId: id,
    });
    return empleado;
  }
}
