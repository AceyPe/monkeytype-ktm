import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const destinationDir = join("dist", "static", "languages");
mkdirSync(destinationDir, { recursive: true });
copyFileSync(
  join("..", "frontend", "static", "languages", "english_10k.json"),
  join(destinationDir, "english_10k.json"),
);
