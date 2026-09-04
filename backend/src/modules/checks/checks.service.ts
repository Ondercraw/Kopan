import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Client, ClientDocument } from '../clients/schemas/client.schema';
import { FinanceService } from '../finance/finance.service';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema';
import { Counter, CounterDocument } from '../stock/schemas/counter.schema';
import { SaveCheckDto } from './dto/save-check.dto';
import { CheckStatus } from './enums/check-status.enum';
import { BankCheck, BankCheckDocument } from './schemas/bank-check.schema';
import { amountInWords } from './utils/amount-in-words';
import { FinancialPaymentMethod } from '../finance/enums/financial-movement.enum';

interface CheckActor { id: string; name: string }

@Injectable()
export class ChecksService {
  constructor(
    @InjectModel(BankCheck.name) private readonly checkModel: Model<BankCheckDocument>,
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(Counter.name) private readonly counterModel: Model<CounterDocument>,
    private readonly financeService: FinanceService,
  ) {}

  async findAll() {
    const checks = await this.checkModel.find().sort({ estado: 1, fechaCobro: 1, createdAt: -1 }).limit(2000).exec();
    await Promise.all(
      checks
        .filter((check) => !check.ventaId && check.estado === CheckStatus.PENDING)
        .map((check) => this.financeService.recordPendingCheck({
          _id: check._id,
          numero: check.numero,
          montoCentavos: check.montoCentavos,
          clienteId: check.clienteId,
          clienteNombre: check.clienteNombre,
          actorId: check.actorId,
          actorName: check.actorName,
          createdAt: check.createdAt,
        })),
    );
    return checks;
  }

  async create(dto: SaveCheckDto, actor: CheckActor) {
    const client = dto.clienteId
      ? await this.clientModel.findOne({ _id: dto.clienteId, activo: true }).exec()
      : null;
    if (dto.clienteId && !client) throw new NotFoundException('Cliente inexistente o inactivo');
    return this.createDocument(dto, actor, client, null);
  }

  async createForSale(
    dto: SaveCheckDto,
    actor: CheckActor,
    client: ClientDocument,
    sale: SaleDocument,
  ) {
    return this.createDocument(dto, actor, client, sale);
  }

  async removeForFailedSale(id: Types.ObjectId): Promise<void> {
    await this.checkModel.deleteOne({ _id: id, estado: CheckStatus.PENDING }).exec();
  }

  async collect(
    id: string,
    destinoCobro: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER,
    actor: CheckActor,
  ) {
    const now = new Date();
    const pending = await this.checkModel.findOne({ _id: id, estado: CheckStatus.PENDING }).exec();
    if (pending?.diferido && pending.fechaCobro && pending.fechaCobro.getTime() > now.getTime()) {
      throw new BadRequestException('El cheque diferido todavía no alcanzó su fecha de cobro');
    }
    const check = await this.checkModel.findOneAndUpdate(
      { _id: id, estado: CheckStatus.PENDING },
      { $set: { estado: CheckStatus.COLLECTED, cobradoAt: now, destinoCobro } },
      { new: true },
    ).exec();
    if (!check) {
      const existing = await this.checkModel.findById(id).exec();
      if (!existing) throw new NotFoundException('Cheque no encontrado');
      throw new ConflictException('El cheque ya fue cobrado y no puede volver a modificarse');
    }
    try {
      if (check.ventaId) {
        await this.saleModel.updateOne(
          { _id: check.ventaId },
          { $set: { chequeCobradoAt: now } },
        ).exec();
      }
      await this.financeService.markCheckCollected({
        _id: check._id,
        numero: check.numero,
        montoCentavos: check.montoCentavos,
        clienteId: check.clienteId,
        clienteNombre: check.clienteNombre,
        ventaId: check.ventaId,
        ventaCodigo: check.ventaCodigo,
        actorId: actor.id,
        actorName: actor.name,
        cobradoAt: now,
        acreditadoEn: destinoCobro,
      });
      return check;
    } catch (error) {
      await this.checkModel.updateOne(
        { _id: check._id },
        { $set: { estado: CheckStatus.PENDING, cobradoAt: null, destinoCobro: null } },
      ).exec();
      if (check.ventaId) {
        await this.saleModel.updateOne({ _id: check.ventaId }, { $set: { chequeCobradoAt: null } }).exec();
      }
      throw error;
    }
  }

  async allocateCollected(
    id: string,
    destinoCobro: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER,
    actor: CheckActor,
  ) {
    const check = await this.checkModel.findOneAndUpdate(
      { _id: id, estado: CheckStatus.COLLECTED, destinoCobro: null },
      { $set: { destinoCobro } },
      { new: true },
    ).exec();
    if (!check) {
      const existing = await this.checkModel.findById(id).exec();
      if (!existing) throw new NotFoundException('Cheque no encontrado');
      throw new ConflictException('El destino del cheque ya fue asignado y no puede modificarse');
    }
    try {
      await this.financeService.allocateCollectedCheck(check._id, destinoCobro, actor);
      return check;
    } catch (error) {
      await this.checkModel.updateOne({ _id: check._id }, { $set: { destinoCobro: null } }).exec();
      throw error;
    }
  }

  private async createDocument(
    dto: SaveCheckDto,
    actor: CheckActor,
    client: ClientDocument | null,
    sale: SaleDocument | null,
  ) {
    const existing = await this.checkModel.exists({ numero: dto.numero.trim() });
    if (existing) throw new ConflictException('Ya existe un cheque con ese número');
    const check = await this.checkModel.create({
      codigo: await this.nextCode(),
      numero: dto.numero.trim(),
      banco: dto.banco.trim(),
      domicilioPago: dto.domicilioPago.trim(),
      titular: dto.titular.trim(),
      domicilioTitular: dto.domicilioTitular.trim(),
      libradorCuit: dto.libradorCuit.replace(/\D/g, ''),
      montoCentavos: dto.montoCentavos,
      montoLetras: amountInWords(dto.montoCentavos),
      fechaEmision: dto.fechaEmision ? new Date(`${dto.fechaEmision}T00:00:00-03:00`) : null,
      lugarEmision: dto.lugarEmision?.trim() ?? '',
      diferido: dto.diferido,
      fechaCobro: dto.diferido && dto.fechaCobro ? new Date(`${dto.fechaCobro}T00:00:00-03:00`) : null,
      estado: CheckStatus.PENDING,
      destinoCobro: null,
      clienteId: client?._id ?? null,
      clienteNombre: client?.nombre ?? '',
      ventaId: sale?._id ?? null,
      ventaCodigo: sale?.codigo ?? null,
      actorId: actor.id,
      actorName: actor.name,
    });
    if (!sale) {
      await this.financeService.recordPendingCheck({
        _id: check._id,
        numero: check.numero,
        montoCentavos: check.montoCentavos,
        clienteId: check.clienteId,
        clienteNombre: check.clienteNombre,
        actorId: check.actorId,
        actorName: check.actorName,
        createdAt: check.createdAt,
      });
    }
    return check;
  }

  private async nextCode(): Promise<number> {
    const counter = await this.counterModel.findOneAndUpdate(
      { key: 'checkCode' },
      { $inc: { value: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();
    if (!counter) throw new Error('No se pudo generar el número interno del cheque');
    return counter.value;
  }
}
