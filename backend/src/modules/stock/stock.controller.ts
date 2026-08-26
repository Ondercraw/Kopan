import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MongoIdPipe } from '../../common/pipes/mongo-id.pipe';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { DeactivateProductsDto } from './dto/deactivate-products.dto';
import { ReactivateProductsDto } from './dto/reactivate-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { StockService } from './stock.service';

const STOCK_MANAGERS = [UserRole.JEFE, UserRole.EMPLEADO_STOCK];
const STOCK_VIEWERS = [...STOCK_MANAGERS, UserRole.VENDEDOR];

@ApiTags('stock')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...STOCK_VIEWERS)
@Controller('stock/products')
export class StockController {
  constructor(
    private readonly stockService: StockService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  findAll() {
    return this.stockService.findAll();
  }

  @Get('inactive')
  @Roles(...STOCK_MANAGERS)
  findInactive() {
    return this.stockService.findInactive();
  }

  @Get(':id/movements')
  @Roles(...STOCK_MANAGERS)
  findMovements(@Param('id', MongoIdPipe) id: string) {
    return this.stockService.findMovements(id);
  }

  @Post()
  @Roles(...STOCK_MANAGERS)
  async create(@Body() dto: CreateProductDto, @CurrentUser() user: JwtPayload) {
    const product = await this.stockService.create(dto, {
      id: user.sub,
      name: user.nombre,
    });
    await this.auditService.record({
      actorId: user.sub,
      action: 'stock.product_created',
      entity: 'product',
      entityId: product._id.toString(),
      metadata: {
        codigo: product.codigo,
        initialStock: product.cantidadStock,
      },
    });
    return product;
  }

  @Patch('deactivate')
  @Roles(...STOCK_MANAGERS)
  async deactivateMany(
    @Body() dto: DeactivateProductsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const products = await this.stockService.deactivateMany(dto.productIds, {
      id: user.sub,
      name: user.nombre,
    });
    await Promise.all(
      products.map((product) =>
        this.auditService.record({
          actorId: user.sub,
          action: 'stock.product_deactivated',
          entity: 'product',
          entityId: product._id.toString(),
          metadata: { codigo: product.codigo, nombre: product.nombre },
        }),
      ),
    );
    return { deactivated: products.length };
  }

  @Patch('reactivate')
  @Roles(...STOCK_MANAGERS)
  async reactivateMany(
    @Body() dto: ReactivateProductsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const products = await this.stockService.reactivateMany(dto.productIds, {
      id: user.sub,
      name: user.nombre,
    });
    await Promise.all(
      products.map((product) =>
        this.auditService.record({
          actorId: user.sub,
          action: 'stock.product_reactivated',
          entity: 'product',
          entityId: product._id.toString(),
          metadata: { codigo: product.codigo, nombre: product.nombre },
        }),
      ),
    );
    return { reactivated: products.length };
  }

  @Patch(':id/quantity')
  @Roles(...STOCK_MANAGERS)
  async adjustStock(
    @Param('id', MongoIdPipe) id: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.stockService.adjustStock(id, dto, {
      id: user.sub,
      name: user.nombre,
    });
    await this.auditService.record({
      actorId: user.sub,
      action: 'stock.quantity_adjusted',
      entity: 'product',
      entityId: id,
      metadata: {
        delta: dto.delta,
        previousStock: result.previousStock,
        currentStock: result.product.cantidadStock,
      },
    });
    return result.product;
  }

  @Patch(':id')
  @Roles(...STOCK_MANAGERS)
  async update(
    @Param('id', MongoIdPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const product = await this.stockService.update(id, dto, {
      id: user.sub,
      name: user.nombre,
    });
    await this.auditService.record({
      actorId: user.sub,
      action: 'stock.product_updated',
      entity: 'product',
      entityId: id,
      metadata: {
        codigo: product.codigo,
        nombre: product.nombre,
        stockAdjustment: dto.ajusteStock ?? 0,
      },
    });
    return product;
  }
}
