import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { assertAllowedOrigin, corsHeaders, HttpError, json } from "../_shared/http.ts";
import { requireOrganizationAdmin } from "../_shared/auth.ts";
import { email, password, requiredString, role, uuid } from "../_shared/validation.ts";

type InvitePayload = {
  organizationId?: unknown;
  email?: unknown;
  fullName?: unknown;
  role?: unknown;
  teamId?: unknown;
  initialPassword?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Metodo nao permitido." }, 405);

  let invitedUserId: string | null = null;
  let adminClient: SupabaseClient | null = null;
  let createdAuthUser = false;

  try {
    assertAllowedOrigin(req);
    const payload = await req.json() as InvitePayload;
    const organizationId = uuid(payload.organizationId, "Organizacao");
    const inviteEmail = email(payload.email);
    const fullName = requiredString(payload.fullName, "Nome completo");
    const accessRole = role(payload.role);
    let teamId = payload.teamId ? uuid(payload.teamId, "Equipe") : null;
    let teamName: string | null = null;
    const initialPassword = password(payload.initialPassword);
    const deliveryMode = "password";

    const { user, serviceClient } = await requireOrganizationAdmin(req, organizationId);
    adminClient = serviceClient;

    const { data: organization, error: orgError } = await serviceClient
      .from("organizations")
      .select("id, active")
      .eq("id", organizationId)
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (orgError) throw orgError;
    if (!organization) throw new HttpError(404, "Organizacao nao encontrada.");

    if (teamId) {
      const { data: team, error: teamError } = await serviceClient
        .from("teams")
        .select("id, name")
        .eq("id", teamId)
        .eq("organization_id", organizationId)
        .eq("active", true)
        .is("deleted_at", null)
        .maybeSingle();
      if (teamError) throw teamError;
      if (!team) throw new HttpError(400, "A equipe nao pertence a organizacao.");
      teamName = team.name;
    } else {
      const { data: firstTeam, error: firstTeamError } = await serviceClient
        .from("teams")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (firstTeamError) throw firstTeamError;

      if (firstTeam) {
        teamId = firstTeam.id;
        teamName = firstTeam.name;
      } else {
        const { data: createdTeam, error: createdTeamError } = await serviceClient
          .from("teams")
          .insert({
            organization_id: organizationId,
            name: "Equipe Comercial",
            color: "#FF9800",
            active: true,
          })
          .select("id, name")
          .single();
        if (createdTeamError) throw createdTeamError;
        teamId = createdTeam.id;
        teamName = createdTeam.name;
      }
    }

    const { data: existingProfile, error: existingProfileError } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("email", inviteEmail)
      .maybeSingle();
    if (existingProfileError) throw existingProfileError;

    if (existingProfile) {
      const { data: existingMembership, error: existingMembershipError } = await serviceClient
        .from("organization_members")
        .select("active")
        .eq("organization_id", organizationId)
        .eq("user_id", existingProfile.id)
        .maybeSingle();
      if (existingMembershipError) throw existingMembershipError;
      if (existingMembership?.active) {
        throw new HttpError(409, "Este usuario ja esta cadastrado nesta organizacao.");
      }
      invitedUserId = existingProfile.id;
      const { error: passwordError } = await serviceClient.auth.admin.updateUserById(invitedUserId, {
        password: initialPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (passwordError) throw passwordError;
    }

    if (!invitedUserId) {
      const { data: createdUser, error: createError } = await serviceClient.auth.admin.createUser({
        email: inviteEmail,
        password: initialPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createError) {
        if (/already|registered|exists/i.test(createError.message)) {
          throw new HttpError(409, "Ja existe uma conta com este e-mail.");
        }
        throw createError;
      }
      if (!createdUser.user) throw new Error("O provedor nao retornou o usuario criado.");
      invitedUserId = createdUser.user.id;
      createdAuthUser = true;
    }

    const { error: profileError } = await serviceClient
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", invitedUserId);
    if (profileError) throw profileError;

    const { error: membershipError } = await serviceClient
      .from("organization_members")
      .upsert({
        organization_id: organizationId,
        user_id: invitedUserId,
        role: accessRole,
        active: true,
      }, { onConflict: "organization_id,user_id" });
    if (membershipError) throw membershipError;

    if (teamId) {
      const { error: teamMemberError } = await serviceClient
        .from("team_members")
        .upsert({ team_id: teamId, user_id: invitedUserId, is_manager: accessRole === "manager" }, {
          onConflict: "team_id,user_id",
        });
      if (teamMemberError) throw teamMemberError;
    }

    const { error: auditError } = await serviceClient.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: user.id,
      action: "invite",
      entity_type: "organization_members",
      entity_id: invitedUserId,
      new_data: { email: inviteEmail, role: accessRole, team_id: teamId, delivery: deliveryMode },
    });
    if (auditError) console.error("invite-user audit", auditError);

    return json(req, {
      ok: true,
      user: {
        id: invitedUserId, email: inviteEmail, fullName, role: accessRole,
        teamId, teamName,
      },
      delivery: deliveryMode,
      activationLink: null,
    }, 201);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    console.error("invite-user", error);

    if (invitedUserId && createdAuthUser && adminClient && status >= 500) {
      try {
        await adminClient.auth.admin.deleteUser(invitedUserId);
      } catch (cleanupError) {
        console.error("invite-user cleanup", cleanupError);
      }
    }

    return json(req, {
      error: status === 500 ? "Nao foi possivel criar o usuario." : message,
    }, status);
  }
});
