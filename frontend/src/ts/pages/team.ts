import Page from "./page";
import * as Skeleton from "../utils/skeleton";
import { teamData, type TeamSection } from "./team-data";

function renderTeamContent(year: string): void {
  const frame = document.querySelector(".pageTeam .frame");
  if (!frame) return;

  const sections = teamData[year] || [];

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
      const card = document.createElement("div");
      card.className = "card";

      const imageDiv = document.createElement("div");
      const img = document.createElement("img");
      img.src = member.imagePath || "/images/team_page.webp";
      img.alt = member.name || "Team Member";
      img.loading = "lazy";
      imageDiv.appendChild(img);

      const position = document.createElement("h3");
      position.textContent = member.title || "";

      const name = document.createElement("span");
      name.textContent = member.name || "";

      const linkedinIcon = document.createElement("i");
      linkedinIcon.className = "fab fa-linkedin-in circle-icon";
      if (member.linkedin) {
        linkedinIcon.style.cursor = "pointer";
        linkedinIcon.addEventListener("click", () => {
          window.open(member.linkedin, "_blank");
        });
      }

      card.appendChild(imageDiv);
      card.appendChild(position);
      card.appendChild(name);
      card.appendChild(linkedinIcon);

      container.appendChild(card);
    });

    frameSection.appendChild(title);
    frameSection.appendChild(container);
    frame.appendChild(frameSection);
  });
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
  setActiveYear("2026");
}

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
    initTeamPage();
  },
});

$(() => {
  Skeleton.save("pageTeam");
});
