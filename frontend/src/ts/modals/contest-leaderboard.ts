import SlimSelect from "slim-select";
import { format } from "date-fns";
import { UTCDateMini } from "@date-fns/utc";
import type { Contest } from "@monkeytype/schemas/contests";
import type { LeaderboardEntry } from "@monkeytype/schemas/leaderboards";
import {
  RankScope,
  RankSortBy,
  RankSortDirection,
} from "@monkeytype/contracts/leaderboards";
import AnimatedModal from "../utils/animated-modal";
import Ape from "../ape";
import Config from "../config";
import Format from "../utils/format";
import * as Notifications from "../elements/notifications";
import {
  REGIONS,
  SECTIONS,
  getSectionNameByGeocode,
  type RegionCode,
} from "../constants/sections-by-geocode";
import { getPublicProfileDisplayName } from "../firebase";
import { getAvatarElement } from "../utils/discord-avatar";
import { capitalizeFirstLetter } from "../utils/strings";

type LeaderboardState = {
  contestId: string | undefined;
  contestTitle: string;
  contestDate: number | undefined;
  loading: boolean;
  updating: boolean;
  error: string | undefined;
  page: number;
  pageSize: number;
  count: number;
  data: LeaderboardEntry[] | null;
  rankScope: RankScope;
  rankSortBy: RankSortBy;
  rankSortDirection: RankSortDirection;
  regionFilter: RegionCode | "";
  sectionFilter: string;
};

const state: LeaderboardState = {
  contestId: undefined,
  contestTitle: "",
  contestDate: undefined,
  loading: false,
  updating: false,
  error: undefined,
  page: 0,
  pageSize: 50,
  count: 0,
  data: null,
  rankScope: "global",
  rankSortBy: "global",
  rankSortDirection: "asc",
  regionFilter: "",
  sectionFilter: "",
};

let regionSelect: SlimSelect | undefined;
let sectionSelect: SlimSelect | undefined;
let suppressFilterChange = false;

const modal = new AnimatedModal({
  dialogId: "contestLeaderboardModal",
  setup: async (modalElement): Promise<void> => {
    modalElement
      .querySelector(".contestLeaderboardCloseButton")
      ?.addEventListener("click", () => {
        void hide();
      });

    modalElement
      .querySelector(".jumpButtons")
      ?.addEventListener("click", (event) => {
        const target = (event.target as HTMLElement).closest("button");
        if (target === null) return;
        const action = target.dataset["action"];
        if (action === "firstPage") {
          goToPage(0);
        } else if (action === "previousPage") {
          goToPage(state.page - 1);
        } else if (action === "nextPage") {
          goToPage(state.page + 1);
        }
      });

    modalElement.querySelector("table")?.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest(".rankSortButton");
      if (target === null) return;
      const sortBy = target.getAttribute("data-sort-by") as RankSortBy | null;
      if (sortBy === null) return;
      handleRankSort(sortBy);
    });
  },
  customEscapeHandler: (): void => {
    void hide();
  },
  customWrapperClickHandler: (event): void => {
    if (event.target === modal.getWrapper()) {
      void hide();
    }
  },
  cleanup: async (): Promise<void> => {
    destroyFilters();
  },
});

function getModalRoot(): HTMLElement {
  return modal.getModal();
}

function formatContestDate(date: number): string {
  return format(new UTCDateMini(date), "dd MMM yyyy");
}

function formatRank(rank: number | undefined): string {
  if (rank === undefined) return "";
  if (rank === 1) {
    return `<span class="lbRankCrown" aria-label="1"><i class="fas fa-crown"></i><span class="lbRankCrownNumber">1</span></span>`;
  }
  return rank.toString();
}

function getRegionNumberFromGeocode(geocode?: string): number | null {
  if (geocode === undefined || geocode.trim() === "") return null;
  const firstDigit = geocode.match(/\d/)?.[0];
  if (firstDigit === undefined) return null;
  const n = Number(firstDigit);
  if (!Number.isInteger(n) || n < 0 || n > 9) return null;
  return n === 0 ? 10 : n;
}

