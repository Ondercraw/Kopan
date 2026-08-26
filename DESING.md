# Diseño del sistema de gestión de Distribuidora Kopan

> Documento vivo. Describe el producto y las decisiones vigentes al 21 de agosto de 2026.
> El nombre `DESING.md` se conserva por decisión del proyecto. Cuando una implementación
> cambie, este archivo y `docs/PRIORIDADES.md` deben actualizarse juntos.

## 1. Resumen

El proyecto reemplaza gradualmente un sistema de escritorio antiguo usado por una
distribuidora mayorista de productos de panadería. La nueva aplicación es web,
responsive y transforma las operaciones basadas en teclas F1/F2/F3 en botones,
formularios, desplegables buscables y acciones visibles.

El alcance funcional incluye autenticación, empleados, stock, proveedores, clientes,
vendedores, precios, venta interna e ingresos por efectivo o transferencia. La factura
fiscal se realiza externamente con el contador en ARCA y no se automatiza en esta etapa.

## 2. Problema que resuelve

- El sistema anterior ya no alcanza para el volumen y la forma actual de trabajo.
- Su navegación depende de teclas de función y convenciones difíciles de descubrir.
- La información operativa debe poder consultarse desde computadoras, tablets y celulares.
- El stock, sus responsables y sus cambios deben ser trazables.
- La migración debe ser gradual para no inventar reglas sobre caja, impuestos o facturación.

## 3. Objetivos

- Presentar operaciones claras y visibles, sin depender de atajos ocultos.
- Mantener datos maestros consistentes para productos, proveedores y clientes.
- Registrar quién hizo cada cambio relevante.
- Evitar stock negativo y señalar stock bajo o agotado.
- Respetar permisos por rol tanto en frontend como en backend.
- Funcionar correctamente en escritorio y dispositivos móviles.
- Permitir exportaciones operativas simples en CSV.
- Construir circuitos completos de a uno, después de validar las reglas reales.

## 4. No objetivos actuales

- No modelar producción ni recetas: Kopan opera como distribuidora mayorista.
- No implementar compras, cuenta corriente, cheques ni cierres formales de caja sin reglas validadas.
- No conectar impresora fiscal ni facturación electrónica de ARCA: el contador factura externamente.
- No mostrar indicadores financieros simulados en Inicio o Informes.
- No definir permisos finales de módulos que el cliente aún no asignó a cada rol.

## 5. Principios de producto

1. **Lo crítico se releva antes de programarse.** Dinero, impuestos y comprobantes no se improvisan.
2. **Una acción visible reemplaza una tecla memorizada.** Botones y menús explican qué ocurrirá.
3. **La baja es lógica.** Se conserva historial y relación; no se elimina información del negocio.
4. **La trazabilidad forma parte de la operación.** Stock y cambios importantes registran usuario y fecha.
5. **La interfaz explica el estado.** Vacío, cargando, error, stock bajo y sin stock tienen tratamientos distintos.
6. **La vista móvil es una adaptación real.** Las tablas se convierten en filas apiladas, no en una miniatura ilegible.
7. **Los datos visibles son reales.** No se inventan importes, ventas ni métricas para completar una pantalla.

## 6. Usuarios y roles actuales

- **Jefe:** administración general, empleados e informes. Un jefe no puede desactivar a otro jefe.
- **Administrativo:** rol existente; sus permisos finales todavía deben validarse.
- **Vendedor:** acceso operativo relacionado con clientes según las reglas actuales.
- **Empleado de stock:** puede gestionar cantidades y productos.
- **Empleado de galpón:** puede gestionar cantidades y productos.

Una persona puede tener más de un rol. El backend es la autoridad de seguridad; ocultar
un botón en Angular mejora la experiencia, pero no reemplaza la validación del servidor.

## 7. Alcance implementado

### Autenticación y sesión

