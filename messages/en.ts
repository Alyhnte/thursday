/**
 * Settings chrome dictionary. English is the source; every other locale
 * mirrors this shape (messages/tr). Only the settings shell reads it —
 * section bodies keep their own words until they move over one by one.
 */
export type SettingsDict = {
  dialogTitle: string;
  navLabel: string;
  groups: Record<"call" | "work" | "app" | "community", string>;
  sections: Record<
    | "thursday"
    | "memory"
    | "bot"
    | "threads"
    | "routines"
    | "files"
    | "skills"
    | "mcp"
    | "signins"
    | "models"
    | "keys"
    | "phone",
    { label: string; hint: string }
  >;
  fileTabs: { finished: string; allFiles: string };
  tabbedLabel: string;
  themeLabel: string;
  themes: Record<"system" | "light" | "dark", string>;
  languageLabel: string;
  languageHint: string;
};

export const en: SettingsDict = {
  dialogTitle: "Settings",
  navLabel: "Settings sections",
  groups: {
    call: "call",
    work: "work",
    app: "app",
    community: "community",
  },
  sections: {
    thursday: {
      label: "Thursday",
      hint: "Captions, models, and how a call starts",
    },
    memory: { label: "Memory", hint: "What Thursday remembers about you" },
    bot: { label: "Bots", hint: "Who Thursday hands work to" },
    threads: { label: "Threads", hint: "Work the bots were handed" },
    routines: {
      label: "Routines",
      hint: "Work that starts by itself, on a schedule",
    },
    files: {
      label: "Files",
      hint: "What the bots finished, and everything else they wrote",
    },
    skills: { label: "Skills", hint: "Instructions the bots load on demand" },
    mcp: {
      label: "Connectors",
      hint: "Apps the bots can use, from MCP servers",
    },
    signins: {
      label: "Sign-ins",
      hint: "The sites you signed in to, and the bots that may use each",
    },
    models: {
      label: "Models",
      hint: "What bots think with, and what they draw, film and speak with",
    },
    keys: { label: "API keys", hint: "The accounts the app runs on" },
    phone: {
      label: "Phone",
      hint: "Write to Thursday from a chat app or by email",
    },
  },
  fileTabs: { finished: "Finished", allFiles: "All files" },
  tabbedLabel: "Screens of this section",
  themeLabel: "Theme",
  themes: { system: "System", light: "Light", dark: "Dark" },
  languageLabel: "Language",
  languageHint: "Settings screens read in this language.",
};
