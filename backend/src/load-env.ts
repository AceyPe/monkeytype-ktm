import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

// dist/load-env.js sits in backend/dist, so this resolves backend/.env
// even when the process is started from another directory.
config({ path: join(__dirname, "../.env") });

if (
  process.env["MONKEYTYPE_STATIC_ROOT"] === undefined ||
  process.env["MONKEYTYPE_STATIC_ROOT"] === ""
) {
  const fromRepo = join(__dirname, "../../frontend/static");
  const bundled = join(__dirname, "static");
  if (existsSync(join(fromRepo, "languages"))) {
    process.env["MONKEYTYPE_STATIC_ROOT"] = fromRepo;
  } else if (existsSync(join(bundled, "languages"))) {
    process.env["MONKEYTYPE_STATIC_ROOT"] = bundled;
  }
}
