"""Independent consistency checks for the Brenvio Web API v2 contract (C0).

Docs-only tool: it reads docs/api/ and, optionally, a READ-ONLY backend checkout. It never writes
anything and never calls a network service.

    python -m venv .venv-contract
    .venv-contract/bin/pip install -r docs/api/tools/requirements.txt
    .venv-contract/bin/python docs/api/tools/check_contract.py \
        [--backend-repo ../smm_ai_helper --backend-ref 76b6c1b]

Exit code 0 only if every check passed. TypeScript generation is a separate step (see README §16).
"""
import argparse
import copy
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import tempfile

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import validate as validate_openapi

API = pathlib.Path(__file__).resolve().parent.parent
SPEC_PATH = API / "web-api-v2.openapi.yaml"
FIX = API / "fixtures"
METHODS = ("get", "put", "post", "patch", "delete")
UNSAFE = ("post", "put", "patch", "delete")
# (stored schema_version, result_kind) pairs this contract registers a frozen decoder for.
DECODERS = {("copilot_api.v1", k) for k in ("DIRECT_RESULT", "MODULE_RESULT", "NEEDS_INPUT", "RUN")} | {
    ("web_api.v2", "UNSUPPORTED"), ("web_chat.v1", "CHAT_REPLY")}

failures = []
passed = []


