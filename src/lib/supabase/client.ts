import { createBrowserClient } from "@supabase/ssr";

// Nota: ver comentário em server.ts sobre o generic Database.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
