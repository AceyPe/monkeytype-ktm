import { Collection, WithId } from "mongodb";
import * as db from "../init/db";
import { ADMIN_ROLE } from "@monkeytype/schemas/users";
import { getPartialUser } from "./user";

export const getCollection = (): Collection<WithId<{ uid: string }>> =>
  db.collection("admin-uids");

export async function getAllLegacyAdminUids(): Promise<string[]> {
  const admins = await getCollection()
    .find({}, { projection: { uid: 1 } })
    .toArray();

  return admins.map((admin) => admin.uid);
}

export async function removeLegacyAdmin(uid: string): Promise<void> {
  await getCollection().deleteOne({ uid });
}

export async function isAdmin(uid: string): Promise<boolean> {
  const legacyAdmin = await getCollection().findOne({ uid });
  if (legacyAdmin !== null) {
    return true;
  }

  const user = await getPartialUser(uid, "check admin role", ["role"]);
  return user.role === ADMIN_ROLE;
}
