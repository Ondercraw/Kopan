import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Counter, CounterSchema } from '../stock/schemas/counter.schema';
import { Product, ProductSchema } from '../stock/schemas/product.schema';
import {
  StockMovement,
  StockMovementSchema,
} from '../stock/schemas/stock-movement.schema';
import { Supplier, SupplierSchema } from '../suppliers/schemas/supplier.schema';
import {
  FinancialMovement,
  FinancialMovementSchema,
} from '../finance/schemas/financial-movement.schema';
import {
  InventoryLot,
  InventoryLotSchema,
} from './schemas/inventory-lot.schema';
import { Purchase, PurchaseSchema } from './schemas/purchase.schema';
import { InventoryLotsService } from './inventory-lots.service';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Purchase.name, schema: PurchaseSchema },
      { name: InventoryLot.name, schema: InventoryLotSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: Counter.name, schema: CounterSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: FinancialMovement.name, schema: FinancialMovementSchema },
    ]),
  ],
  controllers: [PurchasesController],
  providers: [PurchasesService, InventoryLotsService],
  exports: [PurchasesService, InventoryLotsService, MongooseModule],
})
export class PurchasesModule {}
