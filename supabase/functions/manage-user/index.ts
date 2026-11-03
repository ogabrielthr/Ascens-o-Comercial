import { assertAllowedOrigin, corsHeaders, HttpError, json } from "../_shared/http.ts";
import { requireOrganizationAdmin } from "../_shared/auth.ts";
import { password, requiredString, role, uuid } from "../_shared/validation.ts";

type ManagePayload = {
  organizationId?: unknown;
  userId?: unknown;
  action?: unknown;
  role?: unknown;
  active?: unknown;
  transferData?: unknown;
  destinationUserId?: unknown;
  teamId?: unknown;
  fullName?: unknown;
  phone?: unknown;
  extension?: unknown;
  password?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Metodo nao permitido." }, 405);

  try {
    assertAllowedOrigin(req);
    const payload = await req.json() as ManagePayload;
    const organizationId = uuid(payload.organizationId, "Organizacao");
    const targetUserId = uuid(payload.userId, "Usuario");
    const action = requiredString(payload.action, "Acao", 40);
    const { user, userClient, serviceClient } = await requireOrganizationAdmin(req, organizationId);

    const { data: target, error: targetError } = await serviceClient
      .from("organization_members")
      .select("user_id, role, active")
      .eq("organization_id", organizationId)
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new HttpError(404, "Usuario nao pertence a organizacao.");

    if (targetUserId === user.id && ["set_role", "set_active"].includes(action)) {
      throw new HttpError(400, "Voce nao pode alterar o proprio acesso.");
    }

    /* A propria senha se troca em Meu Perfil, onde a sessao atual e revalidada.
       Passar por aqui pularia essa checagem. */
    if (targetUserId === user.id && action === "set_password") {
      throw new HttpError(400, "Use Configuracoes > Meu perfil para trocar a sua senha.");
    }

    async function protectLastAdmin(): Promise<void> {
      if (target.role !== "admin" || !target.active) return;
      const { count, error } = await serviceClient
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("role", "admin")
        .eq("active", true);
      if (error) throw error;
      if ((count ?? 0) <= 1) {
        throw new HttpError(409, "A organizacao precisa manter ao menos um administrador ativo.");
      }
    }

    if (action === "set_role") {
      const nextRole = role(payload.role, true);
      if (target.role === "admin" && nextRole !== "admin") await protectLastAdmin();
      const { error } = await serviceClient
        .from("organization_members")
        .update({ role: nextRole, updated_at: new Date().toISOString() })
        .eq("organization_id", organizationId)
        .eq("user_id", targetUserId);
      if (error) throw error;
      const { error: managerFlagError } = await serviceClient
        .from("team_members")
        .update({ is_manager: nextRole === "manager" })
        .eq("user_id", targetUserId);
      if (managerFlagError) throw managerFlagError;

    } else if (action === "set_active") {
      if (typeof payload.active !== "boolean") {
        throw new HttpError(400, "Situacao de acesso invalida.");
      }
      if (!payload.active) {
        if (typeof payload.transferData !== "boolean") {
          throw new HttpError(400, "Escolha se a carteira sera transferida ou mantida antes de desativar.");
        }
        const destinationUserId = payload.destinationUserId
          ? uuid(payload.destinationUserId, "Usuario de destino") : null;
        const { data, error } = await userClient.rpc("deactivate_user_with_transfer", {
          p_organization_id: organizationId,
          p_user_id: targetUserId,
          p_transfer_data: payload.transferData,
          p_destination_user_id: destinationUserId,
        });
        if (error) {
          const status = error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500;
          throw new HttpError(status, error.message);
        }
        // The database writes the audit in the same transaction as the transfer.
        return json(req, data);
      }
      const { error } = await serviceClient
        .from("organization_members")
        .update({ active: payload.active, updated_at: new Date().toISOString() })
        .eq("organization_id", organizationId)
        .eq("user_id", targetUserId);
      if (error) throw error;

    } else if (action === "set_team") {
      const teamId = payload.teamId ? uuid(payload.teamId, "Equipe") : null;
      const { data: orgTeams, error: teamsError } = await serviceClient
        .from("teams")
        .select("id")
        .eq("organization_id", organizationId)
        .is("deleted_at", null);
      if (teamsError) throw teamsError;
      const teamIds = (orgTeams ?? []).map((team) => team.id);

      if (teamId && !teamIds.includes(teamId)) {
        throw new HttpError(400, "A equipe nao pertence a organizacao.");
      }
      if (teamIds.length) {
        const { error: deleteError } = await serviceClient
          .from("team_members")
          .delete()
          .eq("user_id", targetUserId)
          .in("team_id", teamIds);
        if (deleteError) throw deleteError;
      }
      if (teamId) {
        const { error: insertError } = await serviceClient
          .from("team_members")
          .insert({
            team_id: teamId,
            user_id: targetUserId,
            is_manager: target.role === "manager",
          });
        if (insertError) throw insertError;
      }

    } else if (action === "update_profile") {
      const fullName = requiredString(payload.fullName, "Nome completo");
      const phone = typeof payload.phone === "string" ? payload.phone.replace(/\D/g, "").slice(0, 20) || null : null;
      const extension = typeof payload.extension === "string" ? payload.extension.trim().slice(0, 20) || null : null;
      const { error } = await serviceClient
        .from("profiles")
        .update({ full_name: fullName, phone, extension, updated_at: new Date().toISOString() })
        .eq("id", targetUserId);
      if (error) throw error;

    } else if (action === "set_password") {
      /* A credencial nunca e persistida nem registrada pela aplicacao. */
      const nextPassword = password(payload.password);
      const { error } = await serviceClient.auth.admin.updateUserById(targetUserId, {
        password: nextPassword,
      });
      if (error) throw new HttpError(400, error.message);
    } else {
      throw new HttpError(400, "Acao nao reconhecida.");
    }

    const auditAction = action === "set_role"
      ? "role_change"
      : action === "set_active"
      ? (payload.active ? "activate" : "deactivate")
      : action === "set_password"
      ? "password_reset"
      : "update";
    const { error: auditError } = await serviceClient.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: user.id,
      action: auditAction,
      entity_type: "organization_members",
      entity_id: targetUserId,
      new_data: {
        requested_action: action,
        role: payload.role ?? null,
        active: payload.active ?? null,
        team_id: payload.teamId ?? null,
        /* Nunca registrar a senha, nem em hash: o log de auditoria e lido por
           mais gente do que o banco de credenciais. */
        target_was_admin: action === "set_password"
          ? target.role === "admin"
          : null,
      },
    });
    if (auditError) console.error("manage-user audit", auditError);

    return json(req, { ok: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    console.error("manage-user", error);
    return json(req, {
      error: status === 500 ? "Nao foi possivel atualizar o usuario." : message,
    }, status);
  }
});
