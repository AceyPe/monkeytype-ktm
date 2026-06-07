import * as UserDAL from "../../dal/user";
import MonkeyError from "../../utils/error"; // getErrorMessage,
import { MonkeyResponse } from "../../utils/monkey-response";
import * as DiscordUtils from "../../utils/discord";
import {
  buildAgentLog,
  // getFrontendUrl,
  omit,
  replaceObjectId,
  replaceObjectIds,
  sanitizeString,
} from "../../utils/misc";
import GeorgeQueue from "../../queues/george-queue";
import { deleteAllApeKeys } from "../../dal/ape-keys";
import { deleteAllPresets } from "../../dal/preset";
import { deleteAll as deleteAllResults } from "../../dal/result";
import { deleteConfig } from "../../dal/config";
import { verify } from "../../utils/captcha";
import * as LeaderboardsDAL from "../../dal/leaderboards";
import { purgeUserFromDailyLeaderboards } from "../../utils/daily-leaderboards";
import { purgeUserFromXpLeaderboards } from "../../services/weekly-xp-leaderboard";
import { v4 as uuidv4 } from "uuid";
import { ObjectId } from "mongodb";
import * as ReportDAL from "../../dal/report";
// import emailQueue from "../../queues/email-queue";
import * as AuthUtil from "../../utils/auth";
import * as Dates from "date-fns";
import { UTCDateMini } from "@date-fns/utc";
import * as BlocklistDal from "../../dal/blocklist";
import crypto from "crypto";
import {
  AllTimeLbs,
  ResultFilters,
  User,
  UserProfile,
  CountByYearAndDay,
  TestActivity,
  UserProfileDetails,
} from "@monkeytype/schemas/users";
import { addImportantLog, addLog, deleteUserLogs } from "../../dal/logs";
import {
  AcsRequest,
  AcsResponse,
  AddCustomThemeRequest,
  AddCustomThemeResponse,
  AddFavoriteQuoteRequest,
  AddResultFilterPresetRequest,
  AddResultFilterPresetResponse,
  AddTagRequest,
  AddTagResponse,
  CheckNamePathParameters,
  CheckNameResponse,
  CreateUserRequest,
  DeleteCustomThemeRequest,
  EditCustomThemeRequst,
  EditTagRequest,
  ForgotPasswordEmailRequest,
  GetCurrentTestActivityResponse,
  GetCustomThemesResponse,
  GetDiscordOauthLinkResponse,
  GetFavoriteQuotesResponse,
  GetFriendsResponse,
  GetPersonalBestsQuery,
  GetPersonalBestsResponse,
  GetProfilePathParams,
  GetProfileQuery,
  GetProfileResponse,
  GetStatsResponse,
  GetStreakResponse,
  GetTagsResponse,
  GetTestActivityResponse,
  GetUserInboxResponse,
  GetUserResponse,
  GetAdminStatusResponse,
  ListUsersResponse,
  LinkDiscordRequest,
  LinkDiscordResponse,
  RemoveFavoriteQuoteRequest,
  RemoveResultFilterPresetPathParams,
  ReportUserRequest,
  SamlInitiateResponse,
  SamlLogoutResponse,
  SessionResponse,
  SetStreakHourOffsetRequest,
  TagIdPathParams,
  UpdateEmailRequest,
  UpdateLeaderboardMemoryRequest,
  // UpdatePasswordRequest,
  UpdateUserInboxRequest,
  UpdateUserNameRequest,
  UpdateUserProfileRequest,
  UpdateUserProfileResponse,
} from "@monkeytype/contracts/users";
import { MILLISECONDS_IN_DAY } from "@monkeytype/util/date-and-time";
import { MonkeyRequest } from "../types";
import { tryCatch } from "@monkeytype/util/trycatch";
import * as ConnectionsDal from "../../dal/connections";
import { PersonalBest } from "@monkeytype/schemas/shared";
import * as SamlUtils from "../../utils/saml";
import Logger from "../../utils/logger";
import * as AdminUidsDal from "../../dal/admin-uids";

async function verifyCaptcha(captcha: string): Promise<void> {
  const { data: verified, error } = await tryCatch(verify(captcha));
  if (error) {
    throw new MonkeyError(
      422,
      "Request to the Captcha API failed, please try again later",
    );
  }
  if (!verified) {
    throw new MonkeyError(422, "Captcha challenge failed");
  }
}

export async function samlInitiate(
  req: MonkeyRequest,
): Promise<SamlInitiateResponse> {
  await SamlUtils.generateSamlRequestId();
  const host = SamlUtils.getSamlRequestHostFromHeaders(req.raw.headers);
  const publicBase = SamlUtils.getPublicApiBaseUrlFromExpressRequest(req.raw);
  const url = await SamlUtils.getSamlInitiateNavigateUrl(publicBase, host);
  return new MonkeyResponse("SAML SSO URL generated", { url });
}

export async function samlLogout(
  _req: MonkeyRequest,
): Promise<SamlLogoutResponse> {
  const url = SamlUtils.getSamlLogoutUrl();
  return new MonkeyResponse("SAML logout URL generated", { url });
}

export async function getSession(req: MonkeyRequest): Promise<SessionResponse> {
  const decodedToken = req.ctx.decodedToken;
  if (decodedToken.type !== "Bearer" || decodedToken.uid === "") {
    return new MonkeyResponse("No active session", {
      authenticated: false,
      user: null,
    });
  }
  return new MonkeyResponse("Session is active", {
    authenticated: true,
    user: {
      uid: decodedToken.uid,
      email: decodedToken.email,
      firstName: decodedToken.firstName,
      lastName: decodedToken.lastName,
      avatarUrl: decodedToken.avatarUrl,
    },
  });
}

