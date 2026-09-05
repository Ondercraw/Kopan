import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { Counter, CounterDocument } from '../stock/schemas/counter.schema';
import { Product, ProductDocument } from '../stock/schemas/product.schema';
import { SavePriceListDto } from './dto/save-price-list.dto';
import {
  PriceListItem,
  PriceListItemDocument,
} from './schemas/price-list-item.schema';
import { PriceList, PriceListDocument } from './schemas/price-list.schema';
import {
  PriceHistory,
  PriceHistoryDocument,
} from './schemas/price-history.schema';
import {
  InventoryLot,
  InventoryLotDocument,
} from '../purchases/schemas/inventory-lot.schema';
import {
  Purchase,
  PurchaseDocument,
} from '../purchases/schemas/purchase.schema';
import { dateRange } from '../purchases/purchase-calculations';
import {
  StockMovement,
  StockMovementDocument,
} from '../stock/schemas/stock-movement.schema';

export interface PriceActor {
  id: string;
  name: string;
}

@Injectable()
export class PricesService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(PriceList.name)
    private readonly listModel: Model<PriceListDocument>,
    @InjectModel(PriceListItem.name)
    private readonly itemModel: Model<PriceListItemDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
    @InjectModel(PriceHistory.name)
    private readonly historyModel: Model<PriceHistoryDocument>,
    @InjectModel(InventoryLot.name)
    private readonly lotModel: Model<InventoryLotDocument>,
    @InjectModel(Purchase.name)
    private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovementDocument>,
  ) {}

  findAll() {
    return this.listModel.find().sort({ activo: -1, codigo: 1 }).lean().exec();
  }

  async findOne(id: string) {
    const list = await this.listModel.findById(id).lean().exec();
    if (!list) throw new NotFoundException('Lista de precios no encontrada');
    const items = await this.itemModel
      .find({ listaId: id })
      .populate(
        'productoId',
        'codigo nombre tipo activo alicuotaIva costoCentavos cantidadStock',
      )
      .lean()
      .exec();
    const productIds = items.map(
      (item) => (item.productoId as unknown as { _id: Types.ObjectId })._id,
    );
    const lots = await this.lotModel
      .find({
        productId: { $in: productIds },
        cancelled: false,
        remainingQuantity: { $gt: 0 },
      })
      .sort({ receivedAt: 1, lineNumber: 1 })
      .lean()
      .exec();
    const enriched = items.map((item) => {
      const product = item.productoId as unknown as Record<string, unknown> & {
        _id: Types.ObjectId;
      };
      return {
        ...item,
        productoId: {
          ...product,
          costLayers: lots.filter(
            (lot) => lot.productId.toString() === product._id.toString(),
          ),
        },
      };
    });
    return { ...list, items: enriched };
  }

  async create(dto: SavePriceListDto) {
    try {
      return await this.listModel.create({
        codigo: await this.nextCode(),
        nombre: dto.nombre.trim(),
        descripcion: dto.descripcion?.trim() ?? '',
      });
    } catch (error: unknown) {
      if (this.isDuplicate(error))
        throw new ConflictException('Ya existe una lista con ese nombre');
      throw error;
    }
  }

  async update(id: string, dto: SavePriceListDto) {
    const list = await this.listModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            nombre: dto.nombre.trim(),
            descripcion: dto.descripcion?.trim() ?? '',
          },
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (!list) throw new NotFoundException('Lista de precios no encontrada');
    return list;
  }

  async setActive(id: string, activo: boolean) {
    const list = await this.listModel
      .findByIdAndUpdate(id, { $set: { activo } }, { new: true })
      .exec();
    if (!list) throw new NotFoundException('Lista de precios no encontrada');
    return list;
  }

  setProductPrice(
    listId: string,
    productId: string,
    precioCentavos: number,
    actor: PriceActor,
  ) {
    return this.connection.transaction(() =>
      this.setPriceInTransaction(listId, productId, precioCentavos, actor),
    );
  }

  private async setPriceInTransaction(
    listId: string,
    productId: string,
    precioCentavos: number,
    actor: PriceActor,
  ) {
    const list = await this.listModel
      .findOne({ _id: listId, activo: true })
      .exec();
    const product = await this.productModel
      .findOne({ _id: productId, activo: true })
      .exec();
    if (!list)
      throw new NotFoundException('Lista de precios inexistente o inactiva');
    if (!product)
      throw new NotFoundException('Producto inexistente o inactivo');
    const previous = await this.itemModel
      .findOne({ listaId: listId, productoId: productId })
      .exec();
    const item = await this.itemModel
      .findOneAndUpdate(
        { listaId: listId, productoId: productId },
        { $set: { precioCentavos, actorId: actor.id, actorName: actor.name } },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      )
      .populate(
        'productoId',
        'codigo nombre tipo activo alicuotaIva costoCentavos cantidadStock',
      )
      .exec();
    if (!previous || previous.precioCentavos !== precioCentavos) {
      await this.historyModel.create({
        listaId: list._id,
        productoId: product._id,
        precioCentavos,
        precioAnteriorCentavos: previous?.precioCentavos ?? null,
        actorId: actor.id,
        actorName: actor.name,
        vigenteDesde: new Date(),
      });
    }
    return item;
  }

  async history(
    listId: string,
    productId: string,
    filters: { from?: string; to?: string },
  ) {
    const range = dateRange(filters.from, filters.to);
    const priceQuery: Record<string, unknown> = {
      listaId: listId,
      productoId: productId,
    };
    const purchaseQuery: Record<string, unknown> = {
      'items.productId': new Types.ObjectId(productId),
    };
    const movementQuery: Record<string, unknown> = {
      productId: new Types.ObjectId(productId),
    };
    if (Object.keys(range).length) {
      priceQuery.vigenteDesde = range;
      purchaseQuery.fechaCompra = range;
      movementQuery.createdAt = range;
    }
    const [prices, purchases, movements, lots] = await Promise.all([
      this.historyModel
        .find(priceQuery)
        .sort({ vigenteDesde: -1 })
        .lean()
        .exec(),
      this.purchaseModel
        .find(purchaseQuery)
        .sort({ fechaCompra: -1 })
        .lean()
        .exec(),
      this.movementModel
        .find(movementQuery)
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      this.lotModel
        .find({ productId, cancelled: false, remainingQuantity: { $gt: 0 } })
        .sort({ receivedAt: 1, lineNumber: 1 })
        .lean()
        .exec(),
    ]);
    return {
      prices,
      closingSnapshot: filters.to ? {
        date: filters.to,
        price: await this.historyModel.findOne({ listaId: listId, productoId: productId, vigenteDesde: { $lte: range.$lte } }).sort({ vigenteDesde: -1 }).lean().exec(),
        stock: await this.movementModel.findOne({ productId, createdAt: { $lte: range.$lte } }).sort({ createdAt: -1, _id: -1 }).lean().exec(),
      } : null,
      purchases: purchases.flatMap((purchase) =>
        purchase.items
          .filter((item) => item.productId.toString() === productId)
          .map((item) => ({
            status: purchase.estado,
            kind: purchase.tipo,
            purchaseId: purchase._id,
            purchaseCode: purchase.codigo,
            date: purchase.fechaCompra,
            supplierName: purchase.proveedorNombre,
            quantity: item.quantity,
            unitCostCents: item.unitCostCents,
            previousStock: item.previousStock,
            currentStock: item.currentStock,
            previousAverageCostCents: item.previousAverageCostCents,
            currentAverageCostCents: item.currentAverageCostCents,
          })),
      ),
      movements,
      lots,
    };
  }

  private async nextCode(): Promise<number> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { key: 'priceListCode' },
        { $inc: { value: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!counter) throw new Error('No se pudo generar el código de la lista');
    return counter.value;
  }
  private isDuplicate(error: unknown): error is { code: number } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    );
  }
}
