import { login } from "./_lib/server.js";

export function POST(req: Request) {
  return login(req);
}
