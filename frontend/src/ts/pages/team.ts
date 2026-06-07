import { PageWithUrlParams } from "./page";
import * as Skeleton from "../utils/skeleton";
import { teamData, type TeamMember, type TeamSection } from "./team-data";
import { startTypewriter, type StopTypewriter } from "../utils/typewriter";
import { z } from "zod";

const TEAM_YEARS = ["2026", "2025", "2024", "2022"] as const;
type TeamYear = (typeof TEAM_YEARS)[number];
const DEFAULT_TEAM_YEAR: TeamYear = "2026";

const TeamUrlParamsSchema = z.object({
  year: z.enum(TEAM_YEARS).optional(),
});

let stopSloganTyping: StopTypewriter | null = null;
let teamPageInitialized = false;

function isTeamYear(value: string | undefined): value is TeamYear {
  return value !== undefined && value in teamData;
}

function resolveTeamYear(
  year: z.infer<typeof TeamUrlParamsSchema>["year"],
): TeamYear {
  if (year !== undefined && isTeamYear(year)) {
    return year;
  }
  return DEFAULT_TEAM_YEAR;
}

function updateTeamUrlParams(year: TeamYear): void {
  if (year === DEFAULT_TEAM_YEAR) {
    page.setUrlParams({});
    return;
  }

  page.setUrlParams({ year });
}

function formatRegionSection(member: TeamMember): string {
  const { region, section } = member;
  const hasRegion = region !== undefined && region !== "";
  const hasSection = section !== undefined && section !== "";
  if (hasRegion && hasSection) {
    return `${region} - ${section}`;
  }
  if (hasRegion) {
    return region;
  }
  if (hasSection) {
    return section;
  }
  return "";
}

function renderTeamContent(year: TeamYear): void {
  const frame = document.querySelector(".pageTeam .frame");
  if (!frame) return;

  const sections = teamData[year] || [];

  frame.classList.remove("fade-in");
  frame.classList.add("fade-out");

  setTimeout(() => {
    frame.innerHTML = "";

    sections.forEach((section: TeamSection) => {
      const frameSection = document.createElement("div");
      frameSection.className = "frameSection";

      const title = document.createElement("div");
      title.className = "frameSectionTitle";
      title.textContent = section.title;

      const container = document.createElement("div");
      container.className = "frameSectionContainer";

      section.items.forEach((member) => {
        const hasLinkedin = member.linkedin.trim().length > 0;
        const card: HTMLAnchorElement | HTMLDivElement = hasLinkedin
          ? document.createElement("a")
          : document.createElement("div");
        card.className = "card";
        if (card instanceof HTMLAnchorElement) {
          card.href = member.linkedin;
          card.target = "_blank";
          card.rel = "noopener noreferrer";
          card.setAttribute("aria-label", `${member.name} LinkedIn profile`);
        }

        const imageDiv = document.createElement("div");
        imageDiv.className = "cardImage";
        const img = document.createElement("img");
        img.src = member.imagePath || "/images/team_page.webp";
        img.alt = member.name || "Team Member";
        img.loading = "lazy";
        imageDiv.appendChild(img);
        if (hasLinkedin) {
          const linkedinBadge = document.createElement("div");
          linkedinBadge.className = "cardLinkedinBadge";
          linkedinBadge.setAttribute("aria-hidden", "true");

          const linkedinIcon = document.createElement("i");
          linkedinIcon.className = "fab fa-linkedin-in";
          linkedinBadge.appendChild(linkedinIcon);
          card.appendChild(linkedinBadge);
        }

        const cardInfo = document.createElement("div");
        cardInfo.className = "cardInfo";

        const name = document.createElement("h3");
        name.textContent = member.name || "";
        cardInfo.appendChild(name);

        if (member.title) {
          const position = document.createElement("span");
          position.className = "position";
          position.textContent = member.title;
          cardInfo.appendChild(position);
        }

        const regionSectionText = formatRegionSection(member);
        if (regionSectionText) {
          const regionSection = document.createElement("span");
          regionSection.className = "regionSection";
          regionSection.textContent = regionSectionText;
          cardInfo.appendChild(regionSection);
        }

        card.appendChild(imageDiv);
        card.appendChild(cardInfo);

        container.appendChild(card);
      });

      frameSection.appendChild(title);
      frameSection.appendChild(container);
      frame.appendChild(frameSection);
    });

    requestAnimationFrame(() => {
      frame.classList.remove("fade-out");
      frame.classList.add("fade-in");
    });
  }, 300);
}

function setActiveYear(year: TeamYear): void {
  const buttons = document.querySelectorAll(".pageTeam .bigtitle button");
  buttons.forEach((button) => {
    if (button.textContent?.trim() === year) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });

  renderTeamContent(year);
}

function initTeamPage(initialYear: TeamYear): void {
  const pageEl = document.querySelector(".pageTeam");
  if (!pageEl) return;

  const slogan = pageEl.querySelector(".hero-section .slogan");
  if (slogan instanceof HTMLElement) {
    stopSloganTyping?.();
    stopSloganTyping = startTypewriter(slogan, {
      phrases: [
        "The minds behind the mission",
        "The volunteers behind the keys",
      ],
      pauseAfterTypeMs: 1000,
      loop: true,
    });
  }

  if (!teamPageInitialized) {
    const buttons = pageEl.querySelectorAll(".bigtitle button");
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const year = button.textContent?.trim();
        if (!isTeamYear(year)) return;
        setActiveYear(year);
        updateTeamUrlParams(year);
      });
    });
    teamPageInitialized = true;
  }

  const frame = pageEl.querySelector(".frame");
  if (frame) {
    frame.classList.add("fade-in");
  }

  setActiveYear(initialYear);
}

export const page = new PageWithUrlParams({
  id: "team",
  element: $(".page.pageTeam"),
  path: "/team",
  urlParamsSchema: TeamUrlParamsSchema,
  afterHide: async (): Promise<void> => {
    stopSloganTyping?.();
    stopSloganTyping = null;
    Skeleton.remove("pageTeam");
  },
  beforeShow: async (options): Promise<void> => {
    Skeleton.append("pageTeam", "main");
    initTeamPage(resolveTeamYear(options.urlParams?.year));
  },
});

$(() => {
  Skeleton.save("pageTeam");
});
