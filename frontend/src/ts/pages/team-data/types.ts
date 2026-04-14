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
