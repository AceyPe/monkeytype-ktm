import { PageName } from "../pages/page";

let activePage: PageName = "loading";

export function get(): PageName {
  return activePage;
}

export function set(active: PageName): void {
  activePage = active;
}

export function isTypingTestPage(): boolean {
  const page = get();
  return page === "test" || isContestPage();
}

export function isContestPage(): boolean {
  const page = get();
  return page === "contest" || page === "miniContest";
}
