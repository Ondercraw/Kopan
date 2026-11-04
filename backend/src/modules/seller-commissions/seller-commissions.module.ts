import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import { Product, ProductSchema } from '../stock/schemas/product.schema';
import { Sale, SaleSchema } from '../sales/schemas/sale.schema';
import { FinancialMovement, FinancialMovementSchema } from '../finance/schemas/financial-movement.schema';
import { SellerCommissionsController } from './seller-commissions.controller';
import { SellerCommissionsService } from './seller-commissions.service';

@Module({ imports: [MongooseModule.forFeature([
  { name: Employee.name, schema: EmployeeSchema }, { name: Product.name, schema: ProductSchema },
  { name: Sale.name, schema: SaleSchema }, { name: FinancialMovement.name, schema: FinancialMovementSchema },
])], controllers: [SellerCommissionsController], providers: [SellerCommissionsService] })
export class SellerCommissionsModule {}
