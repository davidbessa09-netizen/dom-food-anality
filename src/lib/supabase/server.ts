import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Nota: os tipos manuais de src/types/database.ts ainda não são totalmente
// compatíveis com o generic estrito do supabase-js. Assim que o projeto
// Supabase real existir, rodar `supabase gen types typescript` e usar
// createServerClient<Database> com o tipo gerado.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // chamado de um Server Component sem permissão de escrita de cookie;
            // o middleware cuida de refrescar a sessão nesse caso.
          }
        },
      },
      global: {
        // O Next.js intercepta e cacheia `fetch` por padrão; sem isso, respostas
        // do PostgREST ficam "presas" em cache mesmo após os dados mudarem no banco.
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}
