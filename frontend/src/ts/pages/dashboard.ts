import Page from "./page";
import * as Skeleton from "../utils/skeleton";
import Ape from "../ape";
import AnimatedModal from "../utils/animated-modal";
import * as Notifications from "../elements/notifications";
import {
  Contest,
  ContestPrize,
  CreateContestRequest,
} from "@monkeytype/schemas/contests";
import { AdminUserListItem } from "@monkeytype/schemas/users";
import {
  getSectionNameByGeocode,
  type RegionCode,
} from "../constants/sections-by-geocode";
import {
  destroyDashboardUsersFilters,
  initDashboardUsersFilters,
  type DashboardUsersFilterValues,
} from "../elements/dashboard-users-filters";
import { SimpleModal } from "../utils/simple-modal";
import { format } from "date-fns";
import { UTCDateMini } from "@date-fns/utc";

type DashboardSection = "contests" | "users";
type ContestFormMode = "create" | "edit";

const state = {
  section: "contests" as DashboardSection,
  contestsLoading: false,
  contestsError: undefined as string | undefined,
  contests: [] as Contest[],
  usersLoading: false,
  usersError: undefined as string | undefined,
  users: [] as AdminUserListItem[],
  usersFilters: {
    adminsOnly: false,
    regionFilter: "" as RegionCode | "",
    sectionFilter: "",
  },
};

let usersFiltersInitialized = false;
let usersActionsMenuListenerAttached = false;

function getUserDisplayName(uid: string): string {
  const user = state.users.find((entry) => entry.uid === uid);
  if (user === undefined) return "this user";
  return user.displayName.trim() === "" ? "Member" : user.displayName;
}

function closeUserActionsMenus(): void {
  pageElement.find(".userActionsMenu").addClass("hidden");
}

function attachUserActionsMenuListener(): void {
  if (usersActionsMenuListenerAttached) return;
  document.addEventListener("click", closeUserActionsMenus);
  usersActionsMenuListenerAttached = true;
}

const setUserAdminModal = new SimpleModal({
  id: "setUserAdmin",
  title: "Set as admin",
  buttonText: "set as admin",
  text: "Are you sure you want to set this user as admin?",
  beforeInitFn: (popup) => {
    popup.text = `Are you sure you want to set ${getUserDisplayName(popup.parameters[0] ?? "")} as admin?`;
  },
  execFn: async (popup) => {
    const uid = popup.parameters[0] as string;
    const response = await Ape.users.setAdmin({ body: { uid } });

    if (response.status !== 200) {
      return {
        status: -1,
        message: response.body.message ?? "Failed to set admin role",
      };
    }

    await fetchUsers();
    return { status: 1, message: "Admin role granted" };
  },
});

const removeUserAdminModal = new SimpleModal({
  id: "removeUserAdmin",
  title: "Remove admin",
  buttonText: "remove admin",
  text: "Are you sure you want to remove admin access from this user?",
  beforeInitFn: (popup) => {
    popup.text = `Are you sure you want to remove admin access from ${getUserDisplayName(popup.parameters[0] ?? "")}?`;
  },
  execFn: async (popup) => {
    const uid = popup.parameters[0] as string;
    const response = await Ape.users.removeAdmin({ body: { uid } });

    if (response.status !== 200) {
      return {
        status: -1,
        message: response.body.message ?? "Failed to remove admin role",
      };
    }

    await fetchUsers();
    return { status: 1, message: "Admin role removed" };
  },
});

const contestFormState = {
  mode: "create" as ContestFormMode,
  contestId: undefined as string | undefined,
};

const deleteContestState = {
  contestId: undefined as string | undefined,
  expectedPhrase: "",
};

const pageElement = $(".page.pageDashboard");

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseUtcDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return Date.UTC(year, month - 1, day);
}

