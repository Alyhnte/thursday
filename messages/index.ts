import type { Locale } from "@/lib/locale";
import { en, type SettingsDict } from "./en";
import { tr } from "./tr";

const DICTS: Record<Locale, SettingsDict> = { en, tr };

export function settingsDictOf(locale: Locale): SettingsDict {
  return DICTS[locale];
}

export type { SettingsDict };
