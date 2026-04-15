import Page from "./page";
import * as Skeleton from "../utils/skeleton";
import { teamData, type TeamMember, type TeamSection } from "./team-data";
import { startTypewriter, type StopTypewriter } from "../utils/typewriter";

let stopSloganTyping: StopTypewriter | null = null;

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

function renderTeamContent(year: string): void {
  const frame = document.querySelector(".pageTeam .frame");
  if (!frame) return;

  const sections = teamData[year] || [];

  // Add fade-out animation
  frame.classList.remove("fade-in");
  frame.classList.add("fade-out");

  // Wait for fade-out animation, then update content and fade in
  setTimeout(() => {
    // Clear existing content
    frame.innerHTML = "";

    // Render each section
    sections.forEach((section: TeamSection) => {
      const frameSection = document.createElement("div");
      frameSection.className = "frameSection";

      const title = document.createElement("div");
      title.className = "frameSectionTitle";
      title.textContent = section.title;

      const container = document.createElement("div");
      container.className = "frameSectionContainer";

      // Render cards for each team member
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

    // Trigger fade-in animation
    requestAnimationFrame(() => {
      frame.classList.remove("fade-out");
      frame.classList.add("fade-in");
    });
  }, 300); // Match the transition duration
}

function setActiveYear(year: string): void {
  // let currentYear: string = "2026";
  // currentYear = year;

  // Update button states
  const buttons = document.querySelectorAll(".pageTeam .bigtitle button");
  buttons.forEach((button) => {
    if (button.textContent?.trim() === year) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });

  // Render content for selected year
  renderTeamContent(year);
}

function initTeamPage(): void {
  const page = document.querySelector(".pageTeam");
  if (!page) return;

  const slogan = page.querySelector(".hero-section .slogan");
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

  // Set up button click handlers
  const buttons = page.querySelectorAll(".bigtitle button");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const year = button.textContent?.trim();
      if (year && teamData[year]) {
        setActiveYear(year);
      }
    });
  });

  // Initialize with default year
  const frame = page.querySelector(".frame");
  if (frame) {
    frame.classList.add("fade-in");
  }
  setActiveYear("2026");
}

export const page = new Page({
  id: "team",
  element: $(".page.pageTeam"),
  path: "/team",
  afterHide: async (): Promise<void> => {
    // reset();
    stopSloganTyping?.();
    stopSloganTyping = null;
    Skeleton.remove("pageTeam");
  },
  beforeShow: async (): Promise<void> => {
    Skeleton.append("pageTeam", "main");
    initTeamPage();
  },
});

$(() => {
  Skeleton.save("pageTeam");
});
