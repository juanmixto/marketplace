# 🛠️ Guía de Desarrollo

Instrucciones para desarrolladores que quieren trabajar en el marketplace.

## Arranque rápido

```bash
./dev.sh
```

Eso es. Después:
- Abre http://localhost:3000 (o el puerto que te muestre)
- Usa las credenciales de prueba del README

## Estructura del proyecto

```
src/
├── app/                    # Next.js App Router
│   ├── (public)/           # Páginas públicas (sin autenticación)
│   ├── (auth)/             # Rutas de autenticación
│   ├── (buyer)/            # Dashboard de compradores
│   ├── (vendor)/           # Dashboard de productores
│   ├── (admin)/            # Panel administrativo
│   └── api/                # API routes
├── components/             # Componentes React reutilizables
├── domains/                # Lógica de negocio (actions, queries, cálculos)
├── lib/                    # Utilidades (autenticación, config, etc)
├── types/                  # Tipos TypeScript compartidos
└── emails/                 # Templates de emails (React Email)

prisma/
├── schema.prisma           # Definición de BD
├── migrations/             # Historial de cambios en BD
└── seed.ts                 # Datos de prueba

test/                       # Tests unitarios
```

## Desarrollo diario

### Levantar solo la BD sin la app
```bash
docker compose up -d db
```

### Correr la app
```bash
npm run dev
```

### Tests
```bash
npm test              # Unitarios
npm run test:integration  # Integración (lento)
npm run test:coverage     # Con cobertura
```

### Base de datos
```bash
npm run db:studio         # UI visual (http://localhost:5555)
npm run db:migrate        # Aplicar cambios
npm run db:seed          # Cargar datos de prueba
npm run db:reset         # Borrar todo y repoblar
```

### TypeScript
```bash
npm run typecheck    # Verificar tipos sin compilar
npm run build        # Build de producción
```

## Flujo típico

1. **Crea una rama:**
   ```bash
   git checkout -b feat/tu-feature
   ```

2. **Haz cambios:**
   - Edita archivos
   - Testa localmente

3. **Tests antes de commit:**
   ```bash
   npm test
   npm run typecheck
   npm run build
   ```

4. **Commit y push:**
   ```bash
   git add .
   git commit -m "feat: Descripción clara"
   git push origin feat/tu-feature
   ```

5. **Pull request en GitHub**

## Áreas principales

### 🌾 Catálogo (Público)
- `src/app/(public)/productos/` — Listado y detalle
- `src/domains/catalog/` — Queries y lógica
- `src/components/catalog/` — Componentes de UI

### 🛒 Carrito y Checkout
- `src/app/(buyer)/carrito/` — Página del carrito
- `src/app/(buyer)/checkout/` — Flujo de compra
- `src/lib/cart-store.ts` — Estado global (Zustand)

### 💳 Pagos
- `src/app/api/webhooks/stripe` — Webhook de confirmación
- `src/domains/payments/` — Lógica de pagos
- Modo mock (por defecto): checkout automático

### 🏪 Productor
- `src/app/(vendor)/vendor/` — Dashboard
- `src/domains/vendors/` — Acciones de vendedor

### 👮 Admin
- `src/app/(admin)/admin/` — Dashboard administrativo
- `src/domains/admin/` — Acciones de admin

## Autenticación

**Proveedor:** NextAuth v5 (credenciales + cookies)

**Test usuarios:**
- Admin: `admin@marketplace.com` / `admin1234`
- Vendor: `productor@test.com` / `vendor1234`
- Buyer: `cliente@test.com` / `cliente1234`

**Config:** `src/lib/auth-config.ts`

## Base de datos

**Sistema:** Prisma ORM + PostgreSQL

**Migrations:**
```bash
# Crear migration automática
npx prisma migrate dev --name tu_cambio

# Aplicar cambios pendientes
npm run db:migrate
```

**Schema:** `prisma/schema.prisma`

## Temas (Dark mode)

Usa variables CSS personalizadas para tema:
```css
color: var(--foreground);
background: var(--background);
border-color: var(--border);
```

No uses colores hardcodeados. Los tests verifican que uses variables.

## Variables de entorno

`.env.local` (para desarrollo):
```env
DATABASE_URL=postgresql://mp_user:mp_pass@localhost:5432/marketplace
PAYMENT_PROVIDER=mock
NEXTAUTH_SECRET=dev_secret_key
```

`.env` (valores por defecto)
`.env.example` (plantilla pública)

## Debugging

### Logs en cliente
Usa `console.log()` — aparecerá en navegador + servidor

### Logs en servidor
```bash
npm run dev  # Muestra logs de Next.js
```

### Prisma Studio
```bash
npm run db:studio
# Abre http://localhost:5555
# Inspecciona y edita datos
```

### Inspeccionar DB
```bash
docker compose exec db psql -U mp_user -d marketplace
```

## Performance

- **Imágenes:** Usa componente `Image` de Next.js (no `<img>`)
- **Fetch:** Usa `unstable_cache` para queries costosas
- **Revalidate:** `revalidate = 300` en páginas que cambian poco

## Seguridad

- ❌ **NO** hardcodees secrets en código
- ✅ Usa variables de entorno (`.env`)
- ✅ Valida datos en servidor (no solo cliente)
- ✅ Usa `@/lib/auth-guard` para rutas protegidas

## Contacto / Ayuda

- Issues: [GitHub Issues](https://github.com/juanmixto/marketplace/issues)
- Cambios de BD: Pide review en PR
- Preguntas de arquitectura: Abre una issue
