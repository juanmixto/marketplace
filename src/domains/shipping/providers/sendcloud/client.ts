import {
  ShippingNotFoundError,
  ShippingProviderUnavailableError,
  ShippingValidationError,
} from '../../domain/errors'
import type { SendcloudConfig } from './config'

/**
 * Raw Sendcloud types. These MUST NOT leak outside this folder — the
 * mapper is the only boundary between these and the domain DTOs.
 */
export interface SendcloudParcelCreate {
  parcel: {
    name: string
    company_name?: string
    address: string
    address_2?: string
    city: string
    postal_code: string
    country: string
    telephone: string
    email?: string
    order_number: string
    weight: string
    request_label: boolean
    sender_address?: number
    parcel_items: Array<{
      description: string
      quantity: number
      weight: string
      value: string
      sku?: string
      hs_code?: string
    }>
  }
}

export interface SendcloudParcelResponse {
  parcel: {
    id: number
    tracking_number: string | null
    tracking_url: string | null
    label: {
      normal_printer: string[]
      label_printer: string | null
    } | null
    carrier: { code: string } | null
    status: { id: number; message: string }
  }
}

export interface SendcloudCancelResponse {
  status: string
  message: string
}

async function safeBody(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export class SendcloudClient {
  constructor(private readonly config: SendcloudConfig) {}

  private authHeader(): string {
    const token = Buffer.from(
      `${this.config.publicKey}:${this.config.secretKey}`,
    ).toString('base64')
    return `Basic ${token}`
  }

  private async request<T>(
    path: string,
    init: RequestInit & { idempotencyKey?: string } = {},
  ): Promise<T> {
    const { idempotencyKey, headers, ...rest } = init

    let res: Response
    try {
      res = await fetch(`${this.config.baseUrl}${path}`, {
        ...rest,
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.authHeader(),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          ...headers,
        },
      })
    } catch (cause) {
      throw new ShippingProviderUnavailableError('Sendcloud network error', cause)
    }

    if (res.status === 404) {
      throw new ShippingNotFoundError(path)
    }
    if (res.status >= 500) {
      throw new ShippingProviderUnavailableError(
        `Sendcloud ${res.status}`,
        await safeBody(res),
      )
    }
    if (res.status >= 400) {
      throw new ShippingValidationError(
        `Sendcloud rejected request (${res.status})`,
        undefined,
        await safeBody(res),
      )
    }
    return (await res.json()) as T
  }

  createParcel(
    body: SendcloudParcelCreate,
    idempotencyKey: string,
  ): Promise<SendcloudParcelResponse> {
    return this.request<SendcloudParcelResponse>('/parcels', {
      method: 'POST',
      body: JSON.stringify(body),
      idempotencyKey,
    })
  }

  getParcel(providerRef: string): Promise<SendcloudParcelResponse> {
    return this.request<SendcloudParcelResponse>(`/parcels/${providerRef}`)
  }

  cancelParcel(providerRef: string): Promise<SendcloudCancelResponse> {
    return this.request<SendcloudCancelResponse>(`/parcels/${providerRef}/cancel`, {
      method: 'POST',
    })
  }
}
