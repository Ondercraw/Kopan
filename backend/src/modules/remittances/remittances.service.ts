import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Client, ClientDocument } from '../clients/schemas/client.schema';
import { Product, ProductDocument } from '../stock/schemas/product.schema';
import { Counter, CounterDocument } from '../stock/schemas/counter.schema';
import { CreateRemittanceDto } from './dto/create-remittance.dto';
import { Remittance, RemittanceDocument } from './schemas/remittance.schema';

@Injectable()
export class RemittancesService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Remittance.name) private readonly remittances: Model<RemittanceDocument>,
    @InjectModel(Client.name) private readonly clients: Model<ClientDocument>,
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    @InjectModel(Counter.name) private readonly counters: Model<CounterDocument>,
  ) {}

  create(dto: CreateRemittanceDto, actor: { id: string; name: string }) {
    return this.connection.transaction(async () => {
      const client = await this.clients.findOne({ _id: dto.clienteId, activo: true }).lean().exec();
      if (!client) throw new NotFoundException('Cliente inexistente o inactivo');
      const ids = dto.items.map((item) => item.productoId);
      if (new Set(ids).size !== ids.length) throw new BadRequestException('Un producto está repetido en el remito');
      const products = await this.products.find({ _id: { $in: ids }, activo: true }).lean().exec();
      if (products.length !== ids.length) throw new NotFoundException('Uno de los productos ya no está activo');
      const byId = new Map(products.map((p) => [p._id.toString(), p]));
      const items = dto.items.map((item) => ({
        productoId: new Types.ObjectId(item.productoId),
        productoNombre: byId.get(item.productoId)!.nombre,
        cantidad: item.cantidad,
        precioFinalUnitarioCentavos: item.precioFinalUnitarioCentavos,
        totalCentavos: Math.round(
          item.cantidad * item.precioFinalUnitarioCentavos *
          (10000 - item.bonificacionPuntosBase) / 10000,
        ),
      }));
      const counter = await this.counters.findOneAndUpdate(
        { key: 'remittanceCode' },
        { $inc: { value: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).exec();
      if (!counter) throw new Error('No se pudo numerar el remito');
      return this.remittances.create({
        codigo: counter.value,
        clienteId: client._id,
        clienteCodigo: client.codigo,
        clienteNombre: client.nombre,
        clienteDireccion: client.direccion,
        clienteLocalidad: client.localidad,
        items,
        transporteDescargaCentavos: dto.transporteDescargaCentavos,
        totalCentavos: items.reduce((sum, item) => sum + item.totalCentavos, dto.transporteDescargaCentavos),
        observaciones: dto.observaciones?.trim() ?? '',
        actorId: actor.id,
        actorName: actor.name,
      });
    });
  }
}