- Inicio y cierre de sesión con cookie `httpOnly`.
- Recuperación de sesión al recargar mediante `/auth/me`.
- Guardia de autenticación y guardia por rol.
- Aviso específico mediante modal cuando una cuenta fue desactivada.
- Protección contra intentos repetidos, encabezados de seguridad y validación de entrada.

### Empleados

- Alta y edición.
- Uno o varios roles por empleado.
- Baja y reactivación lógica.
- Restricción que impide que jefes desactiven a otros jefes.
- Primer jefe creado externamente durante la preparación inicial; ya no se requiere bootstrap desde la UI.

### Proveedores

- Entidad propia con ID autoincremental.
- Nombre, CUIT, contacto, teléfono, email, dirección, localidad y observaciones.
- Alta, edición, baja y reactivación lógica.
- Búsqueda por nombre, CUIT o localidad y filtro de estado.
- Ordenamiento por proveedor, ID, CUIT, localidad, creación o actualización, en ambos sentidos.
- Detalle expandible.
- Exportación CSV de la vista filtrada.
- Solo proveedores activos pueden elegirse en productos nuevos o editados.

### Productos y stock

- ID numérico autoincremental y `_id` interno de MongoDB.
- Nombre, tipo, descripción adicional, cantidad, stock mínimo, peso y unidad (`kg` o `g`).
- Relación opcional con una entidad Proveedor; no se admite proveedor como texto libre.
- Alta, edición, baja múltiple y reactivación.
- Ajuste rápido de una unidad con botones `−` y `+`.
- Ajuste masivo desde edición mediante operación sumar/restar.
- Motivo obligatorio para ajustes masivos y observación opcional.
- Motivos: Compra recibida, Venta o entrega, Devolución, Rotura o pérdida,
  Corrección de inventario y Otro.
- El backend evita cantidades negativas con una actualización atómica.
- El cambio de cantidad y el cambio de stock mínimo generan movimientos independientes.
- Historial por producto, paginado de cinco movimientos, con total y exportación CSV.
- Actualización automática y silenciosa cada 10 segundos de productos, bajas y del historial abierto.
- El refresco automático se omite mientras exista un ajuste local pendiente para no pisar su respuesta.
- Fondo rojo para productos sin stock y ámbar para stock bajo.
- Stock bajo significa `cantidad > 0`, `stockMinimo > 0` y `cantidad <= stockMinimo`.
- Lista de reposición agrupada por proveedor, incluyendo un grupo sin proveedor.
- Cálculo informativo de unidades faltantes para alcanzar el mínimo.
- Exportación CSV del stock filtrado y de la lista de reposición.
- Búsqueda por nombre; filtros de proveedor, tipo y peso; ordenamientos ascendentes y descendentes.
- Orden inicial por menor cantidad disponible.
- Filas expandibles con detalle completo y diseño responsive.

### Clientes

- ID autoincremental, razón social, nombre de fantasía, CUIT/documento, contacto y dirección.
- Localidad, grupo, condición frente al IVA y observaciones.
- Relación opcional con un vendedor.
- Alta, edición, baja y reactivación lógica.
- Búsqueda, filtros por grupo, localidad, vendedor y estado, más ordenamiento.
- Historial de cambios paginado de cinco en cinco.
- Exportación CSV de la vista filtrada.

### Vendedores

- Se apoyan en empleados con rol de vendedor.
- Al seleccionar un vendedor se despliegan sus clientes asignados.
- La regla definitiva de reasignación al desactivar un vendedor sigue pendiente.

### Informes

- **Informes operativos:** productos, vendedores, proveedores y otros datos no financieros ya disponibles.
- **Informes financieros:** sección visualmente separada y restringida al jefe; no calcula cifras hasta el relevamiento.

### Inicio

- Centro operativo con identidad de Kopan.
- Mapa Proveedores → Stock → Clientes y accesos a Vendedores, Informes y Empleados según permisos.
- Comunica claramente qué circuitos están pendientes sin presentar números ficticios.

