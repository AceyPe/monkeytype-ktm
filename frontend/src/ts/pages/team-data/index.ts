import { year2026 } from "./years/2026";
import { year2025 } from "./years/2025";
import { year2024 } from "./years/2024";
import { year2022 } from "./years/2022";

export type TeamMember = {
  name: string;
  title: string;
  imagePath: string;
  linkedin: string;
  region?: string;
  section?: string;
};

export type TeamSection = {
  title: string;
  items: TeamMember[];
};

export type TeamData = {
  [year: string]: TeamSection[];
};

export const teamData: TeamData = {
  "2026": year2026,
  "2025": year2025,
  "2024": year2024,
  "2022": year2022,
};
