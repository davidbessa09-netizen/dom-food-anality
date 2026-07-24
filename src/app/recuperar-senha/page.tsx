import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RecoverForm } from "./recover-form";

export default function RecoverPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Recuperar senha</CardTitle>
          <CardDescription>
            Informe seu e-mail para receber o link de redefinição de senha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecoverForm />
        </CardContent>
      </Card>
    </div>
  );
}
