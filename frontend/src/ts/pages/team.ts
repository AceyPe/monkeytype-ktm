import Page from "./page";
import * as Skeleton from "../utils/skeleton";

export const page = new Page({
  id: "team",
  element: $(".page.pageTeam"),
  path: "/team",
  afterHide: async (): Promise<void> => {
    // reset();
    Skeleton.remove("pageTeam");
  },
  beforeShow: async (): Promise<void> => {
    Skeleton.append("pageTeam", "main");
  },
});

$(() => {
  Skeleton.save("pageTeam");
});
