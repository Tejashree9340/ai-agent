import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { projectId, publicAnonKey } from "../../utils/supabase/info"

const globalScope = globalThis as typeof globalThis & {
  __mystiqueSupabaseV2?: SupabaseClient
}

const legacyStorageKey = `sb-${projectId}-auth-token`
const mystiqueStorageKey = `mystique-${projectId}-auth-token`

if (typeof window !== "undefined") {
  const legacySession = window.localStorage.getItem(legacyStorageKey)
  if (legacySession && !window.localStorage.getItem(mystiqueStorageKey)) {
    window.localStorage.setItem(mystiqueStorageKey, legacySession)
  }
}

export const supabase =
  globalScope.__mystiqueSupabaseV2 ??
  createClient(`https://${projectId}.supabase.co`, publicAnonKey, {
    auth: {
      storageKey: mystiqueStorageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

globalScope.__mystiqueSupabaseV2 = supabase
