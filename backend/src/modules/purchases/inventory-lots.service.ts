import { Injectable } from '@nestjs/common';
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
export class InventoryLotsService {
  constructor(
    @InjectModel(InventoryLot.name)
    private readonly lotModel: Model<InventoryLotDocument>,
  ) {}

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
  ) {
    if (delta < 0)
      return (await this.consumeFifo(productId, -delta, cost, previousStock))
        .remainingAverageCostCents;
    if (delta > 0)
      await this.lotModel.create({
        productId,
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
}
