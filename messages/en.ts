/**
 * Settings chrome dictionary. English is the source; every other locale
 * mirrors this shape (messages/tr). The settings shell and the Thursday
 * section read it; other section bodies move over one by one.
 */
export type ThursdayDict = {
  footer: string;
  groups: {
    captions: string;
    models: string;
    starting: string;
    running: string;
    history: string;
  };
  captionsAria: string;
  captionCenter: { label: string; hint: string };
  captionSides: { label: string; hint: string };
  modelsNotePlan: string;
  modelsNoteKey: string;
  modelsNoteSuffix: string;
  voiceSection: string;
  onPlan: string;
  byMinute: string;
  backendSection: string;
  perToken: string;
  runsOn: string;
  runsOnAria: string;
  gptLabel: string;
  keyLabel: string;
  lineNeedsPlan: (plan: string) => string;
  lineNeedsSignIn: string;
  lineNeedsKey: string;
  voiceBlock: string;
  planVoiceAria: string;
  styleBlock: string;
  styleHint: string;
  yourOwn: string;
  yourOwnAbout: string;
  yourOwnPlaceholder: string;
  yourOwnAria: string;
  modelBlock: string;
  backendModelAria: string;
  otherModelPlaceholder: string;
  otherModelAria: string;
  effortBlock: string;
  toolsBlock: string;
  webSearch: string;
  readSkills: string;
  searchNote: string;
  skillsNote: (count: number) => string;
  noSkills: string;
  instructionsBlock: string;
  instructionsPlaceholder: string;
  instructionsAria: string;
  noLineTitle: string;
  noLineHint: string;
  signInAgain: string;
  planNoCalls: (plan: string) => string;
  planSignInHint: string;
  keyHint: string;
  runsMeanwhile: (label: string) => string;
  keyRowNone: string;
  keyRowPlanNoCalls: (plan: string) => string;
  keyRowHint: string;
  personas: Record<string, { label: string; about: string }>;
  wakeTitle: string;
  wakeSwitch: string;
  wakeAria: string;
  wakeOff: string;
  wakeNotEnglish: string;
  wakeTerse: string;
  wakeOn: string;
  shortcutTitle: string;
  shortcutSwitch: string;
  shortcutRecording: string;
  shortcutEmpty: string;
  shortcutBare: string;
  shortcutListening: string;
  shortcutFocused: string;
  shortcutOff: string;
  callBackTitle: string;
  callBackAria: string;
  callBackNames: Record<"off" | "waiting" | "any", string>;
  callBackHint: Record<"off" | "waiting" | "any", string>;
  callBackNeedsTab: string;
  resetTitle: string;
  resetHint: string;
  resetButton: string;
  resetConfirmTitle: string;
  resetConfirmBody: string;
  resetConfirmOk: string;
  resetWiped: (calls: number, threads: number, notes: number) => string;
  runningUpdateTo: (to: string) => string;
  runningRestarting: string;
  runningOut: (version: string) => string;
  runningStop: string;
  runningKeep: string;
  runningMoveTo: string;
  runningMovePress: string;
  runningMacOnly: string;
  runningUnreached: string;
  runningUpdateFail: (to: string) => string;
  runningUpdate: string;
  runningTitles: Record<
    "background" | "terminal" | "source" | "elsewhere",
    string
  >;
  runningHints: Record<
    "background" | "terminal" | "source" | "elsewhere",
    string
  >;
  copy: string;
  copied: string;
  callHistoryTitle: string;
  callHistoryHint: string;
  callLogTitle: string;
  callLogDescription: (scroll: boolean) => string;
  callLogEmpty: string;
  deleteAll: string;
  deleteAllTitle: string;
  deleteAllBody: string;
  deleteAllOk: string;
  deletedCount: (count: number) => string;
  callDeleted: string;
  deleteCallTitle: (when: string) => string;
  deleteCallBody: string;
  deleteOk: string;
  deleteCallAria: string;
  onTheLine: string;
  inWriting: string;
  jobWords: Record<"running" | "waiting" | "done" | "cancelled", string>;
};

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
  thursday: ThursdayDict;
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
  thursday: {
    footer:
      "Both of her prompts are assembled fresh on every call — memory, the roster and your skills go in. Changes here apply from the next call.",
    groups: {
      captions: "Captions",
      models: "Models",
      starting: "Starting a call",
      running: "Running",
      history: "History",
    },
    captionsAria: "Captions",
    captionCenter: {
      label: "Her last line",
      hint: "One caption under the mark — only what she said.",
    },
    captionSides: {
      label: "Both sides",
      hint: "Hers on the left, yours on the right. Click a line to read it again.",
    },
    modelsNotePlan: "Both run on your GPT Subscription",
    modelsNoteKey: "Both run on your OpenAI key",
    modelsNoteSuffix: "Instructions are saved when you leave the field.",
    voiceSection: "Voice",
    onPlan: "on your plan",
    byMinute: "billed by the minute",
    backendSection: "Backend",
    perToken: "billed per token",
    runsOn: "runs on",
    runsOnAria: "What a call runs on",
    gptLabel: "GPT Subscription",
    keyLabel: "OpenAI key",
    lineNeedsPlan: (plan) => ` · ${plan || "plan"} · no calls`,
    lineNeedsSignIn: " · sign in",
    lineNeedsKey: " · add",
    voiceBlock: "voice",
    planVoiceAria: "Voice on the GPT Subscription",
    styleBlock: "style",
    styleHint: "How she talks to you. It never changes what she can do.",
    yourOwn: "Your own",
    yourOwnAbout: "Say it in your words, over the one above.",
    yourOwnPlaceholder: "Quieter. Don't explain things I didn't ask about.",
    yourOwnAria: "In your own words",
    modelBlock: "model",
    backendModelAria: "Backend model",
    otherModelPlaceholder: "Other model id",
    otherModelAria: "Other backend model id",
    effortBlock: "effort",
    toolsBlock: "tools",
    webSearch: "Search the web",
    readSkills: "Read skills herself",
    searchNote: "Each search adds to the backend's OpenAI usage.",
    skillsNote: (count) =>
      `The same ${count} a bot reads. Each one she opens spends a page of the call on it.`,
    noSkills: "Nothing installed yet — there is nothing for her to read.",
    instructionsBlock: "instructions",
    instructionsPlaceholder:
      "How work should be handed over, what to check first.",
    instructionsAria: "Backend instructions",
    noLineTitle: "No GPT Subscription or OpenAI key",
    noLineHint: "Her voice and the backend both run on one of them",
    signInAgain: "Sign in again",
    planNoCalls: (plan) =>
      `The ${plan} plan runs bots and calls in writing, but not spoken calls. Sign in again with a paid plan.`,
    planSignInHint:
      "Sign in with ChatGPT and calls run on your plan, with no bill by the minute.",
    keyHint:
      "Paste an OpenAI API key. OpenAI bills a call by the minute, apart from ChatGPT.",
    runsMeanwhile: (label) => ` Until then a call runs on your ${label}.`,
    keyRowNone: "No GPT Subscription or OpenAI key",
    keyRowPlanNoCalls: (plan) =>
      `Your ${plan ? `${plan} ` : ""}plan has no spoken calls`,
    keyRowHint: "Her voice and the backend both run on one of them",
    personas: {
      sunny: {
        label: "Bright",
        about: "Quick to laugh. Asks about your day and remembers it.",
      },
      calm: { label: "Calm", about: "Unhurried. Listens more than she talks." },
      straight: {
        label: "Straight",
        about: "Dry and direct. No flattery, no filler.",
      },
      rough: {
        label: "Rough",
        about: "Blunt, loud, swears a bit. All heart.",
      },
    },
    wakeTitle: "Wake phrase",
    wakeSwitch: "Answer to her name",
    wakeAria: "Wake phrase",
    wakeOff:
      "Between calls, the browser listens for it and picks up — Chrome by sending what it hears to Google.",
    wakeNotEnglish: "English words only — she listens for it in English.",
    wakeTerse: "One word will wake her by accident — say hello first.",
    wakeOn: "Heard loosely, in English. Near misses count.",
    shortcutTitle: "Shortcut",
    shortcutSwitch: "Answer to a key",
    shortcutRecording: "Press the keys…",
    shortcutEmpty: "Set a shortcut",
    shortcutBare: "Hold Ctrl, Alt or Cmd — a plain key is typing.",
    shortcutListening: "Esc to keep the one you have.",
    shortcutFocused: "Only while this tab has focus. Not while you are typing.",
    shortcutOff: "Starts a call, and ends the one that is running.",
    callBackTitle: "She calls you",
    callBackAria: "She calls you",
    callBackNames: {
      off: "Never",
      waiting: "When a job needs me",
      any: "Whenever a job ends",
    },
    callBackHint: {
      off: "Nothing opens a call but you.",
      waiting: "A job that stopped to ask gets her to ring you.",
      any: "Anything a bot finishes, she rings you to tell you.",
    },
    callBackNeedsTab:
      "Needs this tab open. It rings until you answer, decline or let it go.",
    resetTitle: "Reset history",
    resetHint: "Calls, jobs and memory. Keys and bots stay.",
    resetButton: "Reset",
    resetConfirmTitle: "Reset history?",
    resetConfirmBody:
      "Every call, every job and everything she remembers is deleted for good. Keys, bots and connectors stay, and so does what each bot keeps for itself.",
    resetConfirmOk: "Reset",
    resetWiped: (calls, threads, notes) =>
      `Wiped ${calls} calls, ${threads} jobs, ${notes} notes`,
    runningUpdateTo: (to) => `Updating to ${to}…`,
    runningRestarting: "Thursday restarts in a moment.",
    runningOut: (version) => `${version} is out.`,
    runningStop: "To stop it",
    runningKeep: "To keep it running without one, press Ctrl+C there and run",
    runningMoveTo: "To move to it",
    runningMovePress: "To move to it, press Ctrl+C there and run",
    runningMacOnly: " Running in the background is macOS only for now.",
    runningUnreached: " npm could not be asked for a newer version.",
    runningUpdateFail: (to) => `Could not update to ${to}.`,
    runningUpdate: "Update",
    runningTitles: {
      background: "In the background",
      terminal: "In a terminal",
      source: "From source",
      elsewhere: "Started by something else",
    },
    runningHints: {
      background: "Starts when you log in, and comes back if it stops.",
      terminal: "Closing that terminal stops Thursday.",
      source: "pnpm dev in a terminal. Closing it stops Thursday.",
      elsewhere: "It stops the way it was started.",
    },
    copy: "Copy",
    copied: "Copied",
    callHistoryTitle: "Call history",
    callHistoryHint: "Every call, word for word — hers and yours",
    callLogTitle: "Call history",
    callLogDescription: (scroll) =>
      `Everything said on the line, oldest at the top.${scroll ? " Scroll up for older calls." : ""}`,
    callLogEmpty:
      "No calls yet. Everything said on the line is kept here — hers and yours, in the order it was said.",
    deleteAll: "Delete all",
    deleteAllTitle: "Delete every call?",
    deleteAllBody:
      "Every turn of every call goes — and she stops reading any of it back into the next call. A call still on the line stays.",
    deleteAllOk: "Delete all",
    deletedCount: (count) =>
      count === 1 ? "1 call deleted" : `${count} calls deleted`,
    callDeleted: "Call deleted",
    deleteCallTitle: (when) => `Delete the call from ${when}?`,
    deleteCallBody:
      "Every turn of it goes — and she stops reading it back into the next call.",
    deleteOk: "Delete",
    deleteCallAria: "Delete this call",
    onTheLine: "on the line",
    inWriting: "in writing",
    jobWords: {
      running: "working",
      waiting: "waiting on you",
      done: "done",
      cancelled: "stopped",
    },
  },
};