function getRegionCellHtml(geocode?: string): string {
  const regionNumber = getRegionNumberFromGeocode(geocode);
  if (regionNumber === null) return "-";
  return `<div class="regionCell"><span>${regionNumber}</span></div>`;
}

function getRegionAvatarUrl(geocode?: string): string | undefined {
  const regionNumber = getRegionNumberFromGeocode(geocode);
  if (regionNumber === null) return undefined;
  return `/images/regons/${regionNumber}.webp`;
}

function getSectionCellText(geocode?: string): string {
  return getSectionNameByGeocode(geocode) ?? "-";
}

function syncRankScopeFromFilters(): void {
  if (state.sectionFilter !== "") {
    state.rankScope = "section";
  } else if (state.regionFilter !== "") {
    state.rankScope = "region";
  } else {
    state.rankScope = "global";
  }
}

function withSuppressedFilterChanges(fn: () => void): void {
  suppressFilterChange = true;
  try {
    fn();
  } finally {
    queueMicrotask(() => {
      suppressFilterChange = false;
    });
  }
}

function destroyFilters(): void {
  regionSelect?.destroy();
  sectionSelect?.destroy();
  regionSelect = undefined;
  sectionSelect = undefined;
}

function initFilters(): void {
  destroyFilters();

  const root = getModalRoot();
  const regionElement = root.querySelector(
    ".contestLbRegionFilter",
  ) as HTMLElement | null;
  const sectionElement = root.querySelector(
    ".contestLbSectionFilter",
  ) as HTMLElement | null;
  if (regionElement === null || sectionElement === null) return;

  regionSelect = new SlimSelect({
    select: regionElement,
    data: [
      { text: "All regions", value: "", placeholder: true },
      ...REGIONS.map((region) => ({
        text: region.name,
        value: region.code,
        filter: region.name,
      })),
    ],
    settings: {
      showSearch: true,
      placeholderText: "All regions",
      allowDeselect: true,
      contentLocation: root,
    },
    events: {
      afterChange: () => {
        if (suppressFilterChange) return;
        const regionFilter = (regionSelect?.getSelected()[0] ?? "") as
          | RegionCode
          | "";
        if (regionFilter !== "") {
          withSuppressedFilterChanges(() => {
            sectionSelect?.setSelected("");
          });
          state.sectionFilter = "";
          state.regionFilter = regionFilter;
        } else {
          state.regionFilter = "";
        }
        syncRankScopeFromFilters();
        state.page = 0;
        void requestData(true);
      },
    },
  });

  sectionSelect = new SlimSelect({
    select: sectionElement,
    data: [
      { text: "All sections", value: "", placeholder: true },
      ...SECTIONS.map((section) => ({
        text: section.name,
        value: section.geocode,
        filter: section.name,
      })),
    ],
    settings: {
      showSearch: true,
      placeholderText: "All sections",
      allowDeselect: true,
      contentLocation: root,
    },
    events: {
      afterChange: () => {
        if (suppressFilterChange) return;
        const sectionFilter = sectionSelect?.getSelected()[0] ?? "";
        if (sectionFilter !== "") {
          withSuppressedFilterChanges(() => {
            regionSelect?.setSelected("");
          });
          state.regionFilter = "";
          state.sectionFilter = sectionFilter;
        } else {
          state.sectionFilter = "";
        }
        syncRankScopeFromFilters();
        state.page = 0;
        void requestData(true);
      },
    },
  });

  withSuppressedFilterChanges(() => {
    regionSelect.setSelected(state.regionFilter);
    sectionSelect.setSelected(state.sectionFilter);
  });
}

function updateRankSortHeaders(): void {
  const root = getModalRoot();
  for (const button of root.querySelectorAll(".rankSortButton")) {
    button.classList.remove("sortAsc", "sortDesc");
  }
  const active = root.querySelector(
    `.rankSortButton[data-sort-by='${state.rankSortBy}']`,
  );
  active?.classList.add(
    state.rankSortDirection === "asc" ? "sortAsc" : "sortDesc",
  );

  const table = root.querySelector("table");
  table?.classList.remove(
    "rankScopeGlobal",
    "rankScopeRegion",
    "rankScopeSection",
  );
  table?.classList.add(`rankScope${capitalizeFirstLetter(state.rankSortBy)}`);
}