const SAML_IDP_DEBUG_SEPARATOR = "*****************************";

function logSamlIdpDebugPayload(label: string, payload: unknown): void {
  for (let i = 0; i < 6; i++) {
    Logger.info(SAML_IDP_DEBUG_SEPARATOR);
  }
  Logger.info(`[SAML IdP Debug] ${label}`);
  Logger.info(
    `[SAML IdP Debug] ${JSON.stringify(payload, null, 2) ?? String(payload)}`,
  );
}

/**
 * Generate a deterministic UID from email using SHA-256 hash
 * This ensures the same email always gets the same UID
 */
function generateUidFromEmail(email: string): string {
  return crypto.createHash("sha256").update(email.toLowerCase()).digest("hex");
}

function looksLikeIeeeMemberId(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "") return false;
  return /^\d{5,}$/.test(trimmed);
}

function getProfileString(
  profile: SamlUtils.SamlProfile,
  keys: string[],
): string | undefined {
  const attributes =
    typeof profile["attributes"] === "object" && profile["attributes"] !== null
      ? (profile["attributes"] as Record<string, unknown>)
      : undefined;

  for (const key of keys) {
    const raw = profile[key] ?? attributes?.[key];
    if (typeof raw === "string" && raw.trim() !== "") {
      return raw.trim();
    }
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (typeof entry === "string" && entry.trim() !== "") {
          return entry.trim();
        }
      }
    }
  }

  return undefined;
}

function resolveSamlEmail(profile: SamlUtils.SamlProfile): string | undefined {
  const emailFromClaims = getProfileString(profile, [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "Email",
    "email",
    "mail",
  ]);

  const candidates = [emailFromClaims, profile.email, profile.nameID].filter(
    (value): value is string =>
      typeof value === "string" && value.trim() !== "",
  );

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (looksLikeIeeeMemberId(trimmed)) continue;
    if (trimmed.includes("@")) return trimmed;
  }

  return candidates[0]?.trim();
}

async function generateAvailableUsername(
  emailRaw: string,
  uid: string,
): Promise<string> {
  const defaultName = emailRaw.split("@")[0] ?? emailRaw;
  let username: string = defaultName;
  let counter = 1;

  while (!(await UserDAL.isNameAvailable(username, uid))) {
    username = `${defaultName}${counter}`;
    counter++;
  }

  return username;
}

// async function ensureUserInDatabase(
//   uid: string,
//   normalizedEmail: string,
//   emailRaw: string,
// ): Promise<void> {
//   const username = await generateAvailableUsername(emailRaw, uid);
//   await UserDAL.addUser(username, normalizedEmail, uid);
//   void addImportantLog(
//     "user_created_saml_sync",
//     `${username} ${emailRaw}`,
//     uid,
//   );
// }

async function findOrCreateUser(
  uid: string,
  normalizedEmail: string,
  emailRaw: string,
): Promise<string> {
  // Check if user exists in database
  try {
    await UserDAL.getUser(uid, "saml acs check");
    return uid;
  } catch (error: unknown) {
    if (error instanceof MonkeyError && error.status === 404) {
      // User doesn't exist, create new user
      const username = await generateAvailableUsername(emailRaw, uid);
      await UserDAL.addUser(username, normalizedEmail, uid);
      void addImportantLog("user_created_saml", `${username} ${emailRaw}`, uid);
      return uid;
    }
    throw error;
  }
}

