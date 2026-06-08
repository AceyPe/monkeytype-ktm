import AnimatedModal from "../utils/animated-modal";
import { focusWords } from "../test/test-ui";
import type { Contest } from "@monkeytype/schemas/contests";
import {
  formatContestEndUtc,
  formatMarathonCountdownVerbose,
  formatPrizeListHtml,
  getContestRemainingMs,
} from "../utils/contest-marathon";

const modal = new AnimatedModal({
  dialogId: "contestMoreInfoModal",
  setup: async (modalElement): Promise<void> => {
    modalElement
      .querySelector(".contestMoreInfoCloseButton")
      ?.addEventListener("click", () => {
        void hide();
      });
  },
  customEscapeHandler: (): void => {
    void hide();
  },
  customWrapperClickHandler: (event): void => {
    if (event.target === modal.getWrapper()) {
      void hide();
    }
  },
});

function getCountdownElement(): HTMLElement | null {
  return modal.getModal().querySelector(".contestMoreInfoCountdown");
}

function updateCountdown(contestDate: number): void {
  const countdownElement = getCountdownElement();
  if (countdownElement === null) return;
  countdownElement.textContent = formatMarathonCountdownVerbose(
    getContestRemainingMs(contestDate),
  );
}

export function updateContestMoreInfoCountdown(contestDate: number): void {
  if (!modal.isOpen()) return;
  updateCountdown(contestDate);
}

function populateModal(contest: Contest, displayName: string): void {
  const modalElement = modal.getModal();
  const greetingElement = modalElement.querySelector(
    ".contestMoreInfoGreeting",
  );
  if (greetingElement !== null) {
    greetingElement.textContent = `Welcome to the IEEE Keyboard Typing Marathon, ${displayName}!`;
  }

  const endTimeElement = modalElement.querySelector(".contestMoreInfoEndTime");
  if (endTimeElement !== null) {
    endTimeElement.textContent = formatContestEndUtc(contest.date);
  }

  const prizesElement = modalElement.querySelector(".contestMoreInfoPrizes");
  if (prizesElement !== null) {
    prizesElement.innerHTML = formatPrizeListHtml(contest.prizes);
  }

  updateCountdown(contest.date);
}

export async function show(
  contest: Contest,
  displayName: string,
): Promise<void> {
  populateModal(contest, displayName);
  await modal.show({
    afterAnimation: async () => {
      updateCountdown(contest.date);
    },
  });
}

export async function hide(): Promise<void> {
  await modal.hide({
    afterAnimation: async () => {
      focusWords();
    },
  });
}
