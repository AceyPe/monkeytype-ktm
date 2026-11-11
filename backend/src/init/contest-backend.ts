import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Logger from "../utils/logger";

let child: ChildProcess | undefined;

/**
 * Starts the built contest backend in this process.
 * Set CONTEST_BACKEND_EXTERNAL=true when contest-backend runs on its own
 * behind https://contest.ieeektm.org.
 */
export function startContestBackend(): void {
  if (process.env["CONTEST_BACKEND_EXTERNAL"] === "true") {
    Logger.info(
      "Contest backend is external at https://contest.ieeektm.org. Not spawning a child process.",
    );
    return;
  }

  const instance = process.env["NODE_APP_INSTANCE"];
  if (instance !== undefined && instance !== "0") {
    return;
  }

  const entry = join(__dirname, "../../../contest-backend/dist/server.cjs");

  if (!existsSync(entry)) {
    Logger.error(
      `Contest backend build was not found at ${entry}. Build @monkeytype/backend so contest-backend/dist is included.`,
    );
    return;
  }

  child = spawn(process.execPath, [entry], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      Logger.error(
        `Contest backend exited with code ${code}${signal === null ? "" : ` (${signal})`}`,
      );
    }
  });

  process.on("exit", () => {
    if (child !== undefined && child.exitCode === null && !child.killed) {
      child.kill("SIGTERM");
    }
  });

  Logger.info(`Starting contest backend from ${entry}`);
}
