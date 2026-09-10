import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  InventoryLot,
  InventoryLotDocument,
} from './schemas/inventory-lot.schema';

export interface LotConsumption {
  lotId: Types.ObjectId;
  quantity: number;
}

@Injectable()
export class InventoryLotsService implements OnModuleInit {
  private readonly logger = new Logger(InventoryLotsService.name);

  constructor(
    @InjectModel(InventoryLot.name)
    private readonly lotModel: Model<InventoryLotDocument>,
  ) {}

  /**
   * Sustituye el índice creado por la primera versión del módulo de Compras.
   * Aquel índice también consideraba los lotes manuales (purchaseId null), por
   * lo que una segunda corrección de inventario fallaba con E11000.
   */
  async onModuleInit(): Promise<void> {
    const collection = this.lotModel.collection;
    await collection.createIndex(
      { purchaseId: 1, lineNumber: 1 },
      {
        name: 'purchase_lot_unique_partial',
        unique: true,
        partialFilterExpression: { purchaseId: { $type: 'objectId' } },
      },
    );

    const legacyIndex = (await collection.indexes()).find(
      (index) => index.name === 'purchaseId_1_lineNumber_1',
    );
    if (legacyIndex && !legacyIndex.partialFilterExpression) {
      await collection.dropIndex('purchaseId_1_lineNumber_1');
      this.logger.log(
        'Índice antiguo de lotes reemplazado; los ajustes manuales múltiples quedaron habilitados',
      );
    }
  }

  async activeLots(productId: Types.ObjectId | string) {
    return this.lotModel
      .find({ productId, cancelled: false, remainingQuantity: { $gt: 0 } })
      .sort({ receivedAt: 1, createdAt: 1, lineNumber: 1 })
      .exec();
  }

  async summary(productId: Types.ObjectId | string) {
    const lots = await this.activeLots(productId);
    const quantity = lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0);
    const value = lots.reduce(
      (sum, lot) => sum + lot.remainingQuantity * lot.unitCostCents,
      0,
    );
    return {
      lots,
      quantity,
      value,
      averageCostCents: quantity ? Math.round(value / quantity) : 0,
    };
  }

  async consumeFifo(
    productId: Types.ObjectId,
    quantity: number,
    fallbackCostCents: number,
    physicalStockBefore: number,
  ) {
    const lots = await this.activeLots(productId);
    const trackedQuantity = lots.reduce(
      (sum, lot) => sum + lot.remainingQuantity,
      0,
    );
    const unvaluedQuantity = Math.max(0, physicalStockBefore - trackedQuantity);
    const unvaluedUsed = Math.min(quantity, unvaluedQuantity);
    let remaining = quantity - unvaluedUsed;
    let totalCostCents = unvaluedUsed * fallbackCostCents;
    const consumptions: LotConsumption[] = [];
    for (const lot of lots) {
      if (!remaining) break;
      const used = Math.min(remaining, lot.remainingQuantity);
      lot.remainingQuantity -= used;
      remaining -= used;
      totalCostCents += used * lot.unitCostCents;
      consumptions.push({ lotId: lot._id, quantity: used });
      await lot.save();
    }
    // Compatibilidad defensiva ante inventario histórico todavía sin valorar.
    totalCostCents += remaining * fallbackCostCents;
    const after = await this.summary(productId);
    return {
      totalCostCents,
      averageUnitCostCents: quantity
        ? Math.round(totalCostCents / quantity)
        : 0,
      remainingAverageCostCents:
        physicalStockBefore > quantity
          ? Math.round(
              (after.value +
                Math.max(0, unvaluedQuantity - unvaluedUsed) *
                  fallbackCostCents) /
                (physicalStockBefore - quantity),
            )
          : 0,
      consumptions,
      unvaluedUsed,
    };
  }

  async adjust(
    productId: Types.ObjectId,
    delta: number,
    previousStock: number,
    cost: number,
    stockMovementId?: Types.ObjectId,
  ) {
    if (delta < 0)
      return this.consumeManualAdjustment(
        productId,
        -delta,
        cost,
        previousStock,
      );
    if (delta > 0)
      await this.lotModel.create({
        productId,
        stockMovementId: stockMovementId ?? null,
        initialQuantity: delta,
        remainingQuantity: delta,
        unitCostCents: cost,
        kind: 'AJUSTE',
        receivedAt: new Date(),
        cancelled: false,
      });
    const summary = await this.summary(productId);
    return summary.quantity ? summary.averageCostCents : cost;
  }

  /**
   * Una corrección manual consume primero los últimos ingresos manuales. Así,
   * una unidad agregada por error queda enlazada con su posterior resta y no
   * provoca un segundo descuento al cancelar el gasto asociado.
   */
  private async consumeManualAdjustment(
    productId: Types.ObjectId,
    quantity: number,
    fallbackCostCents: number,
    physicalStockBefore: number,
  ): Promise<number> {
    const adjustmentLots = await this.lotModel
      .find({
        productId,
        kind: 'AJUSTE',
        cancelled: false,
        remainingQuantity: { $gt: 0 },
      })
      .sort({ receivedAt: -1, createdAt: -1 })
      .exec();
    let remaining = quantity;
    for (const lot of adjustmentLots) {
      if (!remaining) break;
      const used = Math.min(remaining, lot.remainingQuantity);
      lot.remainingQuantity -= used;
      remaining -= used;
      await lot.save();
    }
    if (remaining) {
      await this.consumeFifo(
        productId,
        remaining,
        fallbackCostCents,
        physicalStockBefore - (quantity - remaining),
      );
    }
    return this.averageIncludingUnvalued(
      productId,
      physicalStockBefore - quantity,
      fallbackCostCents,
    );
  }

  async linkedAdjustmentRemaining(
    stockMovementId: Types.ObjectId,
  ): Promise<number | null> {
    const lot = await this.lotModel
      .findOne({ stockMovementId, kind: 'AJUSTE', cancelled: false })
      .exec();
    return lot ? lot.remainingQuantity : null;
  }

  async cancelLinkedAdjustment(
    stockMovementId: Types.ObjectId,
    productId: Types.ObjectId,
    physicalStockAfter: number,
    fallbackCostCents: number,
  ): Promise<number> {
    const lot = await this.lotModel
      .findOne({ stockMovementId, kind: 'AJUSTE', cancelled: false })
      .exec();
    if (lot) {
      lot.remainingQuantity = 0;
      lot.cancelled = true;
      await lot.save();
    }
    return this.averageIncludingUnvalued(
      productId,
      physicalStockAfter,
      fallbackCostCents,
    );
  }

  private async averageIncludingUnvalued(
    productId: Types.ObjectId,
    physicalStock: number,
    fallbackCostCents: number,
  ): Promise<number> {
    if (physicalStock <= 0) return 0;
    const summary = await this.summary(productId);
    const unvaluedQuantity = Math.max(0, physicalStock - summary.quantity);
    return Math.round(
      (summary.value + unvaluedQuantity * fallbackCostCents) / physicalStock,
    );
  }
}
