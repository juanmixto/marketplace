import { registerProvider, getDefaultProvider } from './registry'
import { MockShippingProvider } from './mock'
import { SendcloudProvider } from './sendcloud'
import { isSendcloudConfigured } from './sendcloud/config'

let initialized = false

/**
 * Registers the configured shipping providers. Called lazily the first
 * time a server action or webhook needs a provider. Picks SendcloudProvider
 * if credentials are present, MockShippingProvider otherwise so local dev
 * and tests keep working without real keys.
 */
export function ensureShippingProvidersRegistered(): void {
  if (initialized) return
  if (isSendcloudConfigured()) {
    registerProvider(new SendcloudProvider())
  } else {
    registerProvider(new MockShippingProvider())
  }
  initialized = true
}

export function getShippingProvider() {
  ensureShippingProvidersRegistered()
  return getDefaultProvider()
}

export { registerProvider, __resetProvidersForTests } from './registry'
