import { PurchasesModule } from '../purchases/purchases.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Sale, SaleSchema } from '../sales/schemas/sale.schema';
import { Supplier, SupplierSchema } from '../suppliers/schemas/supplier.schema';
import { BankCheck, BankCheckSchema } from '../checks/schemas/bank-check.schema';
import { Product, ProductSchema } from '../stock/schemas/product.schema';
import { StockMovement, StockMovementSchema } from '../stock/schemas/stock-movement.schema';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinancialMovement, FinancialMovementSchema } from './schemas/financial-movement.schema';

@Module({
  imports: [PurchasesModule, MongooseModule.forFeature([
    { name: FinancialMovement.name, schema: FinancialMovementSchema },
    { name: Sale.name, schema: SaleSchema },
    { name: Supplier.name, schema: SupplierSchema },
    { name: BankCheck.name, schema: BankCheckSchema },
    { name: Product.name, schema: ProductSchema },
    { name: StockMovement.name, schema: StockMovementSchema },
  ])],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService, MongooseModule],
})
export class FinanceModule {}
