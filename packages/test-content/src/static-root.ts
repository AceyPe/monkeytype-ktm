import { existsSync } from "node:fs";
import { join } from "node:path";

let cachedRoot: string | null = null;

/** Resolves frontend/static from monorepo layout (package, contest-backend, backend). */
export function getStaticRoot(): string {
  if (cachedRoot !== null) return cachedRoot;

  const candidates = [
    process.env["MONKEYTYPE_STATIC_ROOT"],
    join(process.cwd(), "frontend/static"),
    join(process.cwd(), "../frontend/static"),
    join(process.cwd(), "../../frontend/static"),
  ].filter((p): p is string => typeof p === "string" && p.length > 0);

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "languages"))) {
      cachedRoot = candidate;
      return candidate;
    }
  }

  throw new Error(
    "Could not locate frontend/static. Set MONKEYTYPE_STATIC_ROOT.",
  );
}