## 8. Navegación

Rutas operativas:

- `/`: centro operativo.
- `/stock`: productos, cantidades, movimientos y reposición.
- `/clientes`: maestro de clientes.
- `/vendedores`: vendedores y clientes asignados.
- `/proveedores`: maestro de proveedores.
- `/empleados`: gestión de usuarios, restringida al jefe.
- `/informes-operativos`: información no financiera, restringida al jefe.
- `/informes-financieros`: separación preparada, sin cálculos reales.

Rutas reservadas mediante pantalla identificatoria:

- `/comprobantes`, `/precios`, `/iva`, `/cheques`, `/caja`,
  `/impresora-fiscal` y `/facturacion-electronica`.

La barra lateral se adapta a móvil con menú superpuesto y muestra solamente los accesos
permitidos por los roles conocidos.

## 9. Arquitectura

```text
Navegador
  └─ Angular 22 (componentes standalone, signals, formularios reactivos)
       └─ HTTP JSON + cookie de sesión
            └─ NestJS 11 (módulos, DTO, guards y servicios)
                 └─ Mongoose 9
                      └─ MongoDB Atlas
```

### Frontend

- Angular 22, TypeScript 6, RxJS y componentes standalone.
- Estado local con `signal` y datos derivados con `computed`.
- Formularios reactivos para altas y ediciones.
- Carga diferida por ruta para páginas funcionales.
- Tabler Icons para iconografía.
- Servicios por dominio para llamadas HTTP.
- Componentes compartidos: confirmación, selector buscable y paginación.
- Servicio compartido de exportación CSV con separador `;` y BOM UTF-8,
  compatible con Excel en configuraciones regionales argentinas.

### Backend

- NestJS 11, TypeScript 5.7 y Mongoose.
- Módulos: Auth, Employees, Stock, Suppliers, Clients y Health.
- DTO validados con `class-validator`.
- Cookies `httpOnly`, JWT, Helmet y throttling.
- Swagger disponible según la configuración del entorno.
- Contadores separados para IDs numéricos de negocio.
- MongoDB conserva `_id` para relaciones y los códigos numéricos para la interfaz.

### Flujo de stock

```text
Alta de producto ────────────────> Movimiento INITIAL
Botón + / − ─────────────────────> Movimiento automático de 1 unidad
Edición con ajuste masivo ───────> Motivo obligatorio + observación opcional
Cambio de stock mínimo ──────────> Movimiento MINIMUM_CHANGE independiente
Baja / reactivación ─────────────> Movimiento con actor y fecha
```

El registro del historial ocurre después de la mutación principal. Si falla el historial,
el backend registra el error y evita reintentar una operación que podría duplicar stock.
Esta decisión prioriza la integridad de la cantidad, aunque debe monitorearse antes de producción.

## 10. API actual

- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
- `GET/POST/PATCH /employees` y acciones de desactivar/reactivar.
- `GET/POST/PATCH /suppliers`, activos y acciones de desactivar/reactivar.
- `GET/POST/PATCH /clients`, opciones y acciones de desactivar/reactivar.
- `GET/POST/PATCH /stock/products`.
- `GET /stock/products/inactive`.
- `GET /stock/products/:id/movements` (últimos 100).
- `PATCH /stock/products/:id/quantity` para `−1` o `+1`.
- Acciones múltiples de baja y reactivación de productos.
- `GET /health` y `GET /health/ready`.

## 11. Lenguaje visual

### Personalidad

La interfaz busca sentirse operativa, cálida y sobria. Toma colores asociados a harina,
papel, madera y panadería sin convertir el sistema en una ilustración decorativa.

### Colores funcionales

