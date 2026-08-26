import { Model, Types } from 'mongoose';
import { StockMovementType } from './enums/stock-movement-type.enum';
import { WeightUnit } from './enums/weight-unit.enum';
import { CounterDocument } from './schemas/counter.schema';
import { ProductDocument } from './schemas/product.schema';
import {
  StockMovementDocument,
  StockMovementSchema,
} from './schemas/stock-movement.schema';
import { StockService } from './stock.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { StockAdjustmentReason } from './enums/stock-adjustment-reason.enum';

describe('StockService', () => {
  let findOneAndUpdate: jest.Mock;
  let findById: jest.Mock;
  let createMovement: jest.Mock;
  let service: StockService;
  const actor = { id: new Types.ObjectId().toString(), name: 'Administrador' };

  beforeEach(() => {
    findOneAndUpdate = jest.fn();
    findById = jest.fn();
    const productModel = {
      findOneAndUpdate,
      findById,
    } as unknown as Model<ProductDocument>;
    const counterModel = {} as Model<CounterDocument>;
    createMovement = jest.fn().mockResolvedValue({});
    const movementModel = {
      create: createMovement,
    } as unknown as Model<StockMovementDocument>;
    const suppliersService = {
      assertActive: jest.fn().mockResolvedValue(null),
    } as unknown as SuppliersService;
    service = new StockService(productModel, counterModel, movementModel, suppliersService);
  });

  it('declara productId como ObjectId para convertir los IDs recibidos por URL', () => {
    expect(StockMovementSchema.path('productId').instance).toBe('ObjectId');
  });

  it('resta una unidad de forma atómica sin permitir cantidades negativas', async () => {
    const product = createProduct(4);
    const exec = jest.fn().mockResolvedValue(product);
    findOneAndUpdate.mockReturnValue({ exec });

    await expect(
      service.adjustStock(product._id.toString(), { delta: -1 }, actor),
    ).resolves.toEqual({
      product,
      previousStock: 5,
    });
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: product._id.toString(), activo: true, cantidadStock: { $gte: 1 } },
      { $inc: { cantidadStock: -1 } },
      { new: true, runValidators: true },
    );
    expect(createMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        type: StockMovementType.DECREMENT,
        previousStock: 5,
        currentStock: 4,
        actorId: actor.id,
        actorName: actor.name,
      }),
    );
  });

  it('rechaza una resta cuando el stock ya está en cero', async () => {
    const product = createProduct(0);
    findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(product) });

    await expect(
      service.adjustStock(product._id.toString(), { delta: -1 }, actor),
    ).rejects.toMatchObject({
      response: { code: 'STOCK_ALREADY_ZERO' },
    });
  });

  it('permite sumar una unidad a un producto con stock cero', async () => {
    const product = createProduct(1);
    findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(product),
    });

    const result = await service.adjustStock(
      product._id.toString(),
      { delta: 1 },
      actor,
    );
    expect(result.previousStock).toBe(0);
    expect(result.product.cantidadStock).toBe(1);
  });

  it('registra el cambio de stock mínimo sin modificar la cantidad actual', async () => {
    const previousProduct = createProduct(8);
    const product = { ...previousProduct, stockMinimo: 4 } as ProductDocument;
    findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(previousProduct),
    });
    findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(product),
    });

    await service.update(
      product._id.toString(),
      {
        nombre: 'Harina 000',
        tipo: 'Harina',
        descripcionAdicional: 'Bolsa reforzada',
        stockMinimo: 4,
        peso: 25,
        unidadPeso: WeightUnit.KILOGRAM,
        proveedorId: undefined,
      },
      actor,
    );

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: product._id.toString(), activo: true },
      {
        $set: {
          nombre: 'Harina 000',
          tipo: 'Harina',
          descripcionAdicional: 'Bolsa reforzada',
          stockMinimo: 4,
          peso: 25,
          unidadPeso: WeightUnit.KILOGRAM,
          proveedorId: null,
        },
      },
      { new: true, runValidators: true },
    );
    expect(createMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        type: StockMovementType.MINIMUM_CHANGE,
        previousStock: 8,
        currentStock: 8,
        previousMinimumStock: 3,
        currentMinimumStock: 4,
        reason: 'Stock mínimo actualizado de 3 a 4 unidades',
      }),
    );
  });

  it('suma varias unidades desde edición y registra un solo movimiento', async () => {
    const product = createProduct(16);
    findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ ...product, cantidadStock: 1 }),
    });
    findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(product),
    });

    await service.update(
      product._id.toString(),
      {
        nombre: product.nombre,
        tipo: product.tipo,
        stockMinimo: product.stockMinimo,
        peso: product.peso,
        unidadPeso: WeightUnit.KILOGRAM,
        proveedorId: undefined,
        ajusteStock: 15,
        motivoAjuste: StockAdjustmentReason.PURCHASE_RECEIVED,
        observacionAjuste: 'Remito 145',
      },
      actor,
    );

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: product._id.toString(), activo: true },
      expect.objectContaining({ $inc: { cantidadStock: 15 } }),
      { new: true, runValidators: true },
    );
    expect(createMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        type: StockMovementType.INCREMENT,
        previousStock: 1,
        currentStock: 16,
        reason: 'Compra recibida: ingreso de 15 unidades — Remito 145',
      }),
    );
  });

  it('rechaza una resta masiva mayor al stock disponible', async () => {
    const product = createProduct(2);
    findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(product) });

    await expect(
      service.update(
        product._id.toString(),
        {
          nombre: product.nombre,
          tipo: product.tipo,
          stockMinimo: product.stockMinimo,
          peso: product.peso,
          unidadPeso: WeightUnit.KILOGRAM,
          ajusteStock: -10,
          motivoAjuste: StockAdjustmentReason.SALE_OR_DELIVERY,
        },
        actor,
      ),
    ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_STOCK' } });

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: product._id.toString(),
        activo: true,
        cantidadStock: { $gte: 10 },
      },
      expect.objectContaining({ $inc: { cantidadStock: -10 } }),
      { new: true, runValidators: true },
    );
  });

  it('rechaza un ajuste masivo sin motivo aunque el servicio se invoque directamente', async () => {
    const product = createProduct(5);

    await expect(
      service.update(
        product._id.toString(),
        {
          nombre: product.nombre,
          tipo: product.tipo,
          stockMinimo: product.stockMinimo,
          peso: product.peso,
          unidadPeso: WeightUnit.KILOGRAM,
          ajusteStock: 3,
        },
        actor,
      ),
    ).rejects.toMatchObject({ response: { code: 'ADJUSTMENT_REASON_REQUIRED' } });

    expect(findById).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  function createProduct(cantidadStock: number): ProductDocument {
    const product = {
      _id: new Types.ObjectId(),
      codigo: 1,
      nombre: 'Bolsa de harina',
      tipo: 'Harina',
      descripcionAdicional: 'Bolsa de 10 kg',
      cantidadStock,
      stockMinimo: 3,
      peso: 10,
      unidadPeso: 'kg',
      proveedorId: null,
      activo: true,
    } as ProductDocument;
    product.populate = jest.fn().mockResolvedValue(product) as ProductDocument['populate'];
    return product;
  }
});
