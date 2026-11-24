/**
 * Server-trusted keystroke validation for contest mode (time, words only).
 * Mirrors client rules from input/helpers/validation.ts for the contest preset.
 */

function isSpace(char: string): boolean {
  if (char.length !== 1) return false;
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return false;
  return (
    codePoint === 0x0020 ||
    codePoint === 0x2002 ||
    codePoint === 0x2003 ||
    codePoint === 0x2009 ||
    codePoint === 0x00a0 ||
    char === "\t" ||
    char === "\n"
  );
}

export type ContestValidatorState = {
  words: readonly string[];
  wordIndex: number;
  /** Characters typed for the current word (not including trailing space). */
  inputInWord: number;
  totalKeypresses: number;
  trustedKeypresses: number;
  errors: number;
};

export type KeystrokeValidationResult = {
  correct: boolean;
  state: ContestValidatorState;
  /** True when a space completed a word and advanced to the next. */
  advancedWord: boolean;
};

export function createValidatorState(
  words: readonly string[],
): ContestValidatorState {
  return {
    words,
    wordIndex: 0,
    inputInWord: 0,
    totalKeypresses: 0,
    trustedKeypresses: 0,
    errors: 0,
  };
}

function cloneState(state: ContestValidatorState): ContestValidatorState {
  return { ...state };
}

function isCharCorrect(
  char: string,
  inputInWord: number,
  targetWord: string,
): boolean {
  if (isSpace(char)) {
    return inputInWord === targetWord.length;
  }
  return targetWord[inputInWord] === char;
}

function shouldInsertSpaceAsCharacter(
  inputInWord: number,
  targetWord: string,
): boolean {
  return !(targetWord + " ").startsWith(targetWord.slice(0, inputInWord) + " ");
}

/**
 * Validate one keystroke in O(1) time using word index + in-word offset.
 */
export function validateKeystroke(
  state: ContestValidatorState,
  char: string,
): KeystrokeValidationResult {
  const next = cloneState(state);
  next.totalKeypresses += 1;

  const targetWord = next.words[next.wordIndex];
  if (targetWord === undefined) {
    next.errors += 1;
    return { correct: false, state: next, advancedWord: false };
  }

  const charIsSpace = isSpace(char);
  let correct = isCharCorrect(char, next.inputInWord, targetWord);

  if (charIsSpace && correct) {
    const insertAsChar = shouldInsertSpaceAsCharacter(
      next.inputInWord,
      targetWord,
    );
    if (insertAsChar) {
      correct = targetWord[next.inputInWord] === char;
    }
  }

  let advancedWord = false;

  if (correct) {
    next.trustedKeypresses += 1;
    if (charIsSpace && next.inputInWord === targetWord.length) {
      next.wordIndex += 1;
      next.inputInWord = 0;
      advancedWord = true;
    } else if (!charIsSpace) {
      next.inputInWord += 1;
    }
  } else {
    next.errors += 1;
  }

  return { correct, state: next, advancedWord };
}

/** Flat text of all correctly typed characters (for checksum / audit). */
export function getTrustedText(state: ContestValidatorState): string {
  let out = "";
  for (let w = 0; w < state.wordIndex; w++) {
    const word = state.words[w];
    if (word !== undefined) {
      if (out.length > 0) out += " ";
      out += word;
    }
  }
  const current = state.words[state.wordIndex];
  if (current !== undefined && state.inputInWord > 0) {
    if (out.length > 0 && state.wordIndex > 0) out += " ";
    out += current.slice(0, state.inputInWord);
  }
  return out;
}
