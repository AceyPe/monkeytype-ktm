import { PageWithUrlParams } from "./page";
import * as Skeleton from "../utils/skeleton";
import Config from "../config";
import {
  LeaderboardEntry,
  XpLeaderboardEntry,
} from "@monkeytype/schemas/leaderboards";
import { capitalizeFirstLetter } from "../utils/strings";
import Ape from "../ape";
import * as Notifications from "../elements/notifications";
import Format from "../utils/format";
import {
  getAuthenticatedUser,
  getAvatarUrlFromStoredTokenGeocode,
  isAuthenticated,
  getPublicProfileDisplayName,
} from "../firebase";
import * as DB from "../db";
import {
  endOfDay,
  endOfWeek,
  format,
  formatDuration,
  intervalToDuration,
  startOfDay,
  startOfWeek,
  subDays,
  subHours,
  subMinutes,
} from "date-fns";
import { differenceInSeconds } from "date-fns/differenceInSeconds";
import * as DateTime from "../utils/date-and-time";
import { getHtmlByUserFlags } from "../controllers/user-flag-controller";
import { getHTMLById as getBadgeHTMLbyId } from "../controllers/badge-controller";
import { isDevEnvironment } from "../utils/misc";
import { abbreviateNumber } from "../utils/numbers";
import { formatDistanceToNow } from "date-fns/formatDistanceToNow";
import { z } from "zod";
import { LocalStorageWithSchema } from "../utils/local-storage-with-schema";
import { UTCDateMini } from "@date-fns/utc";
import * as ConfigEvent from "../observables/config-event";
import * as ActivePage from "../states/active-page";
import {
  PaginationQuery,
  FriendsOnlyQuery,
  RankScope,
  RankSortBy,
  RankSortBySchema,
  RankSortDirection,
  RankSortDirectionSchema,
} from "@monkeytype/contracts/leaderboards";
import { Language, LanguageSchema } from "@monkeytype/schemas/languages";
import { isSafeNumber } from "@monkeytype/util/numbers";
import { Mode, Mode2, ModeSchema } from "@monkeytype/schemas/shared";
import * as ServerConfiguration from "../ape/server-configuration";
import { getAvatarElement } from "../utils/discord-avatar";
import {
  getRegionNameByCode,
  getSectionNameByGeocode,
  type RegionCode,
} from "../constants/sections-by-geocode";
import {
  destroyLeaderboardFilterDropdowns,
  initLeaderboardFilterDropdowns,
  setLeaderboardFilterValues,
  type LeaderboardFilterValues,
} from "../elements/leaderboard-filter-dropdowns";

const LeaderboardTypeSchema = z.enum(["allTime", "weekly", "daily"]);
type LeaderboardType = z.infer<typeof LeaderboardTypeSchema>;
const RegionFilterSchema = z.enum([
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
]);
const utcDateFormat = "EEEE, do MMMM yyyy";
const localDateFormat = "EEEE, do MMMM yyyy HH:mm";

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

function normalizeGeocode(geocode?: string): string | null {
  if (geocode === undefined) return null;
  const normalized = geocode.trim().toUpperCase();
  return normalized === "" ? null : normalized;
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

function getActiveFilterLabel(): string {
  if (state.sectionFilter !== "") {
    return getSectionNameByGeocode(state.sectionFilter) ?? "Section";
  }
  if (state.regionFilter !== "") {
    return getRegionNameByCode(state.regionFilter) ?? "Region";
  }
  return "";
}

function userMatchesActiveFilter(
  userData: Pick<LeaderboardEntry | XpLeaderboardEntry, "geocode">,
): boolean {
  if (state.rankScope === "global") return true;
  if (state.rankScope === "region" && state.regionFilter !== "") {
    const userRegion = getRegionNumberFromGeocode(userData.geocode);
    return userRegion !== null && String(userRegion) === state.regionFilter;
  }
  if (state.rankScope === "section" && state.sectionFilter !== "") {
    return (
      normalizeGeocode(userData.geocode) ===
      normalizeGeocode(state.sectionFilter)
    );
  }
  return true;
}

function handleFilterChange(values: LeaderboardFilterValues): void {
  if (
    values.regionFilter === state.regionFilter &&
    values.sectionFilter === state.sectionFilter
  ) {
    return;
  }
  state.regionFilter = values.regionFilter;
  state.sectionFilter = values.sectionFilter;
  syncRankScopeFromFilters();
  state.page = 0;
  void requestData();
  updateTitle();
  updateContent();
  updateGetParameters();
}

function getSortRank(
  entry: Pick<
    LeaderboardEntry | XpLeaderboardEntry,
    "rank" | "regionRank" | "sectionRank"
  >,
  sortBy: RankSortBy,
): number | undefined {
  if (sortBy === "region") return entry.regionRank;
  if (sortBy === "section") return entry.sectionRank;
  return entry.rank;
}

function getScopedRank(
  entry: Pick<
    LeaderboardEntry | XpLeaderboardEntry,
    "rank" | "regionRank" | "sectionRank"
  >,
  rankScope: RankScope,
): number | undefined {
  return getSortRank(entry, rankScope);
}

function updateRankSortHeaders(): void {
  $(".page.pageLeaderboards .rankSortButton").removeClass("sortAsc sortDesc");
  $(
    `.page.pageLeaderboards .rankSortButton[data-sort-by='${state.rankSortBy}']`,
  ).addClass(state.rankSortDirection === "asc" ? "sortAsc" : "sortDesc");
}

function handleRankSortButtonClick(sortBy: RankSortBy): void {
  if (state.rankSortBy === sortBy) {
    state.rankSortDirection =
      state.rankSortDirection === "asc" ? "desc" : "asc";
  } else {
    state.rankSortBy = sortBy;
    state.rankSortDirection = "asc";
  }
  state.page = 0;
  updateRankSortHeaders();
  updateGetParameters();
  void requestData(true);
}

type LeaderboardStatsModalRow = [label: string, value: string];

function formatWeeklyXpValue(xp: number): string {
  return xp < 1000 ? xp.toString() : abbreviateNumber(xp);
}

function formatWeeklyTimeTyped(seconds: number): string {
  return DateTime.secondsToString(Math.round(seconds), true, true, ":");
}

function getTypingLeaderboardStatsModalRows(
  entry: LeaderboardEntry,
  formatted: { raw: string; con: string },
): LeaderboardStatsModalRow[] {
  const regionNumber = getRegionNumberFromGeocode(entry.geocode);
  return [
    ["raw", formatted.raw],
    ["consistency", formatted.con],
    [
      "date",
      `${format(entry.timestamp, "dd MMM yyyy")} ${format(
        entry.timestamp,
        "HH:mm",
      )}`,
    ],
    ["region", regionNumber === null ? "-" : String(regionNumber)],
    ["section", getSectionCellText(entry.geocode)],
    ["global rank", formatRankText(entry.rank)],
    ["region rank", formatRankText(entry.regionRank)],
    ["section rank", formatRankText(entry.sectionRank)],
  ];
}

function getWeeklyLeaderboardStatsModalRows(
  entry: XpLeaderboardEntry,
): LeaderboardStatsModalRow[] {
  const regionNumber = getRegionNumberFromGeocode(entry.geocode);
  return [
    ["xp gained", formatWeeklyXpValue(entry.totalXp)],
    ["time typed", formatWeeklyTimeTyped(entry.timeTypedSeconds)],
    [
      "last activity",
      `${format(entry.lastActivityTimestamp, "dd MMM yyyy")} ${format(
        entry.lastActivityTimestamp,
        "HH:mm",
      )}`,
    ],
    ["region", regionNumber === null ? "-" : String(regionNumber)],
    ["section", getSectionCellText(entry.geocode)],
    ["global rank", formatRankText(entry.rank)],
    ["region rank", formatRankText(entry.regionRank)],
    ["section rank", formatRankText(entry.sectionRank)],
  ];
}

function encodeLeaderboardStatsModalPayload(
  rows: LeaderboardStatsModalRow[],
): string {
  return encodeURIComponent(JSON.stringify({ rows }));
}

function renderLeaderboardEntryStatsModal(
  rows: LeaderboardStatsModalRow[],
): void {
  const body = $("#leaderboardEntryStatsModalBody");
  body.empty();
  for (const [label, value] of rows) {
    const row = $("<div>", { class: "lbStatsModalRow" });
    row.append($("<span>", { class: "label" }).text(label));
    row.append($("<span>", { class: "value" }).text(value));
    body.append(row);
  }
}

function setupLeaderboardEntryStatsModal(): void {
  const dlg = document.getElementById(
    "leaderboardEntryStatsModal",
  ) as HTMLDialogElement | null;
  if (dlg === null || dlg.dataset["lbStatsBound"] === "true") return;
  dlg.dataset["lbStatsBound"] = "true";
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) {
      closeLeaderboardEntryStatsModal();
    }
  });
  dlg.addEventListener("close", () => {
    dlg.classList.add("hidden");
  });
  $("#leaderboardEntryStatsModalClose").on("click", () => {
    closeLeaderboardEntryStatsModal();
  });
}

