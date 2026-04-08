import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/', '/productos', '/productores', '/login', '/register', '/api/auth']

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function isAdmin(role: string): boolean {
  return role.startsWith('ADMIN') || role === 'SUPERADMIN'
}

export default auth((req) => {
  const { pathname } = req.nextUrl
  const role = req.auth?.user?.role

  // Routes that need auth
  if (!isPublic(pathname) && !req.auth) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Admin routes
  if (pathname.startsWith('/admin') && (!role || !isAdmin(role))) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // Vendor routes
  if (pathname.startsWith('/vendor') && role !== 'VENDOR') {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // Buyer-only routes (cart, checkout, account)
  const buyerPaths = ['/carrito', '/checkout', '/cuenta']
  if (buyerPaths.some(p => pathname.startsWith(p)) && !req.auth) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
