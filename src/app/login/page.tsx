import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { LoginForm } from "./login-form";
import { BRAND, copyrightLine } from "@/lib/brand";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex h-14 w-full items-center justify-center overflow-hidden rounded-md bg-black px-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.logoFullPath} alt={BRAND.logoAlt} className="h-full max-w-full object-contain" />
          </span>
          <CardDescription>Entre com sua conta para acessar os painéis.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        {copyrightLine()}
        <br />
        Desenvolvido por {BRAND.developer}
      </p>
    </div>
  );
}
