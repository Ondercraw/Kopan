import {
  Body,
  Controller,
  Get,
  Param,
  Query,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MongoIdPipe } from '../../common/pipes/mongo-id.pipe';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SavePriceListDto } from './dto/save-price-list.dto';
import { SetPriceDto } from './dto/set-price.dto';
import { PricesService } from './prices.service';

const PRICE_VIEWERS = [UserRole.JEFE, UserRole.VENDEDOR];

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...PRICE_VIEWERS)
@Controller('price-lists')
export class PricesController {
  constructor(private readonly service: PricesService) {}
  @Get() findAll() {
    return this.service.findAll();
  }
  @Get(':id') findOne(@Param('id', MongoIdPipe) id: string) {
    return this.service.findOne(id);
  }
  @Get(':listId/products/:productId/history')
  history(
    @Param('listId', MongoIdPipe) listId: string,
    @Param('productId', MongoIdPipe) productId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.history(listId, productId, { from, to });
  }
  @Post() @Roles(UserRole.JEFE) create(@Body() dto: SavePriceListDto) {
    return this.service.create(dto);
  }
  @Patch(':id') @Roles(UserRole.JEFE) update(
    @Param('id', MongoIdPipe) id: string,
    @Body() dto: SavePriceListDto,
  ) {
    return this.service.update(id, dto);
  }
  @Patch(':id/active') @Roles(UserRole.JEFE) setActive(
    @Param('id', MongoIdPipe) id: string,
    @Body('activo') activo: boolean,
  ) {
    return this.service.setActive(id, activo);
  }
  @Put(':listId/products/:productId')
  @Roles(UserRole.JEFE)
  setPrice(
    @Param('listId', MongoIdPipe) listId: string,
    @Param('productId', MongoIdPipe) productId: string,
    @Body() dto: SetPriceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.setProductPrice(listId, productId, dto.precioCentavos, {
      id: user.sub,
      name: user.nombre,
    });
  }
}
