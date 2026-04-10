export { auth as middleware } from '@/lib/auth'

export const config = {
  matcher: [
    // Proteger todas las rutas excepto archivos estáticos y API de NextAuth
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
}
