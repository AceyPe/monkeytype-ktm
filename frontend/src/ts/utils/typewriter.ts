export type TypewriterOptions = {
  phrases: string[];
  typeSpeedMs?: number;
  deleteSpeedMs?: number;
  pauseAfterTypeMs?: number;
  pauseAfterDeleteMs?: number;
  initialDelayMs?: number;
  loop?: boolean;
  reserveSpace?: boolean;
  showCursor?: boolean;
};

export type StopTypewriter = () => void;

export function startTypewriter(
  target: HTMLElement,
  options: TypewriterOptions,
): StopTypewriter {
  const {
    phrases,
    typeSpeedMs = 70,
    deleteSpeedMs = 45,
    pauseAfterTypeMs = 1000,
    pauseAfterDeleteMs = 250,
    initialDelayMs = 0,
    loop = true,
    reserveSpace = true,
    showCursor = true,
  } = options;

  if (phrases.length === 0) {
    target.textContent = "";
    return () => undefined;
  }

  let timeoutId: number | undefined;
  let phraseIndex = 0;
  let charIndex = 0;
  let deleting = false;
  let stopped = false;
  const maxPhraseLength = phrases.reduce(
    (maxLength, phrase) => Math.max(maxLength, phrase.length),
    0,
  );

  target.textContent = "";
  target.classList.add("typewriter-text");
  target.classList.toggle("typewriter-text--cursor", showCursor);
  if (reserveSpace) {
    target.style.setProperty(
      "--typewriter-reserved-width",
      `${maxPhraseLength}ch`,
    );
  }

  const setText = (): void => {
    const phrase = phrases[phraseIndex] ?? "";
    target.textContent = phrase.slice(0, charIndex);
  };

  const schedule = (delayMs: number, callback: () => void): void => {
    timeoutId = window.setTimeout(() => {
      if (stopped) return;
      callback();
    }, delayMs);
  };

  const tick = (): void => {
    const phrase = phrases[phraseIndex] ?? "";

    if (!deleting) {
      if (charIndex < phrase.length) {
        charIndex += 1;
        setText();
        schedule(typeSpeedMs, tick);
        return;
      }

      const isLastPhrase = phraseIndex === phrases.length - 1;
      if (!loop && isLastPhrase) {
        return;
      }

      deleting = true;
      schedule(pauseAfterTypeMs, tick);
      return;
    }

    if (charIndex > 0) {
      charIndex -= 1;
      setText();
      schedule(deleteSpeedMs, tick);
      return;
    }

    deleting = false;
    phraseIndex = (phraseIndex + 1) % phrases.length;
    schedule(pauseAfterDeleteMs, tick);
  };

  schedule(initialDelayMs, tick);

  return () => {
    stopped = true;
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
    target.classList.remove("typewriter-text", "typewriter-text--cursor");
    target.style.removeProperty("--typewriter-reserved-width");
  };
}
