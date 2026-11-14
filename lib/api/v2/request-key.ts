import type { RequestKey } from "./types";

/** `RequestKey` pattern from the contract: `w-` + lowercase UUIDv7. */
export const REQUEST_KEY_PATTERN = /^w-[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isRequestKey(value: string): value is RequestKey {
  return REQUEST_KEY_PATTERN.test(value);
}

export interface RequestKeySource {
  /** Milliseconds since epoch for the UUIDv7 time field. */
  now?: () => number;
  /** Fills the array with cryptographically strong random bytes. */
  randomBytes?: (bytes: Uint8Array) => void;
}

function defaultRandom(bytes: Uint8Array) {
  if (!globalThis.crypto?.getRandomValues) throw new Error("crypto.getRandomValues is required to mint request keys");
  globalThis.crypto.getRandomValues(bytes);
}

/**
 * Mints a NEW web request key (`w-<uuidv7>`). Keys are never reused, also not after receipt expiry
 * (README §10, item 1). Call this only for a brand-new request or the explicit, warned "start a new request"
 * action; recovery and clarifications keep the original key.
 */
export function createRequestKey({ now = Date.now, randomBytes = defaultRandom }: RequestKeySource = {}): RequestKey {
  const bytes = new Uint8Array(16);
  randomBytes(bytes);
  const ms = Math.max(0, Math.floor(now()));
  // 48-bit big-endian Unix milliseconds.
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ms / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const key = `w-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  if (!isRequestKey(key)) throw new Error("minted request key does not match the contract pattern");
  return key;
}
