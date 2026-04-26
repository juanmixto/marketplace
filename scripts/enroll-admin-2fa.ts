import { db } from '@/lib/db'
import { encryptSecret } from '@/domains/auth/two-factor-crypto'
import {
  generateSecret,
  NobleCryptoPlugin,
  ScureBase32Plugin,
} from 'otplib'
import { generateSync as totpGenerate } from '@otplib/totp'

async function main() {
  const email = process.argv[2] ?? 'admin@dry-run.local'
  const user = await db.user.findUniqueOrThrow({ where: { email } })
  const CRYPTO = new NobleCryptoPlugin()
  const BASE32 = new ScureBase32Plugin()
  const secret = generateSecret({ crypto: CRYPTO, base32: BASE32 })
  const encrypted = encryptSecret(secret)
  await db.userTwoFactor.upsert({
    where: { userId: user.id },
    create: { userId: user.id, secretEncrypted: encrypted, enabledAt: new Date() },
    update: { secretEncrypted: encrypted, enabledAt: new Date(), lastUsedStep: null },
  })
  const code = totpGenerate({ secret, crypto: CRYPTO, base32: BASE32 })
  console.log(`user:          ${email}`)
  console.log(`TOTP secret:   ${secret}`)
  console.log(
    `otpauth URI:   otpauth://totp/Marketplace:${email}?secret=${secret}&issuer=Marketplace`,
  )
  console.log(`current code:  ${code}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
