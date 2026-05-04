import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyEmailToken } from '@/domains/auth/email-verification'

const tokenSchema = z.string().min(20).max(255)

export async function GET(req: NextRequest) {
  const parsed = tokenSchema.safeParse(req.nextUrl.searchParams.get('token'))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
  }

  const result = await verifyEmailToken(parsed.data)

  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: 400 })
  }

  // Redirect to login with success message
  return NextResponse.redirect(new URL('/login?verified=1', req.url))
}