function openLeaderboardEntryStatsModal(encoded: string): void {
  setupLeaderboardEntryStatsModal();
  let rows: LeaderboardStatsModalRow[];
  try {
    const parsed = JSON.parse(decodeURIComponent(encoded)) as {
      rows: LeaderboardStatsModalRow[];
    };
    rows = parsed.rows;
    if (!Array.isArray(rows)) return;
  } catch {
    return;
  }
  renderLeaderboardEntryStatsModal(rows);
  const dlg = document.getElementById(
    "leaderboardEntryStatsModal",
  ) as HTMLDialogElement | null;
  if (dlg === null) return;
  dlg.classList.remove("hidden");
  dlg.showModal();
}

function closeLeaderboardEntryStatsModal(): void {
  const dlg = document.getElementById(
    "leaderboardEntryStatsModal",
  ) as HTMLDialogElement | null;
  if (dlg === null) return;
  dlg.close();
}

type AllTimeState = {
  type: "allTime";
  mode: "time";
  mode2: "15" | "60";
  language: "english";
  data: LeaderboardEntry[] | null;
  count: number;
  userData: LeaderboardEntry | null;
};

type WeeklyState = {
  type: "weekly";
  lastWeek: boolean;
  data: XpLeaderboardEntry[] | null;
  count: number;
  userData: XpLeaderboardEntry | null;
};

type DailyState = {
  type: "daily";
  mode: Mode;
  mode2: Mode2<DailyState["mode"]>;
  yesterday: boolean;
  minWpm: number;
  language: Language;
  data: LeaderboardEntry[] | null;
  count: number;
  userData: LeaderboardEntry | null;
};

type State = {
  type: LeaderboardType;
  loading: boolean;
  updating: boolean;
  page: number;
  pageSize: number;
  friendsOnly: boolean;
  rankScope: RankScope;
  rankSortBy: RankSortBy;
  rankSortDirection: RankSortDirection;
  regionFilter: RegionCode | "";
  sectionFilter: string;
  title: string;
  error?: string;
  scrollToUserAfterFill: boolean;
  goToUserPage: boolean;
} & (AllTimeState | WeeklyState | DailyState);

const state = {
  loading: true,
  updating: false,
  type: "allTime",
  mode: "time",
  mode2: "15",
  data: null,
  userData: null,
  page: 0,
  pageSize: 50,
  friendsOnly: false,
  rankScope: "global",
  rankSortBy: "global",
  rankSortDirection: "asc",
  regionFilter: "",
  sectionFilter: "",
  title: "All-time English Time 15 Leaderboard",
  scrollToUserAfterFill: false,
  goToUserPage: false,
} as State;

const SelectorSchema = z.object({
  type: LeaderboardTypeSchema,
  mode: ModeSchema.optional(),
  mode2: z.string().optional(),
  language: LanguageSchema.optional(),
  yesterday: z.boolean().optional(),
  lastWeek: z.boolean().optional(),
  friendsOnly: z.boolean().optional(),
  regionFilter: RegionFilterSchema.optional(),
  sectionFilter: z.string().optional(),
  rankSortBy: RankSortBySchema.optional(),
  rankSortDirection: RankSortDirectionSchema.optional(),
});
const UrlParameterSchema = SelectorSchema.extend({
  page: z.number(),
  goToUserPage: z.boolean(),
}).partial();
type UrlParameter = z.infer<typeof UrlParameterSchema>;

const selectorLS = new LocalStorageWithSchema({
  key: "leaderboardSelector",
  schema: SelectorSchema,
  fallback: { type: "allTime", mode2: "15" },
});

type LanguagesByModeByMode2 = Partial<
  Record<Mode, Record<string /*mode2*/, Language[]>>
>;

type ValidLeaderboards = {
  allTime: LanguagesByModeByMode2;
  daily: LanguagesByModeByMode2;
};

const validLeaderboards: ValidLeaderboards = {
  allTime: {
    time: {
      "15": ["english"],
      "60": ["english"],
    },
  },
  daily: {},
};

function updateTitle(): void {
  const type =
    state.type === "allTime"
      ? "All-time"
      : state.type === "weekly"
        ? "Weekly XP"
        : "Daily";

  const friend = state.friendsOnly ? "Friends " : "";
  const filterLabel = getActiveFilterLabel();
  const rankScopeLabel = filterLabel === "" ? "" : `${filterLabel} `;

  const language =
    state.type !== "weekly" ? capitalizeFirstLetter(state.language) : "";

  const mode =
    state.type !== "weekly"
      ? ` ${capitalizeFirstLetter(state.mode)} ${state.mode2}`
      : "";

  state.title = `${rankScopeLabel}${type} ${language} ${mode} ${friend}Leaderboard`;
  $(".page.pageLeaderboards .bigtitle >.text").text(state.title);

  $(".page.pageLeaderboards .bigtitle .subtext").addClass("hidden");
  $(".page.pageLeaderboards .bigtitle button").addClass("hidden");
  $(".page.pageLeaderboards .bigtitle .subtext .divider").addClass("hidden");

  if (state.type === "daily") {
    $(".page.pageLeaderboards .bigtitle .subtext").removeClass("hidden");
    $(
      ".page.pageLeaderboards .bigtitle button[data-action='toggleYesterday']",
    ).removeClass("hidden");
    $(".page.pageLeaderboards .bigtitle .subtext .divider").removeClass(
      "hidden",
    );

    if (state.yesterday) {
      $(
        ".page.pageLeaderboards .bigtitle button[data-action='toggleYesterday']",
      ).html(`
        <i class="fas fa-forward"></i>
            show today
        `);
    } else {
      $(
        ".page.pageLeaderboards .bigtitle button[data-action='toggleYesterday']",
      ).html(`
        <i class="fas fa-backward"></i>
            show yesterday
        `);
    }

    let timestamp = startOfDay(new UTCDateMini());
    if (state.yesterday) {
      timestamp = subHours(timestamp, 24);
    }

    updateTimeText(
      format(timestamp, utcDateFormat) + " UTC",
      utcToLocalDate(timestamp),
      utcToLocalDate(endOfDay(timestamp)),
    );
  } else if (state.type === "weekly") {
    $(".page.pageLeaderboards .bigtitle .subtext").removeClass("hidden");
    $(
      ".page.pageLeaderboards .bigtitle button[data-action='toggleLastWeek']",
    ).removeClass("hidden");
    $(".page.pageLeaderboards .bigtitle .subtext .divider").removeClass(
      "hidden",
    );

    if (state.lastWeek) {
      $(".page.pageLeaderboards .bigtitle button[data-action='toggleLastWeek']")
        .html(`
        <i class="fas fa-forward"></i>
            show this week
        `);
    } else {
      $(".page.pageLeaderboards .bigtitle button[data-action='toggleLastWeek']")
        .html(`
        <i class="fas fa-backward"></i>
            show last week
        `);
    }

    let timestamp = startOfWeek(new UTCDateMini(), { weekStartsOn: 1 });
    if (state.lastWeek) {
      timestamp = subDays(timestamp, 7);
    }
    const endingTimestamp = endOfWeek(timestamp, { weekStartsOn: 1 });

    const dateString = `${format(timestamp, utcDateFormat)} - ${format(
      endingTimestamp,
      utcDateFormat,
    )} UTC`;
    updateTimeText(
      dateString,
      utcToLocalDate(timestamp),
      utcToLocalDate(endingTimestamp),
    );
  }
}

