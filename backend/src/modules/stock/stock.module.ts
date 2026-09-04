import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { Counter, CounterSchema } from './schemas/counter.schema';
import { Product, ProductSchema } from './schemas/product.schema';
import {
  StockMovement,
  StockMovementSchema,
} from './schemas/stock-movement.schema';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [
    AuditModule,
    SuppliersModule,
    FinanceModule,
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Counter.name, schema: CounterSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
    ]),
  ],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