export async function acs(
  req: MonkeyRequest<undefined, AcsRequest>,
): Promise<AcsResponse> {
  const { SAMLResponse, RelayState } = req.body;

  if (!SAMLResponse) {
    throw new MonkeyError(400, "SAMLResponse is required");
  }

  // Validate SAML response
  let profile: SamlUtils.SamlProfile;
  try {
    logSamlIdpDebugPayload("Raw ACS body from IdP", req.body);
    profile = await SamlUtils.validateSamlResponse(SAMLResponse, RelayState);
    logSamlIdpDebugPayload("Validated profile returned from IdP", profile);
  } catch (error: unknown) {
    if (error instanceof MonkeyError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new MonkeyError(401, "SAML validation failed", errorMessage);
  }

  // Extract user information from SAML profile
  const emailRaw = resolveSamlEmail(profile);

  const firstName = getProfileString(profile, [
    "FirstName",
    "firstName",
    "givenName",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
  ]);

  const lastName = getProfileString(profile, [
    "LastName",
    "lastname",
    "lastName",
    "sn",
    "surname",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
  ]);

  const geocode = getProfileString(profile, ["geocode", "Geocode"]);
  const status = getProfileString(profile, ["status", "Status"]);
  const grade = getProfileString(profile, ["grade", "Grade"]);
  const ssoid = getProfileString(profile, [
    "ieeeId",
    "ieeeid",
    "ieee_id",
    "ssoid",
    "ssoId",
    "SSOID",
    "uid",
    "employeeNumber",
  ]);
  const avatarUrl = getProfileString(profile, [
    "picture",
    "photo",
    "photoURL",
    "avatar",
    "thumbnailPhoto",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/picture",
  ]);

  if (emailRaw === undefined || emailRaw === null || emailRaw === "") {
    throw new MonkeyError(400, "Email not found in SAML response");
  }

  // Normalize email
  const normalizedEmail = emailRaw.toLowerCase();

  // Prefer IEEE/SAML identifier as uid; fall back to deterministic email hash.
  const uidFromSaml = (ssoid ?? "").trim();
  const resolvedUid =
    uidFromSaml === "" ? generateUidFromEmail(normalizedEmail) : uidFromSaml;

  // Find or create user
  const uid = await findOrCreateUser(resolvedUid, normalizedEmail, emailRaw);

  await UserDAL.updateSamlUserFields(uid, {
    email: normalizedEmail,
    geocode,
    status,
    ssoid,
    firstName,
    lastName,
    grade,
  });

  // Get user email for JWT token
  const user = await UserDAL.getPartialUser(uid, "saml acs", ["email"]);
  const userEmail = user.email ?? normalizedEmail;

  // Generate JWT token with security standards
  const token = AuthUtil.generateJwtToken(uid, userEmail, "1d", {
    geocode,
    status,
    ssoid,
    email: userEmail,
    firstName,
    lastName,
    lastname: lastName,
    grade,
    avatarUrl,
  });

  return new MonkeyResponse("SAML authentication successful", {
    token,
  });
}

export async function createNewUser(
  req: MonkeyRequest<undefined, CreateUserRequest>,
): Promise<MonkeyResponse> {
  const { name, captcha } = req.body;
  const { email, uid } = req.ctx.decodedToken;

  await verifyCaptcha(captcha);

  if (email.endsWith("@tidal.lol") || email.endsWith("@selfbot.cc")) {
    throw new MonkeyError(400, "Invalid domain");
  }

  const available = await UserDAL.isNameAvailable(name, uid);
  if (!available) {
    throw new MonkeyError(409, "Username unavailable");
  }

  const blocklisted = await BlocklistDal.contains({ name, email });
  if (blocklisted) {
    throw new MonkeyError(409, "Username or email blocked");
  }

  await UserDAL.addUser(name, email, uid);
  void addImportantLog("user_created", `${name} ${email}`, uid);

  return new MonkeyResponse("User created", null);
}

export async function sendVerificationEmail(
  req: MonkeyRequest,
): Promise<MonkeyResponse> {
  // With SAML authentication, emails are already verified by the IdP
  // This endpoint is kept for API compatibility but always returns success
  const { email, uid } = req.ctx.decodedToken;

  const userInfo = await UserDAL.getPartialUser(
    uid,
    "request verification email",
    ["uid", "name", "email"],
  );

  if (userInfo.email !== email) {
    throw new MonkeyError(
      400,
      "Authenticated email does not match the email found in the database. This might happen if you recently changed your email. Please refresh and try again.",
    );
  }

  // SAML emails are pre-verified, so we just return success
  return new MonkeyResponse("Email already verified via SAML", null);
}

export async function sendForgotPasswordEmail(
  req: MonkeyRequest<undefined, ForgotPasswordEmailRequest>,
): Promise<MonkeyResponse> {
  // With SAML authentication, password resets are handled by the IdP
  // This endpoint is kept for API compatibility but redirects users to use IdP
  const { email, captcha } = req.body;
  await verifyCaptcha(captcha);

  // Verify the email exists in our database
  const normalizedEmail = email.toLowerCase();
  const uid = generateUidFromEmail(normalizedEmail);

  try {
    await UserDAL.getUser(uid, "forgot password check");
  } catch (error) {
    if (error instanceof MonkeyError && error.status === 404) {
      // Don't reveal if email exists or not for security
    }
    // Still return success message even if user doesn't exist
  }

  return new MonkeyResponse(
    "Password reset must be done through your organization's SAML Identity Provider. Please contact your administrator or use your organization's password reset portal.",
    null,
  );
}

export async function deleteUser(req: MonkeyRequest): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;

  const { data: userInfo, error } = await tryCatch(
    UserDAL.getPartialUser(uid, "delete user", [
      "banned",
      "name",
      "email",
      "discordId",
    ]),
  );

  if (error) {
    if (error instanceof MonkeyError && error.status === 404) {
      //userinfo was already deleted. We ignore this and still try to remove the  other data
    } else {
      throw error;
    }
  }

  if (userInfo?.banned === true) {
    await BlocklistDal.add(userInfo);
  }

  //cleanup database
  await Promise.all([
    UserDAL.deleteUser(uid),
    deleteUserLogs(uid),
    deleteAllApeKeys(uid),
    deleteAllPresets(uid),
    deleteConfig(uid),
    deleteAllResults(uid),
    purgeUserFromDailyLeaderboards(
      uid,
      req.ctx.configuration.dailyLeaderboards,
    ),
    purgeUserFromXpLeaderboards(
      uid,
      req.ctx.configuration.leaderboards.weeklyXp,
    ),
    ConnectionsDal.deleteByUid(uid),
  ]);

  // Revoke all tokens for this user
  await AuthUtil.revokeTokensByUid(uid);

  void addImportantLog(
    "user_deleted",
    `${userInfo?.email} ${userInfo?.name}`,
    uid,
  );

  return new MonkeyResponse("User deleted", null);
}

