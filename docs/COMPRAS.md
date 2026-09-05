# Compras, lotes y costos — preview

## Circuito

1. Crear los proveedores y productos. Un producto puede vincular varios proveedores existentes; cada compra pertenece a uno.
2. Si ya existe mercadería física, usar **Valorar stock existente** antes de registrar nuevas compras. Distribuir exactamente las unidades sin valorar entre renglones con sus costos. No aumenta la cantidad física.
3. Registrar las compras nuevas: unidades, costo unitario final con IVA, proveedor y efectivo, transferencia o cuenta corriente. Comprobante, vencimiento y observaciones son opcionales.
4. El stock aumenta, se conservan los lotes y se registra el gasto. La cuenta corriente queda pendiente hasta pagar; se puede pagar una compra completa o toda la deuda del proveedor.
5. Las ventas consumen lotes FIFO. No generan un segundo gasto de reposición: el desembolso se registra desde Compras.

## Cálculo

Costo promedio = suma(unidades restantes de cada lote × costo unitario histórico) / unidades restantes.

Ejemplo: 25 a $100 + 50 a $150 + 25 a $180 = $14.500 / 100 = **$145 por unidad**.
Una venta de 30 consume primero 25 a $100 y después 5 a $150: costo de esa venta **$3.250**. Quedan 70 unidades por $11.250, promedio mostrado **$160,71**. Los cálculos monetarios se almacenan en centavos; los totales de venta conservan el costo FIFO exacto, no el promedio redondeado multiplicado.

Los cambios nuevos de costo no modifican compras ni ventas anteriores. Los ajustes manuales de devolución/corrección no crean deuda de compra; toman el costo promedio vigente.

## Cancelaciones e historial

- Requieren motivo. Solo se admiten si todos los lotes de la operación conservan sus unidades originales.
- Compra cancelada: revierte stock y movimiento financiero; permanece visible en gris.
- Valuación inicial cancelada: retira la valuación, conserva el stock físico y cancela su movimiento financiero.
- Precios y costos permite consultar **Desde / Hasta**, compras/valuaciones, movimientos con stock antes/después y cambios de precio de venta. Los lotes de la sección **Stock actual** son siempre actuales, no una reconstrucción a la fecha del filtro.
- No se inventa el historial anterior: los costos y precios históricos que nunca se registraron no se pueden reconstruir con certeza.
- La fecha de recepción ordena FIFO; la fecha de registro de movimientos conserva la auditoría. Los filtros de días usan Argentina (UTC−3).

## Infraestructura y verificación

Las operaciones relacionadas se ejecutan en transacciones MongoDB. Requieren replica set (incluido Atlas), no una instancia standalone. No se ejecutan migraciones destructivas ni limpieza de datos al desplegar.

Pruebas: `npm run build` y `npm test -- --runInBand` en backend; `npm run build` en frontend.
`node test/purchases-isolated.cjs` en backend prueba contra un replica set desechable **exclusivamente en localhost:27028**, usando una base nueva por ejecución. No lee `.env` ni usa la base del cliente. Cubre valuación, promedio, compras, pago total, cancelación, FIFO, rollback financiero, concurrencia y venta con snapshot de lotes.

Publicar primero en preview. No promover a producción sin aprobación. Un preview puede compartir la base productiva si así están configuradas sus variables: no cargar operaciones ficticias allí sin verificar el aislamiento.
