import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: join(packageRoot, ".env") });

if (
  process.env["MONKEYTYPE_STATIC_ROOT"] === undefined ||
  process.env["MONKEYTYPE_STATIC_ROOT"] === ""
) {
  const repoStatic = join(packageRoot, "../frontend/static");
  const bundledStatic = join(packageRoot, "dist/static");
  if (existsSync(join(repoStatic, "languages"))) {
    process.env["MONKEYTYPE_STATIC_ROOT"] = repoStatic;
  } else if (existsSync(join(bundledStatic, "languages"))) {
    process.env["MONKEYTYPE_STATIC_ROOT"] = bundledStatic;
  }
}