export async function resetUser(req: MonkeyRequest): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;

  const userInfo = await UserDAL.getPartialUser(uid, "reset user", [
    "banned",
    "discordId",
    "email",
    "name",
  ]);
  if (userInfo.banned) {
    throw new MonkeyError(403, "Banned users cannot reset their account");
  }

  const promises = [
    UserDAL.resetUser(uid),
    deleteAllApeKeys(uid),
    deleteAllPresets(uid),
    deleteAllResults(uid),
    deleteConfig(uid),
    purgeUserFromDailyLeaderboards(
      uid,
      req.ctx.configuration.dailyLeaderboards,
    ),
    purgeUserFromXpLeaderboards(
      uid,
      req.ctx.configuration.leaderboards.weeklyXp,
    ),
  ];

  if (userInfo.discordId !== undefined && userInfo.discordId !== "") {
    promises.push(GeorgeQueue.unlinkDiscord(userInfo.discordId, uid));
  }
  await Promise.all(promises);
  void addImportantLog("user_reset", `${userInfo.email} ${userInfo.name}`, uid);

  return new MonkeyResponse("User reset", null);
}

export async function updateName(
  req: MonkeyRequest<undefined, UpdateUserNameRequest>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { name } = req.body;

  const blocklisted = await BlocklistDal.contains({ name });
  if (blocklisted) {
    throw new MonkeyError(409, "Username blocked");
  }

  const user = await UserDAL.getPartialUser(uid, "update name", [
    "name",
    "banned",
    "needsToChangeName",
    "lastNameChange",
  ]);

  if (user.banned) {
    throw new MonkeyError(403, "Banned users cannot change their name");
  }

  if (
    !user?.needsToChangeName &&
    Date.now() - (user.lastNameChange ?? 0) < MILLISECONDS_IN_DAY * 30
  ) {
    throw new MonkeyError(409, "You can change your name once every 30 days");
  }

  await UserDAL.updateName(uid, name, user.name);

  await ConnectionsDal.updateName(uid, name);
  void addImportantLog(
    "user_name_updated",
    `changed name from ${user.name} to ${name}`,
    uid,
  );

  return new MonkeyResponse("User's name updated", null);
}

export async function clearPb(req: MonkeyRequest): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;

  await UserDAL.clearPb(uid);
  await purgeUserFromDailyLeaderboards(
    uid,
    req.ctx.configuration.dailyLeaderboards,
  );
  void addImportantLog("user_cleared_pbs", "", uid);

  return new MonkeyResponse("User's PB cleared", null);
}

export async function optOutOfLeaderboards(
  req: MonkeyRequest,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;

  await UserDAL.optOutOfLeaderboards(uid);
  await purgeUserFromDailyLeaderboards(
    uid,
    req.ctx.configuration.dailyLeaderboards,
  );
  await purgeUserFromXpLeaderboards(
    uid,
    req.ctx.configuration.leaderboards.weeklyXp,
  );
  void addImportantLog("user_opted_out_of_leaderboards", "", uid);

  return new MonkeyResponse("User opted out of leaderboards", null);
}

export async function checkName(
  req: MonkeyRequest<undefined, undefined, CheckNamePathParameters>,
): Promise<CheckNameResponse> {
  const { name } = req.params;
  const { uid } = req.ctx.decodedToken;

  const available = await UserDAL.isNameAvailable(name, uid);

  return new MonkeyResponse("Check username", {
    available,
  });
}

export async function updateEmail(
  req: MonkeyRequest<undefined, UpdateEmailRequest>,
): Promise<MonkeyResponse> {
  // With SAML authentication, email changes should be handled through the IdP
  // This endpoint updates the email in our database, but the user must update
  // their email in the SAML IdP for authentication to work with the new email
  const { uid } = req.ctx.decodedToken;
  let { newEmail, previousEmail } = req.body;

  newEmail = newEmail.toLowerCase();
  previousEmail = previousEmail.toLowerCase();

  // Check if new email is already in use
  const newUid = generateUidFromEmail(newEmail);
  if (newUid !== uid) {
    // Check if a user with this email already exists
    try {
      await UserDAL.getUser(newUid, "check email availability");
      throw new MonkeyError(
        409,
        "The email address is already in use by another account",
      );
    } catch (error) {
      if (error instanceof MonkeyError && error.status === 404) {
        // Email is available, continue
      } else {
        throw error;
      }
    }
  }

  await UserDAL.updateEmail(uid, newEmail);
  await AuthUtil.revokeTokensByUid(uid);

  void addImportantLog(
    "user_email_updated",
    `changed email from ${previousEmail} to ${newEmail}`,
    uid,
  );

  return new MonkeyResponse(
    "Email updated. Please note: You must update your email in the SAML IdP for authentication to work with the new email.",
    null,
  );
}

// export async function updatePassword(
//   req: MonkeyRequest<undefined, UpdatePasswordRequest>,
// ): Promise<MonkeyResponse> {
//   // With SAML authentication, passwords are managed by the IdP
//   // This endpoint is kept for API compatibility but doesn't perform any action
//   throw new MonkeyError(
//     400,
//     "Password changes must be done through the SAML Identity Provider (IdP). Please contact your administrator or use the IdP's password reset functionality.",
//   );
// }

type RelevantUserInfo = Omit<
  UserDAL.DBUser,
  | "bananas"
  | "lbPersonalBests"
  | "inbox"
  | "nameHistory"
  | "lastNameChange"
  | "_id"
  | "lastReultHashes" //TODO fix typo
  | "note"
  | "ips"
  | "testActivity"
  | "suspicious"
>;

function getRelevantUserInfo(user: UserDAL.DBUser): RelevantUserInfo {
  return omit(user, [
    "bananas",
    "lbPersonalBests",
    "inbox",
    "nameHistory",
    "lastNameChange",
    "_id",
    "lastReultHashes", //TODO fix typo
    "note",
    "ips",
    "testActivity",
    "suspicious",
  ]) as RelevantUserInfo;
}