def check(name, ok, detail=""):
    (passed if ok else failures).append(name if ok else f"{name}: {detail}")
    return ok


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def sha(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def load_json(rel):
    return json.loads((FIX / rel).read_text(encoding="utf-8"))


def walk(value, path=()):
    yield path, value
    if isinstance(value, dict):
        for k, v in value.items():
            yield from walk(v, path + (k,))
    elif isinstance(value, list):
        for i, v in enumerate(value):
            yield from walk(v, path + (i,))


spec = yaml.safe_load(SPEC_PATH.read_text(encoding="utf-8"))
schemas = spec["components"]["schemas"]


def validator(schema_ref):
    root = {"components": spec["components"], "$ref": schema_ref}
    return Draft202012Validator(root, format_checker=FormatChecker())


def errors_of(schema_ref, instance):
    return [f"{'/'.join(map(str, e.absolute_path))}: {e.message[:160]}"
            for e in validator(schema_ref).iter_errors(instance)]


def deref(node):
    seen = 0
    while isinstance(node, dict) and set(node) == {"$ref"}:
        ref = node["$ref"]
        assert ref.startswith("#/"), ref
        target = spec
        for part in ref[2:].split("/"):
            target = target[part]
        node = target
        seen += 1
        assert seen < 10
    return node


def operations():
    for path, item in spec["paths"].items():
        for method in METHODS:
            if method in item:
                yield path, method, item[method]


# 1. OpenAPI 3.1 ----------------------------------------------------------------------------
try:
    validate_openapi(spec)
    check("openapi-3.1 validation (openapi-spec-validator)", True)
except Exception as exc:  # noqa: BLE001
    check("openapi-3.1 validation (openapi-spec-validator)", False, str(exc)[:400])
check("openapi version is 3.1.x", str(spec["openapi"]).startswith("3.1."), spec["openapi"])

# 2. $ref and externalValue -----------------------------------------------------------------
refs = [v for p, v in walk(spec) if p and p[-1] == "$ref"]
broken = []
for ref in refs:
    try:
        deref({"$ref": ref})
    except (KeyError, AssertionError):
        broken.append(ref)
check(f"all {len(refs)} $ref resolve", not broken, broken[:5])
external = [(p, v) for p, v in walk(spec) if p and p[-1] == "externalValue"]
missing = [v for _, v in external if not (API / v).is_file()]
check(f"all {len(external)} examples.externalValue files exist", not missing, missing)
if failures:
    print("structural checks failed; later checks need a valid, fully resolvable document")
    for f in failures:
        print("  FAIL", f)
    sys.exit(1)

# 3. Status markers ---------------------------------------------------------------------------
bad = [f"{m.upper()} {p}" for p, m, op in operations() if op.get("x-status") not in ("proposed", "future", "deferred")]
check("every operation has x-status proposed|future|deferred", not bad, bad)
bad = [n for n, s in schemas.items() if s.get("x-status") not in ("existing", "proposed", "future", "deferred")]
check("every schema has x-status existing|proposed|future|deferred", not bad, bad)
bad = [n for n, s in schemas.items() if s.get("x-status") == "existing" and "x-source" not in s]
check("every existing schema names its x-source", not bad, bad)
bad = []
for n, s in schemas.items():
    if s.get("x-status") == "proposed":
        for p, v in walk(s):
            if p and p[-1] == "$ref" and v.startswith("#/components/schemas/"):
                target = schemas[v.rsplit("/", 1)[1]]
                if target.get("x-status") in ("future",) and n not in ("ResultSnapshot",):
                    bad.append(f"{n} -> {v}")
check("proposed schemas do not depend on future schemas (except the reserved ResultSnapshot variant)", not bad, bad)

# 4. Security / CSRF ----------------------------------------------------------------------------
bad = []
for p, m, op in operations():
    if m in UNSAFE and op["operationId"] not in ("exchangeTelegramLoginToken",):
        sec = op.get("security", spec["security"])
        if not any("csrfHeader" in req for req in sec):
            bad.append(op["operationId"])
check("unsafe methods require X-CSRF-Token", not bad, bad)

# 5. Cache-Control on every response ----------------------------------------------------------
cc = spec["components"]["headers"].get("CacheControlPrivate", {})
check("CacheControlPrivate header is const 'private, no-store'",
      cc.get("schema", {}).get("const") == "private, no-store", cc)
bad = []
for p, m, op in operations():
    for status, resp in op["responses"].items():
        resp = deref(resp)
        hdr = resp.get("headers", {}).get("Cache-Control")
        if hdr != {"$ref": "#/components/headers/CacheControlPrivate"}:
            bad.append(f"{op['operationId']} {status}")
check("every response of every operation declares Cache-Control: private, no-store", not bad, bad)
check("no legacy NoStore header remains", "NoStore" not in spec["components"]["headers"])

# 6. Error catalog ---------------------------------------------------------------------------
catalog = spec["x-error-catalog"]
enum = schemas["ErrorCode"]["enum"]
check("ErrorCode enum == x-error-catalog keys", set(enum) == set(catalog), set(enum) ^ set(catalog))
bad = []
for p, m, op in operations():
    for status, codes in op.get("x-error-codes", {}).items():
        if str(status) not in op["responses"]:
            bad.append(f"{op['operationId']} declares codes for undeclared {status}")
        for c in codes:
            if c not in catalog or str(catalog[c]["status"]) != str(status):
                bad.append(f"{op['operationId']} {status} {c}")
check("x-error-codes agree with the catalog and declared responses", not bad, bad)

# 7. Retry-After -----------------------------------------------------------------------------
ra = spec["components"]["headers"]["RetryAfter"]["schema"]
check("Retry-After has no upper bound", "maximum" not in ra, ra)
check("ErrorResponse.retry_after_seconds has no upper bound",
      "maximum" not in schemas["ErrorResponse"]["properties"]["retry_after_seconds"])
check("quota_exceeded is never retried automatically", catalog["quota_exceeded"]["retry"] == "after_reset")

# 8. Fixtures against schemas ----------------------------------------------------------------
index = load_json("index.json")
listed = {f["file"] for f in index["fixtures"]}
on_disk = {p.relative_to(FIX).as_posix() for p in FIX.rglob("*.json") if p.name != "index.json"}
check("index.json lists exactly the fixture files on disk", listed == on_disk, listed ^ on_disk)
ops_by_id = {op["operationId"]: (p, m, op) for p, m, op in operations()}
validated = 0
for f in index["fixtures"]:
    data = load_json(f["file"])
    if "schema" in f:
        errs = errors_of(f["schema"], data)
        check(f"fixture {f['file']} valid against {f['schema']}", not errs, errs[:3])
        validated += 1
    if "operation_id" in f:
        p, m, op = ops_by_id.get(f["operation_id"], (None, None, None))
        if not check(f"fixture {f['file']} operation exists", op is not None, f["operation_id"]):
            continue
        if "status" in f:
            check(f"fixture {f['file']} status declared on {f['operation_id']}",
                  str(f["status"]) in op["responses"], f["status"])
        if f.get("type") == "error":
            codes = op.get("x-error-codes", {}).get(str(f["status"]), [])
            check(f"fixture {f['file']} code listed for {f['operation_id']} {f['status']}",
                  data["code"] in codes, data["code"])

# every externalValue validates against the schema of its media type
for p, m, op in operations():
    targets = []
    body = op.get("requestBody", {}).get("content", {}).get("application/json")
    if body:
        targets.append(body)
    for status, resp in op["responses"].items():
        mt = deref(resp).get("content", {}).get("application/json")
        if mt:
            targets.append(mt)
    for mt in targets:
        ref = mt["schema"]["$ref"]
        for name, ex in mt.get("examples", {}).items():
            errs = errors_of(ref, json.loads((API / ex["externalValue"]).read_text(encoding="utf-8")))
            check(f"example {op['operationId']}/{name} valid against {ref}", not errs, errs[:3])

# 9. Snapshot and MessageResult invariants --------------------------------------------------------
snapshots = 0
for f in index["fixtures"]:
    if f["file"].startswith("golden/"):
        continue
    data = load_json(f["file"])
    for path, node in walk(data):
        if isinstance(node, dict) and "stored" in node and "presentation" in node:
            snapshots += 1
            where = f"{f['file']}:{'/'.join(map(str, path))}"
            pres, stored = node["presentation"], node["stored"]
            if pres["upcasters"] == []:
                check(f"identity snapshot hash verifiable on presentation ({where})",
                      sha(pres["payload"]) == stored["payload_sha256"]
                      and pres["schema_version"] == stored["schema_version"])
            check(f"snapshot decoder matches stored version ({where})",
                  pres["decoder"] == f"{stored['schema_version']}/{node['result_kind']}", pres["decoder"])
            check(f"snapshot author projection matches immutable author ({where})",
                  node["author"]["id"] == node["provenance"]["author_user_id"])
            check(f"snapshot provenance has no viewer-relative data ({where})",
                  not ({"is_self", "display_name", "created_by"} & set(node["provenance"])))
        if isinstance(node, dict) and "next_action" in node and "running_overdue" in node:
            where = f"{f['file']}:{'/'.join(map(str, path))}"
            check(f"MessageResult.state == user_message.state ({where})", node["state"] == node["user_message"]["state"])
            check(f"poll_after_ms set iff next_action == poll ({where})",
                  (node["poll_after_ms"] is not None) == (node["next_action"] == "poll"))
            check(f"running_overdue only while running ({where})",
                  not node["running_overdue"] or node["state"] == "running")
check(f"found snapshots in fixtures ({snapshots})", snapshots >= 12, snapshots)

nf = [load_json(f) for f in ("errors/not-found-foreign-project.404.json", "errors/not-found-foreign-run.404.json",
                             "errors/not-found-foreign-thread.404.json")]
check("404 bodies identical except request_id",
      len({json.dumps({k: v for k, v in b.items() if k != "request_id"}, sort_keys=True) for b in nf}) == 1)
q = load_json("errors/quota-exceeded.429.json")
check("quota fixture: Retry-After beyond one hour is valid", q["retry_after_seconds"] > 3600 and q["quota"] is not None)

# 10. Golden cases ---------------------------------------------------------------------------------
def integrity_ok(row):
    return sha(row["payload"]) == row["payload_sha256"]


g = load_json("golden/snapshot-corrupted-hash.json")
check("golden corrupted: stored hash mismatch -> result_corrupted",
      not integrity_ok(g["stored_row"]) and g["expected"]["result_status"] == "corrupted"
      and load_json(g["expected"]["error"])["code"] == "result_corrupted")

g = load_json("golden/snapshot-unknown-schema-version.json")
row = g["stored_row"]
check("golden unknown version: hash ok, no decoder -> result_format_unsupported",
      integrity_ok(row) and (row["schema_version"], row["result_kind"]) not in DECODERS
      and load_json(g["expected"]["error"])["code"] == "result_format_unsupported")


def upcast_v1_to_v2_module(payload):
    """Reference implementation of the HYPOTHETICAL golden upcaster (pure; input is not mutated)."""
    out = copy.deepcopy(payload)
    out["schema_version"] = "copilot_api.v2"
    result = out["result"]
    if "headline" in result:  # Post
        result["call_to_action"] = result.pop("cta")
        result.setdefault("kind", "post")
        result.setdefault("limitations", [])
        out["result"] = {k: result[k] for k in ("kind", "headline", "body", "call_to_action", "limitations")}
    return out


g = load_json("golden/snapshot-upcast-v1-to-v2.json")
row = g["stored_row"]
before = copy.deepcopy(row)
check("golden upcast: stored v1 row passes integrity", integrity_ok(row))
check("golden upcast: decoder registered for stored version", (row["schema_version"], row["result_kind"]) in DECODERS)
errs = errors_of("#/components/schemas/ModuleResponse", row["payload"])
check("golden upcast: stored payload valid as copilot_api.v1 ModuleResponse", not errs, errs[:3])
presented = upcast_v1_to_v2_module(row["payload"])
exp = g["expected"]["response"]
check("golden upcast: upcaster output == expected presentation.payload", presented == exp["presentation"]["payload"])
errs = list(Draft202012Validator(g["hypothetical_target_schema"]).iter_errors(presented))
check("golden upcast: output valid against the hypothetical v2 schema", not errs, [e.message for e in errs[:3]])
check("golden upcast: stored row unchanged after upcast", row == before and integrity_ok(row))
check("golden upcast: presentation hash differs from stored hash (and is NOT corruption)",
      sha(presented) != row["payload_sha256"] and g["expected"]["result_status"] == "available")
check("golden upcast: response keeps stored version/hash and presents v2",
      exp["stored"] == {"schema_version": "copilot_api.v1", "payload_sha256": row["payload_sha256"],
                        "writer_version": row["writer_version"]}
      and exp["presentation"]["schema_version"] == "copilot_api.v2"
      and exp["presentation"]["upcasters"] == [g["upcaster"]["id"]])

g = load_json("golden/snapshot-two-viewers.json")
row = g["stored_row"]
views = [(v, load_json(v["response"])) for v in g["views"]]
check("golden two viewers: stored row has no viewer-dependent column",
      not ({"is_self", "display_name", "author"} & set(row)))
check("golden two viewers: stored row integrity", integrity_ok(row))
strip = []
for v, resp in views:
    errs = errors_of("#/components/schemas/ResultSnapshot", resp)
    check(f"golden two viewers: {v['response']} valid ResultSnapshot", not errs, errs[:3])
    check(f"golden two viewers: is_self for viewer {v['viewer_user_id']}",
          resp["author"]["is_self"] is v["expected_author_is_self"]
          and resp["author"]["is_self"] == (resp["author"]["id"] == v["viewer_user_id"]))
    check(f"golden two viewers: response {v['viewer_user_id']} matches stored row",
          resp["stored"]["payload_sha256"] == row["payload_sha256"]
          and resp["provenance"]["author_user_id"] == row["author_user_id"]
          and resp["presentation"]["payload"] == row["payload"])
    s = copy.deepcopy(resp)
    del s["author"]["is_self"]
    strip.append(s)
check("golden two viewers: responses identical except author.is_self", strip[0] == strip[1])
check("golden two viewers: viewers are different users",
      views[0][0]["viewer_user_id"] != views[1][0]["viewer_user_id"])


# 11. Backend DTO compatibility (optional, read-only) -------------------------------------------
def backend_checks(repo, ref):
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="contract-backend-"))
    pkg = tmp / "bk"
    pkg.mkdir()
    (pkg / "__init__.py").write_text("")
    for name in ("api_contracts.py", "mentor_contracts.py"):
        src = subprocess.run(["git", "-C", repo, "show", f"{ref}:app/marketing_copilot/{name}"],
                             check=True, capture_output=True).stdout
        (pkg / name).write_bytes(src)
    sys.path.insert(0, str(tmp))
    from bk import api_contracts as ac, mentor_contracts as mc  # noqa: E402
    models = {**{n: getattr(ac, n) for n in dir(ac)}, **{n: getattr(mc, n) for n in dir(mc)}}

    # a) existing schemas: same property names as the pydantic model, and
    #    required(validation mode) <= required(OpenAPI) <= required(serialization mode):
    #    every body the backend accepts or emits satisfies the schema (fields with defaults such as
    #    `schema_version` are optional on input but always emitted).
    for name, s in schemas.items():
        if s.get("x-status") != "existing" or s.get("type") != "object":
            continue
        cls = models.get(s["x-source"].split("::")[1])
        if not check(f"backend: {name} exists in {s['x-source']}", cls is not None):
            continue
        js_in = cls.model_json_schema(mode="validation")
        check(f"backend: {name} property names", set(s["properties"]) == set(js_in["properties"]),
              set(s["properties"]) ^ set(js_in["properties"]))
        req = set(s.get("required", []))
        # model_dump() (no exclude_* flags, as the backend serializes responses) emits every field.
        lo, hi = set(js_in.get("required", [])), set(cls.model_fields)
        check(f"backend: {name} required fields within backend input/output bounds", lo <= req <= hi,
              f"openapi={sorted(req)} input={sorted(lo)} output={sorted(hi)}")
    for name in ("RunStatus",):
        check(f"backend: {name} enum", set(schemas[name]["enum"]) == {m.value for m in models[name]})

    # b) every existing payload in fixtures validates with the REAL DTO (strict JSON) and round-trips
    by_kind = {"DIRECT_RESULT": ac.DirectResponse, "MODULE_RESULT": ac.ModuleResponse,
               "NEEDS_INPUT": ac.NeedsInputResponse, "RUN": ac.RunResponse}

    def roundtrip(cls, payload, where):
        try:
            obj = cls.model_validate_json(json.dumps(payload, ensure_ascii=False))
        except Exception as exc:  # noqa: BLE001
            return check(f"backend DTO {cls.__name__} accepts {where}", False, str(exc)[:300])
        return check(f"backend DTO {cls.__name__} round-trips {where}", obj.model_dump(mode="json") == payload)

    count = 0
    for f in index["fixtures"]:
        data = load_json(f["file"])
        for path, node in walk(data):
            where = f"{f['file']}:{'/'.join(map(str, path))}"
            if isinstance(node, dict) and "presentation" in node and "stored" in node:
                if node["presentation"]["schema_version"] == "copilot_api.v1":
                    roundtrip(by_kind[node["result_kind"]], node["presentation"]["payload"], where)
                    count += 1
            if path and path[-1] == "live_run" and node is not None:
                roundtrip(ac.RunResponse, node, where)
                count += 1
            if path and path[-1] == "input" and isinstance(node, dict) and "message" in node:
                payload = dict(node, request_key="w-0193a4f2-0000-7000-8000-000000000000")
                try:
                    ac.ExecuteRequest.model_validate_json(json.dumps(payload, ensure_ascii=False))
                    check(f"backend ExecuteRequest accepts {where}", True)
                except Exception as exc:  # noqa: BLE001
                    check(f"backend ExecuteRequest accepts {where}", False, str(exc)[:300])
                count += 1
        if f.get("schema", "").endswith("/SubmitMessageRequest"):
            payload = {k: v for k, v in data.items() if k != "revision"}
            try:
                ac.ExecuteRequest.model_validate_json(json.dumps(payload, ensure_ascii=False))
                check(f"backend ExecuteRequest accepts {f['file']} without revision", True)
            except Exception as exc:  # noqa: BLE001
                check(f"backend ExecuteRequest accepts {f['file']} without revision", False, str(exc)[:300])
            count += 1
    for rel, key, cls in (("responses/mentor-explanation.200.json", "explanation", mc.MentorExplanation),
                          ("responses/mentor-answer.200.json", "answer", mc.MentorAnswer),
                          ("responses/mentor-history.200.json", "history", mc.MentorHistory)):
        roundtrip(cls, load_json(rel)[key], rel)
        count += 1
    roundtrip(mc.MentorQuestion, load_json("requests/mentor-question.json"), "requests/mentor-question.json")
    golden = load_json("golden/snapshot-upcast-v1-to-v2.json")["stored_row"]["payload"]
    roundtrip(ac.ModuleResponse, golden, "golden upcast stored v1 payload")
    check(f"backend: payloads checked with real DTOs ({count + 2})", count > 30, count)


parser = argparse.ArgumentParser()
parser.add_argument("--backend-repo")
parser.add_argument("--backend-ref", default="76b6c1b")
parser.add_argument("--verbose", action="store_true", help="list every passed check")
args = parser.parse_args()
if args.backend_repo:
    backend_checks(args.backend_repo, args.backend_ref)

if args.verbose:
    for name in passed:
        print("  ok  ", name)
print(f"fixtures validated against declared schema: {validated}")
print(f"checks passed: {len(passed)}")
if failures:
    print(f"checks FAILED: {len(failures)}")
    for f in failures:
        print("  FAIL", f)
    sys.exit(1)
print("all checks passed")
