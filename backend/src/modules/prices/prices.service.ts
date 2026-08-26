import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Counter, CounterDocument } from '../stock/schemas/counter.schema';
import { Product, ProductDocument } from '../stock/schemas/product.schema';
import { SavePriceListDto } from './dto/save-price-list.dto';
import { PriceListItem, PriceListItemDocument } from './schemas/price-list-item.schema';
import { PriceList, PriceListDocument } from './schemas/price-list.schema';

export interface PriceActor { id: string; name: string }

@Injectable()
export class PricesService {
  constructor(
    @InjectModel(PriceList.name) private readonly listModel: Model<PriceListDocument>,
    @InjectModel(PriceListItem.name) private readonly itemModel: Model<PriceListItemDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Counter.name) private readonly counterModel: Model<CounterDocument>,
  ) {}

  findAll() { return this.listModel.find().sort({ activo: -1, codigo: 1 }).exec(); }

  async findOne(id: string) {
    const list = await this.listModel.findById(id).exec();
    if (!list) throw new NotFoundException('Lista de precios no encontrada');
    const items = await this.itemModel.find({ listaId: id }).populate('productoId', 'codigo nombre tipo activo alicuotaIva costoCentavos cantidadStock').exec();
    return { ...list.toObject(), items };
  }

  async create(dto: SavePriceListDto) {
    try {
      return await this.listModel.create({ codigo: await this.nextCode(), nombre: dto.nombre.trim(), descripcion: dto.descripcion?.trim() ?? '' });
    } catch (error: unknown) {
      if (this.isDuplicate(error)) throw new ConflictException('Ya existe una lista con ese nombre');
      throw error;
    }
  }

  async update(id: string, dto: SavePriceListDto) {
    const list = await this.listModel.findByIdAndUpdate(id, { $set: { nombre: dto.nombre.trim(), descripcion: dto.descripcion?.trim() ?? '' } }, { new: true, runValidators: true }).exec();
    if (!list) throw new NotFoundException('Lista de precios no encontrada');
    return list;
  }

  async setActive(id: string, activo: boolean) {
    const list = await this.listModel.findByIdAndUpdate(id, { $set: { activo } }, { new: true }).exec();
    if (!list) throw new NotFoundException('Lista de precios no encontrada');
    return list;
  }

  async setProductPrice(listId: string, productId: string, precioCentavos: number, actor: PriceActor) {
    const [list, product] = await Promise.all([this.listModel.findOne({ _id: listId, activo: true }).exec(), this.productModel.findOne({ _id: productId, activo: true }).exec()]);
    if (!list) throw new NotFoundException('Lista de precios inexistente o inactiva');
    if (!product) throw new NotFoundException('Producto inexistente o inactivo');
    return this.itemModel.findOneAndUpdate(
      { listaId: listId, productoId: productId },
      { $set: { precioCentavos, actorId: actor.id, actorName: actor.name } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).populate('productoId', 'codigo nombre tipo activo alicuotaIva costoCentavos cantidadStock').exec();
  }

  private async nextCode(): Promise<number> {
    const counter = await this.counterModel.findOneAndUpdate({ key: 'priceListCode' }, { $inc: { value: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true }).exec();
    if (!counter) throw new Error('No se pudo generar el código de la lista');
    return counter.value;
  }
  private isDuplicate(error: unknown): error is { code: number } { return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 11000; }
}