export async function getUser(req: MonkeyRequest): Promise<GetUserResponse> {
  const { uid } = req.ctx.decodedToken;

  const { data: userInfo, error } = await tryCatch(
    UserDAL.getUser(uid, "get user"),
  );

  if (error) {
    if (error instanceof MonkeyError && error.status === 404) {
      // User not found in database - they need to authenticate via SAML first
      throw new MonkeyError(
        404,
        "User not found in the database. Please authenticate via SAML to create your account.",
        "get user",
        uid,
      );
    } else {
      throw error;
    }
  }

  userInfo.personalBests ??= {
    time: {},
    words: {},
    quote: {},
    zen: {},
    custom: {},
  };

  const agentLog = buildAgentLog(req);
  void addLog("user_data_requested", agentLog, uid);
  void UserDAL.logIpAddress(uid, agentLog.ip, userInfo);

  let inboxUnreadSize = 0;
  if (req.ctx.configuration.users.inbox.enabled) {
    inboxUnreadSize = userInfo.inbox?.filter((mail) => !mail.read).length ?? 0;
  }

  if (!userInfo.name) {
    userInfo.needsToChangeName = true;
    await UserDAL.flagForNameChange(uid);
  }

  const isPremium = await UserDAL.checkIfUserIsPremium(uid, userInfo);

  const allTimeLbs = await getAllTimeLbs(uid);
  const testActivity = generateCurrentTestActivity(userInfo.testActivity);
  const relevantUserInfo = getRelevantUserInfo(userInfo);

  const resultFilterPresets: ResultFilters[] = (
    relevantUserInfo.resultFilterPresets ?? []
  ).map((it) => replaceObjectId(it));
  delete relevantUserInfo.resultFilterPresets;

  const tags = (relevantUserInfo.tags ?? []).map((it) => replaceObjectId(it));
  delete relevantUserInfo.tags;

  const customThemes = (relevantUserInfo.customThemes ?? []).map((it) =>
    replaceObjectId(it),
  );
  delete relevantUserInfo.customThemes;

  const userData: User = {
    ...relevantUserInfo,
    mongoId: userInfo._id.toHexString(),
    resultFilterPresets,
    tags,
    customThemes,
    isPremium,
    allTimeLbs,
    testActivity,
  };

  return new MonkeyResponse("User data retrieved", {
    ...userData,
    inboxUnreadSize: inboxUnreadSize,
  });
}

export async function getAdminStatus(
  req: MonkeyRequest,
): Promise<GetAdminStatusResponse> {
  const { uid } = req.ctx.decodedToken;
  const admin = await AdminUidsDal.isAdmin(uid);

  return new MonkeyResponse("Admin status retrieved", { isAdmin: admin });
}

export async function listUsers(
  _req: MonkeyRequest,
): Promise<ListUsersResponse> {
  const legacyAdminUids = new Set(await AdminUidsDal.getAllLegacyAdminUids());
  const users = await UserDAL.getAllUsersForAdmin(legacyAdminUids);

  return new MonkeyResponse("Users retrieved", users);
}

export async function getOauthLink(
  req: MonkeyRequest,
): Promise<GetDiscordOauthLinkResponse> {
  const { uid } = req.ctx.decodedToken;

  //build the url
  const url = await DiscordUtils.getOauthLink(uid);

  //return
  return new MonkeyResponse("Discord oauth link generated", {
    url: url,
  });
}

export async function linkDiscord(
  req: MonkeyRequest<undefined, LinkDiscordRequest>,
): Promise<LinkDiscordResponse> {
  const { uid } = req.ctx.decodedToken;
  const { tokenType, accessToken, state } = req.body;

  if (!(await DiscordUtils.iStateValidForUser(state, uid))) {
    throw new MonkeyError(403, "Invalid user token");
  }

  const userInfo = await UserDAL.getPartialUser(uid, "link discord", [
    "banned",
    "discordId",
    "lbOptOut",
  ]);
  if (userInfo.banned) {
    throw new MonkeyError(403, "Banned accounts cannot link with Discord");
  }

  const { id: discordId, avatar: discordAvatar } =
    await DiscordUtils.getDiscordUser(tokenType, accessToken);

  if (userInfo.discordId !== undefined && userInfo.discordId !== "") {
    await UserDAL.linkDiscord(uid, userInfo.discordId, discordAvatar);
    return new MonkeyResponse("Discord avatar updated", {
      discordId,
      discordAvatar,
    });
  }

  if (!discordId) {
    throw new MonkeyError(
      500,
      "Could not get Discord account info",
      "discord id is undefined",
    );
  }

  const discordIdAvailable = await UserDAL.isDiscordIdAvailable(discordId);
  if (!discordIdAvailable) {
    throw new MonkeyError(
      409,
      "This Discord account is linked to a different account",
    );
  }

  if (await BlocklistDal.contains({ discordId })) {
    throw new MonkeyError(409, "The Discord account is blocked");
  }

  await UserDAL.linkDiscord(uid, discordId, discordAvatar);

  await GeorgeQueue.linkDiscord(discordId, uid, userInfo.lbOptOut ?? false);
  void addImportantLog("user_discord_link", `linked to ${discordId}`, uid);

  return new MonkeyResponse("Discord account linked", {
    discordId,
    discordAvatar,
  });
}

