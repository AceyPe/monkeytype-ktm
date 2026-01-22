export type TeamMember = {
  name: string;
  title: string;
  imagePath: string;
  linkedin: string;
};

export type TeamSection = {
  title: string;
  items: TeamMember[];
};

export type TeamData = {
  [year: string]: TeamSection[];
};

export const teamData: TeamData = {
  "2026": [
    {
      title: "title",
      items: [
        {
          name: "Mohamed Ahmed",
          title: "Senior Software Engineer",
          imagePath: "",
          linkedin: "https://linkedin.com",
        },
        {
          name: "Mohamed Ahmed",
          title: "Senior Software Engineer",
          imagePath: "",
          linkedin: "https://linkedin.com",
        },
        {
          name: "Mohamed Ahmed",
          title: "Senior Software Engineer",
          imagePath: "",
          linkedin: "https://linkedin.com",
        },
        {
          name: "Mohamed Ahmed",
          title: "Senior Software Engineer",
          imagePath: "",
          linkedin: "https://linkedin.com",
        },
        {
          name: "Mohamed Ahmed",
          title: "Senior Software Engineer",
          imagePath: "",
          linkedin: "https://linkedin.com",
        },
      ],
    },
    {
      title: "title",
      items: [
        {
          name: "Mohamed Ahmed",
          title: "Senior Software Engineer",
          imagePath: "",
          linkedin: "https://linkedin.com",
        },
        {
          name: "Mohamed Ahmed",
          title: "Senior Software Engineer",
          imagePath: "",
          linkedin: "https://linkedin.com",
        },
        {
          name: "Mohamed Ahmed",
          title: "Senior Software Engineer",
          imagePath: "",
          linkedin: "https://linkedin.com",
        },
        {
          name: "Mohamed Ahmed",
          title: "Senior Software Engineer",
          imagePath: "",
          linkedin: "https://linkedin.com",
        },
        {
          name: "Mohamed Ahmed",
          title: "Senior Software Engineer",
          imagePath: "",
          linkedin: "https://linkedin.com",
        },
        {
          name: "Mohamed Ahmed",
          title: "Senior Software Engineer",
          imagePath: "",
          linkedin: "https://linkedin.com",
        },
      ],
    },
  ],
  "2025": [
    {
      title: "title",
      items: [
        {
          name: "",
          title: "",
          imagePath: "",
          linkedin: "",
        },
      ],
    },
  ],
  "2024": [
    {
      title: "title",
      items: [
        {
          name: "",
          title: "",
          imagePath: "",
          linkedin: "",
        },
      ],
    },
  ],
  "2022": [
    {
      title: "title",
      items: [
        {
          name: "",
          title: "",
          imagePath: "",
          linkedin: "",
        },
      ],
    },
  ],
};