function handleRankSort(sortBy: RankSortBy): void {
  if (state.rankSortBy === sortBy) {
    state.rankSortDirection =
      state.rankSortDirection === "asc" ? "desc" : "asc";
  } else {
    state.rankSortBy = sortBy;
    state.rankSortDirection = "asc";
  }
  state.page = 0;
  updateRankSortHeaders();
  void requestData(true);
}

function goToPage(page: number): void {
  if (page < 0 || page === state.page) return;
  const totalPages = Math.ceil(state.count / state.pageSize);
  if (totalPages > 0 && page >= totalPages) return;
  state.page = page;
  void requestData(true);
}

function updateJumpButtons(): void {
  const root = getModalRoot();
  const buttons = root.querySelector(".jumpButtons");
  if (buttons === null) return;

  for (const button of buttons.querySelectorAll("button")) {
    button.classList.remove("disabled");
  }

  const totalPages = Math.ceil(state.count / state.pageSize);
  if (totalPages <= 1) {
    for (const button of buttons.querySelectorAll("button")) {
      button.classList.add("disabled");
    }
    return;
  }

  if (state.page === 0) {
    buttons
      .querySelector("button[data-action='firstPage']")
      ?.classList.add("disabled");
    buttons
      .querySelector("button[data-action='previousPage']")
      ?.classList.add("disabled");
  }

  if (state.page >= totalPages - 1) {
    buttons
      .querySelector("button[data-action='nextPage']")
      ?.classList.add("disabled");
  }
}

function buildTableRow(entry: LeaderboardEntry): HTMLElement {
  const displayName = getPublicProfileDisplayName(entry) || "Member";
  const formatted = {
    wpm: Format.typingSpeed(entry.wpm, { showDecimalPlaces: true }),
    acc: Format.percentage(entry.acc, { showDecimalPlaces: true }),
    con: Format.percentage(entry.consistency ?? 0, { showDecimalPlaces: true }),
  };
  const hasMongoId =
    typeof entry.mongoId === "string" && entry.mongoId.trim() !== "";
  const profileId = hasMongoId ? entry.mongoId : entry.uid;
  const profileQueryParam = hasMongoId ? "id" : "isUid";

  const element = document.createElement("tr");
  element.dataset["uid"] = entry.uid;
  element.innerHTML = `
    <td class="rankCol">${formatRank(entry.rank)}</td>
    <td class="rankCol">${formatRank(entry.regionRank)}</td>
    <td class="rankCol">${formatRank(entry.sectionRank)}</td>
    <td class="nameCol">
      <div class="avatarNameBadge">
        <div class="avatarPlaceholder"></div>
        <a href="${location.origin}/profile/${profileId}?${profileQueryParam}" class="entryName" uid=${entry.uid} router-link>${displayName}</a>
      </div>
    </td>
    <td class="stat narrow">
      ${formatted.wpm}
      <div class="sub">${formatted.acc}</div>
    </td>
    <td class="stat wide">${formatted.wpm}</td>
    <td class="stat wide">${formatted.acc}</td>
    <td class="stat wide">${formatted.con}</td>
    <td class="date">${format(entry.timestamp, "dd MMM yyyy")}<div class="sub">${format(entry.timestamp, "HH:mm")}</div></td>
    <td class="region">${getRegionCellHtml(entry.geocode)}</td>
    <td class="section">${getSectionCellText(entry.geocode)}</td>
  `;

  const avatarEntry = {
    ...entry,
    avatarUrl: getRegionAvatarUrl(entry.geocode),
  };
  element
    .querySelector(".avatarPlaceholder")
    ?.replaceWith(getAvatarElement(avatarEntry));

  return element;
}

