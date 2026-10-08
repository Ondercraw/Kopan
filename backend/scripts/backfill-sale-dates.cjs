// Uso: node scripts/backfill-sale-dates.cjs [--apply]
// Corrige sólo fechas comerciales de ventas ya editadas; conserva createdAt y cobros reales.
const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('Falta MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  const sales = await db.collection('sales').find({
    estado: 'CONFIRMADA', fechaFacturacion: { $type: 'date' },
  }).project({ codigo: 1, fechaFacturacion: 1 }).toArray();
  let movements = 0;
  let incomes = 0;
  for (const sale of sales) {
    const stockFilter = { referenceType: 'SALE', referenceId: sale._id,
      fechaOperacion: { $ne: sale.fechaFacturacion } };
    const incomeFilter = { sourceKey: `sale:${sale._id}:income`,
      fechaMovimiento: { $ne: sale.fechaFacturacion } };
    movements += await db.collection('stock_movements').countDocuments(stockFilter);
    incomes += await db.collection('financial_movements').countDocuments(incomeFilter);
    console.log(`Venta #${sale.codigo}: fecha ${sale.fechaFacturacion.toISOString().slice(0, 10)}`);
    if (process.argv.includes('--apply')) {
      await db.collection('stock_movements').updateMany(stockFilter,
        { $set: { fechaOperacion: sale.fechaFacturacion } });
      await db.collection('financial_movements').updateMany(incomeFilter,
        { $set: { fechaMovimiento: sale.fechaFacturacion } });
    }
  }
  console.log(`${process.argv.includes('--apply') ? 'Actualizados' : 'Por actualizar'}: ${movements} movimientos de stock, ${incomes} movimientos de venta.`);
  await mongoose.disconnect();
}

main().catch((error) => { console.error(error.message); process.exitCode = 1;
  void mongoose.disconnect(); });
