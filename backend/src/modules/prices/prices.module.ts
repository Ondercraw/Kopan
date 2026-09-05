import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Counter, CounterSchema } from '../stock/schemas/counter.schema';
import { Product, ProductSchema } from '../stock/schemas/product.schema';
import { PricesController } from './prices.controller';
import { PricesService } from './prices.service';
import {
  PriceListItem,
  PriceListItemSchema,
} from './schemas/price-list-item.schema';
import { PriceList, PriceListSchema } from './schemas/price-list.schema';
import {
  PriceHistory,
  PriceHistorySchema,
} from './schemas/price-history.schema';
import {
  InventoryLot,
  InventoryLotSchema,
} from '../purchases/schemas/inventory-lot.schema';
import { Purchase, PurchaseSchema } from '../purchases/schemas/purchase.schema';
import {
  StockMovement,
  StockMovementSchema,
} from '../stock/schemas/stock-movement.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PriceList.name, schema: PriceListSchema },
      { name: PriceListItem.name, schema: PriceListItemSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Counter.name, schema: CounterSchema },
      { name: PriceHistory.name, schema: PriceHistorySchema },
      { name: InventoryLot.name, schema: InventoryLotSchema },
      { name: Purchase.name, schema: PurchaseSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
    ]),
  ],
  controllers: [PricesController],
  providers: [PricesService],
  exports: [PricesService],
})
export class PricesModule {}
