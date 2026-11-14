import type { WebApiV2 } from "./contract";

/**
 * Which Web API v2 transport the APP uses.
 *
 * F1 (this code): the fixture transport is the ONLY selectable mode. This function deliberately reads no
 * environment variable, no `NEXT_PUBLIC_*` flag, no URL parameter and no backend health probe, so the deployed
 * preview can never switch to HTTP by configuration or because a backend suddenly answers.
 *
 * Switching HTTP on is a separate, reviewed code change (docs/api-client.md, "Switching HTTP on"): it adds
 * `"http"` here together with the prerequisites listed there. Tests pin this behaviour.
 */
export type WebApiV2Mode = "fixture";

export const WEB_API_V2_HTTP_ENABLED = false as const;

export function resolveWebApiV2Mode(): WebApiV2Mode {
  return "fixture";
}

/**
 * Loads the app's Web API v2 transport lazily (keeps fixture JSON out of the initial bundle). The HTTP client
 * module is intentionally not imported anywhere in app code.
 */
export async function loadAppWebApiV2(): Promise<WebApiV2> {
  const mode = resolveWebApiV2Mode();
  if (mode !== "fixture") throw new Error(`Unsupported Web API v2 mode: ${String(mode)}`);
  const { FixtureWebApiV2Client } = await import("./fixture-client");
  // A few "running" reads before a simulated workflow completes, so the Workspace shows real progress states.
  return new FixtureWebApiV2Client({ pollsUntilDone: 3 });
}
