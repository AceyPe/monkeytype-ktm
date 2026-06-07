import {
  LeaderboardEntry,
  XpLeaderboardEntry,
} from "@monkeytype/schemas/leaderboards";
import { RankScope, RegionFilter } from "@monkeytype/contracts/leaderboards";

export type RankFilterTarget = {
  rankScope: RankScope;
  regionCode?: RegionFilter;
  sectionGeocode?: string;
};

export function normalizeGeocode(geocode?: string): string | null {
  if (geocode === undefined) return null;
  const normalized = geocode.trim().toUpperCase();
  return normalized === "" ? null : normalized;
}

export function getRegionCodeFromGeocode(geocode?: string): string | null {
  const firstDigit = geocode?.match(/\d/)?.[0];
  if (firstDigit === undefined) return null;
  if (firstDigit === "0") return "10";
  return firstDigit;
}

export function matchesRegionCode(
  entryGeocode: string | undefined,
  regionCode: string,
): boolean {
  const entryRegion = getRegionCodeFromGeocode(entryGeocode);
  return entryRegion !== null && entryRegion === regionCode;
}

export function matchesSectionGeocode(
  entryGeocode: string | undefined,
  sectionGeocode: string,
): boolean {
  const entrySection = normalizeGeocode(entryGeocode);
  const filterSection = normalizeGeocode(sectionGeocode);
  return (
    entrySection !== null &&
    filterSection !== null &&
    entrySection === filterSection
  );
}

export function resolveRankFilterTarget(args: {
  rankScope?: RankScope;
  regionFilter?: RegionFilter;
  sectionFilter?: string;
}): RankFilterTarget {
  if (args.sectionFilter !== undefined && args.sectionFilter.trim() !== "") {
    const sectionGeocode = normalizeGeocode(args.sectionFilter);
    if (sectionGeocode === null) {
      return { rankScope: "global" };
    }
    return { rankScope: "section", sectionGeocode };
  }

  if (args.regionFilter !== undefined) {
    return { rankScope: "region", regionCode: args.regionFilter };
  }

  const scope = args.rankScope ?? "global";
  return { rankScope: scope };
}

type RankedEntry = Pick<
  LeaderboardEntry | XpLeaderboardEntry,
  "rank" | "regionRank" | "sectionRank" | "geocode"
>;

export function filterEntriesByRankScope<T extends RankedEntry>(
  entries: T[],
  target: RankFilterTarget,
): T[] {
  if (target.rankScope === "global") return entries;
  if (target.rankScope === "region" && target.regionCode !== undefined) {
    return entries.filter((entry) =>
      matchesRegionCode(entry.geocode, target.regionCode as string),
    );
  }
  if (target.rankScope === "section" && target.sectionGeocode !== undefined) {
    return entries.filter((entry) =>
      matchesSectionGeocode(entry.geocode, target.sectionGeocode as string),
    );
  }
  return entries;
}

export function sortEntriesByRankScope<T extends RankedEntry>(
  entries: T[],
  rankScope: RankScope,
): T[] {
  const getSortRank = (entry: T): number => {
    if (rankScope === "region")
      return entry.regionRank ?? Number.MAX_SAFE_INTEGER;
    if (rankScope === "section") {
      return entry.sectionRank ?? Number.MAX_SAFE_INTEGER;
    }
    return entry.rank;
  };

  return [...entries].sort((a, b) => getSortRank(a) - getSortRank(b));
}

export function paginateEntries<T>(
  entries: T[],
  page: number,
  pageSize: number,
): T[] {
  const start = page * pageSize;
  return entries.slice(start, start + pageSize);
}

export function applyRankScopeToEntries<T extends RankedEntry>(
  entries: T[],
  page: number,
  pageSize: number,
  target: RankFilterTarget,
): { entries: T[]; count: number } {
  const filtered = filterEntriesByRankScope(entries, target);
  const sorted = sortEntriesByRankScope(filtered, target.rankScope);
  return {
    entries: paginateEntries(sorted, page, pageSize),
    count: sorted.length,
  };
}

export function getRankScopeSortField(
  rankScope: RankScope,
): "rank" | "regionRank" | "sectionRank" {
  if (rankScope === "region") return "regionRank";
  if (rankScope === "section") return "sectionRank";
  return "rank";
}
