export type CartHydrationStatus = 'authenticated' | 'unauthenticated' | 'loading'

export type CartHydrationAction = 'clear' | 'load' | 'merge' | 'noop'

export interface CartHydrationPlanInput {
  status: CartHydrationStatus
  userId?: string | null
  alreadyMergedForUser: boolean
  localItemCount: number
}

export function getCartHydrationAction({
  status,
  userId,
  alreadyMergedForUser,
  localItemCount,
}: CartHydrationPlanInput): CartHydrationAction {
  if (status !== 'authenticated' || !userId) return 'noop'
  if (alreadyMergedForUser) return 'load'
  return localItemCount > 0 ? 'merge' : 'load'
}
