# Mapa funcional — Panadería Mayorista

## A. Autenticación y roles

- Login con cuenta por empleado (~10 usuarios)
- Roles: **Jefe**, **Vendedor**, **Empleado Galpón**, **Empleado Stock**, **Administrativo**
- Restricciones por rol (ej: galpón sin acceso a lista de precios)
- Guards en Angular + validación de rol en backend

## B. Usuarios / Empleados

- ABM de empleados
- Asignación de rol
- Relación vendedor ↔ clientes

## C. Clientes

- ABM clientes
- Cuenta corriente (saldo, historial)
- Vendedor asignado

## D. Proveedores

- ABM proveedores
- Historial de compras

## E. Productos y stock

- ABM productos: costo, precio venta, código de barras
- Movimientos ingreso/egreso con comprobante
- Stock por ubicación (galpón vs punto de venta)
- Transferencias entre ubicaciones
- Alta de stock

## F. Ventas

- Registro vinculado a vendedor + cliente
- Comisión de ventas
- Comprobante con IVA

## G. Caja diaria

- Apertura/cierre de caja
- Ingresos y egresos
- Conciliación contra ventas

## H. Cheques

- Ingreso de cheques recibidos
- Estados: pendiente, depositado, cobrado, rechazado
- Fecha de vencimiento

## I. Estadísticas (rol Jefe)

- Ventas por día/semana/mes/período
- Por vendedor, cliente, producto
- Comisiones a pagar
- Cuentas corrientes
- Stock y movimientos
- Rentabilidad (costo vs venta)

## J. Código de barras (fase 2)

- Escaneo para venta y control de stock
- Lector USB funciona como teclado (sin librería extra)

## Tecnologías complementarias (fuera del stack base)

| Necesidad | Tecnología sugerida |
|-----------|---------------------|
| PDFs / comprobantes | pdf-lib o PDFKit en Nest |
| Facturación AFIP | Integración WSFEv1 (confirmar con cliente) |
| Impresión térmica | Impresora de red o agente local ESC/POS |
| Storage imágenes | Supabase Storage |
| Realtime stock | Supabase Realtime |
| Email alertas | Resend |
| Monitoreo errores | Sentry |
| Tests e2e | Playwright |
