/**
 * Processing layer barrel — Phase 2, rules-only, no LLM, no UI.
 *
 * PR-E exposes: confidence band helpers, extractor version constant,
 * processing flag helpers, job kinds. Classifier / extractor / drafts
 * / dedupe implementations land in PR-F and PR-G.
 */

export * from './types'
export * from './classifier'
export * from './extractor'
export * from './drafts'
export * from './dedupe'
export * from './observability'
export * from './admin'
