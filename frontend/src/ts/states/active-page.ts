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
  return page === "test" || page === "contest";
}

export function isContestPage(): boolean {
  return get() === "contest";
}
