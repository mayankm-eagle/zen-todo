import { sync } from "./_lib/server.js";

export function POST(req: Request) {
  return sync(req);
}
