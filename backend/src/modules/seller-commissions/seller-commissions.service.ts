import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';
import { Employee, EmployeeDocument, SellerCommissionRule } from '../employees/schemas/employee.schema';
import { Product, ProductDocument } from '../stock/schemas/product.schema';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema';
import { SaleStatus } from '../sales/enums/sale-status.enum';
import { FinancialMovement, FinancialMovementDocument } from '../finance/schemas/financial-movement.schema';
import { FinancialMovementCategory, FinancialMovementKind, FinancialPaymentMethod } from '../finance/enums/financial-movement.enum';
import { SaveCommissionRuleDto } from './dto/save-commission-rule.dto';

@Injectable()
export class SellerCommissionsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Employee.name) private readonly employees: Model<EmployeeDocument>,
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    @InjectModel(Sale.name) private readonly sales: Model<SaleDocument>,
    @InjectModel(FinancialMovement.name) private readonly movements: Model<FinancialMovementDocument>,
  ) {}

  async overview(sellerId: string) {
    const seller = await this.employees.findById(sellerId).select('nombre roles comisiones').lean().exec();
    if (!seller || !seller.roles.includes(UserRole.VENDEDOR)) throw new NotFoundException('Vendedor inexistente');
    const sales = await this.sales.find({ vendedorId: seller._id, estado: { $in: [SaleStatus.CONFIRMED, SaleStatus.CANCELLED] },
      comisionTotalCentavos: { $gt: 0 } }).sort({ fechaFacturacion: -1, createdAt: -1 }).lean().exec();
    return { seller: { id: seller._id, name: seller.nombre }, rules: seller.comisiones ?? [],
      sales: sales.map((sale) => ({ id: sale._id, code: sale.codigo, date: sale.fechaFacturacion ?? sale.createdAt,
        cancelled: sale.estado === SaleStatus.CANCELLED,
        clientName: sale.clienteNombre, amountCents: sale.totalCentavos,
        commissionCents: sale.comisionTotalCentavos, paidAt: sale.comisionPagadaAt,
        items: sale.items.filter((item) => item.comisionVendedorCentavos > 0).map((item) => ({
          name: item.productoNombre, quantity: item.cantidad, commissionCents: item.comisionVendedorCentavos,
        })) })) };
  }

  async saveRule(sellerId: string, dto: SaveCommissionRuleDto) {
    const seller = await this.employees.findById(sellerId).exec();
    if (!seller || !seller.roles.includes(UserRole.VENDEDOR)) throw new NotFoundException('Vendedor inexistente');
    if (dto.mode === 'PORCENTAJE' && dto.value > 10000)
      throw new BadRequestException('El porcentaje no puede superar el 100 %');
    const rubro = dto.scope === 'RUBRO' ? dto.rubro?.trim().toLocaleUpperCase('es-AR') : undefined;
    if (dto.scope === 'RUBRO' && !rubro) throw new BadRequestException('Elegí un rubro');
    if (dto.scope === 'RUBRO' && !await this.products.exists({ tipo: new RegExp(`^${rubro!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }))
      throw new BadRequestException('El rubro no existe en los productos');
    if (dto.scope === 'PRODUCTO' && !await this.products.exists({ _id: dto.productoId }))
      throw new BadRequestException('El producto no existe');
    const rule: SellerCommissionRule = { _id: new Types.ObjectId(), scope: dto.scope,
      rubro, productoId: dto.productoId ? new Types.ObjectId(dto.productoId) : undefined,
      mode: dto.mode, value: dto.value };
    seller.comisiones = (seller.comisiones ?? []).filter((current) =>
      current.scope !== dto.scope || (dto.scope === 'RUBRO' ? current.rubro !== rubro : current.productoId?.toString() !== dto.productoId));
    seller.comisiones.push(rule);
    await seller.save();
    return rule;
  }

  async deleteRule(sellerId: string, ruleId: string) {
    const result = await this.employees.updateOne({ _id: sellerId }, { $pull: { comisiones: { _id: new Types.ObjectId(ruleId) } } }).exec();
    if (!result.modifiedCount) throw new NotFoundException('Regla inexistente');
    return { deleted: true };
  }

  pay(saleId: string, method: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER,
    actor: { id: string; name: string }) {
    return this.connection.transaction(async () => {
      const sale = await this.sales.findOne({ _id: saleId, estado: SaleStatus.CONFIRMED }).exec();
      if (!sale) throw new NotFoundException('Venta inexistente');
      if (!sale.vendedorId || sale.comisionTotalCentavos <= 0) throw new BadRequestException('La venta no tiene comisión calculada');
      if (sale.comisionPagadaAt) throw new ConflictException('La comisión ya fue pagada');
      const paidAt = new Date();
      sale.comisionPagadaAt = paidAt;
      await sale.save();
      const seller = await this.employees.findById(sale.vendedorId).select('nombre').lean().exec();
      await this.movements.create({ sourceKey: `seller-commission:sale:${sale._id.toString()}`,
        tipo: FinancialMovementKind.EXPENSE, categoria: FinancialMovementCategory.SELLER_COMMISSION,
        montoCentavos: sale.comisionTotalCentavos, montoPagadoCentavos: sale.comisionTotalCentavos,
        concepto: `Comisión vendedor - Venta #${sale.codigo}`,
        detalle: `${seller?.nombre ?? 'Vendedor'} · ${sale.clienteNombre}`,
        medioPago: method, pagado: true, pagadoAt: paidAt, disponible: false,
        fechaMovimiento: paidAt, ventaId: sale._id, ventaCodigo: sale.codigo,
        clienteId: sale.clienteId, clienteNombre: sale.clienteNombre,
        actorId: actor.id, actorName: actor.name });
      return { paid: true, amountCents: sale.comisionTotalCentavos, paidAt };
    });
  }
}
