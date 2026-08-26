# Prioridades actualizadas

Última actualización: 21 de agosto de 2026.

## Decisiones confirmadas en la visita

- El circuito prioritario es producto -> lista de precios -> cliente -> venta -> cobro.
- La factura fiscal no se genera en este sistema: el contador la confecciona directamente en ARCA.
- Alícuotas utilizadas: 21%, 10,5% y 0%.
- Una venta usa un único medio de pago: efectivo o transferencia/Mercado Pago.
- No se permite confirmar una venta sin stock suficiente.
- El stock se descuenta al confirmar la venta.
- Solamente un jefe puede reemplazar el precio de lista durante una venta.
- Existe una computadora principal de venta y otra computadora utilizada habitualmente por el jefe.

## Implementación comercial iniciada

- Productos ampliados con costo en centavos y alícuota de IVA.
- Clientes ampliados con lista de precios, permiso de cuenta corriente y límite de crédito.
- Entidades de listas de precios y precios por producto.
- Venta interna con renglones, bonificación, pago único, control de permisos y descuento de stock.
- Registro de ingresos en efectivo y transferencias/Mercado Pago.
- Estado fiscal `PENDIENTE_CONTADOR` para distinguir la venta interna de la factura de ARCA.

Pendiente de validar: si los precios de lista incluyen IVA, política real de cuenta corriente,
anulaciones/devoluciones, comprobante impreso, cierres de caja y numeración externa del contador.

## Base funcional terminada

- Autenticación, sesión y aviso de cuenta desactivada.
- Gestión de empleados, roles y restricciones entre jefes.
- Gestión de productos y stock: altas, edición, bajas, reactivación, proveedores,
  stock mínimo, ajustes e historial paginado.
- Gestión de proveedores como entidades.
- Gestión de clientes: filtros, vendedor asignado, datos fiscales básicos e
  historial paginado.
- Vista de vendedores con sus clientes asignados.
- Informes operativos de productos, stock, clientes, vendedores y proveedores.
- Separación visual entre informes operativos e informes financieros.
- Diseño responsive y componentes reutilizables para modales, confirmaciones,
  desplegables buscables y paginación.
- Inicio convertido en un mapa operativo neutral y responsive.
- Motivos obligatorios para ajustes masivos de stock, con observación opcional.
- Lista de reposición por proveedor para productos sin stock o con stock bajo.
- Exportación CSV de stock, reposición, movimientos, clientes y proveedores.

## Orden recomendado para continuar

### 1. Estabilizar lo construido

- Ejecutar el checklist manual completo con cada rol.
- Agregar tests automatizados puntuales para permisos, altas/bajas, ajustes de
  stock y relaciones producto-proveedor y cliente-vendedor.
- Revisar estados vacíos, errores de API, navegación por teclado y celulares.
- Corregir advertencias de presupuesto SCSS sin rediseñar las pantallas.

**A qué se refiere:** comprobar que lo terminado funciona con distintos usuarios,
datos y tamaños de pantalla antes de agregar módulos.

**Ejemplo:** un empleado de stock puede ajustar cantidades, pero no administrar
empleados ni acceder a información financiera.

**Preguntas:**

- ¿Qué puede ver cada rol?
- ¿Qué puede modificar cada rol?
- ¿Qué acciones requieren confirmación?
- ¿Qué errores deben avisarse al jefe?

### 2. Normalizar datos maestros

- Definir si tipos de producto, grupos de clientes y localidades seguirán
  admitiendo texto libre o pasarán a ser entidades administrables.
- Evitar duplicados por mayúsculas, tildes o pequeñas diferencias de escritura.
- Definir unidades adicionales solamente si el negocio realmente las utiliza.

**A qué se refiere:** evitar que un mismo dato se escriba de varias formas y
termine duplicado en filtros e informes.

**Ejemplo:** impedir que existan al mismo tiempo `Lanús`, `Lanus` y `lanús` como
tres localidades diferentes.

**Preguntas:**

- ¿Los tipos se pueden crear libremente?
- ¿Quién administra los tipos?
- ¿Los grupos de clientes son fijos?
- ¿Las localidades deben ser una lista?
- ¿Se usan unidades aparte de kg y g?

### 3. Completar el circuito operativo de stock

- Validar con usuarios reales los motivos implementados para ajustes masivos.
- Probar quién prepara y utiliza el listado de reposición por proveedor.
- Definir si existe una sola ubicación o stock separado por depósito/local.
- Confirmar si se necesitan inventarios físicos y correcciones masivas.

**A qué se refiere:** definir cómo se controla el stock real, no solamente cómo
se suma o resta una unidad en pantalla.

**Ejemplo:** registrar que se descontaron 15 unidades por una venta o que se
agregaron 30 por una entrega del proveedor.

**Preguntas:**

- ¿Por qué motivos cambia el stock?
- ¿Debe escribirse un motivo?
- ¿Quién puede corregir cantidades?
- ¿Hay más de un depósito?
- ¿Se transfiere stock entre lugares?
- ¿Cómo se realiza un inventario?
- ¿Qué significa stock bajo?
- ¿Quién recibe el aviso de reposición?

