import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { handleKeystroke } from "./keystroke-handler.js";
import { isStreamEnabled } from "./config.js";

const keystrokeSchema = z.object({
  type: z.literal("contest_keystroke"),
  traceId: z.string().uuid(),
  userId: z.string().min(1),
  char: z.string().length(1),
  seq: z.number().int().nonnegative(),
});

export function attachContestWebSocket(server: Server): void {
  if (isStreamEnabled()) {
    console.log(
      "[contest-backend] Stream.io configured; WebSocket fallback disabled.",
    );
    return;
  }

  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket) => {
    socket.on("message", (raw) => {
      try {
        const text =
          typeof raw === "string"
            ? raw
            : Buffer.isBuffer(raw)
              ? raw.toString("utf8")
              : "";
        if (text === "") return;

        const data = JSON.parse(text) as unknown;
        const parsed = keystrokeSchema.safeParse(data);
        if (!parsed.success) {
          socket.send(
            JSON.stringify({
              type: "error",
              message: "Invalid message",
            }),
          );
          return;
        }

        const ack = handleKeystroke(parsed.data);
        if (ack !== null) {
          socket.send(JSON.stringify(ack));
        }
      } catch {
        socket.send(
          JSON.stringify({ type: "error", message: "Malformed JSON" }),
        );
      }
    });
  });

  console.log("[contest-backend] WebSocket listening at /ws");
}
