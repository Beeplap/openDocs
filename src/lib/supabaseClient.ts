import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const isRemoteScanStorageEnabled =
  process.env.NEXT_PUBLIC_ENABLE_TEMP_SCAN_STORAGE === "true" && !!supabaseUrl && !!supabaseAnonKey;

if (process.env.NEXT_PUBLIC_ENABLE_TEMP_SCAN_STORAGE === "true" && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn(
    "Supabase env vars missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
  );
}

export const supabase = isRemoteScanStorageEnabled
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export const SUPABASE_SCANS_BUCKET = "scans";
export const SUPABASE_SCAN_PAGES_TABLE = "scan_pages";
