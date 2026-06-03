import { describe, expect, it } from "vitest";
import {
  createValidatorState,
  getTrustedText,
  validateKeystroke,
} from "../src/validator.js";

describe("validateKeystroke", () => {
  const words = ["hello", "world"];

  it("accepts correct letters and space between words", () => {
    let state = createValidatorState(words);
    for (const char of "hello ") {
      const r = validateKeystroke(state, char);
      expect(r.correct).toBe(true);
      state = r.state;
    }
    expect(state.wordIndex).toBe(1);
    expect(getTrustedText(state)).toBe("hello");
  });

  it("rejects wrong letter", () => {
    let state = createValidatorState(words);
    const r = validateKeystroke(state, "j");
    expect(r.correct).toBe(false);
    expect(r.state.errors).toBe(1);
  });

  it("rejects early space", () => {
    let state = createValidatorState(words);
    const r = validateKeystroke(state, " ");
    expect(r.correct).toBe(false);
  });
});
