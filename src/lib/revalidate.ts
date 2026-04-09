import { revalidatePath } from 'next/cache'

export function safeRevalidatePath(path: string) {
  if (process.env.NODE_ENV === 'test') return
  revalidatePath(path)
}
