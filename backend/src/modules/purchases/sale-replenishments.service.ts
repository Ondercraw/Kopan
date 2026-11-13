import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema';
import { SaleStatus } from '../sales/enums/sale-status.enum';
import { Purchase, PurchaseDocument } from './schemas/purchase.schema';
import { PurchaseStatus } from './enums/purchase.enum';
import { AssignReplenishmentDto } from './dto/assign-replenishment.dto';
import { SaleReplenishment, SaleReplenishmentDocument } from './schemas/sale-replenishment.schema';
import { FinancialMovement, FinancialMovementDocument } from '../finance/schemas/financial-movement.schema';
import { AssignManualSaleCostDto } from './dto/assign-manual-sale-cost.dto';

@Injectable()
export class SaleReplenishmentsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Sale.name) private readonly sales: Model<SaleDocument>,
    @InjectModel(Purchase.name) private readonly purchases: Model<PurchaseDocument>,
    @InjectModel(SaleReplenishment.name) private readonly links: Model<SaleReplenishmentDocument>,
    @InjectModel(FinancialMovement.name) private readonly finances: Model<FinancialMovementDocument>,
  ) {}

  async pending() {
    const [sales, links] = await Promise.all([
      this.sales.find({ estado: SaleStatus.CONFIRMED, $or: [
        { 'items.costoPromedioUnitarioCentavos': 0 },
        { 'items.costoUnitarioCentavos': 0 },
      ] }).select('codigo clienteNombre fechaFacturacion createdAt items').sort({ fechaFacturacion: -1, createdAt: -1 }).lean().exec(),
      this.links.find().lean().exec(),
    ]);
    const assigned = new Map<string, number>();
    for (const link of links) {
      const key = `${link.saleId}:${link.saleItemIndex}`;
      assigned.set(key, (assigned.get(key) ?? 0) + link.quantity);
    }
    return sales.flatMap((sale) => sale.items.map((item, saleItemIndex) => {
      const quantityAssigned = assigned.get(`${sale._id}:${saleItemIndex}`) ?? 0;
      const originalCost = item.costoPromedioUnitarioCentavos ?? item.costoUnitarioCentavos;
      const pendingQuantity = originalCost === 0 ? Math.max(0, item.cantidad - quantityAssigned) : 0;
      if (originalCost !== 0) return null;
      return {
        saleId: sale._id, saleCode: sale.codigo, saleItemIndex,
        saleDate: sale.fechaFacturacion ?? sale.createdAt,
        clientName: sale.clienteNombre,
        productId: item.productoId, productCode: item.productoCodigo,
        productName: item.productoNombre, quantity: item.cantidad,
        quantityAssigned, pendingQuantity, saleAmountCents: item.totalCentavos,
      };
    }).filter((row) => row !== null));
  }

  async candidates(productId: string) {
    if (!Types.ObjectId.isValid(productId)) throw new BadRequestException('Producto inválido');
    const [purchases, links] = await Promise.all([
      this.purchases.find({ estado: PurchaseStatus.CONFIRMED, 'items.productId': new Types.ObjectId(productId) })
        .select('codigo tipo proveedorNombre fechaCompra items').sort({ fechaCompra: -1, codigo: -1 }).lean().exec(),
      this.links.find({ productId: new Types.ObjectId(productId) }).lean().exec(),
    ]);
    const assigned = new Map<string, number>();
    for (const link of links) {
      if (!link.purchaseId) continue;
      const key = `${link.purchaseId}:${link.purchaseLineNumber}`;
      assigned.set(key, (assigned.get(key) ?? 0) + link.quantity);
    }
    return purchases.flatMap((purchase) => purchase.items
      .filter((item) => item.productId.toString() === productId)
      .map((item) => ({
        purchaseId: purchase._id, purchaseCode: purchase.codigo, purchaseKind: purchase.tipo,
        purchaseLineNumber: item.lineNumber, supplierName: purchase.proveedorNombre,
        date: purchase.fechaCompra, quantity: item.quantity,
        assignedQuantity: assigned.get(`${purchase._id}:${item.lineNumber}`) ?? 0,
        availableQuantity: Math.max(0, item.quantity - (assigned.get(`${purchase._id}:${item.lineNumber}`) ?? 0)),
        unitCostCents: item.unitCostCents,
      })));
  }

  async linked(saleId: string, saleItemIndex: number) {
    const links = await this.links.find({ saleId: new Types.ObjectId(saleId), saleItemIndex }).sort({ createdAt: -1 }).lean().exec();
    const purchases = await this.purchases.find({ _id: { $in: links.map((link) => link.purchaseId).filter((id) => id !== null) } })
      .select('codigo proveedorNombre items').lean().exec();
    const byId = new Map(purchases.map((purchase) => [purchase._id.toString(), purchase]));
    return links.map((link) => {
      const purchase = link.purchaseId ? byId.get(link.purchaseId.toString()) : null;
      const item = purchase?.items.find((row) => row.lineNumber === link.purchaseLineNumber);
      return { _id: link._id, purchaseCode: purchase?.codigo ?? 0,
        supplierName: purchase?.proveedorNombre ?? '', quantity: link.quantity,
        unitCostCents: item?.unitCostCents ?? link.manualUnitCostCents ?? 0,
        manual: !link.purchaseId, createdAt: link.createdAt };
    });
  }

  unlink(id: string) {
    return this.connection.transaction(async () => {
      const link = await this.links.findById(id).exec();
      if (!link) throw new NotFoundException('La vinculación ya no existe');
      await this.links.deleteOne({ _id: link._id }).exec();
      await this.sales.updateOne({ _id: link.saleId }, { $inc: { __v: 1 } }).exec();
      if (link.purchaseId) await this.purchases.updateOne({ _id: link.purchaseId }, { $inc: { __v: 1 } }).exec();
      return { removed: true };
    });
  }

  assign(dto: AssignReplenishmentDto, actor: { id: string; name: string }) {
    return this.connection.transaction(async () => {
      const sale = await this.sales.findOne({ _id: dto.saleId, estado: SaleStatus.CONFIRMED }).exec();
      if (!sale) throw new NotFoundException('La venta no existe o fue anulada');
      const item = sale.items[dto.saleItemIndex];
      if (!item) throw new NotFoundException('El renglón de la venta no existe');
      if ((item.costoPromedioUnitarioCentavos ?? item.costoUnitarioCentavos) !== 0)
        throw new ConflictException('Esta venta ya tenía un costo asignado');
      const purchase = await this.purchases.findOne({ _id: dto.purchaseId, estado: PurchaseStatus.CONFIRMED }).exec();
      if (!purchase) throw new NotFoundException('La compra no existe o fue anulada');
      const purchaseItem = purchase.items.find((row) => row.lineNumber === dto.purchaseLineNumber);
      if (!purchaseItem || purchaseItem.productId.toString() !== item.productoId.toString())
        throw new BadRequestException('La compra no corresponde al producto de la venta');
      if (purchaseItem.unitCostCents <= 0)
        throw new BadRequestException('Esta compra no tiene un costo mayor a cero para asignar');
      const saleLinks = await this.links.find({ saleId: sale._id, saleItemIndex: dto.saleItemIndex }).exec();
      const purchaseLinks = await this.links.find({ purchaseId: purchase._id, purchaseLineNumber: dto.purchaseLineNumber }).exec();
      const saleUsed = saleLinks.reduce((sum, link) => sum + link.quantity, 0);
      const purchaseUsed = purchaseLinks.reduce((sum, link) => sum + link.quantity, 0);
      if (dto.quantity > item.cantidad - saleUsed)
        throw new ConflictException('La cantidad supera las unidades de la venta pendientes de costo');
      if (dto.quantity > purchaseItem.quantity - purchaseUsed)
        throw new ConflictException('La cantidad supera las unidades de esta compra disponibles para vincular');
      if (saleLinks.some((link) => link.purchaseId?.toString() === dto.purchaseId && link.purchaseLineNumber === dto.purchaseLineNumber))
        throw new ConflictException('Esta compra ya está vinculada a ese renglón de venta');
      await this.links.create({ saleId: sale._id, saleItemIndex: dto.saleItemIndex,
        productId: item.productoId, purchaseId: purchase._id,
        purchaseLineNumber: dto.purchaseLineNumber, quantity: dto.quantity,
        actorId: actor.id, actorName: actor.name });
      // Ambos documentos se escriben dentro de la transacción para serializar
      // asignaciones concurrentes sobre la misma venta o compra.
      await this.sales.updateOne({ _id: sale._id }, { $inc: { __v: 1 } }).exec();
      await this.purchases.updateOne({ _id: purchase._id }, { $inc: { __v: 1 } }).exec();
      await this.finances.updateOne({ sourceKey: `sale:${sale._id}:income` },
        { $set: { costoCorregidoAt: new Date() }, $addToSet: { productosCostoCorregido: item.productoNombre } }).exec();
      return { assignedQuantity: saleUsed + dto.quantity, pendingQuantity: item.cantidad - saleUsed - dto.quantity };
    });
  }

  assignManual(dto: AssignManualSaleCostDto, actor: { id: string; name: string }) {
    return this.connection.transaction(async () => {
      const sale = await this.sales.findOne({ _id: dto.saleId, estado: SaleStatus.CONFIRMED }).exec();
      if (!sale) throw new NotFoundException('La venta no existe o fue anulada');
      const item = sale.items[dto.saleItemIndex];
      if (!item) throw new NotFoundException('El renglón de la venta no existe');
      if ((item.costoPromedioUnitarioCentavos ?? item.costoUnitarioCentavos) !== 0)
        throw new ConflictException('Esta venta ya tenía un costo asignado');
      const links = await this.links.find({ saleId: sale._id, saleItemIndex: dto.saleItemIndex }).exec();
      const assigned = links.reduce((sum, link) => sum + link.quantity, 0);
      if (dto.quantity > item.cantidad - assigned)
        throw new ConflictException('La cantidad supera las unidades pendientes de costo');
      if (!Number.isSafeInteger(dto.quantity * dto.unitCostCents))
        throw new BadRequestException('El costo total supera el importe permitido');
      await this.links.create({ saleId: sale._id, saleItemIndex: dto.saleItemIndex,
        productId: item.productoId, purchaseId: null, purchaseLineNumber: null,
        manualUnitCostCents: dto.unitCostCents, quantity: dto.quantity,
        actorId: actor.id, actorName: actor.name });
      await this.sales.updateOne({ _id: sale._id }, { $inc: { __v: 1 } }).exec();
      await this.finances.updateOne({ sourceKey: `sale:${sale._id}:income` },
        { $set: { costoCorregidoAt: new Date() }, $addToSet: { productosCostoCorregido: item.productoNombre } }).exec();
      return { assignedQuantity: assigned + dto.quantity, pendingQuantity: item.cantidad - assigned - dto.quantity };
    });
  }

  async financialCosts(sales: Array<{ _id: Types.ObjectId; items: Array<{ cantidad: number; costoPromedioUnitarioCentavos: number | null; costoUnitarioCentavos: number }> }>) {
    if (!sales.length) return new Map<string, Map<number, { assigned: number; cost: number }>>();
    const links = await this.links.find({ saleId: { $in: sales.map((sale) => sale._id) } }).lean().exec();
    const purchases = await this.purchases.find({ _id: { $in: links.map((link) => link.purchaseId).filter((id) => id !== null) }, estado: PurchaseStatus.CONFIRMED })
      .select('items').lean().exec();
    const purchaseById = new Map(purchases.map((purchase) => [purchase._id.toString(), purchase]));
    const result = new Map<string, Map<number, { assigned: number; cost: number }>>();
    for (const link of links) {
      if (!link.purchaseId) {
        const saleId = link.saleId.toString();
        if (!result.has(saleId)) result.set(saleId, new Map());
        const group = result.get(saleId)!;
        const current = group.get(link.saleItemIndex) ?? { assigned: 0, cost: 0 };
        current.assigned += link.quantity;
        current.cost += link.quantity * (link.manualUnitCostCents ?? 0);
        group.set(link.saleItemIndex, current);
        continue;
      }
      const purchase = purchaseById.get(link.purchaseId.toString());
      const item = purchase?.items.find((row) => row.lineNumber === link.purchaseLineNumber);
      if (!item) continue;
      const saleId = link.saleId.toString();
      if (!result.has(saleId)) result.set(saleId, new Map());
      const group = result.get(saleId)!;
      const current = group.get(link.saleItemIndex) ?? { assigned: 0, cost: 0 };
      current.assigned += link.quantity;
      current.cost += link.quantity * item.unitCostCents;
      group.set(link.saleItemIndex, current);
    }
    return result;
  }

  async assertPurchaseItemQuantity(purchaseId: string, lineNumber: number, nextQuantity: number) {
    const links = await this.links.find({ purchaseId: new Types.ObjectId(purchaseId), purchaseLineNumber: lineNumber }).lean().exec();
    const assigned = links.reduce((sum, link) => sum + link.quantity, 0);
    if (nextQuantity < assigned) throw new ConflictException(`Esta compra tiene ${assigned} unidades vinculadas a ventas. Desvinculalas antes de reducirla.`);
  }
  async hasPurchaseItemLinks(purchaseId: string, lineNumber: number) {
    return !!(await this.links.exists({ purchaseId: new Types.ObjectId(purchaseId), purchaseLineNumber: lineNumber }));
  }
  async linkedSaleImpact(purchaseId: string, lineNumber: number) {
    const links = await this.links.find({ purchaseId: new Types.ObjectId(purchaseId), purchaseLineNumber: lineNumber }).lean().exec();
    const sales = await this.sales.find({ _id: { $in: links.map((link) => link.saleId) }, estado: SaleStatus.CONFIRMED })
      .select('codigo clienteNombre').lean().exec();
    const byId = new Map(sales.map((sale) => [sale._id.toString(), sale]));
    return links.filter((link) => byId.has(link.saleId.toString()))
      .map((link) => ({ codigo: byId.get(link.saleId.toString())!.codigo,
        clienteNombre: byId.get(link.saleId.toString())!.clienteNombre, quantity: link.quantity }));
  }

  async assignedForSale(saleId: string) {
    const links = await this.links.find({ saleId: new Types.ObjectId(saleId) }).lean().exec();
    const assigned = new Map<number, number>();
    for (const link of links) assigned.set(link.saleItemIndex, (assigned.get(link.saleItemIndex) ?? 0) + link.quantity);
    return assigned;
  }

  async removeForCancelledSale(saleId: string) {
    await this.links.deleteMany({ saleId: new Types.ObjectId(saleId) }).exec();
  }

  async assertPurchaseNotLinked(purchaseId: string) {
    if (await this.links.exists({ purchaseId: new Types.ObjectId(purchaseId) }))
      throw new ConflictException('Esta compra está vinculada a ventas sin costo. Desvinculá esas unidades antes de anularla.');
  }
}
