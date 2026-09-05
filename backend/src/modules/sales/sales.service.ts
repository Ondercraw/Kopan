import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import {
  normalizeUserRoles,
  UserRole,
} from '../../common/enums/user-role.enum';
import { Client, ClientDocument } from '../clients/schemas/client.schema';
import {
  Employee,
  EmployeeDocument,
} from '../employees/schemas/employee.schema';
import {
  PriceListItem,
  PriceListItemDocument,
} from '../prices/schemas/price-list-item.schema';
import {
  PriceList,
  PriceListDocument,
} from '../prices/schemas/price-list.schema';
import { Counter, CounterDocument } from '../stock/schemas/counter.schema';
import { Product, ProductDocument } from '../stock/schemas/product.schema';
import {
  StockMovement,
  StockMovementDocument,
} from '../stock/schemas/stock-movement.schema';
import { StockMovementType } from '../stock/enums/stock-movement-type.enum';
import { CreateSaleDto } from './dto/create-sale.dto';
import { PaymentMethod } from './enums/payment-method.enum';
import { FiscalStatus, SaleStatus } from './enums/sale-status.enum';
import { Sale, SaleDocument, SaleItem } from './schemas/sale.schema';
import { ChecksService } from '../checks/checks.service';
import { FinanceService } from '../finance/finance.service';
import { BankCheckDocument } from '../checks/schemas/bank-check.schema';
import {
  InventoryLotsService,
  LotConsumption,
} from '../purchases/inventory-lots.service';

