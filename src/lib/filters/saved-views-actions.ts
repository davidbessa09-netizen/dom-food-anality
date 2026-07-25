"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";

export interface SavedView {
  id: string;
  name: string;
  path: string;
  params: Record<string, string>;
  created_at: string;
}

export async function listSavedViews(path: string): Promise<SavedView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_views")
    .select("id, name, path, params, created_at")
    .eq("path", path)
    .order("created_at", { ascending: false });
  return (data ?? []) as SavedView[];
}

export interface SaveViewResult {
  ok: boolean;
  error?: string;
}

export async function createSavedView(path: string, name: string, params: Record<string, string>): Promise<SaveViewResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sessão expirada." };

  const supabase = await createClient();
  const { error } = await supabase.from("saved_views").insert({
    user_id: user.id,
    path,
    name,
    params,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(path);
  return { ok: true };
}

export async function deleteSavedView(id: string, path: string): Promise<SaveViewResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("saved_views").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(path);
  return { ok: true };
}
