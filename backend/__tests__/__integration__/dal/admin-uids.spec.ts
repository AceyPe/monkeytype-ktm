import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import * as AdminUidsDal from "../../../src/dal/admin-uids";
import * as UserDal from "../../../src/dal/user";

describe("AdminUidsDal", () => {
  describe("isAdmin", () => {
    it("should return true for existing admin user", async () => {
      //GIVEN
      const uid = new ObjectId().toHexString();
      await AdminUidsDal.getCollection().insertOne({
        _id: new ObjectId(),
        uid: uid,
      });

      //WHEN / THEN
      expect(await AdminUidsDal.isAdmin(uid)).toBe(true);
    });

    it("should return false for non-existing admin user", async () => {
      //GIVEN
      await AdminUidsDal.getCollection().insertOne({
        _id: new ObjectId(),
        uid: "admin",
      });

      //WHEN / THEN
      expect(await AdminUidsDal.isAdmin("regularUser")).toBe(false);
    });

    it("should return true for user with admin role", async () => {
      const uid = new ObjectId().toHexString();
      await UserDal.getUsersCollection().insertOne({
        _id: new ObjectId(),
        uid,
        name: "adminuser",
        email: "admin@example.com",
        addedAt: Date.now(),
        personalBests: {
          time: {},
          words: {},
          quote: {},
          zen: {},
          custom: {},
        },
        role: 1,
      } as never);

      expect(await AdminUidsDal.isAdmin(uid)).toBe(true);
    });
  });
});