export interface SaleActor {
  id: string;
  name: string;
  roles: UserRole[];
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(Client.name)
    private readonly clientModel: Model<ClientDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(PriceList.name)
    private readonly listModel: Model<PriceListDocument>,
    @InjectModel(PriceListItem.name)
    private readonly priceItemModel: Model<PriceListItemDocument>,
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovementDocument>,
    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
    private readonly checksService: ChecksService,
    private readonly financeService: FinanceService,
    private readonly inventoryLots: InventoryLotsService,
  ) {}

  findAll(filters: { from?: string; to?: string; medioPago?: string } = {}) {
    const query: Record<string, unknown> = { estado: SaleStatus.CONFIRMED };
    const createdAt: Record<string, Date> = {};
    if (filters.from) {
      const from = new Date(filters.from);
      if (!Number.isNaN(from.getTime())) createdAt.$gte = from;
    }
    if (filters.to) {
      const to = new Date(filters.to);
      if (!Number.isNaN(to.getTime())) createdAt.$lt = to;
    }
    if (Object.keys(createdAt).length) query.createdAt = createdAt;
    if (
      filters.medioPago &&
      Object.values(PaymentMethod).includes(filters.medioPago as PaymentMethod)
    )
      query.medioPago = filters.medioPago;
    return this.saleModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(2000)
      .lean()
      .exec();
  }
  findTransfers() {
    return this.saleModel
      .find({ estado: SaleStatus.CONFIRMED, medioPago: PaymentMethod.TRANSFER })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean()
      .exec();
  }

  create(dto: CreateSaleDto, actor: SaleActor) {
    return this.connection.transaction(() =>
      this.createInTransaction(dto, actor),
    );
  }

  private async createInTransaction(dto: CreateSaleDto, actor: SaleActor) {
    const client = await this.clientModel
      .findOne({ _id: dto.clienteId, activo: true })
      .exec();
    const list = await this.listModel
      .findOne({ _id: dto.listaPreciosId, activo: true })
      .exec();
    if (!client) throw new NotFoundException('Cliente inexistente o inactivo');
    if (!list)
      throw new NotFoundException('Lista de precios inexistente o inactiva');
    if (
      client.listaPreciosId &&
      client.listaPreciosId.toString() !== dto.listaPreciosId &&
      !normalizeUserRoles(actor.roles).includes(UserRole.JEFE)
    ) {
      throw new ConflictException(
        'Solo un dueño puede cambiar la lista asignada durante la venta',
      );
    }
    if (
      dto.medioPago === PaymentMethod.TRANSFER &&
      !dto.referenciaTransferencia?.trim()
    ) {
      throw new BadRequestException(
        'Ingresá una referencia para la transferencia o Mercado Pago',
      );
    }
    if (
      dto.medioPago === PaymentMethod.CREDIT &&
      !client.permiteCuentaCorriente
    ) {
      throw new BadRequestException(
        'El cliente no tiene cuenta corriente habilitada',
      );
    }
    if (dto.medioPago === PaymentMethod.CHECK && !dto.cheque) {
      throw new BadRequestException('Completá los datos del cheque');
    }
    if (dto.vendedorId) {
      const seller = await this.employeeModel.exists({
        _id: dto.vendedorId,
        activo: true,
        roles: UserRole.VENDEDOR,
      });
      if (!seller)
        throw new NotFoundException('Vendedor inexistente o inactivo');
    }

    const grouped = new Map<
      string,
      {
        cantidad: number;
        precioUnitarioCentavos?: number;
        bonificacionPuntosBase: number;
      }
    >();
    for (const item of dto.items) {
      const current = grouped.get(item.productoId);
      grouped.set(item.productoId, {
        cantidad: (current?.cantidad ?? 0) + item.cantidad,
        precioUnitarioCentavos:
          item.precioUnitarioCentavos ?? current?.precioUnitarioCentavos,
        bonificacionPuntosBase:
          item.bonificacionPuntosBase ?? current?.bonificacionPuntosBase ?? 0,
      });
    }
    const productIds = [...grouped.keys()];
    const products = await this.productModel
      .find({ _id: { $in: productIds }, activo: true })
      .populate('proveedorId', 'nombre')
      .exec();
    const prices = await this.priceItemModel
      .find({ listaId: list._id, productoId: { $in: productIds } })
      .exec();
    if (products.length !== productIds.length)
      throw new NotFoundException(
        'Uno o más productos no existen o están inactivos',
      );
    const priceByProduct = new Map(
      prices.map((price) => [
        price.productoId.toString(),
        price.precioCentavos,
      ]),
    );
    const items: SaleItem[] = products.map((product) => {
      const requested = grouped.get(product._id.toString())!;
      const listPrice = priceByProduct.get(product._id.toString());
      if (listPrice === undefined)
        throw new ConflictException(
          `${product.nombre} no tiene precio en ${list.nombre}`,
        );
      const unitPrice = requested.precioUnitarioCentavos ?? listPrice;
      if (
        unitPrice !== listPrice &&
        !normalizeUserRoles(actor.roles).includes(UserRole.JEFE)
      )
        throw new ConflictException(
          'Solo un dueño puede modificar precios durante una venta',
        );
      // El precio de lista es neto. Primero se aplica el descuento y luego el IVA del producto.
      const subtotalNeto = unitPrice * requested.cantidad;
      const neto = Math.round(
        (subtotalNeto * (10000 - requested.bonificacionPuntosBase)) / 10000,
      );
      const iva = Math.round((neto * Number(product.alicuotaIva)) / 100);
      const total = neto + iva;
      const supplier = product.proveedorId as unknown as {
        _id: Types.ObjectId;
        nombre: string;
      } | null;
      return {
        productoId: product._id,
        productoCodigo: product.codigo,
        productoNombre: product.nombre,
        cantidad: requested.cantidad,
        precioUnitarioCentavos: unitPrice,
        bonificacionPuntosBase: requested.bonificacionPuntosBase,
        alicuotaIva: product.alicuotaIva,
        netoCentavos: neto,
        ivaCentavos: iva,
        costoUnitarioCentavos: product.costoCentavos,
        proveedorId: supplier?._id ?? null,
        proveedorNombre: supplier?.nombre ?? '',
        totalCentavos: total,
      } as SaleItem;
    });
    const netoCentavos = items.reduce(
      (sum, item) => sum + item.netoCentavos,
      0,
    );
    const ivaCentavos = items.reduce((sum, item) => sum + item.ivaCentavos, 0);
    const costoCentavos = items.reduce(
      (sum, item) => sum + item.costoUnitarioCentavos * item.cantidad,
      0,
    );
    const totalCentavos = items.reduce(
      (sum, item) => sum + item.totalCentavos,
      0,
    );
    const sale = await this.saleModel.create({
      codigo: await this.nextCode(),
      clienteId: client._id,
      clienteCodigo: client.codigo,
      clienteNombre: client.nombre,
      vendedorId: dto.vendedorId
        ? new Types.ObjectId(dto.vendedorId)
        : client.vendedorId,
      listaPreciosId: list._id,
      listaPreciosNombre: list.nombre,
      items,
      netoCentavos,
      ivaCentavos,
      costoCentavos,
      totalCentavos,
      medioPago: dto.medioPago,
      referenciaTransferencia: dto.referenciaTransferencia?.trim() ?? '',
      chequeId: null,
      chequeNumero: '',
      chequeCobradoAt: null,
      observaciones: dto.observaciones?.trim() ?? '',
      actorId: actor.id,
      actorName: actor.name,
      estado: SaleStatus.PROCESSING,
      estadoFiscal: FiscalStatus.PENDING_EXTERNAL,
    });

    // Venta, consumo FIFO, deuda, cheque e ingreso se confirman juntos.
    const decremented: Array<{
      product: ProductDocument;
      previous: number;
      quantity: number;
      consumptions: LotConsumption[];
    }> = [];
    let creditReserved = false;
    let createdCheck: BankCheckDocument | null = null;
    {
      if (dto.medioPago === PaymentMethod.CHECK && dto.cheque) {
        if (dto.cheque.montoCentavos !== totalCentavos) {
          throw new BadRequestException(
            'El monto del cheque debe coincidir con el total de la venta',
          );
        }
        createdCheck = await this.checksService.createForSale(
          { ...dto.cheque, clienteId: client._id.toString() },
          { id: actor.id, name: actor.name },
          client,
          sale,
        );
        sale.chequeId = createdCheck._id;
        sale.chequeNumero = createdCheck.numero;
      }
      if (dto.medioPago === PaymentMethod.CREDIT) {
        const updatedClient = await this.clientModel
          .findOneAndUpdate(
            {
              _id: client._id,
              activo: true,
              permiteCuentaCorriente: true,
              $expr: {
                $lte: [
                  {
                    $add: [
                      { $ifNull: ['$saldoCuentaCorrienteCentavos', 0] },
                      totalCentavos,
                    ],
                  },
                  '$limiteCreditoCentavos',
                ],
              },
            },
            {
              $inc: { saldoCuentaCorrienteCentavos: totalCentavos },
              $push: {
                historialCambios: {
                  actorId: actor.id,
                  actorName: actor.name,
                  action: 'CREDIT_SALE',
                  detail: `Venta #${sale.codigo} a crédito por ${totalCentavos} centavos`,
                  date: new Date(),
                },
              },
            },
            { new: true },
          )
          .exec();
        if (!updatedClient) {
          throw new ConflictException(
            'La venta supera el crédito disponible del cliente',
          );
        }
        creditReserved = true;
      }
      for (const item of items) {
        const product = await this.productModel
          .findOneAndUpdate(
            {
              _id: item.productoId,
              activo: true,
              cantidadStock: { $gte: item.cantidad },
            },
            { $inc: { cantidadStock: -item.cantidad } },
            { new: true },
          )
          .exec();
        if (!product)
          throw new ConflictException(
            `Stock insuficiente para ${item.productoNombre}`,
          );
        const fifo = await this.inventoryLots.consumeFifo(
          product._id,
          item.cantidad,
          item.costoUnitarioCentavos,
          product.cantidadStock + item.cantidad,
        );
        item.costoUnitarioCentavos = fifo.averageUnitCostCents;
        item.costoTotalCentavos = fifo.totalCostCents;
        item.lotesConsumidos = fifo.consumptions;
        product.costoCentavos = fifo.remainingAverageCostCents;
        await product.save();
        decremented.push({
          product,
          previous: product.cantidadStock + item.cantidad,
          quantity: item.cantidad,
          consumptions: fifo.consumptions,
        });
      }
      sale.items = items;
      sale.costoCentavos = items.reduce(
        (sum, item) =>
          sum +
          (item.costoTotalCentavos ??
            item.costoUnitarioCentavos * item.cantidad),
        0,
      );
      await this.movementModel.insertMany(
        decremented.map(({ product, previous }) => ({
          productId: product._id,
          productCode: product.codigo,
          productName: product.nombre,
          type: StockMovementType.DECREMENT,
          previousStock: previous,
          currentStock: product.cantidadStock,
          currentAverageCostCents: product.costoCentavos,
          reason: `Venta #${sale.codigo}`,
          referenceType: 'SALE',
          referenceId: sale._id,
          referenceCode: sale.codigo,
          actorId: actor.id,
          actorName: actor.name,
        })),
      );
      sale.estado = SaleStatus.CONFIRMED;
      const confirmedSale = await sale.save();
      await this.financeService.recordSale(confirmedSale);
      return confirmedSale;
    }
  }

  private async nextCode(): Promise<number> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { key: 'saleCode' },
        { $inc: { value: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!counter) throw new Error('No se pudo generar el número de venta');
    return counter.value;
  }
}
