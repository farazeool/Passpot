"use client";

import { useEffect } from "react";

/** Sets the browser tab title for client pages: "Ayesha's family circle · Rota". */
export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · Rota`;
  }, [title]);
}