### 4. Validar Clientes, Vendedores y Proveedores con datos reales

- Confirmar campos obligatorios y terminología con el cliente.
- Probar búsquedas con un volumen parecido al real.
- Definir importación inicial desde Excel/CSV para evitar carga manual masiva.
- Confirmar la reasignación de clientes cuando un vendedor se desactiva.

**A qué se refiere:** confirmar que los campos y relaciones actuales coinciden
con la forma real de trabajar de la distribuidora.

**Ejemplo:** decidir si un cliente puede tener un único vendedor o cambiar de
vendedor conservando el historial anterior.

**Preguntas:**

- ¿Qué datos del cliente son obligatorios?
- ¿Un cliente puede tener varias direcciones?
- ¿Un cliente puede tener varios teléfonos?
- ¿Un cliente tiene un solo vendedor?
- ¿Qué pasa si el vendedor se desactiva?
- ¿Qué grupos de clientes existen?
- ¿Qué datos del proveedor son obligatorios?
- ¿Un producto puede tener varios proveedores?
- ¿Hay clientes o proveedores repetidos?
- ¿Los datos actuales están en Excel?

### 5. Relevar presencialmente el sistema anterior

- Documentar paso a paso comprobantes, precios, ventas, compras, cuenta
  corriente, cobranzas, caja, cheques, IVA y facturación electrónica.
- Registrar permisos, validaciones, numeraciones, cierres y reportes utilizados.
- Convertir teclas F1/F2/F3 en botones o acciones visibles en los nuevos flujos.
- Obtener ejemplos anonimizados de comprobantes y reportes reales.

**A qué se refiere:** observar el trabajo cotidiano completo antes de diseñar
módulos que manejan dinero, impuestos o documentos fiscales.

**Ejemplo:** seguir una venta desde que se carga el pedido hasta que se cobra,
se descuenta el stock y se emite el comprobante.

**Preguntas:**

- ¿Quién inicia cada operación?
- ¿Qué datos se ingresan?
- ¿Qué controles hace el sistema?
- ¿Qué documento se genera?
- ¿Quién puede anularlo?
- ¿Qué teclas rápidas usan?
- ¿Qué pasos generan demoras?
- ¿Qué errores son frecuentes?
- ¿Qué reportes usan diariamente?

### 6. Implementar el siguiente módulo validado

Después de la visita, elegir un solo circuito completo. La opción recomendada
es empezar por **precios y costos** si sus reglas resultan simples; si afecta
impuestos, comprobantes o caja, comenzar antes por el maestro necesario y no
por una versión parcial del circuito financiero.

**A qué se refiere:** construir un flujo completo por vez y no varias pantallas
incompletas que después deban rehacerse.

**Ejemplo:** si se elige Precios, completar costo, precio de venta, listas,
vigencia, permisos e historial antes de comenzar Caja.

**Preguntas:**

- ¿Cuál es el problema más urgente?
- ¿Qué módulo usan más veces al día?
- ¿Qué módulo puede funcionar solo?
- ¿Qué resultado define que está terminado?

### 7. Preparar la entrega

- Importación y respaldo inicial de datos.
- Configuración segura de variables de entorno y secretos.
- Deploy de prueba, recuperación ante fallos y registro de errores.
- Manual breve de uso y capacitación con los usuarios reales.

**A qué se refiere:** preparar el sistema para uso diario y recuperación ante
errores, no solamente para ejecutarlo en la computadora de desarrollo.

**Ejemplo:** poder restaurar la base de datos si se elimina información por
accidente o falla el equipo principal.

**Preguntas:**

- ¿En qué equipos se usará?
- ¿Cuántos usuarios simultáneos habrá?
- ¿Hay internet estable?
- ¿Quién administrará las cuentas?
- ¿Cada cuánto se hará respaldo?
- ¿Quién recibirá soporte?
- ¿Se necesita capacitación impresa?

## Módulos bloqueados hasta validar reglas

No implementar todavía cálculos o movimientos reales de:

- ventas, compras e importes;
- cuenta corriente y cobranzas;
- caja diaria y cierres;
- cheques;
- IVA, impresora fiscal y facturación electrónica;
- estadísticas financieras.

Las pantallas pueden mantenerse identificadas en la navegación, pero no deben
mostrar cifras simuladas ni ejecutar operaciones contables hasta completar el
relevamiento presencial.

## Preguntas breves para el relevamiento completo

No es necesario responder todo de memoria. Conviene hacer estas preguntas
mientras se observa una operación real y anotar ejemplos.

### Negocio y usuarios

- ¿Cuántas personas usan el sistema?
- ¿Qué tarea cumple cada persona?
- ¿Trabajan al mismo tiempo?
- ¿Qué información es confidencial?
- ¿Quién autoriza cambios importantes?
- ¿Necesitan ver quién hizo cada cambio?

### Productos y stock

