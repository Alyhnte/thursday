import type { Locale } from "@/lib/locale";
import {
  type BotDict,
  en,
  type FilesDict,
  type McpDict,
  type MemoryDict,
  type RoutineDict,
  type SettingsDict,
  type SkillsDict,
  type ThreadsDict,
  type ThursdayDict,
  type WorkspaceDict,
} from "./en";
import { tr } from "./tr";

const DICTS: Record<Locale, SettingsDict> = { en, tr };

export function settingsDictOf(locale: Locale): SettingsDict {
  return DICTS[locale];
}

export type {
  BotDict,
  FilesDict,
  McpDict,
  MemoryDict,
  RoutineDict,
  SettingsDict,
  SkillsDict,
  ThreadsDict,
  ThursdayDict,
  WorkspaceDict,
};
