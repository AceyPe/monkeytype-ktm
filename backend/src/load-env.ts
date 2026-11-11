import { config } from "dotenv";
import { join } from "node:path";

// dist/load-env.js sits in backend/dist, so this resolves backend/.env
// even when the process is started from another directory.
config({ path: join(__dirname, "../.env") });
