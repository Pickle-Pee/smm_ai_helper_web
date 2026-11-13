import { appVersion } from "@/lib/site";

// Liveness probe for Docker, the reverse proxy and smoke tests.
// Deliberately minimal: no hostnames, paths, env values or dependency details.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok", version: appVersion },
    { headers: { "Cache-Control": "no-store" } },
  );
}
