import { createClient } from "@supabase/supabase-js";

const SUPABASE_SCANS_BUCKET = "scans";
const SUPABASE_SCAN_PAGES_TABLE = "scan_pages";

export const dynamic = "force-dynamic";

type ExpiredScanRow = {
  storage_path: string | null;
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret) {
    return jsonResponse({ ok: false, error: "Missing CRON_SECRET env" }, 500);
  }

  if (authorization !== `Bearer ${cronSecret}`) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: "Missing Supabase env" }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Delete only expired objects/rows to keep your storage budget under control.
  const nowIso = new Date().toISOString();

  // 1) Fetch expired storage paths
  const { data: expiredRows, error: selectError } = await supabaseAdmin
    .from(SUPABASE_SCAN_PAGES_TABLE)
    .select("storage_path")
    .lt("expires_at", nowIso)
    .limit(2000);

  if (selectError) {
    return jsonResponse({ ok: false, error: selectError.message }, 500);
  }

  const paths =
    (expiredRows as ExpiredScanRow[] | null | undefined)
      ?.map((row) => row.storage_path)
      .filter((path): path is string => typeof path === "string" && path.length > 0) ?? [];

  // 2) Remove storage objects (best-effort; if some are already missing, that's fine)
  if (paths.length > 0) {
    await supabaseAdmin.storage.from(SUPABASE_SCANS_BUCKET).remove(paths).catch(() => {});
  }

  // 3) Delete expired rows
  try {
    await supabaseAdmin.from(SUPABASE_SCAN_PAGES_TABLE).delete().lt("expires_at", nowIso);
  } catch {
    // best-effort cleanup
  }

  return jsonResponse({ ok: true, deleted_paths: paths.length }, 200);
}
