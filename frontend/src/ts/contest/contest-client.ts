import * as ActivePage from "../states/active-page";
import { envConfig } from "virtual:env-config";
import { StreamChat, type Channel, type Event } from "stream-chat";

type ContestTransport = "stream.io" | "websocket" | "none";

type ContestSessionResponse = {
  traceId: string;
  userId: string;
  channelId: string;
  streamApiKey?: string;
  streamToken?: string;
  transport: ContestTransport;
  chunkSize: number;
  totalWords: number;
  durationSeconds: number;
};

type KeystrokeAck = {
  type: "contest_keystroke_result";
  traceId: string;
  seq: number;
  correct: boolean;
  errors: number;
  wordIndex: number;
};

type ContestKeystrokeEvent = {
  type: "contest_keystroke";
  traceId: string;
  userId: string;
  char: string;
  seq: number;
  contest_trace_id: string;
};

type WordChunkResponse = {
  chunkIndex: number;
  words: string[];
  totalWords: number;
  hasMore: boolean;
};

function asKeystrokeAck(event: Event): KeystrokeAck | null {
  if ((event.type as string) !== "contest_keystroke_result") return null;
  return event as unknown as KeystrokeAck;
}

let session: ContestSessionResponse | null = null;
let streamClient: StreamChat | null = null;
let streamChannel: Channel | null = null;
let socket: WebSocket | null = null;
let seq = 0;
let untrusted = false;
let pendingAcks = new Map<number, (ack: KeystrokeAck) => void>();
let loadedWords: string[] | null = null;
let wordsLoadPromise: Promise<string[]> | null = null;

function getBackendUrl(): string {
  return envConfig.contestBackendUrl.replace(/\/$/, "");
}

export function isConnected(): boolean {
  return session !== null;
}

export function hasUntrustedMismatch(): boolean {
  return untrusted;
}

export function getTraceId(): string | null {
  return session?.traceId ?? null;
}

async function fetchAllChunks(): Promise<string[]> {
  if (session === null) {
    throw new Error("No contest session");
  }

  const words: string[] = [];
  let chunkIndex = 0;
  let hasMore = true;

  while (hasMore) {
    const url = new URL(
      `${getBackendUrl()}/api/contest/trace/${session.traceId}/chunk/${chunkIndex}`,
    );
    url.searchParams.set("userId", session.userId);

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Contest chunk failed (${res.status})`);
    }

    const chunk = (await res.json()) as WordChunkResponse;
    words.push(...chunk.words);
    hasMore = chunk.hasMore;
    chunkIndex++;
  }

  return words;
}

/** Words for the active contest trace (loaded in chunks; not in session JSON). */
export async function loadSessionWords(): Promise<string[]> {
  if (loadedWords !== null) return loadedWords;
  if (wordsLoadPromise !== null) return wordsLoadPromise;

  wordsLoadPromise = fetchAllChunks()
    .then((words) => {
      loadedWords = words;
      return words;
    })
    .finally(() => {
      wordsLoadPromise = null;
    });

  return wordsLoadPromise;
}

export function getSessionWords(): string[] | null {
  return loadedWords;
}

export async function startSession(): Promise<ContestSessionResponse> {
  await disconnect();

  const res = await fetch(`${getBackendUrl()}/api/contest/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error(`Contest session failed (${res.status})`);
  }

  session = (await res.json()) as ContestSessionResponse;
  seq = 0;
  untrusted = false;
  loadedWords = null;
  pendingAcks.clear();

  if (session.transport === "stream.io") {
    await connectStream(session);
  } else if (session.transport === "websocket") {
    connectWebSocket();
  }

  return session;
}

async function connectStream(data: ContestSessionResponse): Promise<void> {
  if (data.streamApiKey === undefined || data.streamToken === undefined) {
    throw new Error("Stream credentials missing from contest session");
  }

  streamClient = StreamChat.getInstance(data.streamApiKey);
  await streamClient.connectUser({ id: data.userId }, data.streamToken);

  streamChannel = streamClient.channel("messaging", data.channelId);
  await streamChannel.watch();

  streamClient.on((event) => {
    const ack = asKeystrokeAck(event);
    if (ack === null || ack.traceId !== data.traceId) return;
    const resolve = pendingAcks.get(ack.seq);
    if (resolve !== undefined) {
      pendingAcks.delete(ack.seq);
      resolve(ack);
    }
  });
}

function connectWebSocket(): void {
  const base = getBackendUrl().replace(/^http/, "ws");
  socket = new WebSocket(`${base}/ws`);

  socket.addEventListener("message", (ev) => {
    try {
      const ack = JSON.parse(ev.data as string) as KeystrokeAck;
      if (ack.type !== "contest_keystroke_result") return;
      const resolve = pendingAcks.get(ack.seq);
      if (resolve !== undefined) {
        pendingAcks.delete(ack.seq);
        resolve(ack);
      }
    } catch {
      // ignore malformed frames
    }
  });
}

export async function reportKeystroke(
  char: string,
  clientCorrect: boolean,
): Promise<KeystrokeAck | null> {
  if (session === null || !ActivePage.isContestPage()) return null;

  const currentSeq = seq++;
  const payload: ContestKeystrokeEvent = {
    type: "contest_keystroke",
    traceId: session.traceId,
    userId: session.userId,
    char,
    seq: currentSeq,
    contest_trace_id: session.traceId,
  };

  const ackPromise = new Promise<KeystrokeAck>((resolve) => {
    pendingAcks.set(currentSeq, resolve);
  });

  if (streamChannel !== null) {
    try {
      await streamChannel.sendEvent(payload as unknown as Event);
    } catch (e) {
      console.error("Stream contest_keystroke event failed", e);
    }
  } else if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }

  const httpAck = await fetch(`${getBackendUrl()}/api/contest/keystroke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      traceId: session.traceId,
      userId: session.userId,
      char,
      seq: currentSeq,
    }),
  });

  let ack: KeystrokeAck | null = null;
  if (httpAck.ok) {
    ack = (await httpAck.json()) as KeystrokeAck;
    const resolve = pendingAcks.get(currentSeq);
    if (resolve !== undefined) {
      pendingAcks.delete(currentSeq);
      resolve(ack);
    }
  } else {
    ack = await Promise.race([
      ackPromise,
      new Promise<null>((r) => setTimeout(() => r(null), 2000)),
    ]);
  }

  if (ack !== null && ack.correct !== clientCorrect) {
    untrusted = true;
  }

  return ack;
}

export async function finishSession(): Promise<void> {
  if (session === null) return;
  await fetch(
    `${getBackendUrl()}/api/contest/trace/${session.traceId}/finish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: session.userId }),
    },
  );
}

export async function disconnect(): Promise<void> {
  pendingAcks.clear();
  seq = 0;
  loadedWords = null;
  wordsLoadPromise = null;

  if (streamClient !== null) {
    await streamClient.disconnectUser();
    streamClient = null;
    streamChannel = null;
  }

  if (socket !== null) {
    socket.close();
    socket = null;
  }

  session = null;
}