export async function unlinkDiscord(
  req: MonkeyRequest,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;

  const userInfo = await UserDAL.getPartialUser(uid, "unlink discord", [
    "banned",
    "discordId",
  ]);

  if (userInfo.banned) {
    throw new MonkeyError(403, "Banned accounts cannot unlink Discord");
  }

  const discordId = userInfo.discordId;
  if (discordId === undefined || discordId === "") {
    throw new MonkeyError(404, "User does not have a linked Discord account");
  }

  await GeorgeQueue.unlinkDiscord(discordId, uid);
  await UserDAL.unlinkDiscord(uid);
  void addImportantLog("user_discord_unlinked", discordId, uid);

  return new MonkeyResponse("Discord account unlinked", null);
}

export async function addResultFilterPreset(
  req: MonkeyRequest<undefined, AddResultFilterPresetRequest>,
): Promise<AddResultFilterPresetResponse> {
  const { uid } = req.ctx.decodedToken;
  const filter = req.body;
  const { maxPresetsPerUser } = req.ctx.configuration.results.filterPresets;

  const createdId = await UserDAL.addResultFilterPreset(
    uid,
    filter,
    maxPresetsPerUser,
  );
  return new MonkeyResponse(
    "Result filter preset created",
    createdId.toHexString(),
  );
}

export async function removeResultFilterPreset(
  req: MonkeyRequest<undefined, undefined, RemoveResultFilterPresetPathParams>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { presetId } = req.params;

  await UserDAL.removeResultFilterPreset(uid, presetId);
  return new MonkeyResponse("Result filter preset deleted", null);
}

export async function addTag(
  req: MonkeyRequest<undefined, AddTagRequest>,
): Promise<AddTagResponse> {
  const { uid } = req.ctx.decodedToken;
  const { tagName } = req.body;

  const tag = await UserDAL.addTag(uid, tagName);
  return new MonkeyResponse("Tag updated", replaceObjectId(tag));
}

export async function clearTagPb(
  req: MonkeyRequest<undefined, undefined, TagIdPathParams>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { tagId } = req.params;

  await UserDAL.removeTagPb(uid, tagId);
  return new MonkeyResponse("Tag PB cleared", null);
}

export async function editTag(
  req: MonkeyRequest<undefined, EditTagRequest>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { tagId, newName } = req.body;

  await UserDAL.editTag(uid, tagId, newName);
  return new MonkeyResponse("Tag updated", null);
}

export async function removeTag(
  req: MonkeyRequest<undefined, undefined, TagIdPathParams>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { tagId } = req.params;

  await UserDAL.removeTag(uid, tagId);
  return new MonkeyResponse("Tag deleted", null);
}

export async function getTags(req: MonkeyRequest): Promise<GetTagsResponse> {
  const { uid } = req.ctx.decodedToken;

  const tags = await UserDAL.getTags(uid);
  return new MonkeyResponse("Tags retrieved", replaceObjectIds(tags));
}

export async function updateLbMemory(
  req: MonkeyRequest<undefined, UpdateLeaderboardMemoryRequest>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { mode, language, rank } = req.body;
  const mode2 = req.body.mode2;

  await UserDAL.updateLbMemory(uid, mode, mode2, language, rank);
  return new MonkeyResponse("Leaderboard memory updated", null);
}

export async function getCustomThemes(
  req: MonkeyRequest,
): Promise<GetCustomThemesResponse> {
  const { uid } = req.ctx.decodedToken;
  const customThemes = await UserDAL.getThemes(uid);
  return new MonkeyResponse(
    "Custom themes retrieved",
    replaceObjectIds(customThemes),
  );
}

export async function addCustomTheme(
  req: MonkeyRequest<undefined, AddCustomThemeRequest>,
): Promise<AddCustomThemeResponse> {
  const { uid } = req.ctx.decodedToken;
  const { name, colors } = req.body;

  const addedTheme = await UserDAL.addTheme(uid, { name, colors });
  return new MonkeyResponse("Custom theme added", replaceObjectId(addedTheme));
}

export async function removeCustomTheme(
  req: MonkeyRequest<undefined, DeleteCustomThemeRequest>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { themeId } = req.body;
  await UserDAL.removeTheme(uid, themeId);
  return new MonkeyResponse("Custom theme removed", null);
}

export async function editCustomTheme(
  req: MonkeyRequest<undefined, EditCustomThemeRequst>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { themeId, theme } = req.body;

  await UserDAL.editTheme(uid, themeId, theme);
  return new MonkeyResponse("Custom theme updated", null);
}

export async function getPersonalBests(
  req: MonkeyRequest<GetPersonalBestsQuery>,
): Promise<GetPersonalBestsResponse> {
  const { uid } = req.ctx.decodedToken;
  const { mode, mode2 } = req.query;

  const data = (await UserDAL.getPersonalBests(uid, mode, mode2)) ?? null;
  return new MonkeyResponse("Personal bests retrieved", data);
}

export async function getStats(req: MonkeyRequest): Promise<GetStatsResponse> {
  const { uid } = req.ctx.decodedToken;

  const data = (await UserDAL.getStats(uid)) ?? null;
  return new MonkeyResponse("Personal stats retrieved", data);
}

export async function getFavoriteQuotes(
  req: MonkeyRequest,
): Promise<GetFavoriteQuotesResponse> {
  const { uid } = req.ctx.decodedToken;

  const quotes = await UserDAL.getFavoriteQuotes(uid);

  return new MonkeyResponse("Favorite quotes retrieved", quotes);
}

export async function addFavoriteQuote(
  req: MonkeyRequest<undefined, AddFavoriteQuoteRequest>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;

  const { language, quoteId } = req.body;

  await UserDAL.addFavoriteQuote(
    uid,
    language,
    quoteId,
    req.ctx.configuration.quotes.maxFavorites,
  );

  return new MonkeyResponse("Quote added to favorites", null);
}

