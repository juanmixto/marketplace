export function isMissingTelegramScopeColumnError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /TelegramLink\.scope does not exist|Unknown argument 'scope'|column .*TelegramLink\.scope.*does not exist/i.test(
      error.message,
    )
  )
}
