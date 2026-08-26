# Panadería Mayorista — Sistema de Gestión

Monorepo con **NestJS** (backend), **Angular 22** (frontend), **MongoDB Atlas** (datos) y **Supabase** (storage/realtime opcional).

## Estructura del proyecto

```
Proyecto panaderia  mayorista/
├── backend/                 # API NestJS
│   └── src/
│       ├── common/          # Enums, guards, decorators, filters
│       ├── config/          # Variables de entorno
│       ├── database/        # Conexión MongoDB
│       └── modules/         # Módulos de negocio (auth, ventas, stock...)
├── frontend/                # App Angular 22 (standalone + @if/@for)
│   └── src/app/
│       ├── core/            # Servicios singleton, guards, interceptors
│       ├── shared/          # Componentes reutilizables
│       ├── features/        # Módulos por funcionalidad (lazy loading)
│       └── layouts/         # Layouts de página
└── docs/                    # Documentación de setup
```

## Requisitos

- Node.js >= 22.22.3 (recomendado: LTS o v26+)
- npm >= 10
- Cuenta en [MongoDB Atlas](https://www.mongodb.com/atlas)
- Cuenta en [Supabase](https://supabase.com) (opcional para v1)

## Paso 1 — Clonar e instalar

```powershell
cd "C:\Users\User\Desktop\Proyecto panaderia  mayorista"

# Backend
cd backend
npm install

# Frontend (en otra terminal)
cd ..\frontend
npm install
```

## Paso 2 — Configurar MongoDB Atlas

1. Entrá a [MongoDB Atlas](https://cloud.mongodb.com) → **Create Cluster** (M0 free tier alcanza para desarrollo).
2. **Database Access** → Create Database User (usuario + contraseña segura).
3. **Network Access** → Add IP Address → `0.0.0.0/0` (solo desarrollo; en producción restringir IPs).
4. **Connect** → Drivers → copiá la connection string.
5. Reemplazá `<password>` y el nombre de DB por `panaderia`.

## Paso 3 — Variables de entorno del backend

```powershell
cd backend
copy .env.example .env
```

Editá `.env`:

```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb+srv://TU_USUARIO:TU_PASSWORD@cluster.mongodb.net/panaderia?retryWrites=true&w=majority
JWT_SECRET=GENERA_UN_SECRET_LARGO_AQUI
JWT_EXPIRES_IN=8h
FRONTEND_URL=http://localhost:4200
```

Generar JWT secret seguro:

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

## Paso 4 — Configurar Supabase (opcional v1)

1. [supabase.com](https://supabase.com) → New Project.
2. Settings → API → copiá **Project URL** y **anon key**.
3. Agregá las claves privadas solamente al `.env` del backend.

El frontend todavía no usa Supabase. Cuando se integre, únicamente la anon key
pública puede incorporarse en los archivos `src/environments`; la service role
nunca debe formar parte de un build de Angular.

Supabase se usará para storage (PDFs, fotos) y realtime (stock entre galpón y ventas). Los datos de negocio van en MongoDB.

## Paso 5 — Levantar el entorno

**Terminal 1 — Backend:**

```powershell
cd backend
npm run start:dev
```

Verificá: http://localhost:3000/api/health

Readiness de API + MongoDB: http://localhost:3000/api/health/ready

Documentación Swagger en desarrollo: http://localhost:3000/api/docs

**Terminal 2 — Frontend:**

```powershell
cd frontend
npm start
```

Verificá: http://localhost:4200

## Convenciones Angular

- **Standalone components** (sin NgModules)
- **Control flow moderno**: `@if`, `@for`, `@switch` (NO `*ngIf`, `*ngFor`)
- **Signals** para estado local
- **Lazy loading** por feature en rutas

## Convenciones Backend

- Prefijo global: `/api`
- Contraseñas: **bcrypt** (nunca texto plano, nunca en logs)
- Validación: `class-validator` en todos los DTOs
- Roles: `jefe`, `vendedor`, `empleado_galpon`, `empleado_stock`, `administrativo`

## Deploy (futuro)

| Componente | Plataforma |
|-----------|-----------|
| Frontend Angular | Vercel |
| Backend NestJS | Vercel (serverless) o Railway/Render |
| Base de datos | MongoDB Atlas |
| Storage / Realtime | Supabase |

El build de producción usa `/api` como URL relativa. El hosting debe publicar
frontend y backend bajo el mismo dominio, o configurar un proxy/rewrite de
`/api` hacia NestJS para que la cookie de sesión funcione correctamente.

## Verificaciones

```powershell
cd backend
npm run lint
npm test
npm run build

cd ..\frontend
npm test -- --watch=false
npm run build
```

Ver `docs/TESTING.md` para las pruebas manuales críticas antes de una entrega.

## Módulos planificados

Ver `docs/FUNCIONALIDADES.md` para el mapa completo del sistema.

Ver `docs/PRIORIDADES.md` para el estado actual y el orden recomendado de trabajo.