- Marrón profundo (`#6d3603` y variantes): acción principal e identidad.
- Beige/papel (`#f5ece3`, `#f8f3ed`): encabezados y superficies secundarias.
- Blanco: superficies de lectura y formularios.
- Verde: disponible, ingreso o reactivación.
- Ámbar: stock bajo y atención preventiva.
- Rojo: sin stock, egreso riesgoso, baja o error.

El color nunca debe ser el único indicador: se acompaña con texto, icono o etiqueta.

### Componentes y comportamiento

- Listas tabulares en escritorio; bloques etiquetados en móvil.
- Una fila se expande dentro del flujo y desplaza a las siguientes.
- Modales para crear, editar y confirmar; no se usan `alert()` ni `confirm()` nativos.
- Un clic fuera del modal no lo cierra: se evitan pérdidas accidentales y se exige una acción explícita.
- Selectores buscables con el mismo patrón visual que Proveedor en Stock.
- Botones primarios marrones, secundarios claros y tonos semánticos para riesgo/éxito.
- Descripciones extensas permiten salto de línea y lectura de izquierda a derecha.
- Paginación muestra botones en bloques de cinco y entrada manual de página.
- Estados vacíos explican qué falta o qué filtro cambiar.

### Accesibilidad mínima

- Diálogos con `role="dialog"`, `aria-modal` y título asociado.
- Botones de icono con nombre accesible.
- Foco visible y cierre de modales con Escape.
- Campos con etiquetas reales y mensajes de validación.
- Áreas táctiles y disposición adaptada para celulares.
- Revisión pendiente: recorrido integral solo con teclado y lector de pantalla.

## 12. Responsive

- Escritorio: sidebar fija, listas tabulares y detalles en varias columnas.
- Tablet: barras de filtros envuelven, encabezados pasan a columna y las listas se adaptan.
- Móvil: sidebar desplegable, controles a ancho completo, filas en una columna y modales compactos.
- El contenido no debe requerir zoom manual ni producir scroll horizontal en la vista móvil.
- La lista de stock deja de comportarse como tabla por debajo de 1100 px debido a la cantidad de datos.

## 13. Estados, errores y confirmaciones

Toda pantalla que consume API debe contemplar:

- carga en progreso;
- resultado vacío;
- error recuperable con mensaje legible;
- acción en progreso para evitar doble envío;
- confirmación previa en bajas/reactivaciones;
- respuesta específica para reglas conocidas, como stock insuficiente o cuenta desactivada.

## 14. Datos y consistencia

- Los nombres visibles se recortan con `trim` antes de guardarse.
- Las descripciones de producto admiten hasta 500 caracteres.
- Los emails de clientes y proveedores admiten hasta 254 caracteres.
- La observación de ajuste admite hasta 200 caracteres.
- Peso admite hasta tres decimales y debe ser mayor que cero.
- Cantidades y mínimos son enteros no negativos.
- Un producto puede tener cero o un proveedor; varios proveedores por producto no están modelados.
- Un cliente puede tener cero o un vendedor; vendedores compartidos o históricos están pendientes.
- Tipo de producto, grupo y localidad aún permiten texto; su normalización está pendiente de validación.

## 15. Seguridad y configuración

- Los secretos reales viven solamente en `.env`, que no debe versionarse.
- `.env.example` documenta nombres de variables con valores ficticios.
- Antes de publicar el repositorio se deben rotar secretos usados durante desarrollo,
  aun cuando hayan permanecido locales, y verificar el historial de Git.
- Producción debe usar HTTPS, cookie segura, origen CORS explícito y credenciales de base
  con privilegios mínimos.
- No se registran contraseñas, tokens ni contenido sensible en logs.
- Las operaciones de backend vuelven a validar rol, estado y datos recibidos.

## 16. Verificación

### Automatizada

- Backend con Jest para reglas de stock y permisos críticos.
- Frontend con Vitest disponible; ampliar pruebas puntuales de lógica y componentes compartidos.
- `npm run build` en frontend y backend antes de integrar cambios.

### Manual prioritaria