export async function removeFavoriteQuote(
  req: MonkeyRequest<undefined, RemoveFavoriteQuoteRequest>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;

  const { quoteId, language } = req.body;
  await UserDAL.removeFavoriteQuote(uid, language, quoteId);

  return new MonkeyResponse("Quote removed from favorites", null);
}

export async function getProfile(
  req: MonkeyRequest<GetProfileQuery, undefined, GetProfilePathParams>,
): Promise<GetProfileResponse> {
  const { uidOrName } = req.params;

  const user = req.query.id
    ? await UserDAL.getUserByMongoId(uidOrName, "get user profile")
    : req.query.isUid
      ? await UserDAL.getUser(uidOrName, "get user profile")
      : await UserDAL.getUserByName(uidOrName, "get user profile");

  const {
    name,
    geocode,
    firstName,
    lastName,
    banned,
    inventory,
    profileDetails,
    personalBests,
    completedTests,
    startedTests,
    timeTyping,
    addedAt,
    discordId,
    discordAvatar,
    xp,
    streak,
    lbOptOut,
  } = user;

  const extractValid = (
    src: Record<string, PersonalBest[]>,
    validKeys: string[],
  ): Record<string, PersonalBest[]> => {
    return validKeys.reduce((obj, key) => {
      if (src?.[key] !== undefined) {
        obj[key] = src[key];
      }
      return obj;
    }, {});
  };

  const validTimePbs = extractValid(personalBests.time, [
    "15",
    "30",
    "60",
    "120",
  ]);
  const validWordsPbs = extractValid(personalBests.words, [
    "10",
    "25",
    "50",
    "100",
  ]);

  const typingStats = {
    completedTests,
    startedTests,
    timeTyping,
  };

  const relevantPersonalBests = {
    time: validTimePbs,
    words: validWordsPbs,
  };

  const baseProfile = {
    mongoId: user._id.toHexString(),
    name,
    geocode,
    firstName,
    lastName,
    banned,
    addedAt,
    typingStats,
    personalBests: relevantPersonalBests,
    discordId,
    discordAvatar,
    xp,
    streak: streak?.length ?? 0,
    maxStreak: streak?.maxLength ?? 0,
    lbOptOut,
    isPremium: await UserDAL.checkIfUserIsPremium(user.uid, user),
  };

  if (banned) {
    return new MonkeyResponse("Profile retrived: banned user", baseProfile);
  }

  const allTimeLbs = await getAllTimeLbs(user.uid);

  const profileData = {
    ...baseProfile,
    inventory,
    details: profileDetails,
    allTimeLbs,
    uid: user.uid,
  } as UserProfile;

  if (user.profileDetails?.showActivityOnPublicProfile) {
    profileData.testActivity = generateCurrentTestActivity(user.testActivity);
  } else {
    delete profileData.testActivity;
  }
  return new MonkeyResponse("Profile retrieved", profileData);
}

export async function updateProfile(
  req: MonkeyRequest<undefined, UpdateUserProfileRequest>,
): Promise<UpdateUserProfileResponse> {
  const { uid } = req.ctx.decodedToken;
  const {
    bio,
    keyboard,
    socialProfiles,
    selectedBadgeId,
    showActivityOnPublicProfile,
  } = req.body;

  const user = await UserDAL.getPartialUser(uid, "update user profile", [
    "banned",
    "inventory",
  ]);

  if (user.banned) {
    throw new MonkeyError(403, "Banned users cannot update their profile");
  }

  user.inventory?.badges.forEach((badge) => {
    if (badge.id === selectedBadgeId) {
      badge.selected = true;
    } else {
      delete badge.selected;
    }
  });

  const profileDetailsUpdates: Partial<UserProfileDetails> = {
    bio: sanitizeString(bio),
    keyboard: sanitizeString(keyboard),
    // Only allow these explicit profile links.
    // Legacy fields like `page` are intentionally ignored.
    socialProfiles: {
      linkedin: sanitizeString(socialProfiles?.linkedin),
      github: sanitizeString(socialProfiles?.github),
      website: sanitizeString(socialProfiles?.website),
    },
    showActivityOnPublicProfile,
  };

  await UserDAL.updateProfile(uid, profileDetailsUpdates, user.inventory);

  return new MonkeyResponse("Profile updated", profileDetailsUpdates);
}

export async function getInbox(
  req: MonkeyRequest,
): Promise<GetUserInboxResponse> {
  const { uid } = req.ctx.decodedToken;

  const inbox = await UserDAL.getInbox(uid);

  return new MonkeyResponse("Inbox retrieved", {
    inbox,
    maxMail: req.ctx.configuration.users.inbox.maxMail,
  });
}

export async function updateInbox(
  req: MonkeyRequest<undefined, UpdateUserInboxRequest>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { mailIdsToMarkRead, mailIdsToDelete } = req.body;

  await UserDAL.updateInbox(
    uid,
    mailIdsToMarkRead ?? [],
    mailIdsToDelete ?? [],
  );

  return new MonkeyResponse("Inbox updated", null);
}

export async function reportUser(
  req: MonkeyRequest<undefined, ReportUserRequest>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const {
    reporting: { maxReports, contentReportLimit },
  } = req.ctx.configuration.quotes;

  const { uid: uidToReport, reason, comment, captcha } = req.body;

  await verifyCaptcha(captcha);

  const newReport: ReportDAL.DBReport = {
    _id: new ObjectId(),
    id: uuidv4(),
    type: "user",
    timestamp: new Date().getTime(),
    uid,
    contentId: `${uidToReport}`,
    reason,
    comment: comment ?? "",
  };

  await ReportDAL.createReport(newReport, maxReports, contentReportLimit);

  return new MonkeyResponse("User reported", null);
}

