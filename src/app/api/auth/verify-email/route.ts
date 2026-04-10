import { NextRequest, NextResponse } from 'next/server'
import { verifyEmailToken } from '@/domains/auth/email-verification'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
  }

  const result = await verifyEmailToken(token)

  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: 400 })
  }

  // Redirect to login with success message
  return NextResponse.redirect(new URL('/login?verified=1', req.url))
}
