import { HttpError } from "./http.ts";

export const roles = [
  "admin", "manager", "commercial", "bdr",
  "operations", "finance", "user", "auditor",
] as const;
export type AccessRole = typeof roles[number];

export function requiredString(value: unknown, label: string, max = 160): string {
  if (typeof value !== "string") throw new HttpError(400, label + " e obrigatorio.");
  const clean = value.trim();
  if (!clean || clean.length > max) throw new HttpError(400, label + " e invalido.");
  return clean;
}

export function uuid(value: unknown, label: string): string {
  const clean = requiredString(value, label, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean)) {
    throw new HttpError(400, label + " e invalido.");
  }
  return clean;
}

export function email(value: unknown): string {
  const clean = requiredString(value, "E-mail", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    throw new HttpError(400, "E-mail invalido.");
  }
  return clean;
}

/**
 * Senha definida por um administrador para outra pessoa.
 *
 * Validar aqui e obrigatorio: o cliente pode ser contornado, e o padrao do
 * GoTrue (6 caracteres) e fraco demais para uma conta que enxerga carteira de
 * clientes e dados financeiros.
 */
export function password(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "Senha e obrigatoria.");
  if (value.length < 8) throw new HttpError(400, "A senha precisa de ao menos 8 caracteres.");
  if (value.length > 72) throw new HttpError(400, "A senha pode ter no maximo 72 caracteres.");
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    throw new HttpError(400, "A senha precisa misturar letras e numeros.");
  }
  if (/^\s|\s$/.test(value)) {
    throw new HttpError(400, "A senha nao pode comecar nem terminar com espaco.");
  }
  return value;
}

export function role(value: unknown, allowAdmin = false): AccessRole {
  if (typeof value !== "string" || !roles.includes(value as AccessRole)) {
    throw new HttpError(400, "Perfil de acesso invalido.");
  }
  if (value === "admin" && !allowAdmin) {
    throw new HttpError(400, "Convites nao podem criar outro administrador.");
  }
  return value as AccessRole;
}