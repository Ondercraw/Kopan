import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from '../clients/schemas/client.schema';
import { Product, ProductSchema } from '../stock/schemas/product.schema';
import { Counter, CounterSchema } from '../stock/schemas/counter.schema';
import { Remittance, RemittanceSchema } from './schemas/remittance.schema';
import { RemittancesController } from './remittances.controller';
import { RemittancesService } from './remittances.service';

@Module({
  imports: [MongooseModule.forFeature([
    { name: Remittance.name, schema: RemittanceSchema },
    { name: Client.name, schema: ClientSchema },
    { name: Product.name, schema: ProductSchema },
    { name: Counter.name, schema: CounterSchema },
  ])],
  controllers: [RemittancesController],
  providers: [RemittancesService],
})
export class RemittancesModule {}
