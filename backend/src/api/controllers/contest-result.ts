import objectHash from "object-hash";
import { UAParser } from "ua-parser-js";
import {
  AddContestResultRequest,
  AddContestResultResponse,
  GetContestBestResultResponse,
} from "@monkeytype/contracts/contests";
import { CompletedEvent, KeyStats } from "@monkeytype/schemas/results";
import { isSafeNumber, roundTo2, stdDev } from "@monkeytype/util/numbers";
import { checkCompatibility } from "@monkeytype/funbox";
import { tryCatch } from "@monkeytype/util/trycatch";
import {
  implemented as anticheatImplemented,
  validateKeys,
  validateResult,
} from "../../anticheat/index";
import MonkeyStatusCodes from "../../constants/monkey-status-codes";
import * as ContestDAL from "../../dal/contest";
import * as ContestResultDAL from "../../dal/contest-result";
import { addLog } from "../../dal/logs";
import * as UserDAL from "../../dal/user";
import { isDevEnvironment, omit } from "../../utils/misc";
import MonkeyError from "../../utils/error";
import { MonkeyResponse } from "../../utils/monkey-response";
import { buildDbResult } from "../../utils/result";
import {
  toContestResultSummary,
  validateContestCompletedEvent,
} from "../../utils/contest-result";
import { isTestTooShort } from "../../utils/validation";
import { MonkeyRequest } from "../types";

export function isContestShapedResult(completedEvent: CompletedEvent): boolean {
  return (
    completedEvent.mode === "time" &&
    completedEvent.mode2 === "60" &&
    !completedEvent.punctuation &&
    !completedEvent.numbers &&
    completedEvent.funbox.length === 0
  );
}

