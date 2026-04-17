// Independent Supabase client for the VFD Sandbox.
// Uses a SEPARATE storage key so the sandbox session does not collide with
// the main WeSave session. This lets a developer be signed in to WeSave in
// one tab and signed in as a different "test" user in the sandbox tab.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const sandboxSupabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: localStorage,
      storageKey: "sb-sandbox-auth",
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
