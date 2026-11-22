import { WebApiV2Client, type WebApiV2ClientOptions } from "./http-client";

const OPERATIONS = ["startTelegramLoginChallenge", "exchangeTelegramLoginToken", "getMe", "getCsrfToken", "logout"] as const;

export type CabinetApi = Pick<WebApiV2Client, (typeof OPERATIONS)[number]>;

export function createCabinetApi(onUnauthenticated?: WebApiV2ClientOptions["onUnauthenticated"]): CabinetApi {
  return new WebApiV2Client({
    fetch: (url, init) => window.fetch(url, init),
    onUnauthenticated,
    allowedOperations: OPERATIONS,
  });
}
