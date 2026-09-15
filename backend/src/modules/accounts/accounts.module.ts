import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from '../clients/schemas/client.schema';
import { FinancialMovement, FinancialMovementSchema } from '../finance/schemas/financial-movement.schema';
import { PurchasesModule } from '../purchases/purchases.module';
import { Purchase, PurchaseSchema } from '../purchases/schemas/purchase.schema';
import { Sale, SaleSchema } from '../sales/schemas/sale.schema';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AccountPayment, AccountPaymentSchema } from './schemas/account-payment.schema';

@Module({
  imports: [PurchasesModule, MongooseModule.forFeature([
    { name: Sale.name, schema: SaleSchema }, { name: Purchase.name, schema: PurchaseSchema },
    { name: Client.name, schema: ClientSchema }, { name: FinancialMovement.name, schema: FinancialMovementSchema },
    { name: AccountPayment.name, schema: AccountPaymentSchema },
  ])],
  controllers: [AccountsController], providers: [AccountsService],
})
export class AccountsModule {}
