import { logout } from "./_lib/server.js";

export function POST(req: Request) {
  return logout(req);
}
