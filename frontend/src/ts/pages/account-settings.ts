import Page from "./page";

const existingElement = $(".page.pageAccountSettings");
const pageElement =
  existingElement.length > 0
    ? existingElement
    : $('<div class="page pageAccountSettings hidden"></div>');

export function updateUI(): void {
  // Account settings page is disabled in this build.
}

export const page = new Page({
  id: "accountSettings",
  display: "Account Settings",
  element: pageElement,
  path: "/account-settings",
});
