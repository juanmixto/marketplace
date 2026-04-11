'use server'

import { requireVendor } from '@/lib/auth-guard'
import { db } from '@/lib/db'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function createStripeConnectLink(): Promise<string> {
  const session = await requireVendor()

  const vendor = await db.vendor.findUniqueOrThrow({
    where: { userId: session.user.id },
  })

  // Crear cuenta Express si no existe
  let accountId = vendor.stripeAccountId
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'ES',
      email: session.user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    })
    accountId = account.id

    await db.vendor.update({
      where: { id: vendor.id },
      data: { stripeAccountId: accountId },
    })
  }

  // Crear link de onboarding
  const baseUrl =
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/vendor/perfil?stripe=refresh`,
    return_url: `${baseUrl}/vendor/perfil?stripe=success`,
    type: 'account_onboarding',
  })

  return accountLink.url
}

export async function verifyStripeOnboarding(): Promise<boolean> {
  const session = await requireVendor()

  const vendor = await db.vendor.findUniqueOrThrow({
    where: { userId: session.user.id },
  })

  if (!vendor.stripeAccountId) return false

  const account = await stripe.accounts.retrieve(vendor.stripeAccountId)
  const isComplete =
    account.details_submitted && !account.requirements?.currently_due?.length

  if (isComplete && !vendor.stripeOnboarded) {
    await db.vendor.update({
      where: { id: vendor.id },
      data: { stripeOnboarded: true },
    })
  }

  return isComplete
}

export async function getStripeAccountStatus() {
  const session = await requireVendor()

  const vendor = await db.vendor.findUniqueOrThrow({
    where: { userId: session.user.id },
  })

  if (!vendor.stripeAccountId) {
    return { status: 'not_started', onboarded: false }
  }

  const account = await stripe.accounts.retrieve(vendor.stripeAccountId)
  const isComplete =
    account.details_submitted && !account.requirements?.currently_due?.length

  return {
    status: isComplete ? 'completed' : 'pending',
    onboarded: vendor.stripeOnboarded || isComplete,
    chargesEnabled: account.charges_enabled || false,
    requirements: account.requirements?.currently_due || [],
  }
}
