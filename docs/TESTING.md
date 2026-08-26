# Estrategia de pruebas para la primera entrega

Con un solo desarrollador y un plazo de 4 a 6 semanas no se busca cobertura
exhaustiva. Se automatizan reglas que podrían comprometer acceso, dinero o
stock; la experiencia visual y los flujos del sistema heredado se verifican
manualmente.

## Automatizado en cada cambio

```powershell
cd backend
npm run lint
npm test
npm run build

cd ..\frontend
npm test -- --watch=false
npm run build
```

## Checklist manual de autenticación y empleados

1. Ingresar con un empleado activo y confirmar navegación según sus roles.
2. Intentar una contraseña incorrecta y verificar el mensaje genérico.
3. Desactivar un empleado y probar su contraseña correcta: debe mostrarse el
   modal de cuenta desactivada.
4. Con ese empleado ya logueado en otro navegador, desactivarlo y navegar: la
   siguiente petición debe cerrar su sesión.
5. Cambiar roles y confirmar que los permisos se actualicen sin esperar 8 horas.
6. Confirmar que no aparezca la baja para un jefe y que una llamada directa a la
   API también responda 403.
7. Crear y editar empleados con emails repetidos y roles inválidos.
8. Probar formulario, modal, Escape y navegación con teclado.

## Para clientes y stock

Agregar tests automatizados para normalización de CUIT/documentos, listas de
precios, movimientos de stock, transferencias, concurrencia e imposibilidad de
dejar cantidades inconsistentes. Esos módulos no deberían depender sólo de
pruebas manuales.
