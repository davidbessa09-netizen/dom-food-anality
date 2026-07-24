import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PagePlaceholder({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ainda não implementado</CardTitle>
          <CardDescription>
            Esta tela faz parte da {phase}. A navegação já está no lugar; o conteúdo
            chega na fase correspondente do plano de implementação (ver README.md).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Dado indisponível — funcionalidade ainda não implementada.
        </CardContent>
      </Card>
    </div>
  );
}
