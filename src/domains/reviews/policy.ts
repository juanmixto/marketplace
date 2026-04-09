export function canReviewDeliveredOrder({
  orderDelivered,
  reviewExists,
}: {
  orderDelivered: boolean
  reviewExists: boolean
}) {
  return orderDelivered && !reviewExists
}
