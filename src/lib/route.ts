import { useEffect, useState } from "react";

export type Route =
  | { name: "today" }
  | { name: "upcoming" }
  | { name: "inbox" }
  | { name: "priority" }
  | { name: "projects" }
  | { name: "project"; id: string };

export function parse(hash: string): Route {
  const [, name, id] = hash.replace(/^#/, "").split("/");
  switch (name) {
    case "upcoming":
    case "inbox":
    case "priority":
    case "projects":
      return { name };
    case "project":
      return id ? { name: "project", id: decodeURIComponent(id) } : { name: "projects" };
    default:
      return { name: "today" };
  }
}

export const href = (r: Route) => (r.name === "project" ? `#/project/${encodeURIComponent(r.id)}` : `#/${r.name}`);

export function go(r: Route) {
  window.location.hash = href(r);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
