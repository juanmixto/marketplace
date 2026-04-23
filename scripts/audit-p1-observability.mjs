#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)

function readText(relativePath) {
	const absolutePath = path.join(repoRoot, relativePath)
	return fs.readFileSync(absolutePath, 'utf8')
}

function hasAll(haystack, needles) {
	return needles.filter((needle) => haystack.includes(needle))
}

function checkLogScopes() {
	const runbook = readText('docs/runbooks/payment-incidents.md')

	const requiredCheckoutScopes = [
		'checkout.start',
		'checkout.committed',
		'checkout.payment_intent_failed',
		'checkout.tx_failed',
	]
	const requiredStripeScopes = [
		'stripe.webhook.received',
		'stripe.webhook.duplicate',
		'stripe.webhook.processing_failed',
		'stripe.webhook.payment_mismatch',
	]

	const checkoutFound = hasAll(runbook, requiredCheckoutScopes)
	const stripeFound = hasAll(runbook, requiredStripeScopes)

	const missing = [
		...requiredCheckoutScopes.filter((s) => !checkoutFound.includes(s)),
		...requiredStripeScopes.filter((s) => !stripeFound.includes(s)),
	]

	return {
		ok: missing.length === 0,
		missing,
	}
}

function checkFlagsPolicy() {
	const flagsSource = readText('src/lib/flags.ts')
	const conventions = readText('docs/conventions.md')

	const namingPresent =
		flagsSource.includes('kill-<area>') && flagsSource.includes('feat-<name>')
	const failOpenPresent = flagsSource.includes('Fail-open policy') || flagsSource.includes('Fail-open')
	const cleanupRulePresent =
		conventions.includes('cleanup ticket') && conventions.includes('30 days')

	return {
		ok: namingPresent && failOpenPresent && cleanupRulePresent,
		details: {
			namingPresent,
			failOpenPresent,
			cleanupRulePresent,
		},
	}
}

function checkCfBeforeXffInFunction(source, functionName) {
	const fnStart = source.indexOf(`function ${functionName}`)
	if (fnStart === -1) return false

	const fnBody = source.slice(fnStart, fnStart + 2000)
	const cfVarIndex = fnBody.indexOf("const cfConnectingIp =")
	const xffVarIndex = fnBody.indexOf("const forwarded")

	return cfVarIndex !== -1 && xffVarIndex !== -1 && cfVarIndex < xffVarIndex
}

function checkIpPrecedence() {
	const ratelimit = readText('src/lib/ratelimit.ts')
	const audit = readText('src/lib/audit.ts')

	const ratelimitCfFirst = checkCfBeforeXffInFunction(ratelimit, 'getClientIP')
	const auditCfFirst = checkCfBeforeXffInFunction(audit, 'extractAuditIp')

	return {
		ok: ratelimitCfFirst && auditCfFirst,
		details: {
			ratelimitCfFirst,
			auditCfFirst,
		},
	}
}

function main() {
	console.log('--- P1 audit: observability, flags, ip precedence ---')

	const logScopes = checkLogScopes()
	const flags = checkFlagsPolicy()
	const ipPrecedence = checkIpPrecedence()

	console.log(`log scopes: ${logScopes.ok ? 'OK' : 'FAIL'}`)
	if (!logScopes.ok) {
		console.log(`missing scopes: ${logScopes.missing.join(', ')}`)
	}

	console.log(`flags policy: ${flags.ok ? 'OK' : 'FAIL'}`)
	console.log(`  naming: ${flags.details.namingPresent ? 'OK' : 'FAIL'}`)
	console.log(`  fail-open: ${flags.details.failOpenPresent ? 'OK' : 'FAIL'}`)
	console.log(`  cleanup rule: ${flags.details.cleanupRulePresent ? 'OK' : 'FAIL'}`)

	console.log(`ip precedence: ${ipPrecedence.ok ? 'OK' : 'FAIL'}`)
	console.log(`  ratelimit cf first: ${ipPrecedence.details.ratelimitCfFirst ? 'OK' : 'FAIL'}`)
	console.log(`  audit cf first: ${ipPrecedence.details.auditCfFirst ? 'OK' : 'FAIL'}`)

	const ok = logScopes.ok && flags.ok && ipPrecedence.ok
	if (!ok) {
		process.exitCode = 1
	}
}

main()
