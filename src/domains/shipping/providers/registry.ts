import type { ShippingProvider } from './ShippingProvider'
import type { ShippingProviderCode } from '../domain/types'

const providers = new Map<ShippingProviderCode, ShippingProvider>()

export function registerProvider(provider: ShippingProvider): void {
  providers.set(provider.code, provider)
}

export function getProvider(code: ShippingProviderCode): ShippingProvider {
  const provider = providers.get(code)
  if (!provider) {
    throw new Error(`Shipping provider not registered: ${code}`)
  }
  return provider
}

export function hasProvider(code: ShippingProviderCode): boolean {
  return providers.has(code)
}

export function getDefaultProviderCode(): ShippingProviderCode {
  const raw = process.env.SHIPPING_PROVIDER ?? 'SENDCLOUD'
  return raw as ShippingProviderCode
}

export function getDefaultProvider(): ShippingProvider {
  return getProvider(getDefaultProviderCode())
}

/** Test-only reset helper. */
export function __resetProvidersForTests(): void {
  providers.clear()
}
