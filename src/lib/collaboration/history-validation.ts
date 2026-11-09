import { z } from "zod";
import type { HistoryAction } from "./history";

const id = z.string().regex(/^[\w-]{1,100}$/),
  member = z.string().min(1).max(200);
const scopes = z.array(z.string().min(1).max(2048)).min(1).max(1000);
const choices = z.record(z.string().max(32_768), z.enum(["ours", "theirs"]));
const message = z.string().trim().min(1).max(500);
const schema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("branch"),
      id,
      branchId: id,
      name: z.string().trim().min(1).max(80),
      fromCommit: id,
    })
    .strict(),
  z.object({ type: z.literal("commit"), id, branchId: id, scopes, message }).strict(),
  z
    .object({
      type: z.literal("permission"),
      id,
      memberId: member,
      permission: z
        .object({
          mergeMain: z.boolean().optional(),
          editMain: z.boolean().optional(),
          restoreMain: z.boolean().optional(),
          until: z.string().datetime({ offset: true }).optional(),
          proposalId: id.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({ type: z.literal("editors"), id, branchId: id, editors: z.array(member).max(10_000).optional() })
    .strict(),
  z
    .object({ type: z.literal("propose"), id, branchId: id, targetId: id, commitId: id, scopes, message })
    .strict(),
  z.object({ type: z.literal("reject"), id, proposalId: id }).strict(),
  z
    .object({
      type: z.literal("merge"),
      id,
      proposalId: id,
      expectedHead: id,
      choices,
      scopes: scopes.optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("pull"), id, branchId: id, commitId: id, scopes, expectedHead: id, choices })
    .strict(),
  z.object({ type: z.literal("restore"), id, branchId: id, commitId: id, scopes }).strict(),
]);
/** El mismo contrato se comprueba en IPC, cola offline y recepción autenticada. */
export function parseHistoryAction(value: unknown): HistoryAction {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new Error("Operación de historial inválida: revisa el mensaje, las vistas y los permisos.");
  return result.data;
}
