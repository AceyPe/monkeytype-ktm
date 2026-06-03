import { processKeystroke } from "./session-store.js";
import { sendKeystrokeResult } from "./stream-client.js";

export type KeystrokePayload = {
  traceId: string;
  userId: string;
  char: string;
  seq: number;
};

export type KeystrokeAck = {
  type: "contest_keystroke_result";
  traceId: string;
  seq: number;
  correct: boolean;
  errors: number;
  wordIndex: number;
};

export function handleKeystroke(
  payload: KeystrokePayload,
): KeystrokeAck | null {
  if (payload.char.length !== 1) return null;

  const result = processKeystroke(payload.traceId, payload.char, payload.seq);
  if (result === null) return null;

  const ack: KeystrokeAck = {
    type: "contest_keystroke_result",
    traceId: payload.traceId,
    seq: result.seq,
    correct: result.correct,
    errors: result.errors,
    wordIndex: result.wordIndex,
  };

  void sendKeystrokeResult(payload.userId, {
    traceId: payload.traceId,
    seq: ack.seq,
    correct: ack.correct,
    errors: ack.errors,
    wordIndex: ack.wordIndex,
  });

  return ack;
}
