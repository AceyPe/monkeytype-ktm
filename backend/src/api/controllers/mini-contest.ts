import {
  AddContestResultRequest,
  AddContestResultResponse,
  GetContestBestResultResponse,
  GetContestLeaderboardParams,
  GetContestLeaderboardQuery,
  GetContestLeaderboardResponse,
  SetContestLeaderboardPublicRequest,
  UpdateContestParams,
} from "@monkeytype/contracts/contests";
import {
  CreateMiniContestResponse,
  GetMiniContestResponse,
  GetMiniContestsResponse,
  GetPublicMiniContestsResponse,
  MiniContestSlugParams,
} from "@monkeytype/contracts/mini-contests";
import {
  CreateContestRequest,
  UpdateContestRequest,
} from "@monkeytype/schemas/contests";
import * as MiniContestDAL from "../../dal/mini-contest";
import { MonkeyResponse } from "../../utils/monkey-response";
import { omit, replaceObjectId, replaceObjectIds } from "../../utils/misc";
import { MonkeyRequest } from "../types";
import {
  getBestResultForContest,
  getLeaderboardForContest,
  saveContestResult,
} from "./contest-result";

export async function getMiniContests(
  _req: MonkeyRequest,
): Promise<GetMiniContestsResponse> {
  const data = await MiniContestDAL.getMiniContests();
  return new MonkeyResponse("Mini-contests retrieved", replaceObjectIds(data));
}

export async function getPublicMiniContests(
  _req: MonkeyRequest,
): Promise<GetPublicMiniContestsResponse> {
  const data = (await MiniContestDAL.getPublicMiniContests()).map((contest) =>
    omit(replaceObjectId(contest), ["slug"]),
  );
  return new MonkeyResponse("Public mini-contests retrieved", data);
}

export async function getMiniContestBySlug(
  req: MonkeyRequest<undefined, undefined, MiniContestSlugParams>,
): Promise<GetMiniContestResponse> {
  const data = await MiniContestDAL.requireMiniContestBySlug(req.params.slug);
  return new MonkeyResponse("Mini-contest retrieved", replaceObjectId(data));
}

export async function createMiniContest(
  req: MonkeyRequest<undefined, CreateContestRequest>,
): Promise<CreateMiniContestResponse> {
  const data = await MiniContestDAL.createMiniContest(req.body);
  return new MonkeyResponse("Mini-contest created", data);
}

export async function updateMiniContest(
  req: MonkeyRequest<undefined, UpdateContestRequest, UpdateContestParams>,
): Promise<MonkeyResponse> {
  await MiniContestDAL.updateMiniContest(req.params.contestId, req.body);
  return new MonkeyResponse("Mini-contest updated", null);
}

export async function setMiniContestLeaderboardPublic(
  req: MonkeyRequest<
    undefined,
    SetContestLeaderboardPublicRequest,
    UpdateContestParams
  >,
): Promise<MonkeyResponse> {
  await MiniContestDAL.setMiniContestLeaderboardPublic(
    req.params.contestId,
    req.body.leaderboardPublic,
  );
  return new MonkeyResponse(
    "Mini-contest leaderboard visibility updated",
    null,
  );
}

export async function deleteMiniContest(
  req: MonkeyRequest<undefined, undefined, UpdateContestParams>,
): Promise<MonkeyResponse> {
  await MiniContestDAL.deleteMiniContest(req.params.contestId);
  return new MonkeyResponse("Mini-contest deleted", null);
}

export async function addMiniContestResult(
  req: MonkeyRequest<undefined, AddContestResultRequest, MiniContestSlugParams>,
): Promise<AddContestResultResponse> {
  const contest = await MiniContestDAL.requireActiveMiniContest(
    req.params.slug,
  );
  return await saveContestResult(req, contest._id.toHexString());
}

export async function getMiniContestBestResult(
  req: MonkeyRequest<undefined, undefined, MiniContestSlugParams>,
): Promise<GetContestBestResultResponse> {
  const contest = await MiniContestDAL.requireMiniContestBySlug(
    req.params.slug,
  );
  return await getBestResultForContest(
    req.ctx.decodedToken.uid,
    contest._id.toHexString(),
  );
}

export async function getMiniContestLeaderboard(
  req: MonkeyRequest<
    GetContestLeaderboardQuery,
    undefined,
    GetContestLeaderboardParams
  >,
): Promise<GetContestLeaderboardResponse> {
  const contest = await MiniContestDAL.requireMiniContest(req.params.contestId);
  return await getLeaderboardForContest(req, contest);
}
