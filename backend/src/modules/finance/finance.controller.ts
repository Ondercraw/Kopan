import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MongoIdPipe } from '../../common/pipes/mongo-id.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CancelReplenishmentDto } from './dto/cancel-replenishment.dto';
import { PayExpenseDto } from './dto/pay-expense.dto';
import { FinanceService } from './finance.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.JEFE)
@Controller('finance/movements')
export class FinanceController {
  constructor(private readonly service: FinanceService) {}
  @Get() findAll(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.findAll({ from, to });
  }
  @Post('expenses') createExpense(@Body() dto: CreateExpenseDto, @CurrentUser() user: JwtPayload) {
    return this.service.createExpense(dto, { id: user.sub, name: user.nombre });
  }
  @Patch(':id/pay') payExpense(
    @Param('id', MongoIdPipe) id: string,
    @Body() dto: PayExpenseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.payExpense(id, dto.medioPago, { id: user.sub, name: user.nombre });
  }
  @Patch(':id/cancel-replenishment') cancelReplenishment(
    @Param('id', MongoIdPipe) id: string,
    @Body() dto: CancelReplenishmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.cancelReplenishment(id, dto.motivo, {
      id: user.sub,
      name: user.nombre,
    });
  }
}
