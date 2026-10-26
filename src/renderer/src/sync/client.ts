import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.RENDERER_VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.RENDERER_VITE_SUPABASE_ANON_KEY as string | undefined

/** null — синхронізацію не налаштовано (немає ключів у .env); Kast працює локально */
// PKCE: вхід через Google повертає одноразовий код, який обмінюємо на сесію в самому застосунку
export const supabase =
  url && key
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce', detectSessionInUrl: false } })
    : null
