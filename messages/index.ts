import type { Locale } from "@/lib/locale";
import {
  type BotDict,
  en,
  type MemoryDict,
  type RoutineDict,
  type SettingsDict,
  type ThreadsDict,
  type ThursdayDict,
} from "./en";
import { tr } from "./tr";

const DICTS: Record<Locale, SettingsDict> = { en, tr };

export function settingsDictOf(locale: Locale): SettingsDict {
  return DICTS[locale];
}

export type {
  BotDict,
  MemoryDict,
  RoutineDict,
  SettingsDict,
  ThreadsDict,
  ThursdayDict,
};
