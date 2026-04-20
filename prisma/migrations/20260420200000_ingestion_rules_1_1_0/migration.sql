-- rules-1.1.0: extend enums to support PRODUCT_NO_PRICE classification
-- and UNEXTRACTABLE_PRODUCT review queue item kind.

ALTER TYPE "IngestionMessageClass" ADD VALUE 'PRODUCT_NO_PRICE';
ALTER TYPE "IngestionDraftKind" ADD VALUE 'UNEXTRACTABLE_PRODUCT';
