import type { MiniContest } from "@monkeytype/schemas/contests";
import * as ActivePage from "../states/active-page";

let active: MiniContest | null = null;

export function set(contest: MiniContest): void {
  active = contest;
}

/** The mini-contest being played, null on every page but the mini-contest one. */
export function get(): MiniContest | null {
  return ActivePage.get() === "miniContest" ? active : null;
}
