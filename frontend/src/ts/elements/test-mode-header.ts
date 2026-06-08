import { hasContestToday } from "../utils/contest-today";

const topSectionElement = $("#testTopSection");
const headerElement = $("#testModeHeader");

export async function updateTestModeHeader(): Promise<void> {
  if ($(".page.pageTest").hasClass("contest-mode")) {
    return;
  }

  topSectionElement.removeClass("hidden");
  headerElement.removeClass("hidden");
  $("#contestModeHeader").addClass("hidden");

  const contestToday = await hasContestToday();
  headerElement.find(".marathonCallout").toggleClass("hidden", !contestToday);
}

export function hideTestModeHeader(): void {
  topSectionElement.addClass("hidden");
}
