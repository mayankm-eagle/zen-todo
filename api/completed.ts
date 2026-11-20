import { completed } from "./_lib/server.js";

export function GET(req: Request) {
  return completed(req);
}
