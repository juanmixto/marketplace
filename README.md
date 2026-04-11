# 🌾 Marketplace Agroalimentario

Plataforma de compra directa al productor. Compradores pueden explorar catálogo, añadir productos al carrito y pagar. Productores gestionan su catálogo y reciben pedidos. Administradores supervisan la plataforma.

## 🚀 Lanzar la aplicación

**Requisito único: Docker instalado**

```bash
./dev.sh
```

Eso es. Se levanta automáticamente:
- Base de datos PostgreSQL
- Migraciones y datos de prueba
- Servidor Next.js (normalmente **http://localhost:3000**, o **3003+** si 3000 está ocupado)

**Para limpiar y reiniciar:**
```bash
./dev.sh --reset
```

---

## 📋 Acceso a la aplicación

Una vez ejecutado `./dev.sh`, accede a **http://localhost:3000** con estas credenciales:

| Rol | Email | Contraseña | URL directa |
|-----|-------|-----------|------------|
| 👨‍💼 **Admin** | `admin@marketplace.com` | `admin1234` | http://localhost:3000/admin/dashboard |
| 🌾 **Productor** | `productor@test.com` | `vendor1234` | http://localhost:3000/vendor/dashboard |
| 👤 **Comprador** | `cliente@test.com` | `cliente1234` | http://localhost:3000/cuenta/pedidos |

---

## 🛑 Parar la aplicación

```bash
docker compose down
```

---

## 📚 Stack técnico

- **Next.js 16** + App Router  
- **React 19**  
- **Prisma 7** + **PostgreSQL**  
- **NextAuth v5** (autenticación por credenciales)  
- **Tailwind CSS 4** (estilos)  
- **Stripe** (modo mock para desarrollo)  
- **Zustand** (estado del carrito)  
- **Node test runner** (tests)

## 🎯 Áreas principales

- **Pública**: home, catálogo, detalle de productos, perfil de productor
- **Comprador**: carrito, checkout, pagos, historial de pedidos
- **Productor**: dashboard, gestión de catálogo, alta/edición de productos
- **Admin**: dashboard de administración

## 🌐 Idiomas y auto-traducción de productos

El storefront ya funciona en **español e inglés** para navegación, páginas públicas y catálogo.

### Qué hace actualmente
- guarda el idioma del usuario en la cookie `mp_locale`
- traduce la UI pública y de catálogo con el sistema interno de i18n
- si un producto fue escrito originalmente en otro idioma, puede mostrar una **traducción automática** de `nombre`, `descripción` y `unidad`
- enseña una insignia visual para avisar al comprador, por ejemplo: `Auto-translated from Spanish`

### Tecnología usada
La traducción actual **no usa servicios externos** como Google Translate, DeepL u OpenAI.
Se implementa con lógica interna en:
- `src/i18n/server.ts`
- `src/i18n/public-page-copy.ts`
- `src/i18n/catalog-copy.ts`

### Limitación importante
La auto-traducción actual es **heurística y basada en glosarios**, adecuada para copy corto del catálogo. Si más adelante se necesita máxima calidad en producción, lo recomendado es evolucionar a:
- campos bilingües en base de datos (`nameEs`, `nameEn`, etc.), o
- traducción persistida al guardar con un proveedor externo

Más detalle en la wiki: [`docs/wiki/Internationalization and Auto-translation.md`](./docs/wiki/Internationalization%20and%20Auto-translation.md).

## 💻 Requisitos del sistema

- **Node.js 20+**
- **Docker** (para PostgreSQL)
- **npm**

---

## Configuración manual (sin el script)

Si prefieres lanzarlo paso a paso:

### 1. Instala dependencias

```bash
npm install
```

### 2. Variables de entorno

El fichero `.env.local` ya está configurado para desarrollo local con valores por defecto:

- `PAYMENT_PROVIDER=mock` — no necesitas Stripe real
- `DATABASE_URL` apunta a PostgreSQL en localhost:5432

Si necesitas ajustarlo, edita `.env.local` directamente.

### 3. Base de datos

```bash
# Levantar PostgreSQL con Docker
docker compose up -d db

# Aplicar migraciones
npm run db:migrate

# Cargar datos de ejemplo
npm run db:seed
```

### 4. Arrancar la app

```bash
npm run dev
```

---

## Herramientas de desarrollo

| Comando | Descripción |
|---------|-------------|
| `./dev.sh` | Arranque completo en un comando |
| `./dev.sh --reset` | Reset de BD + arranque |
| `npm test` | Tests rápidos sin base de datos |
| `npm run test:parallel` | Tests rápidos en paralelo |
| `npm run test:db` | Tests con base de datos y migraciones |
| `npm run test:db:parallel` | Tests con base de datos en paralelo |
| `npm run test:integration` | Tests de integración |
| `npm run db:studio` | Prisma Studio en http://localhost:5555 |
| `npm run db:reset` | Reset de BD con seed (sin arrancar app) |
| `npm run typecheck` | Validación completa de TypeScript |
| `npm run typecheck:app` | TypeScript de la app |
| `npm run typecheck:test` | TypeScript de los tests |
| `npm run build` | Build de producción |

Más detalle del flujo de validación en [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## Pagos

### Modo mock (por defecto)

`PAYMENT_PROVIDER="mock"` — el checkout confirma el pedido automáticamente sin Stripe real. Ideal para desarrollar y probar flujos de compra.

### Modo Stripe

Cambia a `PAYMENT_PROVIDER="stripe"` en `.env.local` y añade tus claves de test:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

El webhook de confirmación está en `/api/webhooks/stripe`. Para recibirlo en local usa [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## Estado actual

El proyecto está operativo para desarrollo local y ya tiene:

- Build pasando
- Tests básicos de checkout, pagos, envs y utilidades de catálogo
- Soporte de pago mock y flujo base con Stripe

Áreas en evolución: panel admin completo, incidencias, liquidaciones, emails transaccionales y Stripe Connect para vendedores.
