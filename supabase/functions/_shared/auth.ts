import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { HttpError } from "./http.ts";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Variavel obrigatoria ausente: " + name);
  return value;
}

export function createServiceClient(): SupabaseClient {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createUserClient(req: Request): SupabaseClient {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new HttpError(401, "Sessao ausente.");
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function serviceRolePepper(): string {
  return requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export type AdminContext = {
  user: User;
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
};

export async function requireOrganizationAdmin(
  req: Request,
  organizationId: string,
): Promise<AdminContext> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "Sessao ausente.");
  }

  const userClient = createUserClient(req);
  const serviceClient = createServiceClient();

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) throw new HttpError(401, "Sessao invalida.");

  const { data: membership, error: membershipError } = await serviceClient
    .from("organization_members")
    .select("role, active")
    .eq("organization_id", organizationId)
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership?.active || membership.role !== "admin") {
    throw new HttpError(403, "Apenas administradores podem realizar esta operacao.");
  }

  return { user: authData.user, userClient, serviceClient };
}
