import {
  CreateContestResponse,
  GetContestsResponse,
  UpdateContestParams,
} from "@monkeytype/contracts/contests";
import {
  CreateContestRequest,
  UpdateContestRequest,
} from "@monkeytype/schemas/contests";
import * as ContestDAL from "../../dal/contest";
import { MonkeyResponse } from "../../utils/monkey-response";
import { replaceObjectId } from "../../utils/misc";
import { MonkeyRequest } from "../types";

export async function getContests(
  _req: MonkeyRequest,
): Promise<GetContestsResponse> {
  const data = (await ContestDAL.getContests()).map((contest) =>
    replaceObjectId(contest),
  );

  return new MonkeyResponse("Contests retrieved", data);
}

export async function createContest(
  req: MonkeyRequest<undefined, CreateContestRequest>,
): Promise<CreateContestResponse> {
  const data = await ContestDAL.createContest(req.body);

  return new MonkeyResponse("Contest created", data);
}

export async function updateContest(
  req: MonkeyRequest<undefined, UpdateContestRequest, UpdateContestParams>,
): Promise<MonkeyResponse> {
  await ContestDAL.updateContest(req.params.contestId, req.body);

  return new MonkeyResponse("Contest updated", null);
}

export async function deleteContest(
  req: MonkeyRequest<undefined, undefined, UpdateContestParams>,
): Promise<MonkeyResponse> {
  await ContestDAL.deleteContest(req.params.contestId);

  return new MonkeyResponse("Contest deleted", null);
}
