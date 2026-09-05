// Integration regression: requires a disposable local replica set on port 27028.
// Never reads .env or connects to the application's database. No destructive cleanup.
require('reflect-metadata');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  PurchasesService,
} = require('../dist/modules/purchases/purchases.service');
const {
  InventoryLotsService,
} = require('../dist/modules/purchases/inventory-lots.service');
async function main() {
  mongoose.set('transactionAsyncLocalStorage', true);
  const conn = await mongoose
    .createConnection(
      `mongodb://127.0.0.1:27028/kopan_test_${Date.now()}?replicaSet=kopanTest`,
    )
    .asPromise();
  try {
    const model = (name, path) =>
      conn.model(name, require('../dist/modules/' + path)[name + 'Schema']);
    const Purchase = model('Purchase', 'purchases/schemas/purchase.schema');
    const Lot = model('InventoryLot', 'purchases/schemas/inventory-lot.schema');
    const Product = model('Product', 'stock/schemas/product.schema');
    const Supplier = model('Supplier', 'suppliers/schemas/supplier.schema');
    const Counter = model('Counter', 'stock/schemas/counter.schema');
    const Movement = model(
      'StockMovement',
      'stock/schemas/stock-movement.schema',
    );
    const Finance = model(
      'FinancialMovement',
      'finance/schemas/financial-movement.schema',
    );
    await Promise.all(Object.values(conn.models).map((m) => m.init()));
    const inventory = new InventoryLotsService(Lot);
    const service = new PurchasesService(
      conn,
      Purchase,
      Lot,
      Product,
      Supplier,
      Counter,
      Movement,
      Finance,
      inventory,
    );
    const supplier = await Supplier.create({
      codigo: 1,
      nombre: 'Proveedor ficticio aislado',
    });
    const product = await Product.create({
      codigo: 1,
      nombre: 'Harina prueba aislada',
      tipo: 'Harina',
      peso: 1,
      unidadPeso: 'kg',
      cantidadStock: 100,
    });
    const actor = {
      id: new mongoose.Types.ObjectId().toString(),
      name: 'Prueba aislada',
    };
    const dto = (items, kind = 'COMPRA') => ({
      supplierId: supplier.id,
      kind,
      paymentMethod: 'CUENTA_CORRIENTE',
      items: items.map(([quantity, unitCostCents]) => ({
        productId: product.id,
        quantity,
        unitCostCents,
      })),
    });
    await assert.rejects(
      service.create(dto([[1, 10000]]), actor),
      /Primero valor/,
    );
    const opening = await service.create(
      dto(
        [
          [25, 10000],
          [50, 15000],
          [25, 18000],
        ],
        'STOCK_INICIAL',
      ),
      actor,
    );
    assert.equal(opening.totalCentavos, 1450000);
    assert.equal((await Product.findById(product.id)).cantidadStock, 100);
    assert.equal((await inventory.summary(product.id)).averageCostCents, 14500);
    const buy = await service.create(dto([[10, 20000]]), actor);
    assert.equal((await Product.findById(product.id)).cantidadStock, 110);
    assert.equal((await inventory.summary(product.id)).averageCostCents, 15000);
    assert.equal((await service.supplierAccounts())[0].deudaCentavos, 1650000);
    const paid = await service.paySupplierAccount(
      supplier.id,
      'TRANSFERENCIA',
      actor,
    );
    assert.equal(paid.paidPurchases, 2);
    assert.equal((await service.supplierAccounts()).length, 0);
    assert.equal(await Finance.countDocuments({ pagado: true }), 2);
    await service.cancel(buy.id, 'Compra de prueba cancelada', actor);
    assert.equal((await Product.findById(product.id)).cantidadStock, 100);
    assert.equal(
      (await Finance.findOne({ compraId: buy._id })).cancelado,
      true,
    );
    await assert.rejects(service.cancel(buy.id, 'Repetida', actor));
    await conn.transaction(async () => {
      const result = await inventory.consumeFifo(product._id, 30, 14500, 100);
      assert.equal(result.totalCostCents, 325000);
      assert.deepEqual(
        result.consumptions.map((c) => c.quantity),
        [25, 5],
      );
      await Product.updateOne(
        { _id: product._id },
        { cantidadStock: 70, costoCentavos: result.remainingAverageCostCents },
      );
    });
    await assert.rejects(
      service.cancel(opening.id, 'Lote consumido', actor),
      /vendieron/,
    );
    const before = await Product.findById(product.id).lean();
    const count = await Purchase.countDocuments();
    const originalCreate = Finance.create;
    Finance.create = async () => {
      throw new Error('Fallo financiero simulado');
    };
    await assert.rejects(service.create(dto([[2, 17000]]), actor), /simulado/);
    Finance.create = originalCreate;
    assert.equal(await Purchase.countDocuments(), count);
    assert.equal(
      (await Product.findById(product.id)).cantidadStock,
      before.cantidadStock,
    );
    assert.equal((await inventory.summary(product.id)).quantity, 70);
    const results = await Promise.allSettled([
      service.create(dto([[2, 17000]]), actor),
      service.create(dto([[3, 18000]]), actor),
    ]);
    assert.equal(
      results.filter((r) => r.status === 'fulfilled').length,
      2,
      JSON.stringify(results),
    );
    assert.equal((await Product.findById(product.id)).cantidadStock, 75);
    assert.equal((await inventory.summary(product.id)).quantity, 75);
    const Sale = model('Sale', 'sales/schemas/sale.schema');
    const Client = model('Client', 'clients/schemas/client.schema');
    const List = model('PriceList', 'prices/schemas/price-list.schema');
    const Price = model(
      'PriceListItem',
      'prices/schemas/price-list-item.schema',
    );
    await Promise.all([Sale, Client, List, Price].map((m) => m.init()));
    const client = await Client.create({
      codigo: 1,
      nombre: 'Cliente aislado',
    });
    const list = await List.create({ codigo: 1, nombre: 'Lista aislada' });
    await Price.create({
      listaId: list._id,
      productoId: product._id,
      precioCentavos: 25000,
      actorId: actor.id,
      actorName: actor.name,
    });
    const { SalesService } = require('../dist/modules/sales/sales.service');
    const financeStub = { recordSale: async () => undefined };
    const sales = new SalesService(
      conn,
      Sale,
      Client,
      {},
      Product,
      List,
      Price,
      Movement,
      Counter,
      {},
      financeStub,
      inventory,
    );
    const saleDto = {
      clienteId: client.id,
      listaPreciosId: list.id,
      medioPago: 'EFECTIVO',
      items: [{ productoId: product.id, cantidad: 2 }],
    };
    const sale = await sales.create(saleDto, { ...actor, roles: ['JEFE'] });
    assert.equal(sale.costoCentavos, 30000);
    assert.equal(sale.items[0].lotesConsumidos[0].quantity, 2);
    assert.equal((await Product.findById(product.id)).cantidadStock, 73);
    financeStub.recordSale = async () => {
      throw new Error('Ingreso fallido');
    };
    await assert.rejects(
      sales.create(saleDto, { ...actor, roles: ['JEFE'] }),
      /Ingreso fallido/,
    );
    assert.equal((await Product.findById(product.id)).cantidadStock, 73);
    assert.equal((await inventory.summary(product.id)).quantity, 73);
    assert.equal(await Sale.countDocuments(), 1);
    console.log('PASS: sale FIFO snapshot and sale rollback on failed income.');
    console.log(
      'PASS: initial valuation, weighted average, purchase, full debt payment, cancellation, FIFO, rollback and concurrent purchases.',
    );
  } finally {
    await conn.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
