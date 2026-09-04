import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from '../clients/schemas/client.schema';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import { PriceListItem, PriceListItemSchema } from '../prices/schemas/price-list-item.schema';
import { PriceList, PriceListSchema } from '../prices/schemas/price-list.schema';
import { Counter, CounterSchema } from '../stock/schemas/counter.schema';
import { Product, ProductSchema } from '../stock/schemas/product.schema';
import { StockMovement, StockMovementSchema } from '../stock/schemas/stock-movement.schema';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { Sale, SaleSchema } from './schemas/sale.schema';
import { ChecksModule } from '../checks/checks.module';
import { FinanceModule } from '../finance/finance.module';

@Module({ imports: [ChecksModule, FinanceModule, MongooseModule.forFeature([
  { name: Sale.name, schema: SaleSchema }, { name: Client.name, schema: ClientSchema }, { name: Employee.name, schema: EmployeeSchema },
  { name: PriceList.name, schema: PriceListSchema }, { name: PriceListItem.name, schema: PriceListItemSchema },
  { name: Product.name, schema: ProductSchema }, { name: StockMovement.name, schema: StockMovementSchema }, { name: Counter.name, schema: CounterSchema },
])], controllers: [SalesController], providers: [SalesService] })
export class SalesModule {}
