import Page from "./page";
import * as Skeleton from "../utils/skeleton";
import Ape from "../ape";
import AnimatedModal from "../utils/animated-modal";
import * as Notifications from "../elements/notifications";
import { Contest, CreateContestRequest } from "@monkeytype/schemas/contests";
import { format } from "date-fns";
import { UTCDateMini } from "@date-fns/utc";

type DashboardSection = "contests";

const state = {
  section: "contests" as DashboardSection,
  loading: false,
  error: undefined as string | undefined,
  contests: [] as Contest[],
};

const pageElement = $(".page.pageDashboard");

function parseUtcDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return Date.UTC(year, month - 1, day);
}

function formatContestDate(timestamp: number): string {
  return `${format(new UTCDateMini(timestamp), "dd MMM yyyy")} UTC`;
}

function formatPrizeRange(fromPosition: number, toPosition?: number): string {
  if (toPosition === undefined || toPosition === fromPosition) {
    return String(fromPosition);
  }
  return `${fromPosition}–${toPosition}`;
}

function updateSectionButtons(): void {
  pageElement.find(".sectionButtons button").removeClass("active");
  pageElement
    .find(`.sectionButtons button[data-section='${state.section}']`)
    .addClass("active");
}

function renderContestsList(): void {
  const list = pageElement.find(".contestsList");
  list.empty();

  if (state.contests.length === 0) {
    list.append(`<div class="empty">No contests yet</div>`);
    return;
  }

  for (const contest of state.contests) {
    const prizeRows = contest.prizes
      .map(
        (prize) => `
          <tr>
            <td>${formatPrizeRange(prize.fromPosition, prize.toPosition)}</td>
            <td>${escapeHtml(prize.reward)}</td>
          </tr>
        `,
      )
      .join("");

    list.append(`
      <div class="contestCard" data-contest-id="${contest._id}">
        <div class="contestTitle">${escapeHtml(contest.title)}</div>
        <div class="contestDate">${formatContestDate(contest.date)}</div>
        <table class="prizeTable">
          <thead>
            <tr>
              <th>position</th>
              <th>reward</th>
            </tr>
          </thead>
          <tbody>${prizeRows}</tbody>
        </table>
      </div>
    `);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function updateContent(): void {
  pageElement.find(".loading").toggleClass("hidden", !state.loading);
  pageElement.find(".error").toggleClass("hidden", state.error === undefined);
  pageElement.find(".error p").text(state.error ?? "");
  pageElement
    .find(".contestsPanel")
    .toggleClass("hidden", state.section !== "contests");

  if (state.loading || state.error !== undefined) {
    pageElement.find(".contestsList").empty();
    return;
  }

  renderContestsList();
}

async function fetchContests(): Promise<void> {
  state.loading = true;
  state.error = undefined;
  updateContent();

  const response = await Ape.contests.get();

  state.loading = false;

  if (response.status === 200) {
    state.contests = response.body.data;
    state.error = undefined;
  } else {
    state.contests = [];
    state.error = response.body.message ?? "Failed to load contests";
    Notifications.add(state.error, -1);
  }

  updateContent();
}

function createPrizeRow(): HTMLElement {
  const row = document.createElement("div");
  row.className = "prizeRow";
  row.innerHTML = `
    <label>
      from position
      <input type="number" min="1" step="1" class="fromPosition" required />
    </label>
    <label>
      to position (optional)
      <input type="number" min="1" step="1" class="toPosition" />
    </label>
    <label>
      reward
      <input type="text" class="reward" required />
    </label>
    <button type="button" class="textButton removePrizeButton" aria-label="Remove prize">
      <i class="fas fa-times"></i>
    </button>
  `;
  return row;
}

function resetCreateContestForm(): void {
  const form = createContestModal.getModal();
  if (form instanceof HTMLFormElement) {
    form.reset();
  }
  const prizeList = $(form).find(".prizeList");
  prizeList.empty();
  prizeList.append(createPrizeRow());
  $(form).find(".formError").addClass("hidden").text("");
}

function readPrizesFromForm(): CreateContestRequest["prizes"] | string {
  const prizes: CreateContestRequest["prizes"] = [];
  const rows = $(createContestModal.getModal()).find(".prizeRow");

  if (rows.length === 0) {
    return "Add at least one prize";
  }

  let invalid = false;

  rows.each(function () {
    const fromRaw = $(this).find(".fromPosition").val() as string;
    const toRaw = $(this).find(".toPosition").val() as string;
    const reward = ($(this).find(".reward").val() as string).trim();

    const fromPosition = Number(fromRaw);
    const toPosition = toRaw.trim() === "" ? undefined : Number(toRaw);

    if (!Number.isInteger(fromPosition) || fromPosition < 1) {
      invalid = true;
      return;
    }

    if (
      toPosition !== undefined &&
      (!Number.isInteger(toPosition) || toPosition < fromPosition)
    ) {
      invalid = true;
      return;
    }

    if (reward === "") {
      invalid = true;
      return;
    }

    prizes.push({
      fromPosition,
      toPosition,
      reward,
    });
  });

  if (invalid || prizes.length !== rows.length) {
    return "Fill in valid prize details for each row";
  }

  return prizes;
}

const createContestModal = new AnimatedModal({
  dialogId: "createContestModal",
  setup: async (modalEl): Promise<void> => {
    $(modalEl).on("click", ".addPrizeButton", () => {
      $(modalEl).find(".prizeList").append(createPrizeRow());
    });

    $(modalEl).on("click", ".removePrizeButton", function () {
      const prizeList = $(modalEl).find(".prizeList");
      if (prizeList.find(".prizeRow").length <= 1) return;
      $(this).closest(".prizeRow").remove();
    });

    $(modalEl).on("submit", (event) => {
      void submitCreateContest(event);
    });
  },
});

async function submitCreateContest(event: {
  preventDefault: () => void;
}): Promise<void> {
  event.preventDefault();

  const modal = $(createContestModal.getModal());
  const title = (modal.find("input[name='title']").val() as string).trim();
  const dateValue = modal.find("input[name='date']").val() as string;
  const date = parseUtcDate(dateValue);
  const prizes = readPrizesFromForm();
  const errorEl = modal.find(".formError");

  if (title === "") {
    errorEl.removeClass("hidden").text("Title is required");
    return;
  }

  if (date === null) {
    errorEl.removeClass("hidden").text("Date is required");
    return;
  }

  if (typeof prizes === "string") {
    errorEl.removeClass("hidden").text(prizes);
    return;
  }

  errorEl.addClass("hidden").text("");
  modal.find(".submitButton").prop("disabled", true);

  const response = await Ape.contests.create({
    body: {
      title,
      date,
      prizes,
    },
  });

  modal.find(".submitButton").prop("disabled", false);

  if (response.status === 200) {
    Notifications.add("Contest created", 1);
    void createContestModal.hide();
    await fetchContests();
    return;
  }

  errorEl
    .removeClass("hidden")
    .text(response.body.message ?? "Failed to create contest");
}

function openCreateContestModal(): void {
  resetCreateContestForm();
  void createContestModal.show({
    focusFirstInput: true,
  });
}

pageElement.on("click", ".sectionButtons button", function () {
  const section = $(this).attr("data-section") as DashboardSection | undefined;
  if (section === undefined || state.section === section) return;
  state.section = section;
  updateSectionButtons();
  updateContent();
});

pageElement.on("click", ".createContestButton", () => {
  openCreateContestModal();
});

export const page = new Page({
  id: "dashboard",
  element: pageElement,
  path: "/dashboard",
  afterHide: async (): Promise<void> => {
    Skeleton.remove("pageDashboard");
  },
  beforeShow: async (): Promise<void> => {
    Skeleton.append("pageDashboard", "main");
    updateSectionButtons();
    await fetchContests();
  },
});

$(() => {
  Skeleton.save("pageDashboard");
});