- Probar cada rol con sesiones separadas.
- Alta, edición, baja y reactivación de cada maestro.
- Stock en cero, stock bajo, resta insuficiente y ajuste masivo con motivo.
- Exportaciones con tildes, comas, comillas y filtros activos.
- Escritorio, tablet y móvil; navegación táctil y por teclado.
- Estados de API caída, sesión vencida y cuenta desactivada.

Para un desarrollador y un plazo corto, no se busca cobertura total: se automatizan reglas
que podrían romper datos y se completa con un checklist manual repetible.

## 17. Decisiones tomadas

- Distribuidora, no sistema de producción.
- Proveedor convertido de texto a entidad relacionada.
- Baja lógica en lugar de eliminación física.
- Stock ordenado inicialmente por menor cantidad.
- Motivo obligatorio solo en cambios masivos; `+` y `−` siguen siendo rápidos.
- Exportación CSV local sin agregar una dependencia externa.
- Inicio neutral y operativo hasta conocer la distribución definitiva por roles.
- Informes operativos separados de informes financieros.
- Módulos críticos visibles como alcance futuro, pero sin operaciones simuladas.

## 18. Restricciones y deuda conocida

- La definición final de permisos por rol depende de la visita al negocio.
- Los movimientos de stock se limitan a los últimos 100 por producto.
- El registro de movimiento no usa una transacción MongoDB junto con la mutación principal.
- Falta definir múltiples depósitos, inventario físico, lotes y vencimientos.
- Falta decidir si tipos, grupos y localidades serán catálogos administrables.
- Hay advertencias de presupuesto por tamaño en algunos archivos SCSS.
- Falta definir importación inicial desde Excel/CSV y estrategia de respaldo.
- La tipografía y los textos deben revisarse en las computadoras reales del cliente.

## 19. Próximos pasos

Antes de la visita:

1. Probar y estabilizar los módulos actuales.
2. Usar la lista de reposición, los motivos y las exportaciones con datos ficticios.
3. Revisar Inicio y responsive con cada rol disponible.
4. Preparar preguntas y ejemplos para observar el sistema anterior.

Después de la visita:

1. Documentar responsables, permisos y circuitos completos.
2. Elegir un único módulo validado para implementar.
3. Si Precios y costos resulta independiente, abordarlo primero; si toca impuestos o caja,
   construir antes el dato maestro necesario.
4. Mantener bloqueados cálculos financieros hasta contar con ejemplos y reglas reales.

## 20. Preguntas abiertas

- ¿Qué ve y modifica exactamente cada rol?
- ¿Existe uno o más depósitos?
- ¿Cómo se hace el recuento físico y quién autoriza correcciones?
- ¿Quién recibe y usa la lista de reposición?
- ¿Un producto puede tener varios proveedores o códigos de proveedor?
- ¿Qué campos de clientes y proveedores son realmente obligatorios?
- ¿Qué ocurre con los clientes cuando un vendedor se desactiva?
- ¿Se importarán maestros e historiales desde Excel u otra base?
- ¿Qué navegadores, celulares, impresoras y lectores se usan?
- ¿Cuál es el primer circuito crítico que puede implementarse de punta a punta?

## 21. Regla de mantenimiento

Un cambio funcional no está completamente documentado hasta que:

1. el código y sus validaciones coinciden;
2. la interfaz comunica sus estados y errores;
3. existe una verificación proporcional al riesgo;
4. este documento refleja la decisión estable;
5. `docs/PRIORIDADES.md` refleja lo terminado y lo pendiente.

## 22. Referencias de estructura

La organización de este documento sigue prácticas habituales de documentos de diseño:
contexto, objetivos, no objetivos, decisiones, restricciones, riesgos y preguntas abiertas.
Se tomaron como referencia las guías públicas de documentos de diseño de Chromium,
el documento de diseño de `gopls` y las prácticas de cambios pequeños de Google.
