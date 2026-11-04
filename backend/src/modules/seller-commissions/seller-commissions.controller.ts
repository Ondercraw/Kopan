import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MongoIdPipe } from '../../common/pipes/mongo-id.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SaveCommissionRuleDto } from './dto/save-commission-rule.dto';
import { PayCommissionDto } from './dto/pay-commission.dto';
import { SellerCommissionsService } from './seller-commissions.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.JEFE)
@Controller('seller-commissions')
export class SellerCommissionsController {
  constructor(private readonly service: SellerCommissionsService) {}
  @Get(':sellerId') overview(@Param('sellerId', MongoIdPipe) sellerId: string) { return this.service.overview(sellerId); }
  @Post(':sellerId/rules') saveRule(@Param('sellerId', MongoIdPipe) sellerId: string, @Body() dto: SaveCommissionRuleDto) {
    return this.service.saveRule(sellerId, dto);
  }
  @Delete(':sellerId/rules/:ruleId') deleteRule(@Param('sellerId', MongoIdPipe) sellerId: string,
    @Param('ruleId', MongoIdPipe) ruleId: string) { return this.service.deleteRule(sellerId, ruleId); }
  @Post('sales/:saleId/pay') pay(@Param('saleId', MongoIdPipe) saleId: string, @Body() dto: PayCommissionDto,
    @CurrentUser() user: JwtPayload) { return this.service.pay(saleId, dto.paymentMethod, { id: user.sub, name: user.nombre }); }
}
