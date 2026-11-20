import { session } from "./_lib/server.js";

export function GET(req: Request) {
  return session(req);
}
