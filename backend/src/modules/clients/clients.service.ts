import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  Employee,
  EmployeeDocument,
} from '../employees/schemas/employee.schema';
import { Counter, CounterDocument } from '../stock/schemas/counter.schema';
import { SaveClientDto } from './dto/save-client.dto';
import {
  ClientCatalog,
  ClientCatalogDocument,
  ClientCatalogKind,
} from './schemas/client-catalog.schema';
import { Client, ClientDocument } from './schemas/client.schema';
import {
  PriceList,
  PriceListDocument,
} from '../prices/schemas/price-list.schema';

export interface ClientActor {
  id: string;
  name: string;
}

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client.name)
    private readonly clientModel: Model<ClientDocument>,
    @InjectModel(ClientCatalog.name)
    private readonly catalogModel: Model<ClientCatalogDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
    @InjectModel(PriceList.name)
    private readonly priceListModel: Model<PriceListDocument>,
  ) {}

  findAll(): Promise<Client[]> {
    return this.clientModel
      .find()
      .populate('vendedorId', 'nombre email activo')
      .populate('listaPreciosId', 'codigo nombre activo')
      .sort({ activo: -1, nombre: 1 })
      .exec();
  }

  async options() {
    const [groups, locations, sellers, priceLists] = await Promise.all([
      this.catalogModel
        .find({ kind: ClientCatalogKind.GROUP, activo: true })
        .sort({ nombre: 1 })
        .exec(),
      this.catalogModel
        .find({ kind: ClientCatalogKind.LOCATION, activo: true })
        .sort({ nombre: 1 })
        .exec(),
      this.employeeModel
        .find({ activo: true, roles: UserRole.VENDEDOR })
        .select('nombre email')
        .sort({ nombre: 1 })
        .exec(),
      this.priceListModel
        .find({ activo: true })
        .select('codigo nombre')
        .sort({ codigo: 1 })
        .exec(),
    ]);
    return {
      groups: groups.map((item) => item.nombre),
      locations: locations.map((item) => item.nombre),
      sellers,
      priceLists,
    };
  }

  async create(
    dto: SaveClientDto,
    actor: ClientActor,
  ): Promise<ClientDocument> {
    await this.validateSeller(dto.vendedorId);
    await this.validatePriceList(dto.listaPreciosId);
    const codigo = await this.nextCode();
    try {
      const client = await this.clientModel.create({
        codigo,
        ...this.normalized(dto),
        historialCambios: [this.change(actor, 'CREATED', 'Cliente creado')],
      });
      await this.saveCatalogs(client.grupo, client.localidad);
      return client.populate('vendedorId', 'nombre email activo');
    } catch (error: unknown) {
      if (this.isDuplicateKey(error))
        throw new ConflictException('Ya existe un cliente con ese CUIT');
      throw error;
    }
  }

  async update(
    id: string,
    dto: SaveClientDto,
    actor: ClientActor,
  ): Promise<ClientDocument> {
    await this.validateSeller(dto.vendedorId);
    await this.validatePriceList(dto.listaPreciosId);
    const current = await this.clientModel
      .findById(id)
      .select('saldoCuentaCorrienteCentavos')
      .exec();
    if (!current) throw new NotFoundException('Cliente no encontrado');
    const currentBalance = current.saldoCuentaCorrienteCentavos ?? 0;
    if (currentBalance > 0 && !dto.permiteCuentaCorriente) {
      throw new ConflictException(
        'No se puede deshabilitar la cuenta corriente mientras tenga saldo pendiente',
      );
    }
    if (
      dto.permiteCuentaCorriente &&
      dto.limiteCreditoCentavos < currentBalance
    ) {
      throw new ConflictException(
        'El límite de crédito no puede ser menor al saldo pendiente',
      );
    }
    try {
      const client = await this.clientModel
        .findByIdAndUpdate(
          id,
          {
            $set: this.normalized(dto),
            $push: {
              historialCambios: this.change(
                actor,
                'UPDATED',
                'Datos generales actualizados',
              ),
            },
          },
          { new: true, runValidators: true },
        )
        .populate('vendedorId', 'nombre email activo')
        .exec();
      if (!client) throw new NotFoundException('Cliente no encontrado');
      await this.saveCatalogs(client.grupo, client.localidad);
      return client;
    } catch (error: unknown) {
      if (this.isDuplicateKey(error))
        throw new ConflictException('Ya existe un cliente con ese CUIT');
      throw error;
    }
  }

  async setActive(
    id: string,
    activo: boolean,
    actor: ClientActor,
  ): Promise<ClientDocument> {
    const client = await this.clientModel
      .findByIdAndUpdate(
        id,
        {
          $set: { activo },
          $push: {
            historialCambios: this.change(
              actor,
              activo ? 'REACTIVATED' : 'DEACTIVATED',
              activo ? 'Cliente reactivado' : 'Cliente dado de baja',
            ),
          },
        },
        { new: true },
      )
      .populate('vendedorId', 'nombre email activo')
      .exec();
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  private normalized(dto: SaveClientDto) {
    return {
      nombre: dto.nombre.trim(),
      nombreFantasia: dto.nombreFantasia?.trim() ?? '',
      cuit: dto.cuit?.replace(/\D/g, '') ?? '',
      telefono: dto.telefono?.trim() ?? '',
      email: dto.email?.trim().toLowerCase() ?? '',
      direccion: dto.direccion?.trim() ?? '',
      localidad: dto.localidad?.trim() ?? '',
      grupo: dto.grupo?.trim() ?? '',
      vendedorId: dto.vendedorId ? new Types.ObjectId(dto.vendedorId) : null,
      condicionIva: dto.condicionIva,
      listaPreciosId: dto.listaPreciosId
        ? new Types.ObjectId(dto.listaPreciosId)
        : null,
      permiteCuentaCorriente: dto.permiteCuentaCorriente,
      limiteCreditoCentavos: dto.limiteCreditoCentavos,
      observaciones: dto.observaciones?.trim() ?? '',
    };
  }

  private change(actor: ClientActor, action: string, detail: string) {
    return {
      actorId: actor.id,
      actorName: actor.name,
      action,
      detail,
      date: new Date(),
    };
  }

  private async validateSeller(id?: string): Promise<void> {
    if (!id) return;
    const seller = await this.employeeModel.exists({
      _id: id,
      activo: true,
      roles: UserRole.VENDEDOR,
    });
    if (!seller)
      throw new NotFoundException(
        'El vendedor seleccionado no existe o está inactivo',
      );
  }

  private async validatePriceList(id?: string): Promise<void> {
    if (!id) return;
    const list = await this.priceListModel.exists({ _id: id, activo: true });
    if (!list)
      throw new NotFoundException(
        'La lista de precios seleccionada no existe o está inactiva',
      );
  }

  private async saveCatalogs(group: string, location: string): Promise<void> {
    const values: Array<[ClientCatalogKind, string]> = [
      [ClientCatalogKind.GROUP, group],
      [ClientCatalogKind.LOCATION, location],
    ];
    await Promise.all(
      values
        .filter(([, name]) => name)
        .map(([kind, name]) =>
          this.catalogModel
            .updateOne(
              { kind, normalizedName: this.normalize(name) },
              { $set: { nombre: name, activo: true } },
              { upsert: true },
            )
            .exec(),
        ),
    );
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private async nextCode(): Promise<number> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { key: 'clientCode' },
        { $inc: { value: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!counter) throw new Error('No se pudo generar el código del cliente');
    return counter.value;
  }

  private isDuplicateKey(error: unknown): error is { code: number } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    );
  }
}
