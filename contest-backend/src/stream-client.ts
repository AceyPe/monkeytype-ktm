import { StreamChat } from "stream-chat";
import { config, isStreamEnabled } from "./config.js";

let serverClient: StreamChat | null = null;

export function getStreamServerClient(): StreamChat | null {
  if (!isStreamEnabled()) return null;
  if (serverClient === null) {
    serverClient = StreamChat.getInstance(
      config.streamApiKey,
      config.streamApiSecret,
    );
  }
  return serverClient;
}

export async function ensureContestChannel(
  traceId: string,
  userId: string,
  channelId: string,
): Promise<void> {
  const client = getStreamServerClient();
  if (client === null) return;

  const channel = client.channel("messaging", channelId, {
    created_by_id: userId,
    contest_trace_id: traceId,
  });
  await channel.create();
  await channel.addMembers([userId]);
}

export async function sendKeystrokeResult(
  userId: string,
  payload: {
    traceId: string;
    seq: number;
    correct: boolean;
    errors: number;
    wordIndex: number;
  },
): Promise<void> {
  const client = getStreamServerClient();
  if (client === null) return;

  await client.sendUserCustomEvent(userId, {
    type: "contest_keystroke_result",
    ...payload,
  });
}
