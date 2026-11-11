import "./load-env.js";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { config } from "./config.js";
import routes from "./routes.js";
import { attachContestWebSocket } from "./websocket.js";
import { logContestBackendEnv } from "./log-config.js";

const app = express();
app.use(
  cors({
    origin: config.corsOrigin,
  }),
);
app.use(express.json());

app.use("/api/contest", routes);

const server = createServer(app);
attachContestWebSocket(server);

server.listen(config.port, () => {
  logContestBackendEnv();
  console.log(`[contest-backend] listening on http://localhost:${config.port}`);
});
