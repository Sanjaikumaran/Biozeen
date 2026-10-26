import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { config } from "../config.js";
import { sessionUser } from "../middleware/auth.js";

let io: Server | null = null;

function cookieValue(header: string | undefined, name: string) {
  for (const part of header?.split(";") ?? []) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** Live channel for notifications. Sockets authenticate with the same session cookie as the API. */
export function attachRealtime(server: HttpServer) {
  io = new Server(server, { path: "/api/socket", cors: { origin: config.clientOrigins, credentials: true }, serveClient: false });
  io.use(async (socket, next) => {
    const origin = socket.handshake.headers.origin;
    if (origin && !config.clientOrigins.includes(origin)) return next(new Error("Origin not allowed"));
    const token = cookieValue(socket.handshake.headers.cookie, config.cookieName);
    const user = token ? await sessionUser(token) : null;
    if (!user) return next(new Error("Not signed in"));
    socket.data.userId = user.id;
    next();
  });
  io.on("connection", (socket) => {
    void socket.join(`user:${socket.data.userId as string}`);
  });
  return io;
}

export function emitToUsers(userIds: string[], event: string, payload: unknown) {
  if (io && userIds.length) io.to(userIds.map((id) => `user:${id}`)).emit(event, payload);
}

/** Close a user's live connections, e.g. after suspension or "sign out everywhere". */
export function disconnectUser(userId: string) {
  io?.in(`user:${userId}`).disconnectSockets(true);
}
