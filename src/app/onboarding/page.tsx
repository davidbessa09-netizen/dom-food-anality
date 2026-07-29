import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

const STEPS = [
  "Criar o projeto Supabase e rodar supabase/schema.sql",
  "Criar seu usuário admin em Authentication → Users",
  "Inserir seu vínculo em user_organizations com role = admin_geral",
  "Conectar uma integração (Anota AI/iFood) e sincronizar suas lojas",
  "Fazer login e explorar o menu lateral",
];

export default function OnboardingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Bem-vindo ao {BRAND.name}</CardTitle>
          <CardDescription>
            Siga os passos abaixo para colocar o sistema no ar (detalhes em
            DEPLOYMENT.md).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <Link href="/login" className={buttonVariants({ className: "w-full" })}>
            Ir para o login
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