- ¿Cómo identifican un producto?
- ¿Usan código de barras?
- ¿Qué unidades manejan?
- ¿Un producto tiene presentaciones?
- ¿Manejan lotes?
- ¿Manejan vencimientos?
- ¿Hay productos equivalentes?
- ¿Hay varios depósitos?
- ¿Se permite stock negativo?
- ¿Cómo registran roturas o pérdidas?
- ¿Cómo registran devoluciones?
- ¿Cómo deciden qué reponer?

### Clientes

- ¿Cuál es el dato identificador?
- ¿El CUIT es obligatorio?
- ¿Usan nombre comercial?
- ¿Guardan condición de IVA?
- ¿Guardan límite de crédito?
- ¿Guardan días de pago?
- ¿Usan listas de precios?
- ¿Un cliente tiene sucursales?
- ¿Quién puede darlo de baja?

### Vendedores

- ¿Cómo asignan los clientes?
- ¿Pueden compartir un cliente?
- ¿Cobran comisión?
- ¿Cómo calculan la comisión?
- ¿La comisión cambia por producto?
- ¿Qué pasa al cambiar de vendedor?

### Proveedores y compras

- ¿Cómo identifican al proveedor?
- ¿Qué productos vende cada uno?
- ¿Guardan códigos del proveedor?
- ¿Comparan costos?
- ¿Registran pedidos de compra?
- ¿Registran entregas parciales?
- ¿Cómo ingresan una factura?
- ¿Una compra aumenta stock automáticamente?
- ¿Cómo registran devoluciones?

### Precios y costos

- ¿Cuántas listas de precios existen?
- ¿Qué cliente usa cada lista?
- ¿El precio incluye IVA?
- ¿Cómo actualizan los costos?
- ¿Usan porcentajes de ganancia?
- ¿Redondean los precios?
- ¿Programan precios futuros?
- ¿Guardan historial de precios?
- ¿Quién puede cambiar precios?

### Ventas y comprobantes

- ¿Primero cargan pedido o factura?
- ¿Quién carga la venta?
- ¿Se reserva stock al pedir?
- ¿Cuándo se descuenta el stock?
- ¿Se permiten ventas sin stock?
- ¿Se permiten entregas parciales?
- ¿Qué comprobantes emiten?
- ¿Cómo anulan una venta?
- ¿Cómo registran una devolución?
- ¿Imprimen remitos?
- ¿Envían comprobantes por email?

### Cuenta corriente y cobranzas

- ¿Qué clientes usan cuenta corriente?
- ¿Cómo se calcula el saldo?
- ¿Registran vencimientos?
- ¿Se permiten pagos parciales?
- ¿Qué medios de pago aceptan?
- ¿Quién registra una cobranza?
- ¿Entregan recibo?
- ¿Cómo imputan un pago?
- ¿Cómo corrigen un pago equivocado?
- ¿Necesitan resumen por cliente?

### Caja

- ¿Cuántas cajas existen?
- ¿Quién abre la caja?
- ¿Quién la cierra?
- ¿Se registra saldo inicial?
- ¿Qué ingresos no son ventas?
- ¿Qué egresos se registran?
- ¿Se separan los medios de pago?
- ¿Cómo controlan diferencias?
- ¿Se puede reabrir un cierre?
- ¿Quién autoriza correcciones?

### Cheques

- ¿Registran cheques recibidos?
- ¿Registran cheques emitidos?
- ¿Qué datos guardan?
- ¿Usan cheques de terceros?
- ¿Cómo cambian de estado?
- ¿Controlan vencimientos?
- ¿Registran depósitos?
- ¿Cómo manejan rechazos?
- ¿Necesitan alertas?

### IVA y facturación electrónica

- ¿Qué tipos de factura usan?
- ¿Qué puntos de venta existen?
- ¿Quién factura actualmente?
- ¿Usan certificado de ARCA?
- ¿Dónde guardan los certificados?
- ¿Qué alícuotas utilizan?
- ¿Hay productos exentos?
- ¿Emiten notas de crédito?
- ¿Emiten notas de débito?
- ¿Qué libros de IVA necesitan?
- ¿Exportan datos al contador?

### Informes

- ¿Qué miran todos los días?
- ¿Qué miran cada mes?
- ¿Qué comparaciones necesitan?
- ¿Qué filtros usan?
- ¿Necesitan exportar a Excel?
- ¿Necesitan imprimir?
- ¿Quién puede ver importes?
- ¿Qué alertas necesitan?

### Datos existentes y migración

- ¿Qué información debe conservarse?
- ¿En qué formato está?
- ¿Cuántos registros hay?
- ¿Hay datos duplicados?
- ¿Hay datos incompletos?
- ¿Se necesita todo el historial?
- ¿Quién validará la importación?
- ¿Cuándo se dejará el sistema anterior?

### Equipos e infraestructura

- ¿Qué computadoras utilizan?
- ¿Qué celulares utilizan?
- ¿Qué navegadores utilizan?
- ¿Qué impresoras utilizan?
- ¿Usan lectores de códigos?
- ¿La red interna es estable?
- ¿Pueden trabajar sin internet?
- ¿Quién puede instalar programas?
