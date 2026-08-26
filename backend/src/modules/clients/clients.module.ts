import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import { Counter, CounterSchema } from '../stock/schemas/counter.schema';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { ClientCatalog, ClientCatalogSchema } from './schemas/client-catalog.schema';
import { Client, ClientSchema } from './schemas/client.schema';
import { PriceList, PriceListSchema } from '../prices/schemas/price-list.schema';

@Module({
  imports: [AuditModule, MongooseModule.forFeature([
    { name: Client.name, schema: ClientSchema },
    { name: ClientCatalog.name, schema: ClientCatalogSchema },
    { name: Employee.name, schema: EmployeeSchema },
    { name: Counter.name, schema: CounterSchema },
    { name: PriceList.name, schema: PriceListSchema },
  ])],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