function fillTable(): void {
  const root = getModalRoot();
  const tableBody = root.querySelector("table tbody");
  const table = root.querySelector("table");
  if (tableBody === null || table === null) return;

  tableBody.innerHTML = "";
  updateRankSortHeaders();

  if (state.data === null || state.data.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="99" class="empty">No data</td></tr>`;
    table.classList.remove("hidden");
    return;
  }

  for (const entry of state.data) {
    tableBody.appendChild(buildTableRow(entry));
  }

  table.classList.remove("hidden");
}

function updateContent(): void {
  const root = getModalRoot();

  root.querySelector(".loading")?.classList.toggle("hidden", !state.loading);
  root.querySelector(".updating")?.classList.toggle("hidden", !state.updating);
  root
    .querySelector(".error")
    ?.classList.toggle("hidden", state.error === undefined);

  if (state.error !== undefined) {
    const errorText = root.querySelector(".error p");
    if (errorText !== null) {
      errorText.textContent = state.error;
    }
    root.querySelector(".tableToolbar")?.classList.add("hidden");
    root.querySelector("table")?.classList.add("hidden");
    return;
  }

  if (state.loading) {
    root.querySelector(".tableToolbar")?.classList.add("hidden");
    root.querySelector("table")?.classList.add("hidden");
    return;
  }

  root.querySelector(".tableToolbar")?.classList.remove("hidden");

  const countEl = root.querySelector(".contestLeaderboardCount");
  if (countEl !== null) {
    countEl.textContent =
      state.count === 0
        ? "No results yet"
        : `${state.count} participant${state.count === 1 ? "" : "s"}`;
  }

  for (const element of root.querySelectorAll(
    ".wide.speedUnit, .narrow.speedUnit span",
  )) {
    element.textContent = Config.typingSpeedUnit;
  }

  updateJumpButtons();
  fillTable();
}

async function requestData(update = false): Promise<void> {
  if (state.contestId === undefined) return;

  if (update) {
    state.updating = true;
    state.error = undefined;
  } else {
    state.loading = true;
    state.error = undefined;
    state.data = null;
  }
  updateContent();

  const response = await Ape.contests.getLeaderboard({
    params: { contestId: state.contestId },
    query: {
      page: state.page,
      pageSize: state.pageSize,
      rankScope: state.rankScope === "global" ? undefined : state.rankScope,
      regionFilter: state.regionFilter || undefined,
      sectionFilter: state.sectionFilter || undefined,
      rankSortBy:
        state.rankSortBy === "global" && state.rankSortDirection === "asc"
          ? undefined
          : state.rankSortBy,
      rankSortDirection:
        state.rankSortBy === "global" && state.rankSortDirection === "asc"
          ? undefined
          : state.rankSortDirection,
    },
  });

  state.loading = false;
  state.updating = false;

  if (response.status === 200) {
    state.data = response.body.data.entries;
    state.count = response.body.data.count;
    state.pageSize = response.body.data.pageSize;
    state.error = undefined;
  } else {
    state.data = null;
    state.error =
      response.status === 404
        ? "Contest not found"
        : (response.body.message ?? "Failed to load leaderboard");
    Notifications.add(state.error, -1);
  }

  updateContent();
}

function resetState(contest: Contest): void {
  state.contestId = contest._id;
  state.contestTitle = contest.title;
  state.contestDate = contest.date;
  state.page = 0;
  state.count = 0;
  state.data = null;
  state.error = undefined;
  state.rankScope = "global";
  state.rankSortBy = "global";
  state.rankSortDirection = "asc";
  state.regionFilter = "";
  state.sectionFilter = "";
}

function populateHeader(): void {
  const root = getModalRoot();
  const title = root.querySelector(".contestLeaderboardTitle");
  if (title !== null) {
    title.textContent = state.contestTitle;
  }

  const date = root.querySelector(".contestLeaderboardDate");
  if (date !== null && state.contestDate !== undefined) {
    date.textContent = formatContestDate(state.contestDate);
  }
}

export async function show(contest: Contest): Promise<void> {
  resetState(contest);
  populateHeader();
  updateRankSortHeaders();
  await modal.show({
    afterAnimation: async () => {
      initFilters();
      updateContent();
      await requestData(false);
    },
  });
}

export async function hide(): Promise<void> {
  await modal.hide();
}
