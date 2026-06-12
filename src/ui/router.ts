import { useCallback, useEffect, useState } from "react";

export interface Route {
  path: string;
  params: URLSearchParams;
}

function parse(): Route {
  const hash = location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = hash.split("?");
  return { path, params: new URLSearchParams(query) };
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(parse);

  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((to: string, replace = false) => {
    if (replace) location.replace(`#${to}`);
    else location.hash = to;
  }, []);

  return { ...route, navigate };
}
