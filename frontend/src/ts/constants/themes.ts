import { ThemeName } from "@monkeytype/schemas/configs";
import { hexToHSL } from "../utils/colors";

export type Theme = {
  name: ThemeName;
  bgColor: string;
  mainColor: string;
  subColor: string;
  textColor: string;
};

export const themes: Record<ThemeName, Omit<Theme, "name">> = {
  dark: {
    bgColor: "#00141a",
    mainColor: "#72963e",
    subColor: "#a0a0a0",
    textColor: "#eee",
  },
  light: {
    bgColor: "#f5f5f5",
    mainColor: "#72963e",
    subColor: "#666666",
    textColor: "#1a1a1a",
  },
};

export const ThemesList: Theme[] = Object.keys(themes)
  .sort()
  .map(
    (it) =>
      ({
        ...themes[it as ThemeName],
        name: it,
      }) as Theme,
  );

export const ThemesListSorted = [
  ...ThemesList.sort((a, b) => {
    const b1 = hexToHSL(a.bgColor);
    const b2 = hexToHSL(b.bgColor);
    return b2.lgt - b1.lgt;
  }),
];