async function requestData(update = false): Promise<void> {
  if (update) {
    state.updating = true;
    state.error = undefined;
  } else {
    state.loading = true;
    state.error = undefined;
    state.data = null;
    state.userData = null;
  }
  updateContent();

  const defineRequests = <TQuery, TRank, TData>(
    data: (args: {
      query: TQuery &
        PaginationQuery &
        FriendsOnlyQuery & {
          rankScope?: RankScope;
          regionFilter?: string;
          sectionFilter?: string;
          rankSortBy?: RankSortBy;
          rankSortDirection?: RankSortDirection;
        };
    }) => Promise<TData>,
    rank: (args: { query: TQuery }) => Promise<TRank>,
    baseQuery: TQuery,
  ): {
    rank: undefined | (() => Promise<TRank>);
    data: () => Promise<TData>;
  } => ({
    rank: async () =>
      rank({
        query: {
          ...baseQuery,
          friendsOnly: state.friendsOnly || undefined,
        },
      }),
    data: async () =>
      data({
        query: {
          ...baseQuery,
          page: state.page,
          pageSize: state.pageSize,
          friendsOnly: state.friendsOnly || undefined,
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
      }),
  });

  let requests;
  if (state.type === "allTime") {
    requests = defineRequests(Ape.leaderboards.get, Ape.leaderboards.getRank, {
      language: "english",
      mode: "time",
      mode2: state.mode2,
    });
  } else if (state.type === "daily") {
    requests = defineRequests(
      Ape.leaderboards.getDaily,
      Ape.leaderboards.getDailyRank,
      {
        language: state.language,
        mode: state.mode,
        mode2: state.mode2,
        daysBefore: state.yesterday ? 1 : undefined,
      },
    );
  } else if (state.type === "weekly") {
    requests = defineRequests(
      Ape.leaderboards.getWeeklyXp,
      Ape.leaderboards.getWeeklyXpRank,
      {
        weeksBefore: state.lastWeek ? 1 : undefined,
      },
    );
  } else {
    throw new Error("unknown state type");
  }

  if (!isAuthenticated() || state.userData !== null) {
    requests.rank = undefined;
  }

  if (state.goToUserPage && requests.rank !== undefined) {
    state.goToUserPage = false;
    const rankResponse = await requests.rank();
    if (
      rankResponse !== undefined &&
      rankResponse.status === 200 &&
      rankResponse.body.data !== null
    ) {
      state.userData = rankResponse.body.data;
      const scopedRank = getSortRank(state.userData, state.rankSortBy);
      if (scopedRank !== undefined) {
        state.page = Math.floor((scopedRank - 1) / state.pageSize);
      }
      updateGetParameters();
    }
    requests.rank = undefined;
  }

  const [dataResponse, rankResponse] = await Promise.all([
    requests.data(),
    requests.rank?.(),
  ]);

  if (dataResponse.status === 200) {
    state.data = dataResponse.body.data.entries;
    state.count = dataResponse.body.data.count;
    state.pageSize = dataResponse.body.data.pageSize;

    if (state.type === "daily") {
      //@ts-expect-error not sure why this is causing errors when it's clearly defined in the schema
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      state.minWpm = dataResponse.body.data.minWpm;
    }
  } else {
    state.data = null;

    if (dataResponse.status === 404) {
      state.error = "No leaderboard found";
    } else {
      state.error = "Something went wrong";
      Notifications.add(
        "Failed to get leaderboard: " + dataResponse.body.message,
        -1,
      );
    }
  }

  if (state.userData === null && rankResponse !== undefined) {
    if (rankResponse.status === 200) {
      if (rankResponse.body.data !== null) {
        state.userData = rankResponse.body.data;
      }
    } else {
      state.userData = null;
      state.error = "Something went wrong";
      Notifications.add("Failed to get rank: " + rankResponse.body.message, -1);
    }
  }

  state.loading = false;
  state.updating = false;
  updateContent();
  if (!update && isAuthenticated()) {
    fillUser();
  }
  return;
}

function updateJumpButtons(): void {
  const el = $(".page.pageLeaderboards .titleAndButtons .jumpButtons");
  el.find("button").removeClass("active");

  const totalPages = Math.ceil(state.count / state.pageSize);

  if (totalPages <= 1) {
    el.find("button").addClass("disabled");
  } else {
    el.find("button").removeClass("disabled");
  }

  if (state.page === 0) {
    el.find("button[data-action='previousPage']").addClass("disabled");
    el.find("button[data-action='firstPage']").addClass("disabled");
  } else {
    el.find("button[data-action='previousPage']").removeClass("disabled");
    el.find("button[data-action='firstPage']").removeClass("disabled");
  }

  if (isAuthenticated()) {
    const userButton = el.find("button[data-action='userPage']");
    if (!state.userData) {
      userButton.addClass("disabled");
    } else {
      const scopedRank = getSortRank(state.userData, state.rankSortBy);
      if (scopedRank === undefined) {
        userButton.addClass("disabled");
      } else {
        const userPage = Math.floor((scopedRank - 1) / state.pageSize);
        if (state.page === userPage) {
          userButton.addClass("disabled");
        } else {
          userButton.removeClass("disabled");
        }
      }
    }
  }

  if (state.page >= totalPages - 1) {
    el.find("button[data-action='nextPage']").addClass("disabled");
  } else {
    el.find("button[data-action='nextPage']").removeClass("disabled");
  }
}

function buildTableRow(entry: LeaderboardEntry, me = false): HTMLElement {
  const displayName = getPublicProfileDisplayName(entry) || "Member";
  const regionCellHtml = getRegionCellHtml(entry.geocode);
  const sectionCellText = getSectionCellText(entry.geocode);
  const formatted = {
    wpm: Format.typingSpeed(entry.wpm, { showDecimalPlaces: true }),
    acc: Format.percentage(entry.acc, { showDecimalPlaces: true }),
    raw: Format.typingSpeed(entry.raw, { showDecimalPlaces: true }),
    con: Format.percentage(entry.consistency, { showDecimalPlaces: true }),
  };
  const statsPayload = encodeLeaderboardStatsModalPayload(
    getTypingLeaderboardStatsModalRows(entry, formatted),
  );

  const element = document.createElement("tr");
  if (me) {
    element.classList.add("me");
  }
  element.dataset["uid"] = entry.uid;
  const hasMongoId =
    typeof entry.mongoId === "string" && entry.mongoId.trim() !== "";
  const profileId = hasMongoId ? entry.mongoId : entry.uid;
  const profileQueryParam = hasMongoId ? "id" : "isUid";
  element.innerHTML = `
      <td>${formatRank(entry.friendsRank)}</td>
      <td>${formatRank(entry.rank)}</td>
      <td class="rankCol">${formatRank(entry.regionRank)}</td>
      <td class="rankCol">${formatRank(entry.sectionRank)}</td>
      <td class="nameCol">
        <div class="avatarNameBadge">
          <div class="avatarPlaceholder"></div>
          <a href="${location.origin}/profile/${profileId}?${profileQueryParam}" class="entryName" uid=${entry.uid} router-link>${displayName}</a>
          <div class="flagsAndBadge">
            ${getHtmlByUserFlags({
              ...entry,
              isFriend: DB.isFriend(entry.uid),
            })}
            ${
              isSafeNumber(entry.badgeId) ? getBadgeHTMLbyId(entry.badgeId) : ""
            }
          </div>
        </div>
      </td>
      <td class="stat narrow">
      ${formatted.wpm}
        <div class="sub">${formatted.acc}</div>
      </td>
      <td class="stat wide">${formatted.wpm}</td>
      <td class="stat wide">${formatted.acc}</td>
      <td class="stat wide">${formatted.con}</td>
      <td class="date">${format(
        entry.timestamp,
        "dd MMM yyyy",
      )}<div class="sub">${format(entry.timestamp, "HH:mm")}</div></td>
      <td class="region">${regionCellHtml}</td>
      <td class="section">${sectionCellText}</td>
      <td class="mobileLbStats">
        <button
          type="button"
          class="textButton viewLbStatsButton"
          data-action="viewLbStats"
          aria-haspopup="dialog"
          data-lb-stats="${statsPayload}"
        >
          view stats
        </button>
      </td>

  `;

  const avatarEntry = {
    ...entry,
    avatarUrl:
      getRegionAvatarUrl(entry.geocode) ??
      (me ? (getAvatarUrlFromStoredTokenGeocode() ?? undefined) : undefined),
  };
  element
    .querySelector(".avatarPlaceholder")
    ?.replaceWith(getAvatarElement(avatarEntry));
  return element;
}

function buildWeeklyTableRow(
  entry: XpLeaderboardEntry,
  me = false,
): HTMLElement {
  const displayName = getPublicProfileDisplayName(entry) || "Member";
  const activeDiff = formatDistanceToNow(entry.lastActivityTimestamp, {
    addSuffix: true,
  });
  const regionCellHtml = getRegionCellHtml(entry.geocode);
  const sectionCellText = getSectionCellText(entry.geocode);
  const formattedXp = formatWeeklyXpValue(entry.totalXp);
  const formattedTime = formatWeeklyTimeTyped(entry.timeTypedSeconds);
  const statsPayload = encodeLeaderboardStatsModalPayload(
    getWeeklyLeaderboardStatsModalRows(entry),
  );
  const element = document.createElement("tr");
  if (me) {
    element.classList.add("me");
  }
  element.dataset["uid"] = entry.uid;
  const hasMongoId =
    typeof entry.mongoId === "string" && entry.mongoId.trim() !== "";
  const profileId = hasMongoId ? entry.mongoId : entry.uid;
  const profileQueryParam = hasMongoId ? "id" : "isUid";
  element.innerHTML = `
      <td>${formatRank(entry.friendsRank)}</td>
      <td>${formatRank(entry.rank)}</td>
      <td class="rankCol">${formatRank(entry.regionRank)}</td>
      <td class="rankCol">${formatRank(entry.sectionRank)}</td>
      <td class="nameCol">
        <div class="avatarNameBadge">
          <div class="avatarPlaceholder"></div>
          <a href="${location.origin}/profile/${profileId}?${profileQueryParam}" class="entryName" uid=${entry.uid} router-link>${displayName}</a>
          <div class="flagsAndBadge">
            ${getHtmlByUserFlags({
              ...entry,
              isFriend: DB.isFriend(entry.uid),
            })}
            ${
              isSafeNumber(entry.badgeId) ? getBadgeHTMLbyId(entry.badgeId) : ""
            }
          </div>
        </div>
      </td>
      <td class="stat narrow">
      ${formattedXp}
        <div class="sub">${formattedTime}</div>
      </td>
      <td class="stat wide">${formattedXp}</td>
      <td class="stat wide">${formattedTime}</td>
      <td class="date" data-balloon-pos="left" aria-label="${activeDiff}">
        ${format(entry.lastActivityTimestamp, "dd MMM yyyy")}
        <div class="sub">
          ${format(entry.lastActivityTimestamp, "HH:mm")}
        </div>
      </td>
      <td class="region">${regionCellHtml}</td>
      <td class="section">${sectionCellText}</td>
      <td class="mobileLbStats">
        <button
          type="button"
          class="textButton viewLbStatsButton"
          data-action="viewLbStats"
          aria-haspopup="dialog"
          data-lb-stats="${statsPayload}"
        >
          view stats
        </button>
      </td>

  `;
  const avatarEntry = {
    ...entry,
    avatarUrl:
      getRegionAvatarUrl(entry.geocode) ??
      (me ? (getAvatarUrlFromStoredTokenGeocode() ?? undefined) : undefined),
  };
  element
    .querySelector(".avatarPlaceholder")
    ?.replaceWith(getAvatarElement(avatarEntry));
  return element;
}

function fillTable(): void {
  const table = $(".page.pageLeaderboards table tbody");
  const tableElement = $(".page.pageLeaderboards table");
  table.empty();

  if (state.friendsOnly) {
    table.parent().addClass("friendsOnly");
  } else {
    table.parent().removeClass("friendsOnly");
  }

  tableElement.removeClass("rankScopeGlobal rankScopeRegion rankScopeSection");
  tableElement.addClass(`rankScope${capitalizeFirstLetter(state.rankSortBy)}`);
  updateRankSortHeaders();

  $(".page.pageLeaderboards table thead").addClass("hidden");
  if (state.type === "allTime" || state.type === "daily") {
    tableElement.addClass("mobileStatsInModal");
    tableElement.removeClass("weeklyMobileStatsInModal");
    $(".page.pageLeaderboards table thead.allTimeAndDaily").removeClass(
      "hidden",
    );
  } else if (state.type === "weekly") {
    tableElement.addClass("mobileStatsInModal weeklyMobileStatsInModal");
    $(".page.pageLeaderboards table thead.weekly").removeClass("hidden");
  }

  if (state.data === null || state.data.length === 0) {
    table.append(`<tr><td colspan="99" class="empty">No data</td></tr>`);
    $(".page.pageLeaderboards table").removeClass("hidden");
    return;
  }

  if (state.type === "allTime" || state.type === "daily") {
    for (const entry of state.data) {
      const me = getAuthenticatedUser()?.uid === entry.uid;
      table.append(buildTableRow(entry, me));
    }
  } else if (state.type === "weekly") {
    for (const entry of state.data) {
      const me = getAuthenticatedUser()?.uid === entry.uid;
      table.append(buildWeeklyTableRow(entry, me));
    }
  }

  $(".page.pageLeaderboards table").removeClass("hidden");
}

function getLbMemoryDifference(): number | null {
  if (state.type !== "allTime") return null;
  if (state.userData === null) return null;

  const memory =
    DB.getSnapshot()?.lbMemory?.["time"]?.[state.mode2]?.["english"] ?? 0;

  const rank = state.userData.rank;
  const diff = memory - rank;

  if (diff !== 0) {
    void DB.updateLbMemory("time", state.mode2, "english", rank, true);
  }

  return diff;
}

function fillUser(): void {
  if (isAuthenticated() && DB.getSnapshot()?.lbOptOut === true) {
    $(".page.pageLeaderboards .bigUser").html(
      '<div class="warning">You have opted out of the leaderboards.</div>',
    );
    return;
  }

  if (isAuthenticated() && DB.getSnapshot()?.banned === true) {
    $(".page.pageLeaderboards .bigUser").html(
      '<div class="warning">Your account is banned</div>',
    );
    return;
  }

  const minTimeTyping =
    ServerConfiguration.get()?.leaderboards.minTimeTyping ?? 7200;

  if (
    isAuthenticated() &&
    !isDevEnvironment() &&
    (DB.getSnapshot()?.typingStats?.timeTyping ?? 0) < minTimeTyping
  ) {
    $(".page.pageLeaderboards .bigUser").html(
      `<div class="warning">Your account must have ${formatDuration(
        intervalToDuration({ start: 0, end: minTimeTyping * 1000 }),
      )} typed to be placed on the leaderboard.</div>`,
    );
    return;
  }

  if (isAuthenticated() && state.type === "daily" && state.userData === null) {
    let str = `Not qualified`;

    if (!state.yesterday) {
      str += ` (min speed required: ${Format.typingSpeed(state.minWpm, {
        showDecimalPlaces: true,
        suffix: ` ${Config.typingSpeedUnit}`,
      })})`;
    }

    $(".page.pageLeaderboards .bigUser").html(
      `<div class="warning">${str}</div>`,
    );
    return;
  }

  if (isAuthenticated() && state.userData === null) {
    $(".page.pageLeaderboards .bigUser").html(
      `<div class="warning">Not qualified</div>`,
    );
    return;
  }

  if (
    isAuthenticated() &&
    !state.friendsOnly &&
    state.rankScope !== "global" &&
    state.userData !== null &&
    (!userMatchesActiveFilter(state.userData) ||
      getScopedRank(state.userData, state.rankScope) === undefined)
  ) {
    $(".page.pageLeaderboards .bigUser").html(
      `<div class="warning">Not ranked in the selected ${state.rankScope}</div>`,
    );
    return;
  }

  if (state.data === null) {
    return;
  }

  if (state.type === "allTime" || state.type === "daily") {
    if (!state.userData || !state.count) {
      $(".page.pageLeaderboards .bigUser").addClass("hidden");
      $(".page.pageLeaderboards .tableAndUser > .divider").removeClass(
        "hidden",
      );
      return;
    }

    const userData = state.userData;
    const rank = state.friendsOnly
      ? (userData.friendsRank as number)
      : (getSortRank(userData, state.rankSortBy) as number);
    const percentile = (rank / state.count) * 100;

    let percentileString = `Top ${percentile.toFixed(2)}%`;
    if (rank === 1) {
      percentileString = "GOAT";
    }

    const diff = getLbMemoryDifference();
    let diffText;

    if (diff === null) {
      diffText = "";
    } else if (diff === 0) {
      diffText = ` ( = since you last checked)`;
    } else if (diff > 0) {
      diffText = ` (<i class="fas fa-fw fa-angle-up"></i>${Math.abs(
        diff,
      )} since you last checked
      )`;
    } else {
      diffText = ` (<i class="fas fa-fw fa-angle-down"></i>${Math.abs(
        diff,
      )} since you last checked
        )`;
    }

    const formatted = {
      wpm: Format.typingSpeed(userData.wpm, { showDecimalPlaces: true }),
      acc: Format.percentage(userData.acc, { showDecimalPlaces: true }),
      con: Format.percentage(userData.consistency, { showDecimalPlaces: true }),
    };

    const html = `
          <div class="rank">${formatRank(rank)}</div>
        <div class="stat">
          <div class="title">region rank</div>
          <div class="value">${formatRank(userData.regionRank)}</div>
        </div>
        <div class="stat ">
          <div class="title">section rank</div>
          <div class="value">${formatRank(userData.sectionRank)}</div>
        </div>
        <div class="userInfo">
          <div class="top">You (${percentileString})</div>
          <div class="bottom">${diffText}</div>
        </div>
        <div class="stat wide">
          <div class="title">${Config.typingSpeedUnit}</div>
          <div class="value">${formatted.wpm}</div>
        </div>
        <div class="stat wide">
          <div class="title">accuracy</div>
          <div class="value">${formatted.acc}</div>
        </div>
        <div class="stat wide">
          <div class="title">consistency</div>
          <div class="value">${formatted.con}</div>
        </div>
        <div class="stat wide">
          <div class="title">date</div>
          <div class="value">${format(
            userData.timestamp,
            "dd MMM yyyy HH:mm",
          )}</div>
        </div>
        <div class="stat wide">
          <div class="title">region</div>
          <div class="value">${getRegionNumberFromGeocode(userData.geocode) ?? "-"}</div>
        </div>
        <div class="stat wide">
          <div class="title">section</div>
          <div class="value">${getSectionCellText(userData.geocode)}</div>
        </div>
        <div class="stat narrow">
          <div>${formatted.wpm}</div>
          <div class="sub">${formatted.acc}</div>
        </div>

        <div class="stat narrow">
          <div>${format(userData.timestamp, "dd MMM yyyy")}</div>
          <div class="sub">${format(userData.timestamp, "HH:mm")}</div>
        </div>
        `;

    $(".page.pageLeaderboards .bigUser").html(html);
  } else if (state.type === "weekly") {
    if (!state.userData || !state.count) {
      $(".page.pageLeaderboards .bigUser").addClass("hidden");
      return;
    }

    const userData = state.userData;
    const rank = state.friendsOnly
      ? (userData.friendsRank as number)
      : (getSortRank(userData, state.rankSortBy) as number);
    const percentile = (rank / state.count) * 100;

    let percentileString = `Top ${percentile.toFixed(2)}%`;
    if (rank === 1) {
      percentileString = "GOAT";
    }

    const diff = getLbMemoryDifference();
    let diffText;

    if (diff === null) {
      diffText = "";
    } else if (diff === 0) {
      diffText = ` ( = since you last checked)`;
    } else if (diff > 0) {
      diffText = ` (<i class="fas fa-fw fa-angle-up"></i>${Math.abs(
        diff,
      )} since you last checked
      )`;
    } else {
      diffText = ` (<i class="fas fa-fw fa-angle-down"></i>${Math.abs(
        diff,
      )} since you last checked
        )`;
    }

    const formatted = {
      xp:
        userData.totalXp < 1000
          ? userData.totalXp
          : abbreviateNumber(userData.totalXp),
      time: DateTime.secondsToString(
        Math.round(userData.timeTypedSeconds),
        true,
        true,
        ":",
      ),
    };

    const html = `
          <div class="rank">${formatRank(rank)}</div>
        <div class="stat ">
          <div class="title">region rank</div>
          <div class="value">${formatRank(userData.regionRank)}</div>
        </div>
        <div class="stat ">
          <div class="title">section rank</div>
          <div class="value">${formatRank(userData.sectionRank)}</div>
        </div>
        <div class="userInfo">
          <div class="top">You (${percentileString})</div>
          <div class="bottom">${diffText}</div>
        </div>
        <div class="stat wide">
          <div class="title">xp gained</div>
          <div class="value">${formatted.xp}</div>
        </div>
        <div class="stat wide">
          <div class="title">time typed</div>
          <div class="value">${formatted.time}</div>
        </div>
        <div class="stat wide">
          <div class="title">last activity</div>
          <div class="value">${format(
            userData.lastActivityTimestamp,
            "dd MMM yyyy HH:mm",
          )}</div>
        </div>
        <div class="stat wide">
          <div class="title">region</div>
          <div class="value">${getRegionNumberFromGeocode(userData.geocode) ?? "-"}</div>
        </div>
        <div class="stat wide">
          <div class="title">section</div>
          <div class="value">${getSectionCellText(userData.geocode)}</div>
        </div>
        <div class="stat narrow">
          <div>${formatted.xp}</div>
          <div class="sub">${formatted.time}</div>
        </div>
        <div class="stat narrow">
          <div>${format(userData.lastActivityTimestamp, "dd MMM yyyy")}</div>
          <div class="sub">${format(
            userData.lastActivityTimestamp,
            "HH:mm",
          )}</div>
        </div>
        `;

    $(".page.pageLeaderboards .bigUser").html(html);
  }
  $(".page.pageLeaderboards .bigUser").removeClass("hidden");
  $(".page.pageLeaderboards .tableAndUser > .divider").addClass("hidden");
}

function updateContent(): void {
  $(".page.pageLeaderboards .loading").addClass("hidden");
  $(".page.pageLeaderboards .updating").addClass("invisible");
  $(".page.pageLeaderboards .error").addClass("hidden");

  if (state.error !== undefined) {
    $(".page.pageLeaderboards .error").removeClass("hidden");
    $(".page.pageLeaderboards .error p").text(state.error);
    $(".page.pageLeaderboards .tableToolbar").addClass("hidden");
    enableButtons();
    return;
  }

  if (state.updating) {
    disableButtons();
    $(".page.pageLeaderboards .updating").removeClass("invisible");
    return;
  } else if (state.loading) {
    disableButtons();
    $(".page.pageLeaderboards .bigUser").addClass("hidden");
    $(".page.pageLeaderboards .titleAndButtons").addClass("hidden");
    $(".page.pageLeaderboards .tableToolbar").addClass("hidden");
    $(".page.pageLeaderboards .loading").removeClass("hidden");
    $(".page.pageLeaderboards table").addClass("hidden");
    return;
  } else {
    enableButtons();
  }

  if (isAuthenticated()) {
    $(".page.pageLeaderboards .needAuth").removeClass("hidden");
  } else {
    $(".page.pageLeaderboards .needAuth").addClass("hidden");
  }

  if (state.data === null) {
    Notifications.add("Data is null");
    return;
  }

  $(".page.pageLeaderboards .titleAndButtons").removeClass("hidden");
  $(".page.pageLeaderboards .tableToolbar").removeClass("hidden");
  updateJumpButtons();
  updateTimerVisibility();
  fillTable();

  for (const element of document.querySelectorAll(
    ".page.pageLeaderboards .wide.speedUnit, .page.pageLeaderboards .narrow.speedUnit span",
  )) {
    element.innerHTML = Config.typingSpeedUnit;
  }

  if (state.scrollToUserAfterFill) {
    document.querySelector(".tableAndUser .me")?.scrollIntoView({
      block: "center",
    });
    state.scrollToUserAfterFill = false;
  }
}

function updateSideButtons(): void {
  updateTypeButtons();
  updateFriendsButtons();
  updateModeButtons();
  updateLanguageButtons();
}

function updateTypeButtons(): void {
  const el = $(".page.pageLeaderboards .buttonGroup.typeButtons");
  el.find("button").removeClass("active");
  el.find(`button[data-type=${state.type}]`).addClass("active");
}

function updateFriendsButtons(): void {
  const friendsOnlyGroup = $(
    ".page.pageLeaderboards .buttonGroup.friendsOnlyButtons",
  );
  if (
    isAuthenticated() &&
    (ServerConfiguration.get()?.connections.enabled ?? false)
  ) {
    friendsOnlyGroup.removeClass("hidden");
  } else {
    friendsOnlyGroup.addClass("hidden");
    state.friendsOnly = false;
    return;
  }

  const everyoneButton = $(
    ".page.pageLeaderboards .buttonGroup.friendsOnlyButtons .everyone",
  );
  const friendsOnlyButton = $(
    ".page.pageLeaderboards .buttonGroup.friendsOnlyButtons .friendsOnly",
  );
  if (state.friendsOnly) {
    friendsOnlyButton.addClass("active");
    everyoneButton.removeClass("active");
  } else {
    friendsOnlyButton.removeClass("active");
    everyoneButton.addClass("active");
  }
}

function updateModeButtons(): void {
  if (state.type !== "allTime" && state.type !== "daily") {
    $(".page.pageLeaderboards .buttonGroup.modeButtons").addClass("hidden");
    return;
  }
  $(".page.pageLeaderboards .buttonGroup.modeButtons").removeClass("hidden");

  const el = $(".page.pageLeaderboards .buttonGroup.modeButtons");
  el.find("button").removeClass("active");
  el.find(
    `button[data-mode=${state.mode}][data-mode2=${state.mode2}]`,
  ).addClass("active");

  //hide all mode buttons
  $(`.page.pageLeaderboards .buttonGroup.modeButtons button`).addClass(
    "hidden",
  );

  //show all valid ones
  for (const mode of Object.keys(validLeaderboards[state.type]) as Mode[]) {
    for (const mode2 of Object.keys(
      // oxlint-disable-next-line no-non-null-assertion
      validLeaderboards[state.type][mode]!,
    )) {
      $(
        `.page.pageLeaderboards .buttonGroup.modeButtons button[data-mode="${mode}"][data-mode2="${mode2}"]`,
      ).removeClass("hidden");
    }
  }
}

function updateLanguageButtons(): void {
  if (state.type !== "daily") {
    $(".page.pageLeaderboards .buttonGroup.languageButtons").addClass("hidden");
    return;
  }
  $(".page.pageLeaderboards .buttonGroup.languageButtons").removeClass(
    "hidden",
  );

  const el = $(".page.pageLeaderboards .buttonGroup.languageButtons");
  el.find("button").removeClass("active");
  el.find(`button[data-language=${state.language}]`).addClass("active");

  //hide all languages
  $(`.page.pageLeaderboards .buttonGroup.languageButtons button`).addClass(
    "hidden",
  );

  //show all valid ones
  for (const lang of validLeaderboards[state.type][state.mode]?.[state.mode2] ??
    []) {
    $(
      `.page.pageLeaderboards .buttonGroup.languageButtons button[data-language="${lang}"]`,
    ).removeClass("hidden");
  }
}

let updateTimer: number | undefined;

function updateTimerElement(): void {
  if (state.type === "daily") {
    const diff = differenceInSeconds(new Date(), endOfDay(new UTCDateMini()));

    $(".page.pageLeaderboards .titleAndButtons .timer").text(
      "Next reset in: " + DateTime.secondsToString(diff, true),
    );
  } else if (state.type === "allTime") {
    const date = new Date();
    const minutesToNextUpdate = 14 - (date.getMinutes() % 15);
    const secondsToNextUpdate = 60 - date.getSeconds();
    const totalSeconds = minutesToNextUpdate * 60 + secondsToNextUpdate;
    $(".page.pageLeaderboards .titleAndButtons .timer").text(
      "Next update in: " + DateTime.secondsToString(totalSeconds, true),
    );
  } else if (state.type === "weekly") {
    const nextWeekTimestamp = endOfWeek(new UTCDateMini(), { weekStartsOn: 1 });
    const totalSeconds = differenceInSeconds(new Date(), nextWeekTimestamp);
    $(".page.pageLeaderboards .titleAndButtons .timer").text(
      "Next reset in: " +
        DateTime.secondsToString(totalSeconds, true, true, ":", true, true),
    );
  }
}

function updateTimerVisibility(): void {
  let visible = true;

  if (
    (state.type === "daily" && state.yesterday) ||
    (state.type === "weekly" && state.lastWeek)
  ) {
    visible = false;
  }

  if (visible) {
    $(".page.pageLeaderboards .titleAndButtons .timer").removeClass(
      "invisible",
    );
  } else {
    $(".page.pageLeaderboards .titleAndButtons .timer").addClass("invisible");
  }
}

function startTimer(): void {
  updateTimerElement();
  updateTimer = setInterval(() => {
    updateTimerElement();
  }, 1000) as unknown as number;
}

function stopTimer(): void {
  clearInterval(updateTimer);
  updateTimer = undefined;
  $(".page.pageLeaderboards .titleAndButtons .timer").text("-");
}

function convertRuleOption(rule: string): string[] {
  if (rule.startsWith("(")) {
    return rule.slice(1, -1).split("|");
  }
  return [rule];
}

async function updateValidDailyLeaderboards(): Promise<void> {
  const dailyRulesConfig =
    ServerConfiguration.get()?.dailyLeaderboards.validModeRules;

  if (dailyRulesConfig === undefined) {
    throw new Error(
      "cannot load server configuration for dailyLeaderboards.validModeRules",
    );
  }

  //a rule can contain multiple values. create a flat list out of them
  const dailyRules = dailyRulesConfig.flatMap((rule) => {
    const languages = convertRuleOption(rule.language) as Language[];
    const mode2List = convertRuleOption(rule.mode2);

    return mode2List.map((mode2) => ({
      mode: rule.mode as Mode,
      mode2,
      languages,
    }));
  });

  validLeaderboards.daily = dailyRules.reduce<
    Partial<Record<Mode, Record<string /*mode2*/, Language[]>>>
  >((acc, { mode, mode2, languages }) => {
    let modes = acc[mode];
    if (modes === undefined) {
      modes = {};
      acc[mode] = modes;
    }

    let modes2 = modes[mode2];
    if (modes2 === undefined) {
      modes2 = [];
      modes[mode2] = modes2;
    }

    modes2.push(...languages);
    return acc;
  }, {});
}

function checkIfLeaderboardIsValid(): void {
  if (state.type === "weekly") return;

  const validLeaderboard = validLeaderboards[state.type];

  let validModes2 = validLeaderboard[state.mode];
  if (validModes2 === undefined) {
    const firstMode = Object.keys(validLeaderboard).sort()[0] as Mode;
    if (firstMode === undefined) {
      throw new Error(`no valid leaderboard config for type ${state.type}`);
    }
    state.mode = firstMode;
    // oxlint-disable-next-line no-non-null-assertion
    validModes2 = validLeaderboard[state.mode]!;
  }

  let supportedLanguages = validModes2[state.mode2];
  if (supportedLanguages === undefined) {
    const firstMode2 = Object.keys(validModes2).sort(
      (a, b) => parseInt(a) - parseInt(b),
    )[0];
    if (firstMode2 === undefined) {
      throw new Error(
        `no valid leaderboard config for type ${state.type} and mode ${state.mode}`,
      );
    }
    state.mode2 = firstMode2;
    supportedLanguages = validModes2[state.mode2];
  }

  if (supportedLanguages === undefined || supportedLanguages.length < 1) {
    throw new Error(
      `Daily leaderboard config not valid for mode:${state.mode} mode2:${state.mode2}`,
    );
  }

  if (!supportedLanguages.includes(state.language)) {
    state.language = supportedLanguages.sort()[0] as Language;
  }
}

async function appendModeAndLanguageButtons(): Promise<void> {
  const modes = Array.from(
    new Set(
      Object.values(validLeaderboards).flatMap(
        (rule) => Object.keys(rule) as Mode[],
      ),
    ),
  ).sort();

  const mode2Buttons = modes.flatMap((mode) => {
    const modes2 = Array.from(
      new Set(
        Object.values(validLeaderboards).flatMap((rule) =>
          Object.keys(rule[mode] ?? {}),
        ),
      ),
    ).sort((a, b) => parseInt(a) - parseInt(b));

    const icon = mode === "time" ? "fas fa-clock" : "fas fa-align-left";

    return modes2.map(
      (mode2) => `<button data-mode="${mode}" data-mode2="${mode2}">
      <i class="${icon}"></i>
       ${mode} ${mode2}
    </button>`,
    );
  });
  $(".modeButtons").html(
    `<div class="divider"></div>` + mode2Buttons.join("\n"),
  );

  const availableLanguages = Array.from(
    new Set(
      Object.values(validLeaderboards)
        .flatMap((rule) => Object.values(rule))
        .flatMap((mode) => Object.values(mode))
        .flatMap((it) => it),
    ),
  ).sort();

  const languageButtons = availableLanguages.map(
    (lang) =>
      `<button data-language="${lang}">
          <i class="fas fa-globe"></i>
          ${lang}
        </button>`,
  );
  $(".languageButtons").html(
    `<div class="divider"></div>` + languageButtons.join("\n"),
  );
}

function disableButtons(): void {
  $(".page.pageLeaderboards button").prop("disabled", true);
}

function enableButtons(): void {
  $(".page.pageLeaderboards button").prop("disabled", false);
}

export function goToPage(pageId: number): void {
  if (pageId < 0 || pageId === state.page) return;
  handleJumpButton("goToPage", pageId);
}

type Action =
  | "firstPage"
  | "previousPage"
  | "nextPage"
  | "goToPage"
  | "userPage";
function handleJumpButton(action: Action, page?: number): void {
  if (action === "firstPage") {
    state.page = 0;
  } else if (action === "previousPage" && state.page > 0) {
    const totalPages = Math.ceil(state.count / state.pageSize);
    if (state.page > totalPages) {
      state.page = totalPages - 1;
    } else {
      state.page -= 1;
    }
  } else if (action === "nextPage") {
    state.page += 1;
  } else if (action === "goToPage" && page !== undefined) {
    state.page = page;
  } else if (action === "userPage") {
    if (isAuthenticated()) {
      const rank = state.userData
        ? getSortRank(state.userData, state.rankSortBy)
        : undefined;
      if (isSafeNumber(rank)) {
        // - 1 to make sure position 50 with page size 50 is on the first page (page 0)
        const page = Math.floor((rank - 1) / state.pageSize);

        if (state.page === page) {
          return;
        }

        state.page = page;
        state.scrollToUserAfterFill = true;
      }
    }
  } else {
    return;
  }
  updateGetParameters();
  void requestData(true);
  updateContent();
}

function handleYesterdayLastWeekButton(action: string): void {
  if (state.type === "daily" && action === "toggleYesterday") {
    state.yesterday = !state.yesterday;
  } else if (state.type === "weekly" && action === "toggleLastWeek") {
    state.lastWeek = !state.lastWeek;
  }

  updateGetParameters();
  void requestData();
  updateContent();
  updateTitle();
}

function updateGetParameters(): void {
  if (state.goToUserPage) {
    //parameters are updated in the requestData method
    return;
  }

  const params: UrlParameter = {};

  params.type = state.type;
  if (state.type === "allTime") {
    params.mode2 = state.mode2;
  } else if (state.type === "daily") {
    params.mode = state.mode;
    params.language = state.language;
    params.mode2 = state.mode2;
    if (state.yesterday) {
      params.yesterday = true;
    }
  } else if (state.type === "weekly") {
    if (state.lastWeek) {
      params.lastWeek = true;
    }
  }

  params.page = state.page + 1;

  if (state.friendsOnly) {
    params.friendsOnly = true;
  }
  if (state.regionFilter !== "") {
    params.regionFilter = state.regionFilter;
  }
  if (state.sectionFilter !== "") {
    params.sectionFilter = state.sectionFilter;
  }
  if (state.rankSortBy !== "global" || state.rankSortDirection !== "asc") {
    params.rankSortBy = state.rankSortBy;
    params.rankSortDirection = state.rankSortDirection;
  }
  page.setUrlParams(params);

  selectorLS.set({
    type: state.type,
    mode: state.type !== "weekly" ? state.mode : undefined,
    mode2: state.type !== "weekly" ? state.mode2 : undefined,
    language: state.type === "daily" ? state.language : undefined,
    yesterday: state.type === "daily" && state.yesterday ? true : undefined,
    lastWeek: state.type === "weekly" && state.lastWeek ? true : undefined,
    friendsOnly: state.friendsOnly || undefined,
    regionFilter: state.regionFilter || undefined,
    sectionFilter: state.sectionFilter || undefined,
    rankSortBy:
      state.rankSortBy !== "global" || state.rankSortDirection !== "asc"
        ? state.rankSortBy
        : undefined,
    rankSortDirection:
      state.rankSortBy !== "global" || state.rankSortDirection !== "asc"
        ? state.rankSortDirection
        : undefined,
  });
}

function readGetParameters(params?: UrlParameter): void {
  if (params === undefined) {
    Object.assign(state, selectorLS.get());
    state.rankSortBy = state.rankSortBy ?? "global";
    state.rankSortDirection = state.rankSortDirection ?? "asc";
    syncRankScopeFromFilters();
    return;
  }

  if (params.type !== undefined) {
    state.type = params.type;
  }

  state.friendsOnly = params.friendsOnly ?? false;
  state.regionFilter = (params.regionFilter ?? "") as RegionCode | "";
  state.sectionFilter = params.sectionFilter ?? "";
  state.rankSortBy = params.rankSortBy ?? "global";
  state.rankSortDirection = params.rankSortDirection ?? "asc";
  syncRankScopeFromFilters();

  if (state.type === "allTime") {
    if (params.mode2 !== undefined) {
      state.mode2 = params.mode2 as AllTimeState["mode2"];
    }
  } else if (state.type === "daily") {
    if (params.language !== undefined) {
      state.language = params.language;
    }
    if (params.mode2 !== undefined) {
      state.mode2 = params.mode2;
    }
    if (params.mode !== undefined) {
      state.mode = params.mode;
    }
    if (params.yesterday !== undefined) {
      state.yesterday = params.yesterday;
    }
  } else if (state.type === "weekly") {
    if (params.lastWeek !== undefined) {
      state.lastWeek = params.lastWeek;
    }
  }

  if (params.page !== undefined) {
    state.page = params.page - 1;

    if (state.page < 0) {
      state.page = 0;
    }
  }
  if (params.goToUserPage === true) {
    state.goToUserPage = true;
  }
}

function utcToLocalDate(timestamp: UTCDateMini): Date {
  return subMinutes(timestamp, new Date().getTimezoneOffset());
}

function updateTimeText(
  dateString: string,
  localStart: Date,
  localEnd: Date,
): void {
  const localDateString =
    "local time \n" +
    format(localStart, localDateFormat) +
    " - \n" +
    format(localEnd, localDateFormat);

  const text = $(".page.pageLeaderboards .bigtitle .subtext > .text");
  text.text(`${dateString}`);
  text.attr("aria-label", localDateString);
}

function formatRank(rank: number | undefined): string {
  if (rank === undefined) return "";
  if (rank === 1) {
    return `<span class="lbRankCrown" aria-label="1"><i class="fas fa-crown"></i><span class="lbRankCrownNumber">1</span></span>`;
  }

  return rank.toString();
}

function formatRankText(rank: number | undefined): string {
  if (rank === undefined) return "-";
  return rank.toString();
}

$(".page.pageLeaderboards .jumpButtons button").on("click", function () {
  const action = $(this).data("action") as Action;
  if (action !== "goToPage") {
    handleJumpButton(action);
  }
});

$(".page.pageLeaderboards .bigtitle button").on("click", function () {
  const action = $(this).data("action") as string;
  handleYesterdayLastWeekButton(action);
});

$(".page.pageLeaderboards .buttonGroup.typeButtons").on(
  "click",
  "button",
  function () {
    const type = $(this).data("type") as "allTime" | "weekly" | "daily";
    if (state.type === type) return;
    state.type = type;
    if (state.type === "daily") {
      state.language = "english";
      state.yesterday = false;
    }
    if (state.type === "weekly") {
      state.lastWeek = false;
    }
    checkIfLeaderboardIsValid();
    state.data = null;
    state.page = 0;
    void requestData();
    updateTitle();
    updateSideButtons();
    updateContent();
    updateGetParameters();
  },
);

$(".page.pageLeaderboards .buttonGroup.modeButtons").on(
  "click",
  "button",
  function () {
    const mode = $(this).attr("data-mode") as Mode;
    const mode2 = $(this).attr("data-mode2");

    if (
      mode !== undefined &&
      mode2 !== undefined &&
      (state.type === "allTime" || state.type === "daily")
    ) {
      if (state.mode === mode && state.mode2 === mode2) return;
      state.mode = mode;
      state.mode2 = mode2;
      state.page = 0;
    } else {
      return;
    }
    checkIfLeaderboardIsValid();
    state.data = null;
    void requestData();
    updateSideButtons();
    updateTitle();
    updateContent();
    updateGetParameters();
  },
);

$(".page.pageLeaderboards .buttonGroup.languageButtons").on(
  "click",
  "button",
  function () {
    const language = $(this).attr("data-language") as Language;

    if (language !== undefined && state.type === "daily") {
      if (state.language === language) return;
      state.language = language;
      state.page = 0;
    } else {
      return;
    }
    checkIfLeaderboardIsValid();
    state.data = null;
    void requestData();
    updateSideButtons();
    updateTitle();
    updateContent();
    updateGetParameters();
  },
);

$(".page.pageLeaderboards .buttonGroup.friendsOnlyButtons").on(
  "click",
  "button",
  () => {
    state.friendsOnly = !state.friendsOnly;
    state.page = 0;
    void requestData();
    updateTitle();
    updateSideButtons();
    updateContent();
    updateGetParameters();
  },
);

$(".page.pageLeaderboards").on("click", ".rankSortButton", function () {
  const sortBy = $(this).attr("data-sort-by") as RankSortBy | undefined;
  if (sortBy === undefined) return;
  handleRankSortButtonClick(sortBy);
});

export const page = new PageWithUrlParams({
  id: "leaderboards",
  element: $(".page.pageLeaderboards"),
  path: "/leaderboards",
  urlParamsSchema: UrlParameterSchema,

  afterHide: async (): Promise<void> => {
    Skeleton.remove("pageLeaderboards");
    destroyLeaderboardFilterDropdowns();
    stopTimer();
  },
  beforeShow: async (options): Promise<void> => {
    await ServerConfiguration.configurationPromise;
    Skeleton.append("pageLeaderboards", "main");
    await updateValidDailyLeaderboards();
    await appendModeAndLanguageButtons();
    readGetParameters(options.urlParams);
    checkIfLeaderboardIsValid();
    initLeaderboardFilterDropdowns(handleFilterChange);
    setLeaderboardFilterValues({
      regionFilter: state.regionFilter,
      sectionFilter: state.sectionFilter,
    });
    updateRankSortHeaders();
    startTimer();
    updateTitle();
    updateContent();
    updateSideButtons();
    updateGetParameters();
    void requestData(false);
  },
  afterShow: async (): Promise<void> => {
    // updateSideButtons();
  },
});

$(async () => {
  Skeleton.save("pageLeaderboards");
});

$(document).on(
  "click",
  "#pageLeaderboards [data-action='viewLbStats']",
  function (e) {
    e.preventDefault();
    e.stopPropagation();
    const encoded = $(this).attr("data-lb-stats");
    if (encoded === undefined) return;
    openLeaderboardEntryStatsModal(encoded);
  },
);

ConfigEvent.subscribe((eventKey) => {
  if (ActivePage.get() === "leaderboards" && eventKey === "typingSpeedUnit") {
    updateContent();
    fillUser();
  }
});
