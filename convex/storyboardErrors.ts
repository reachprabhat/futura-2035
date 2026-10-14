import { v } from "convex/values";
export const failureDetailValidator = v.object({
  stage: v.string(), panel: v.optional(v.number()), message: v.string(), name: v.string(),
  status: v.optional(v.number()), code: v.optional(v.string()), type: v.optional(v.string()),
  requestId: v.optional(v.string()), stack: v.optional(v.string()),
});
export function failureDetail(error: unknown, stage: string, panel?: number) {
  const e = error !== null && typeof error === "object" ? error as Record<string, unknown> : null;
  const message = e && "data" in e ? typeof e.data === "string" ? e.data : (JSON.stringify(e.data) ?? String(e.data))
    : error instanceof Error ? error.message : String(error);
  return {
    stage, ...(panel === undefined ? {} : { panel }), message,
    name: error instanceof Error ? error.name : "Error",
    ...(typeof e?.status === "number" ? { status: e.status } : {}),
    ...(typeof e?.code === "string" ? { code: e.code } : {}),
    ...(typeof e?.type === "string" ? { type: e.type } : {}),
    ...(typeof e?.request_id === "string" ? { requestId: e.request_id } : typeof e?._request_id === "string" ? { requestId: e._request_id } : {}),
    ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
  };
}
