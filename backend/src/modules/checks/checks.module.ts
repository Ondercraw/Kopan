import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from '../clients/schemas/client.schema';
import { FinanceModule } from '../finance/finance.module';
import { Sale, SaleSchema } from '../sales/schemas/sale.schema';
import { Counter, CounterSchema } from '../stock/schemas/counter.schema';
import { ChecksController } from './checks.controller';
import { ChecksService } from './checks.service';
import { BankCheck, BankCheckSchema } from './schemas/bank-check.schema';

@Module({
  imports: [FinanceModule, MongooseModule.forFeature([
    { name: BankCheck.name, schema: BankCheckSchema },
    { name: Client.name, schema: ClientSchema },
    { name: Sale.name, schema: SaleSchema },
    { name: Counter.name, schema: CounterSchema },
  ])],
  controllers: [ChecksController],
  providers: [ChecksService],
  exports: [ChecksService],
})
export class ChecksModule {}
