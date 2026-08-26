import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Counter, CounterSchema } from '../stock/schemas/counter.schema';
import { Product, ProductSchema } from '../stock/schemas/product.schema';
import { PricesController } from './prices.controller';
import { PricesService } from './prices.service';
import { PriceListItem, PriceListItemSchema } from './schemas/price-list-item.schema';
import { PriceList, PriceListSchema } from './schemas/price-list.schema';

@Module({
  imports: [MongooseModule.forFeature([
    { name: PriceList.name, schema: PriceListSchema }, { name: PriceListItem.name, schema: PriceListItemSchema },
    { name: Product.name, schema: ProductSchema }, { name: Counter.name, schema: CounterSchema },
  ])],
  controllers: [PricesController], providers: [PricesService], exports: [PricesService],
})
export class PricesModule {}
