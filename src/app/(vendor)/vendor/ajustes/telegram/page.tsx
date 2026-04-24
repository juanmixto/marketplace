import { redirect } from 'next/navigation'

// The Telegram connect panel was merged into /vendor/ajustes/notificaciones
// so vendors manage channel linking and per-event toggles in one place.
// Kept as a permanent redirect so existing bookmarks and deep links still work.
export default function VendorTelegramRedirect(): never {
  redirect('/vendor/ajustes/notificaciones')
}
