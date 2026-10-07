import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema';

export type StockLocation = 'PENDING' | 'COUNTER' | 'DEPOT' | 'WAREHOUSE';
const fieldFor = {
  COUNTER: 'stockMostrador',
  DEPOT: 'stockDeposito',
  WAREHOUSE: 'stockGalpon',
} as const;

@Injectable()
export class StockLocationsService {
  constructor(@InjectModel(Product.name) private readonly products: Model<ProductDocument>) {}

  private allocation(product: Product) {
    const snapshot = product.stockUbicacionesSincronizado;
    let counter = product.stockMostrador ?? 0;
    let depot = product.stockDeposito ?? 0;
    let warehouse = product.stockGalpon ?? 0;
    if (snapshot === null || snapshot === undefined) return { counter: 0, depot: 0, warehouse: 0 };
    let decrease = Math.max(0, snapshot - product.cantidadStock);
    const usedCounter = Math.min(counter, decrease);
    counter -= usedCounter; decrease -= usedCounter;
    const usedDepot = Math.min(depot, decrease);
    depot -= usedDepot; decrease -= usedDepot;
    warehouse -= Math.min(warehouse, decrease);
    return { counter, depot, warehouse };
  }

  private async synchronize(id: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const product = await this.products.findById(id).exec();
      if (!product?.activo) throw new NotFoundException('Producto no encontrado');
      const snapshot = product.stockUbicacionesSincronizado;
      if (snapshot === product.cantidadStock) return product;
      const { counter, depot, warehouse } = this.allocation(product);
      const updated = await this.products.findOneAndUpdate(
        { _id: id, cantidadStock: product.cantidadStock, stockUbicacionesSincronizado: snapshot ?? null },
        { $set: { stockMostrador: counter, stockDeposito: depot, stockGalpon: warehouse,
          stockUbicacionesSincronizado: product.cantidadStock } },
        { new: true },
      ).exec();
      if (updated) return updated;
    }
    throw new ConflictException('El stock cambió mientras se sincronizaban las ubicaciones; intentá de nuevo');
  }

  private view(product: Product) {
    // Las lecturas son puras: sólo al transferir se persiste la sincronización.
    const allocation = this.allocation(product);
    const mostrador = allocation.counter;
    const deposito = allocation.depot;
    const galpon = allocation.warehouse;
    return {
      id: product._id.toString(), codigo: product.codigo, nombre: product.nombre,
      rubro: product.tipo, total: product.cantidadStock,
      pendiente: Math.max(0, product.cantidadStock - mostrador - deposito - galpon),
      mostrador, deposito, galpon,
    };
  }

  async list() {
    const products = await this.products.find({ activo: true })
      .select('codigo nombre tipo cantidadStock stockMostrador stockDeposito stockGalpon stockUbicacionesSincronizado')
      .sort({ nombre: 1, codigo: 1 }).lean().exec();
    return products.map((product) => this.view(product as Product));
  }

  async transfer(id: string, source: StockLocation, destination: StockLocation, quantity: number) {
    if (source === destination) throw new BadRequestException('Elegí dos ubicaciones diferentes');
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new BadRequestException('La cantidad debe ser un entero mayor a cero');
    for (let attempt = 0; attempt < 5; attempt++) {
      const product = await this.synchronize(id);
      const state = this.view(product);
      const available = { PENDING: state.pendiente, COUNTER: state.mostrador,
        DEPOT: state.deposito, WAREHOUSE: state.galpon }[source];
      if (quantity > available) throw new BadRequestException(`Solo hay ${available} unidades en el origen`);
      const changes: Record<string, number> = {};
      if (source !== 'PENDING') changes[fieldFor[source]] = -quantity;
      if (destination !== 'PENDING') changes[fieldFor[destination]] = quantity;
      const updated = await this.products.findOneAndUpdate(
        { _id: id, cantidadStock: product.cantidadStock,
          stockMostrador: product.stockMostrador ?? 0,
          stockDeposito: product.stockDeposito ?? 0,
          stockGalpon: product.stockGalpon ?? 0 },
        { $inc: changes }, { new: true },
      ).exec();
      if (updated) return this.view(updated);
    }
    throw new ConflictException('Otra operación modificó las ubicaciones; intentá de nuevo');
  }
}
