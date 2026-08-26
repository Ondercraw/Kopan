# Setup paso a paso — Entorno de desarrollo

## 1. Verificar Node.js

```powershell
node -v   # debe ser >= 22.22.3
npm -v
```

Si falla Angular CLI, actualizá Node:

```powershell
winget install OpenJS.NodeJS
```

## 2. MongoDB Atlas

1. Crear cluster gratuito M0
2. Crear usuario de base de datos
3. Whitelist IP (0.0.0.0/0 para dev)
4. Copiar connection string → `backend/.env` como `MONGODB_URI`

## 3. Supabase

1. Crear proyecto en supabase.com
2. Ir a **Project Settings → API**
3. Copiar:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` → `SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (solo backend, nunca en frontend)

### Storage (cuando lo necesitemos)

En Supabase Dashboard → Storage → New bucket:

- `comprobantes` (privado)
- `productos` (público o privado según necesidad)

## 4. Archivos .env

```powershell
# Backend
cd backend
copy .env.example .env
# Editar .env con tus valores reales

```

Angular usa `src/environments/environment.ts` en desarrollo y reemplaza ese
archivo por `environment.production.ts` durante el build. El `.env.example` del
frontend es sólo una referencia y no debe contener claves privadas.

## 5. Correr proyectos

```powershell
# Terminal 1
cd backend
npm run start:dev

# Terminal 2
cd frontend
npm start
```

## 6. Verificar que todo funciona

- Backend: http://localhost:3000/api/health → `{ "status": "ok" }`
- Backend + MongoDB: http://localhost:3000/api/health/ready
- Swagger (sólo desarrollo): http://localhost:3000/api/docs
- Frontend: http://localhost:4200 → pantalla de login placeholder

## Seguridad — reglas desde el día 1

1. **Nunca** commitear `.env` (está en `.gitignore`)
2. Contraseñas de usuarios: hash con **bcrypt** (cost factor 12)
3. JWT con secret de al menos 64 bytes aleatorios
4. `JWT_SECRET` y `MONGODB_URI` nunca en logs ni respuestas de API
5. Validar todos los inputs con `class-validator`
6. CORS restringido al dominio del frontend en producción
7. Helmet activo en el backend (ya configurado)
