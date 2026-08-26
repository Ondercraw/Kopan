import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { Counter, CounterSchema } from '../stock/schemas/counter.schema';
import { Product, ProductSchema } from '../stock/schemas/product.schema';
import { Supplier, SupplierSchema } from './schemas/supplier.schema';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [AuditModule, MongooseModule.forFeature([
    { name: Supplier.name, schema: SupplierSchema },
    { name: Product.name, schema: ProductSchema },
    { name: Counter.name, schema: CounterSchema },
  ])],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService, MongooseModule],
})
export class SuppliersModule {}
