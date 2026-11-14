#!/usr/bin/env node
/**
 * Generates TypeScript types for Brenvio Web API v2 from the contract YAML (single source of truth).
 *
 *   npm run generate:api   # write lib/api/generated/*
 *   npm run check:api      # fail if the committed files differ from what the YAML produces (CI drift check)
 *
 * Output is deterministic: no timestamps, LF line endings, pinned openapi-typescript (exact devDependency),
 * and the sha256 of the YAML (normalized to LF) is embedded so even comment-only contract edits are detected.
 * DTOs are never written by hand: `web-api-v2.ts` comes from openapi-typescript, `web-api-v2.meta.ts` is a
 * mechanical projection of `info`, `x-error-catalog` and the operation table of the same YAML.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";
import { parse } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = join(root, "docs/api/web-api-v2.openapi.yaml");
const outDir = join(root, "lib/api/generated");
const typesFile = join(outDir, "web-api-v2.ts");
const metaFile = join(outDir, "web-api-v2.meta.ts");
const check = process.argv.includes("--check");

const lf = (s) => s.replace(/\r\n/g, "\n");
const specText = lf(readFileSync(specPath, "utf8"));
const specSha256 = createHash("sha256").update(specText, "utf8").digest("hex");
const generatorVersion = JSON.parse(readFileSync(join(root, "node_modules/openapi-typescript/package.json"), "utf8")).version;
const spec = parse(specText);

const banner = (what) =>
  [
    "/**",
    ` * ${what}`,
    " * GENERATED FILE - DO NOT EDIT. Regenerate with `npm run generate:api`; CI runs `npm run check:api`.",
    ` * Source: docs/api/web-api-v2.openapi.yaml (info.version ${spec.info.version}, sha256 ${specSha256}).`,
    ` * Generator: openapi-typescript ${generatorVersion}.`,
    " */",
    "",
  ].join("\n");

async function buildTypes() {
  // Default openapi-typescript options (identical to the CLI): shapes stay 1:1 with the YAML.
  const ast = await openapiTS(pathToFileURL(specPath));
  return lf(banner("TypeScript types for Brenvio Web API v2 (PROPOSED contract).") + "\n" + astToString(ast));
}

const METHODS = ["get", "post", "put", "patch", "delete"];

function buildMeta() {
  const catalog = spec["x-error-catalog"] ?? {};
  const errorEntries = Object.entries(catalog).map(
    ([code, entry]) => `  ${code}: { status: ${entry.status}, retry: ${JSON.stringify(entry.retry)} },`,
  );
  const operations = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      operations.push(
        `  ${op.operationId}: { method: ${JSON.stringify(method.toUpperCase())}, path: ${JSON.stringify(path)}, status: ${JSON.stringify(op["x-status"])}, unsafe: ${method !== "get"} },`,
      );
    }
  }
  const body = [
    `export const WEB_API_V2_CONTRACT = {`,
    `  version: ${JSON.stringify(spec.info.version)},`,
    `  status: ${JSON.stringify(spec.info["x-contract-status"])},`,
    `  responseSchemaVersion: ${JSON.stringify(spec.info["x-response-schema-version"])},`,
    `  specSha256: ${JSON.stringify(specSha256)},`,
    `  /** Public same-origin prefix the browser uses (servers[0].url). Paths below are native FastAPI paths. */`,
    `  publicBasePath: ${JSON.stringify(spec.servers?.[0]?.url ?? "")},`,
    `} as const;`,
    ``,
    `/** Projection of the root \`x-error-catalog\`: HTTP status and retry policy per error code. */`,
    `export const ERROR_CATALOG = {`,
    ...errorEntries,
    `} as const;`,
    ``,
    `/** Every operation of the contract: method, native path, contract status and whether it is an unsafe method. */`,
    `export const OPERATIONS = {`,
    ...operations,
    `} as const;`,
    ``,
    `export type ErrorRetryPolicy = (typeof ERROR_CATALOG)[keyof typeof ERROR_CATALOG]["retry"];`,
    `export type OperationId = keyof typeof OPERATIONS;`,
    ``,
  ].join("\n");
  return lf(banner("Contract metadata for Brenvio Web API v2 (version, error catalog, operation table).") + "\n" + body);
}

const outputs = [
  [typesFile, await buildTypes()],
  [metaFile, buildMeta()],
];

let drift = false;
for (const [file, content] of outputs) {
  const rel = relative(root, file).replace(/\\/g, "/");
  if (check) {
    const current = existsSync(file) ? lf(readFileSync(file, "utf8")) : null;
    if (current !== content) {
      drift = true;
      console.error(`✗ ${rel} is out of date with docs/api/web-api-v2.openapi.yaml`);
    } else {
      console.log(`✓ ${rel} matches the contract (sha256 ${specSha256.slice(0, 12)}…)`);
    }
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content, "utf8");
    console.log(`wrote ${rel}`);
  }
}

if (drift) {
  console.error("Run `npm run generate:api` and commit the result. Never edit generated files by hand.");
  process.exit(1);
}
