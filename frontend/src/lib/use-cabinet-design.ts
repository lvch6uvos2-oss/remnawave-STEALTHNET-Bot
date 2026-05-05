/**
 * Хук для чтения текущего дизайна кабинета (classic | stealth) из публичного
 * конфига. Кэшируется в localStorage чтобы при следующем открытии не было
 * мерцания дефолтного classic перед загрузкой.
 */

import { useEffect, useState } from "react";
import { api } from "./api";

export type CabinetDesign = "classic" | "stealth";

const CACHE_KEY = "cabinet_design_cache";

function readCache(): CabinetDesign {
  try {
    const v = localStorage.getItem(CACHE_KEY);
    return v === "stealth" ? "stealth" : "classic";
  } catch {
    return "classic";
  }
}

export function useCabinetDesign(): CabinetDesign {
  const [design, setDesign] = useState<CabinetDesign>(() => readCache());

  useEffect(() => {
    let alive = true;
    api.getPublicConfig()
      .then((cfg) => {
        if (!alive) return;
        const next = (cfg as { cabinetDesign?: CabinetDesign }).cabinetDesign === "stealth" ? "stealth" : "classic";
        setDesign(next);
        try { localStorage.setItem(CACHE_KEY, next); } catch { /* ignore */ }
      })
      .catch(() => { /* ignore — keep cached */ });
    return () => { alive = false; };
  }, []);

  return design;
}
