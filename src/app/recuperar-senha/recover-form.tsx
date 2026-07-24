"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recoverPassword, type RecoverState } from "./actions";

const initialState: RecoverState = {};

export function RecoverForm() {
  const [state, formAction, pending] = useActionState(recoverPassword, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Enviando..." : "Enviar link de recuperação"}
      </Button>

      <div className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="hover:underline">
          Voltar ao login
        </Link>
      </div>
    </form>
  );
}