async function validateContestResultSubmission(
  req: MonkeyRequest<undefined, AddContestResultRequest>,
  completedEvent: CompletedEvent,
  uid: string,
): Promise<{
  keySpacingStats?: KeyStats;
  keyDurationStats?: KeyStats;
}> {
  const user = await UserDAL.getUser(uid, "add contest result");

  if (user.needsToChangeName) {
    throw new MonkeyError(
      403,
      "Please change your name before submitting a contest result",
    );
  }

  validateContestCompletedEvent(completedEvent);

  if (isTestTooShort(completedEvent)) {
    const status = MonkeyStatusCodes.TEST_TOO_SHORT;
    throw new MonkeyError(status.code, status.message);
  }

  if (user.lbOptOut !== true && completedEvent.acc < 75) {
    throw new MonkeyError(400, "Accuracy too low");
  }

  const resulthash = completedEvent.hash;
  if (req.ctx.configuration.results.objectHashCheckEnabled) {
    const serverhash = objectHash(omit(completedEvent, ["hash"]));
    if (serverhash !== resulthash) {
      const status = MonkeyStatusCodes.RESULT_HASH_INVALID;
      throw new MonkeyError(status.code, "Incorrect result hash");
    }
  }

  if (!checkCompatibility(completedEvent.funbox)) {
    throw new MonkeyError(400, "Impossible funbox combination");
  }

  let keySpacingStats: KeyStats | undefined;
  if (
    completedEvent.keySpacing !== "toolong" &&
    completedEvent.keySpacing.length > 0
  ) {
    keySpacingStats = {
      average:
        completedEvent.keySpacing.reduce(
          (previous, current) => (current += previous),
        ) / completedEvent.keySpacing.length,
      sd: stdDev(completedEvent.keySpacing),
    };
  }

  let keyDurationStats: KeyStats | undefined;
  if (
    completedEvent.keyDuration !== "toolong" &&
    completedEvent.keyDuration.length > 0
  ) {
    keyDurationStats = {
      average:
        completedEvent.keyDuration.reduce(
          (previous, current) => (current += previous),
        ) / completedEvent.keyDuration.length,
      sd: stdDev(completedEvent.keyDuration),
    };
  }

  if (anticheatImplemented()) {
    if (
      !validateResult(
        completedEvent,
        ((req.raw.headers["x-client-version"] as string) ||
          req.raw.headers["client-version"]) as string,
        JSON.stringify(new UAParser(req.raw.headers["user-agent"]).getResult()),
        user.lbOptOut === true,
      )
    ) {
      const status = MonkeyStatusCodes.RESULT_DATA_INVALID;
      throw new MonkeyError(status.code, "Result data doesn't make sense");
    }
  } else if (!isDevEnvironment()) {
    throw new Error("No anticheat module found");
  }

  const contest = await ContestDAL.requireTodaysContest();
  const contestId = contest._id.toHexString();

  const { data: lastResultTimestamp } = await tryCatch(
    ContestResultDAL.getLastContestResultTimestamp(uid, contestId),
  );

  completedEvent.timestamp = Math.floor(Date.now() / 1000) * 1000;

  const testDurationMilis = completedEvent.testDuration * 1000;
  const incompleteTestsMilis = completedEvent.incompleteTestSeconds * 1000;
  const earliestPossible =
    (lastResultTimestamp ?? 0) + testDurationMilis + incompleteTestsMilis;
  const nowNoMilis = Math.floor(Date.now() / 1000) * 1000;
  if (
    isSafeNumber(lastResultTimestamp) &&
    nowNoMilis < earliestPossible - 1000
  ) {
    const status = MonkeyStatusCodes.RESULT_SPACING_INVALID;
    throw new MonkeyError(status.code, "Invalid result spacing");
  }

  if (
    completedEvent.mode === "time" &&
    completedEvent.wpm > 130 &&
    completedEvent.testDuration < 122 &&
    (user.verified === false || user.verified === undefined) &&
    user.lbOptOut !== true
  ) {
    if (!keySpacingStats || !keyDurationStats) {
      const status = MonkeyStatusCodes.MISSING_KEY_DATA;
      throw new MonkeyError(status.code, "Missing key data");
    }
    if (completedEvent.keyOverlap === undefined) {
      throw new MonkeyError(400, "Old key data format");
    }
    if (anticheatImplemented()) {
      if (
        !validateKeys(completedEvent, keySpacingStats, keyDurationStats, uid)
      ) {
        const status = MonkeyStatusCodes.BOT_DETECTED;
        throw new MonkeyError(status.code, "Possible bot detected");
      }
    }
  }

  if (keyDurationStats) {
    keyDurationStats.average = roundTo2(keyDurationStats.average);
    keyDurationStats.sd = roundTo2(keyDurationStats.sd);
  }
  if (keySpacingStats) {
    keySpacingStats.average = roundTo2(keySpacingStats.average);
    keySpacingStats.sd = roundTo2(keySpacingStats.sd);
  }

  return { keySpacingStats, keyDurationStats };
}

export async function addTodayContestResult(
  req: MonkeyRequest<undefined, AddContestResultRequest>,
): Promise<AddContestResultResponse> {
  const { uid } = req.ctx.decodedToken;
  const completedEvent = req.body.result;
  completedEvent.uid = uid;

  await validateContestResultSubmission(req, completedEvent, uid);

  const contest = await ContestDAL.requireTodaysContest();
  const contestId = contest._id.toHexString();
  const user = await UserDAL.getUser(uid, "add contest result");
  const dbresult = buildDbResult(completedEvent, user.name, false);

  const upserted = await ContestResultDAL.upsertBestContestResult(
    uid,
    contestId,
    dbresult,
  );

  void addLog(
    "contest_result_saved",
    {
      contestId,
      improved: upserted.improved,
      wpm: upserted.best.wpm,
    },
    uid,
  );

  return new MonkeyResponse("Contest result saved", {
    insertedId: upserted.insertedId.toHexString(),
    improved: upserted.improved,
    best: upserted.best,
  });
}

export async function getTodayContestBestResult(
  req: MonkeyRequest,
): Promise<GetContestBestResultResponse> {
  const { uid } = req.ctx.decodedToken;
  const contest = await ContestDAL.requireTodaysContest();
  const contestId = contest._id.toHexString();

  const best = await ContestResultDAL.getBestContestResult(uid, contestId);
  if (best === null) {
    return new MonkeyResponse("No contest result yet", null);
  }

  return new MonkeyResponse(
    "Contest best result retrieved",
    toContestResultSummary(best),
  );
}