function formatUtcDateInput(timestamp: number): string {
  const date = new UTCDateMini(timestamp);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function formatContestDate(timestamp: number): string {
  return `${format(new UTCDateMini(timestamp), "dd MMM yyyy")} UTC`;
}

function getUtcTodayStart(): number {
  const now = new UTCDateMini();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function isContestDateToday(contestDate: number): boolean {
  return contestDate === getUtcTodayStart();
}

function getDeleteContestConfirmPhrase(title: string): string {
  return `I am sure I want to delete the ${title} contest`;
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

    const deleteDisabled = isContestDateToday(contest.date);
    const deleteDisabledAttr = deleteDisabled ? "disabled" : "";
    const deleteTitle = deleteDisabled
      ? 'title="Cannot delete a contest scheduled for today"'
      : "";

    list.append(`
      <div class="contestCard" data-contest-id="${contest._id}">
        <div class="contestCardHeader">
          <div class="contestMeta">
            <div class="contestTitle">${escapeHtml(contest.title)}</div>
            <div class="contestDate">${formatContestDate(contest.date)}</div>
          </div>
          <div class="contestCardActions">
            <button
              type="button"
              class="textButton editContestButton"
              data-contest-id="${contest._id}"
            >
              <i class="fas fa-pencil-alt"></i>
              edit
            </button>
            <button
              type="button"
              class="textButton leaderboardContestButton"
              data-contest-id="${contest._id}"
            >
              <i class="fas fa-list-ol"></i>
              leaderboard
            </button>
            <button
              type="button"
              class="textButton deleteContestButton"
              data-contest-id="${contest._id}"
              ${deleteDisabledAttr}
              ${deleteTitle}
            >
              <i class="fas fa-trash-alt"></i>
              delete
            </button>
          </div>
        </div>
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

function getRegionNumberFromGeocode(geocode?: string): number | null {
  if (geocode === undefined || geocode.trim() === "") return null;
  const firstDigit = geocode.match(/\d/)?.[0];
  if (firstDigit === undefined) return null;
  const n = Number(firstDigit);
  if (!Number.isInteger(n) || n < 0 || n > 9) return null;
  return n === 0 ? 10 : n;
}

function normalizeGeocode(geocode?: string): string | null {
  if (geocode === undefined) return null;
  const normalized = geocode.trim().toUpperCase();
  return normalized === "" ? null : normalized;
}

function userMatchesFilters(user: AdminUserListItem): boolean {
  if (state.usersFilters.adminsOnly && !user.isAdmin) return false;

  if (state.usersFilters.sectionFilter !== "") {
    return (
      normalizeGeocode(user.geocode) ===
      normalizeGeocode(state.usersFilters.sectionFilter)
    );
  }

  if (state.usersFilters.regionFilter !== "") {
    const userRegion = getRegionNumberFromGeocode(user.geocode);
    return (
      userRegion !== null &&
      String(userRegion) === state.usersFilters.regionFilter
    );
  }

  return true;
}

function getFilteredUsers(): AdminUserListItem[] {
  return state.users.filter(userMatchesFilters);
}

function updateAdminsOnlyButtons(): void {
  const toolbar = pageElement.find(".usersTableToolbar .adminsOnlyButtons");
  toolbar
    .find(".allUsers")
    .toggleClass("active", !state.usersFilters.adminsOnly);
  toolbar
    .find(".adminsOnly")
    .toggleClass("active", state.usersFilters.adminsOnly);
}

function ensureUsersFilters(): void {
  if (usersFiltersInitialized) return;
  initDashboardUsersFilters(handleUsersFilterChange);
  usersFiltersInitialized = true;
}

function handleUsersFilterChange(values: DashboardUsersFilterValues): void {
  state.usersFilters.regionFilter = values.regionFilter;
  state.usersFilters.sectionFilter = values.sectionFilter;
  updateContent();
}

function renderUsersList(): void {
  const list = pageElement.find(".usersList");
  list.empty();

  const users = getFilteredUsers();

  if (state.users.length === 0) {
    list.append(`<div class="empty">No users found</div>`);
    return;
  }

  if (users.length === 0) {
    list.append(`<div class="empty">No users match these filters</div>`);
    return;
  }

  const rows = users
    .map((user) => {
      const displayName =
        user.displayName.trim() === "" ? "Member" : user.displayName;
      const section =
        user.geocode !== undefined
          ? escapeHtml(getSectionNameByGeocode(user.geocode) ?? user.geocode)
          : '<span class="emptyCell">—</span>';
      const grade =
        user.grade !== undefined
          ? escapeHtml(user.grade)
          : '<span class="emptyCell">—</span>';
      const status =
        user.status !== undefined
          ? escapeHtml(user.status)
          : '<span class="emptyCell">—</span>';
      const setAdminAction = user.isAdmin
        ? ""
        : `<button type="button" class="setAdminAction" data-uid="${escapeHtml(user.uid)}">set as admin</button>`;
      const removeAdminAction = user.isAdmin
        ? `<button type="button" class="removeAdminAction" data-uid="${escapeHtml(user.uid)}">remove admin</button>`
        : "";

      return `
        <tr>
          <td class="userNameCell">
            <span class="userName">${escapeHtml(displayName)}</span>
            ${
              user.isAdmin
                ? `<span class="adminBadge" title="Admin"><i class="fas fa-shield-alt"></i> admin</span>`
                : ""
            }
          </td>
          <td>${section}</td>
          <td>${grade}</td>
          <td>${status}</td>
          <td class="userActionsCell">
            <div class="userActions">
              <button
                type="button"
                class="textButton userActionsButton"
                aria-label="User actions"
                data-uid="${escapeHtml(user.uid)}"
              >
                <i class="fas fa-ellipsis-h"></i>
              </button>
              <div class="userActionsMenu hidden">
                ${setAdminAction}
                ${removeAdminAction}
              </div>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  list.append(`
    <table class="usersTable">
      <thead>
        <tr>
          <th>name</th>
          <th>section</th>
          <th>grade</th>
          <th>status</th>
          <th class="userActionsHeader"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `);
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
  pageElement
    .find(".contestsPanel")
    .toggleClass("hidden", state.section !== "contests");
  pageElement
    .find(".usersPanel")
    .toggleClass("hidden", state.section !== "users");

  if (state.section === "contests") {
    pageElement
      .find(".contestsPanel .loading")
      .toggleClass("hidden", !state.contestsLoading);
    pageElement
      .find(".contestsPanel .error")
      .toggleClass("hidden", state.contestsError === undefined);
    pageElement.find(".contestsPanel .error p").text(state.contestsError ?? "");

    if (state.contestsLoading || state.contestsError !== undefined) {
      pageElement.find(".contestsList").empty();
      return;
    }

    renderContestsList();
    return;
  }

  pageElement
    .find(".usersPanel .usersLoading")
    .toggleClass("hidden", !state.usersLoading);
  pageElement
    .find(".usersPanel .usersError")
    .toggleClass("hidden", state.usersError === undefined);
  pageElement.find(".usersPanel .usersError p").text(state.usersError ?? "");
  pageElement
    .find(".usersTableToolbar")
    .toggleClass(
      "hidden",
      state.usersLoading || state.usersError !== undefined,
    );

  if (state.usersLoading || state.usersError !== undefined) {
    pageElement.find(".usersList").empty();
    return;
  }

  ensureUsersFilters();
  updateAdminsOnlyButtons();
  attachUserActionsMenuListener();
  renderUsersList();
}

async function fetchContests(): Promise<void> {
  state.contestsLoading = true;
  state.contestsError = undefined;
  updateContent();

  const response = await Ape.contests.get();

  state.contestsLoading = false;

  if (response.status === 200) {
    state.contests = response.body.data;
    state.contestsError = undefined;
  } else {
    state.contests = [];
    state.contestsError = response.body.message ?? "Failed to load contests";
    Notifications.add(state.contestsError, -1);
  }

  updateContent();
}

async function fetchUsers(): Promise<void> {
  state.usersLoading = true;
  state.usersError = undefined;
  updateContent();

  const response = await Ape.users.listUsers();

  state.usersLoading = false;

  if (response.status === 200) {
    state.users = response.body.data;
    state.usersError = undefined;
  } else {
    state.users = [];
    state.usersError = response.body.message ?? "Failed to load users";
    Notifications.add(state.usersError, -1);
  }

  updateContent();
}

function createPrizeRow(prize?: ContestPrize): HTMLElement {
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

  if (prize !== undefined) {
    const rowEl = $(row);
    rowEl.find(".fromPosition").val(String(prize.fromPosition));
    if (prize.toPosition !== undefined) {
      rowEl.find(".toPosition").val(String(prize.toPosition));
    }
    rowEl.find(".reward").val(prize.reward);
  }

  return row;
}

function getContestFormModal(): JQuery {
  return $(contestFormModal.getModal());
}

function resetContestForm(): void {
  const form = contestFormModal.getModal();
  if (form instanceof HTMLFormElement) {
    form.reset();
  }
  const modal = getContestFormModal();
  const prizeList = modal.find(".prizeList");
  prizeList.empty();
  prizeList.append(createPrizeRow());
  modal.find(".formError").addClass("hidden").text("");
}

function populateContestForm(contest: Contest): void {
  const form = contestFormModal.getModal();
  if (form instanceof HTMLFormElement) {
    form.reset();
  }

  const modal = getContestFormModal();
  modal.find("input[name='title']").val(contest.title);
  modal.find("input[name='date']").val(formatUtcDateInput(contest.date));

  const prizeList = modal.find(".prizeList");
  prizeList.empty();
  for (const prize of contest.prizes) {
    prizeList.append(createPrizeRow(prize));
  }

  modal.find(".formError").addClass("hidden").text("");
}

function updateContestFormModalUi(): void {
  const modal = getContestFormModal();
  const isEdit = contestFormState.mode === "edit";
  modal
    .find(".contestFormTitle")
    .text(isEdit ? "Edit contest" : "Create contest");
  modal.find(".contestFormSubmitButton").text(isEdit ? "save" : "create");
}

function readPrizesFromForm(): CreateContestRequest["prizes"] | string {
  const prizes: CreateContestRequest["prizes"] = [];
  const rows = getContestFormModal().find(".prizeRow");

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

const contestFormModal = new AnimatedModal({
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
      void submitContestForm(event);
    });
  },
});

function getDeleteContestModal(): JQuery {
  return $(deleteContestModal.getModal());
}

function updateDeleteContestSubmitState(): void {
  const modal = getDeleteContestModal();
  const input = (
    modal.find("input[name='confirmText']").val() as string
  ).trim();
  modal
    .find(".deleteContestSubmitButton")
    .prop("disabled", input !== deleteContestState.expectedPhrase);
}

function resetDeleteContestForm(): void {
  const form = deleteContestModal.getModal();
  if (form instanceof HTMLFormElement) {
    form.reset();
  }

  const modal = getDeleteContestModal();
  modal.find(".formError").addClass("hidden").text("");
  updateDeleteContestSubmitState();
}

const deleteContestModal = new AnimatedModal({
  dialogId: "deleteContestModal",
  setup: async (modalEl): Promise<void> => {
    $(modalEl).on("input", "input[name='confirmText']", () => {
      updateDeleteContestSubmitState();
    });

    $(modalEl).on("click", ".cancelDeleteContestButton", () => {
      void deleteContestModal.hide();
    });

    $(modalEl).on("submit", (event) => {
      void submitDeleteContest(event);
    });
  },
});

async function submitContestForm(event: {
  preventDefault: () => void;
}): Promise<void> {
  event.preventDefault();

  const modal = getContestFormModal();
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
  modal.find(".contestFormSubmitButton").prop("disabled", true);

  const body = { title, date, prizes };
  const response =
    contestFormState.mode === "edit" && contestFormState.contestId !== undefined
      ? await Ape.contests.update({
          params: { contestId: contestFormState.contestId },
          body,
        })
      : await Ape.contests.create({ body });

  modal.find(".contestFormSubmitButton").prop("disabled", false);

  if (response.status === 200) {
    Notifications.add(
      contestFormState.mode === "edit" ? "Contest updated" : "Contest created",
      1,
    );
    void contestFormModal.hide();
    await fetchContests();
    return;
  }

  errorEl
    .removeClass("hidden")
    .text(response.body.message ?? "Failed to save contest");
}

function openCreateContestModal(): void {
  contestFormState.mode = "create";
  contestFormState.contestId = undefined;
  resetContestForm();
  updateContestFormModalUi();
  void contestFormModal.show({
    focusFirstInput: true,
  });
}

function openEditContestModal(contestId: string): void {
  const contest = state.contests.find((entry) => entry._id === contestId);
  if (contest === undefined) {
    Notifications.add("Contest not found", -1);
    return;
  }

  contestFormState.mode = "edit";
  contestFormState.contestId = contestId;
  populateContestForm(contest);
  updateContestFormModalUi();
  void contestFormModal.show({
    focusFirstInput: true,
  });
}

function openDeleteContestModal(contestId: string): void {
  const contest = state.contests.find((entry) => entry._id === contestId);
  if (contest === undefined) {
    Notifications.add("Contest not found", -1);
    return;
  }

  if (isContestDateToday(contest.date)) {
    Notifications.add("Cannot delete a contest scheduled for today", -1);
    return;
  }

  deleteContestState.contestId = contestId;
  deleteContestState.expectedPhrase = getDeleteContestConfirmPhrase(
    contest.title,
  );

  const modal = getDeleteContestModal();
  modal.find(".confirmPhrase").text(deleteContestState.expectedPhrase);
  resetDeleteContestForm();

  void deleteContestModal.show({
    focusFirstInput: true,
  });
}

async function submitDeleteContest(event: {
  preventDefault: () => void;
}): Promise<void> {
  event.preventDefault();

  const modal = getDeleteContestModal();
  const errorEl = modal.find(".formError");
  const confirmText = (
    modal.find("input[name='confirmText']").val() as string
  ).trim();
  const contestId = deleteContestState.contestId;

  if (contestId === undefined) {
    errorEl.removeClass("hidden").text("Contest not found");
    return;
  }

  if (confirmText !== deleteContestState.expectedPhrase) {
    errorEl.removeClass("hidden").text("Confirmation phrase does not match");
    return;
  }

  errorEl.addClass("hidden").text("");
  modal.find(".deleteContestSubmitButton").prop("disabled", true);

  const response = await Ape.contests.delete({
    params: { contestId },
  });

  modal.find(".deleteContestSubmitButton").prop("disabled", false);

  if (response.status === 200) {
    Notifications.add("Contest deleted", 1);
    void deleteContestModal.hide();
    await fetchContests();
    return;
  }

  errorEl
    .removeClass("hidden")
    .text(response.body.message ?? "Failed to delete contest");
}

pageElement.on("click", ".sectionButtons button", function () {
  const section = $(this).attr("data-section") as DashboardSection | undefined;
  if (section === undefined || state.section === section) return;
  state.section = section;
  updateSectionButtons();
  updateContent();
  if (section === "users") {
    if (state.users.length === 0 && !state.usersLoading) {
      void fetchUsers();
    }
  }
});

pageElement.on("click", ".usersTableToolbar .allUsers", () => {
  if (!state.usersFilters.adminsOnly) return;
  state.usersFilters.adminsOnly = false;
  updateContent();
});

pageElement.on("click", ".usersTableToolbar .adminsOnly", () => {
  if (state.usersFilters.adminsOnly) return;
  state.usersFilters.adminsOnly = true;
  updateContent();
});

pageElement.on("click", ".userActionsButton", function (event) {
  event.stopPropagation();
  const menu = $(this).siblings(".userActionsMenu");
  const isOpen = !menu.hasClass("hidden");
  closeUserActionsMenus();
  if (!isOpen) {
    menu.removeClass("hidden");
  }
});

pageElement.on("click", ".userActionsMenu", (event) => {
  event.stopPropagation();
});

pageElement.on("click", ".setAdminAction", function () {
  const uid = $(this).attr("data-uid");
  if (uid === undefined) return;
  closeUserActionsMenus();
  setUserAdminModal.show([uid], {});
});

pageElement.on("click", ".removeAdminAction", function () {
  const uid = $(this).attr("data-uid");
  if (uid === undefined) return;
  closeUserActionsMenus();
  removeUserAdminModal.show([uid], {});
});

pageElement.on("click", ".createContestButton", () => {
  openCreateContestModal();
});

pageElement.on("click", ".editContestButton", function () {
  const contestId = $(this).attr("data-contest-id");
  if (contestId === undefined) return;
  openEditContestModal(contestId);
});

pageElement.on("click", ".deleteContestButton", function () {
  if ($(this).prop("disabled") === true) return;
  const contestId = $(this).attr("data-contest-id");
  if (contestId === undefined) return;
  openDeleteContestModal(contestId);
});

export const page = new Page({
  id: "dashboard",
  element: pageElement,
  path: "/dashboard",
  afterHide: async (): Promise<void> => {
    destroyDashboardUsersFilters();
    usersFiltersInitialized = false;
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
