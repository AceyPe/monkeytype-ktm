import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as db from "../src/init/db";
import * as UserDAL from "../src/dal/user";

const scriptDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(scriptDir, "../.env") });

const args = process.argv.slice(2);
const uidArg = args
  .find((arg) => arg.startsWith("--uid="))
  ?.slice("--uid=".length);
const email =
  args.find((arg) => !arg.startsWith("--")) ?? "mohamedaymn218@gmail.com";

async function main(): Promise<void> {
  await db.connect();

  if (uidArg !== undefined && uidArg !== "") {
    const updated = await UserDAL.setAdminRoleByUid(uidArg);
    if (!updated) {
      console.error(`No user found with uid: ${uidArg}`);
      process.exitCode = 1;
      return;
    }

    const user = await UserDAL.getUserByEmail(email).catch(() => null);
    console.log(`Granted admin role to uid ${uidArg}`);
    if (user !== null) {
      console.log(JSON.stringify(user, null, 2));
    }
    await db.close();
    return;
  }

  const existingUser = await UserDAL.getUserByEmail(email);
  if (existingUser === null) {
    console.error(`No user found with email: ${email}`);
    console.error(
      "Log in once via SAML so your account exists, then rerun this script.",
    );
    console.error(
      "Or grant by uid: npx tsx scripts/set-admin-role-by-email.ts --uid=YOUR_UID",
    );
    process.exitCode = 1;
    return;
  }

  const updated = await UserDAL.setAdminRoleByEmail(email);
  if (!updated) {
    console.error(`Failed to update admin role for: ${email}`);
    process.exitCode = 1;
    return;
  }

  const user = await UserDAL.getUserByEmail(email);
  console.log(
    `Granted admin role to ${email} (uid: ${user?.uid ?? "unknown"}, role: ${user?.role ?? "missing"})`,
  );

  await db.close();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
