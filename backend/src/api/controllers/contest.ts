import {
  CreateContestResponse,
  GetContestsResponse,
} from "@monkeytype/contracts/contests";
import { CreateContestRequest } from "@monkeytype/schemas/contests";
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
