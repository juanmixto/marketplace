import { z } from 'zod'

/**
 * Frozen extractor payload schema.
 *
 * This shape is the cross-phase contract: the Phase 2 rules extractor
 * emits it and the Phase 2.5 LLM extractor MUST emit the same shape.
 * Any change to the shape bumps `schemaVersion` on
 * `IngestionExtractionResult` and requires a matching freeze test
 * update (see `test/contracts/domain/ingestion-extraction-schema.test.ts`).
 *
 * Per-field traceability lives in `extractionMeta`: each extracted
 * field records the rule that produced it and the source substring,
 * so operators can explain any value on any draft without re-running
 * the pipeline.
 */

export const EXTRACTION_SCHEMA_VERSION = 1

const unitSchema = z
  .enum(['KG', 'G', 'L', 'ML', 'UNIT'])
  .nullable()

const availabilitySchema = z.enum([
  'AVAILABLE',
  'LIMITED',
  'SOLD_OUT',
  'UNKNOWN',
])

const extractionMetaEntrySchema = z.object({
  rule: z.string().min(1),
  source: z.string(),
})

const productMetaSchema = z.object({
  productName: extractionMetaEntrySchema.optional(),
  categorySlug: extractionMetaEntrySchema.optional(),
  unit: extractionMetaEntrySchema.optional(),
  weightGrams: extractionMetaEntrySchema.optional(),
  priceCents: extractionMetaEntrySchema.optional(),
  currencyCode: extractionMetaEntrySchema.optional(),
  availability: extractionMetaEntrySchema.optional(),
})

const extractedProductSchema = z.object({
  productOrdinal: z.number().int().nonnegative(),
  productName: z.string().nullable(),
  categorySlug: z.string().nullable(),
  unit: unitSchema,
  weightGrams: z.number().int().positive().nullable(),
  priceCents: z.number().int().positive().nullable(),
  currencyCode: z.enum(['EUR']).nullable(),
  availability: availabilitySchema,
  confidenceOverall: z.number().min(0).max(1),
  confidenceByField: z.record(z.string(), z.number().min(0).max(1)),
  extractionMeta: productMetaSchema,
})

const vendorHintSchema = z.object({
  externalId: z.string().nullable(),
  displayName: z.string().nullable(),
  meta: z.object({
    rule: z.string(),
    source: z.string(),
  }),
})

export const extractionPayloadSchema = z.object({
  schemaVersion: z.literal(EXTRACTION_SCHEMA_VERSION),
  products: z.array(extractedProductSchema),
  vendorHint: vendorHintSchema,
  confidenceOverall: z.number().min(0).max(1),
  rulesFired: z.array(z.string()),
})

export type ExtractionPayload = z.infer<typeof extractionPayloadSchema>
export type ExtractedProduct = z.infer<typeof extractedProductSchema>
export type ExtractionVendorHint = z.infer<typeof vendorHintSchema>
export type ExtractionMetaEntry = z.infer<typeof extractionMetaEntrySchema>
