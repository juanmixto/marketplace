# 🔒 Seguridad

Prácticas de seguridad implementadas en el marketplace.

## Autenticación

- **NextAuth v5** con credenciales (email + contraseña)
- **Email verification** requerido para registros
- **Password reset** seguro con tokens temporales
- **Session management** con cookies seguras

## Encriptación

- Contraseñas hasheadas con bcryptjs
- Datos sensibles nunca en logs o respuestas de error
- HTTPS requerido en producción

## Base de datos

- **Prisma ORM** para prevenir SQL injection
- **Select queries** para limitar exposición de datos
- **Foreign key constraints** para integridad referencial
- **Transactions** para operaciones críticas

## Validación

- **Server-side validation** obligatorio (no confiar en cliente)
- **Zod schemas** para tipado y validación
- **Rate limiting** en endpoints críticos:
  - Login: 5 intentos/10 minutos
  - Registro: 3/hora
  - Password reset: 3/hora

## Pagos

- **Server-side price validation** — cliente no puede cambiar precios
- **Webhook signature verification** de Stripe
- **Modo mock** para desarrollo (sin datos reales de Stripe)
- **PCI compliance** delegada a Stripe

## GDPR & Privacidad

- **Data export** — usuarios pueden descargar sus datos
- **Account deletion** — eliminación permanente de cuenta
- **Consent tracking** — consentimiento para marketing
- **Email verification** — no enviar datos sin confirmar

## Protección de rutas

Usa `@/lib/auth-guard` en rutas protegidas:

```typescript
import { authorized } from '@/lib/auth-guard'

export default async function AdminPage() {
  const session = await authorized(['admin'])
  // Solo admin puede acceder
}
```

**Roles disponibles:**
- `admin` — Panel administrativo
- `vendor` — Dashboard de productor
- `buyer` — Dashboard de comprador
- `public` — Sin autenticación requerida

## Auditoría

- Logs de todas las acciones admin en tabla `AuditLog`
- IP tracking para investigación
- Timestamps precisos
- Imposible falsificar (insertados por servidor)

## Secretos

**Nunca commitear:**
- `.env` (credenciales reales)
- API keys
- Contraseñas de BD
- Tokens de webhook

**Usar variables de entorno:**
```bash
DATABASE_URL=...
STRIPE_SECRET_KEY=...
NEXTAUTH_SECRET=...
```

## Headers de seguridad

(Implementados en Next.js middleware)
- Content-Security-Policy
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection

## Testing de seguridad

```bash
npm test  # Incluye tests de autenticación y autorización
```

### Verificaciones manuales

- ✅ No puede acceder a rutas protegidas sin login
- ✅ Roles cortos: vendor no ve admin
- ✅ Precios no cambian desde cliente
- ✅ Webhooks verifican firma
- ✅ Errores no revelan estructura de BD

## Reportar vulnerabilidades

❌ **NO** abras issue pública  
✅ Contacta privadamente:
- Email al owner del repo
- Proporciona detalles técnicos
- Espera respuesta en 48h

## Checklist de seguridad antes de deploy

- [ ] `.env` NO está en `.gitignore` correctamente
- [ ] No hay secrets en código fuente
- [ ] Tests de autenticación pasan
- [ ] Rate limiting está activo
- [ ] HTTPS está forzado (en prod)
- [ ] DB backups están configurados
- [ ] Logs están centralizados
- [ ] Webhooks verifican firmas
- [ ] CORS está restringido

## Referencias

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [NextAuth Documentation](https://authjs.dev/)
- [Stripe Security](https://stripe.com/docs/security)
- [Prisma Security](https://www.prisma.io/docs/concepts/database-connectors/postgresql#using-pgbouncer)
