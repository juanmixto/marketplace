import type { TelegramMessage } from '../update-schema'
import { sendRawMessage } from '../service'

const HELP_TEXT = [
  '<b>Comandos disponibles</b>',
  '',
  '/start <i>&lt;token&gt;</i> — vincula tu cuenta (genera el token en Ajustes → Telegram).',
  '/disconnect — desvincula la cuenta de este chat.',
  '/help — muestra este mensaje.',
].join('\n')

export async function handleHelpCommand(message: TelegramMessage): Promise<void> {
  await sendRawMessage(String(message.chat.id), { text: HELP_TEXT })
}
