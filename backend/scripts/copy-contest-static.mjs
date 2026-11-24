import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "../../frontend/static/languages/english_10k.json");
const targetDir = join(here, "../dist/static/languages");

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, join(targetDir, "english_10k.json"));
