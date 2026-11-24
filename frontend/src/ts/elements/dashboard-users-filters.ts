import SlimSelect from "slim-select";
import {
  REGIONS,
  SECTIONS,
  type RegionCode,
} from "../constants/sections-by-geocode";

export type DashboardUsersFilterValues = {
  regionFilter: RegionCode | "";
  sectionFilter: string;
};

let regionSelect: SlimSelect | undefined;
let sectionSelect: SlimSelect | undefined;
let changeCallback: ((values: DashboardUsersFilterValues) => void) | undefined;
let suppressChange = false;

function getPageElement(): HTMLElement | null {
  return document.querySelector(".page.pageDashboard");
}

function getSelectedRegionFilter(): RegionCode | "" {
  return (regionSelect?.getSelected()[0] ?? "") as RegionCode | "";
}

function getSelectedSectionFilter(): string {
  return sectionSelect?.getSelected()[0] ?? "";
}

function withSuppressedChanges(fn: () => void): void {
  suppressChange = true;
  try {
    fn();
  } finally {
    queueMicrotask(() => {
      suppressChange = false;
    });
  }
}

export function initDashboardUsersFilters(
  onChange: (values: DashboardUsersFilterValues) => void,
): void {
  changeCallback = onChange;
  const page = getPageElement();
  if (page === null) return;

  regionSelect?.destroy();
  sectionSelect?.destroy();

  const regionElement = page.querySelector(
    ".usersRegionFilter",
  ) as HTMLElement | null;
  const sectionElement = page.querySelector(
    ".usersSectionFilter",
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
      contentLocation: page,
    },
    events: {
      afterChange: () => {
        if (suppressChange) return;

        const regionFilter = getSelectedRegionFilter();
        if (regionFilter !== "") {
          withSuppressedChanges(() => {
            sectionSelect?.setSelected("");
          });
          changeCallback?.({ regionFilter, sectionFilter: "" });
          return;
        }

        changeCallback?.({
          regionFilter: "",
          sectionFilter: getSelectedSectionFilter(),
        });
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
        filter: `${section.name} ${section.geocode}`,
      })),
    ],
    settings: {
      showSearch: true,
      placeholderText: "All sections",
      allowDeselect: true,
      contentLocation: page,
    },
    events: {
      afterChange: () => {
        if (suppressChange) return;

        const sectionFilter = getSelectedSectionFilter();
        if (sectionFilter !== "") {
          withSuppressedChanges(() => {
            regionSelect?.setSelected("");
          });
          changeCallback?.({ regionFilter: "", sectionFilter });
          return;
        }

        changeCallback?.({
          regionFilter: getSelectedRegionFilter(),
          sectionFilter: "",
        });
      },
    },
  });
}

export function destroyDashboardUsersFilters(): void {
  regionSelect?.destroy();
  sectionSelect?.destroy();
  regionSelect = undefined;
  sectionSelect = undefined;
  changeCallback = undefined;
}