export async function setStreakHourOffset(
  req: MonkeyRequest<undefined, SetStreakHourOffsetRequest>,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  const { hourOffset } = req.body;

  const user = await UserDAL.getPartialUser(uid, "update user profile", [
    "streak",
  ]);

  if (
    user.streak?.hourOffset !== undefined &&
    user.streak?.hourOffset !== null
  ) {
    throw new MonkeyError(403, "Streak hour offset already set");
  }

  await UserDAL.setStreakHourOffset(uid, hourOffset);

  void addImportantLog("user_streak_hour_offset_set", { hourOffset }, uid);

  return new MonkeyResponse("Streak hour offset set", null);
}

export async function revokeAllTokens(
  req: MonkeyRequest,
): Promise<MonkeyResponse> {
  const { uid } = req.ctx.decodedToken;
  await AuthUtil.revokeTokensByUid(uid);
  void addImportantLog("user_tokens_revoked", "", uid);
  return new MonkeyResponse("All tokens revoked", null);
}

async function getAllTimeLbs(uid: string): Promise<AllTimeLbs> {
  const allTime15English = await LeaderboardsDAL.getRank(
    "time",
    "15",
    "english",
    uid,
  );

  const allTime15EnglishCount = await LeaderboardsDAL.getCount(
    "time",
    "15",
    "english",
  );

  const allTime60English = await LeaderboardsDAL.getRank(
    "time",
    "60",
    "english",
    uid,
  );

  const allTime60EnglishCount = await LeaderboardsDAL.getCount(
    "time",
    "60",
    "english",
  );

  const english15 =
    allTime15English === false || allTime15English === null
      ? undefined
      : {
          rank: allTime15English.rank,
          count: allTime15EnglishCount,
        };

  const english60 =
    allTime60English === false || allTime60English === null
      ? undefined
      : {
          rank: allTime60English.rank,
          count: allTime60EnglishCount,
        };

  return {
    time: {
      "15": {
        english: english15,
      },
      "60": {
        english: english60,
      },
    },
  };
}

export function generateCurrentTestActivity(
  testActivity: CountByYearAndDay | undefined,
): TestActivity | undefined {
  const thisYear = Dates.startOfYear(new UTCDateMini());
  const lastYear = Dates.startOfYear(Dates.subYears(thisYear, 1));

  let thisYearData = testActivity?.[thisYear.getFullYear().toString()];
  let lastYearData = testActivity?.[lastYear.getFullYear().toString()];

  if (lastYearData === undefined && thisYearData === undefined)
    return undefined;

  lastYearData = lastYearData ?? [];
  thisYearData = thisYearData ?? [];

  //make sure lastYearData covers the full year
  if (lastYearData.length < Dates.getDaysInYear(lastYear)) {
    lastYearData.push(
      ...(new Array(Dates.getDaysInYear(lastYear) - lastYearData.length).fill(
        undefined,
      ) as (number | null)[]),
    );
  }
  //use enough days of the last year to have 372 days in total to always fill the first week of the graph
  lastYearData = lastYearData.slice(-372 + thisYearData.length);

  const lastDay = Dates.startOfDay(
    Dates.addDays(thisYear, thisYearData.length - 1),
  );

  return {
    testsByDays: [...lastYearData, ...thisYearData],
    lastDay: lastDay.valueOf(),
  };
}

export async function getTestActivity(
  req: MonkeyRequest,
): Promise<GetTestActivityResponse> {
  const { uid } = req.ctx.decodedToken;
  const premiumFeaturesEnabled = req.ctx.configuration.users.premium.enabled;
  const user = await UserDAL.getPartialUser(uid, "testActivity", [
    "testActivity",
    "premium",
  ]);
  const userHasPremium = await UserDAL.checkIfUserIsPremium(uid, user);

  if (!premiumFeaturesEnabled) {
    throw new MonkeyError(503, "Premium features are disabled");
  }

  if (!userHasPremium) {
    throw new MonkeyError(503, "User does not have premium");
  }

  return new MonkeyResponse(
    "Test activity data retrieved",
    user.testActivity ?? null,
  );
}

export async function getCurrentTestActivity(
  req: MonkeyRequest,
): Promise<GetCurrentTestActivityResponse> {
  const { uid } = req.ctx.decodedToken;

  const user = await UserDAL.getPartialUser(uid, "current test activity", [
    "testActivity",
  ]);
  const data = generateCurrentTestActivity(user.testActivity);
  return new MonkeyResponse(
    "Current test activity data retrieved",
    data ?? null,
  );
}

export async function getStreak(
  req: MonkeyRequest,
): Promise<GetStreakResponse> {
  const { uid } = req.ctx.decodedToken;

  const user = await UserDAL.getPartialUser(uid, "streak", ["streak"]);

  return new MonkeyResponse("Streak data retrieved", user.streak ?? null);
}

export async function getFriends(
  req: MonkeyRequest,
): Promise<GetFriendsResponse> {
  const { uid } = req.ctx.decodedToken;
  const premiumEnabled = req.ctx.configuration.users.premium.enabled;
  const data = await UserDAL.getFriends(uid);

  if (!premiumEnabled) {
    for (const friend of data) {
      delete friend.isPremium;
    }
  }

  return new MonkeyResponse("Friends retrieved", data);
}
