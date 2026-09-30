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

export type MemoryDict = {
  editWithModel: string;
  notesFacts: (notes: number, facts: number, more: boolean) => string;
  newNote: string;
  filter: string;
  nothingMatches: string;
  sections: Record<string, string>;
  forgetNoteTitle: (path: string) => string;
  forgetNoteBody: string;
  deleteOk: string;
  factOne: string;
  factMany: string;
  lastRead: string;
  neverRead: string;
  editNoteLine: string;
  forgetNote: string;
  noteLineAria: string;
  noteLinePlaceholder: string;
  save: string;
  cancel: string;
  addFactAria: string;
  addFactPlaceholder: string;
  add: string;
  forgetFactTitle: string;
  forgetFactBody: (text: string) => string;
  factAria: string;
  editFact: string;
  forgetFact: string;
  sources: Record<string, string>;
  kinds: Record<string, string>;
  kindPlaceholders: Record<string, string>;
  kindFacts: Record<string, string>;
  newNoteTitle: string;
  newNoteDesc: string;
  create: string;
  kindLabel: string;
  nameLabel: string;
  summaryLabel: string;
  factsLabel: string;
  summaryPlaceholder: string;
  factsPlaceholder: (fact: string) => string;
  editMemoryAria: string;
  sendAria: string;
  editPlaceholder: string;
};

export type ThreadsDict = {
  clearTitle: string;
  clearBody: string;
  clearOk: string;
  deleteTitle: (label: string) => string;
  deleteBody: string;
  deleteOk: string;
  filter: string;
  resultCount: (shown: number, total: number) => string;
  emptyMatch: string;
  emptyFresh: string;
  railShown: (count: number) => string;
  railWaiting: (count: number) => string;
  railUnread: (count: number) => string;
  clearFinished: string;
  routineTitle: string;
  closeThread: string;
  menuMore: string;
  stop: string;
  delete: string;
  stopped: string;
  doneDefault: string;
  takingOn: (bot: string) => string;
  stepOne: string;
  stepMany: string;
};

export type RoutineDict = {
  startsNote: string;
  railSetUp: (total: number, on: number) => string;
  railMost: (max: number) => string;
  newRoutine: string;
  empty: string;
  notRunYet: string;
  offBefore: string;
  botOff: (bot: string) => string;
  botGone: (bot: string) => string;
  runningNow: string;
  lastWaits: (said: string) => string;
  nextPrefix: string;
  offWord: string;
  onOrOff: (label: string) => string;
  openRoutine: (label: string) => string;
  deleteTitle: (label: string) => string;
  deleteBody: string;
  deleteOk: string;
  newTitle: string;
  moreActions: string;
  deleteAction: string;
  closeRoutine: string;
  nameField: string;
  namePlaceholder: string;
  nameHint: string;
  botField: string;
  botHint: string;
  pickBot: string;
  whenField: string;
  howStarts: string;
  kindOnce: string;
  kindDaily: string;
  kindEvery: string;
  onWord: string;
  atWord: string;
  orWord: string;
  inAnHour: string;
  everyWord: string;
  hoursWord: string;
  dayNames: string[];
  dayWords: string[];
  monthNames: string[];
  daySets: { label: string; days: number[] }[];
  jobField: string;
  jobPlaceholder: string;
  jobHint: string;
  runsWord: string;
  notRunYetLine: string;
  stopped: string;
  noWords: string;
  stillNeeds: (missing: string) => string;
  missingName: string;
  missingBot: string;
  missingTime: string;
  missingTimeAhead: string;
  missingJob: string;
  missingNothing: string;
  missingAnd: string;
  save: string;
  lastRunOpen: string;
  runNow: string;
  create: string;
  today: string;
  tomorrow: string;
  anotherDay: string;
  timeOfDay: string;
  timePassed: string;
  pickTimeAndDay: string;
  pickTime: string;
  switchesOff: string;
  firstStart: string;
  nextRun: (when: string) => string;
  scheduleOnce: (date: string) => string;
  scheduleEveryHour: string;
  scheduleEveryHours: (hours: number) => string;
  scheduleDaily: (time: string) => string;
  scheduleDailyDays: (time: string, names: string) => string;
  scheduleDayTime: (day: string, time: string) => string;
  nowWord: string;
  yesterdayWord: string;
};

export type BotDict = {
  botsMost: (count: number, max: number) => string;
  newBot: string;
  crowded: (count: number, app: string) => string;
  emptyPitch: (app: string) => string;
  readyMade: string;
  addDialogTitle: string;
  addDialogDesc: string;
  addDialogTail: string;
  alreadyAdded: string;
  cancel: string;
  addOne: (name: string) => string;
  addMany: (count: number) => string;
  readyMadeAria: (count: number) => string;
  roomFits: (room: number) => string;
  noteFullTick: string;
  noteFullUnticked: (wanted: number, fit: string) => string;
  noteNone: string;
  noteSome: (wanted: number, total: number) => string;
  needsMedia: (needs: string) => string;
  needsAnd: string;
  mediaWords: Record<string, string>;
  createdOk: string;
  deletedOk: string;
  deleteTitle: (name: string) => string;
  deleteBody: (app: string) => string;
  deleteOk: string;
  clearLineTitle: (name: string) => string;
  clearLineBody: (app: string) => string;
  clearOk: string;
  newBotTitle: string;
  offWord: string;
  onOrOffBot: (name: string) => string;
  handWorkTip: (app: string) => string;
  deleteBotAria: string;
  nameRow: string;
  namePlaceholder: string;
  nameHintMade: (app: string) => string;
  nameHintNew: (app: string, max: number) => string;
  descRow: string;
  descPlaceholder: string;
  descHint: (app: string) => string;
  clearLineAria: string;
  mayAddLine: (name: string) => string;
  mayAddLineHint: string;
  runsOnRow: string;
  runsOnHint: string;
  appDefaultHint: string;
  effortRow: string;
  effortHint: string;
  compactRow: string;
  compactFromDefault: string;
  compactUnit: string;
  compactSummary: string;
  compactFromDefaultLong: (summarize: string) => string;
  compactHandDefault: (summarize: string) => string;
  compactHandModel: (summarize: string) => string;
  compactPct: (pct: number, k: string, summarize: string) => string;
  compactUnknown: (summarize: string) => string;
  toolsRow: string;
  promptRow: string;
  promptPlaceholder: string;
  memoryWord: string;
  fileOne: string;
  fileMany: (count: number) => string;
  showInManager: string;
  folderWord: string;
  nothingKept: string;
  deleteFileTitle: (file: string) => string;
  deleteFileBody: (bot: string) => string;
  deleteFileAria: (file: string) => string;
  fileDeletedOk: string;
  railOff: string;
  tokensSome: (count: string) => string;
  tokensNone: string;
  sinceWord: string;
  needsMissing: (missing: string) => string;
  keepMemory: string;
  createBot: string;
  missingName: string;
  missingDesc: string;
  recentWord: string;
  historyWord: string;
  recentEmpty: string;
  jobWaiting: string;
  jobWorking: string;
  jobStopped: string;
  jobDone: string;
  pinHint: string;
  pickTools: string;
  unpinTool: (name: string) => string;
  loadedHint: string;
  searchTools: string;
  nothingMatches: string;
  rosterWaiting: string;
  rosterWorking: (label: string) => string;
  rosterOff: string;
  rosterIdleNone: string;
  rosterIdleLast: (ago: string) => string;
  justNow: string;
  agoWord: (ago: string) => string;
  seedHints: Record<string, string>;
};

export type FilesDict = {
  finishedWord: string;
  countEmpty: string;
  resultOne: string;
  resultMany: string;
  countResults: (shown: number, total: string) => string;
  countFiles: (files: string) => string;
  revealFolder: string;
  filter: string;
  everyone: string;
  unsorted: string;
  showMore: (more: number, total: string) => string;
  deletedOk: string;
  deleteTitle: (name: string) => string;
  deleteFileBody: string;
  deleteFolderBody: string;
  deleteOk: string;
  shelfWord: string;
  fileWord: string;
  filesWord: string;
  openNewTab: string;
  revealManager: string;
  deleteAria: string;
  setEmpty: string;
  setRest: (shown: number, total: string) => string;
  nothingEmpty: string;
  nothingPick: string;
};

export type WorkspaceDict = {
  scratchDone: string;
  emptyScratchTitle: string;
  emptyScratchBody: (
    scratch: string,
    artifacts: string,
    projects: string,
  ) => string;
  emptyScratchOk: string;
  revealFolder: string;
  emptyScratchBtn: string;
  filter: string;
  nothingMatches: string;
  emptyFolder: string;
  foldersWord: string;
  filesWord: string;
  showMore: (more: number, total: string) => string;
  folderOne: string;
  folderMany: string;
  fileOne: string;
  fileMany: string;
  countEmpty: string;
  countOf: (total: string) => string;
  nothingEmptyHead: string;
  nothingEmptyTail: string;
  pickFile: string;
  nothingListed: string;
  fileDeletedOk: string;
  deleteTitle: (name: string) => string;
  deleteBody: string;
  deleteOk: string;
  openNewTab: string;
  revealManager: string;
  deleteAria: string;
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
  memory: MemoryDict;
  threads: ThreadsDict;
  routine: RoutineDict;
  bot: BotDict;
  files: FilesDict;
  workspace: WorkspaceDict;
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
  memory: {
    editWithModel: "Edit with a model",
    notesFacts: (notes, facts, more) =>
      `${notes}${more ? "+" : ""} notes · ${facts}${more ? "+" : ""} facts`,
    newNote: "New note",
    filter: "Filter memory",
    nothingMatches: "Nothing matches",
    sections: {
      you: "You",
      people: "People",
      projects: "Projects",
      topics: "Topics",
      other: "Other",
    },
    forgetNoteTitle: (path) => `Forget ${path}?`,
    forgetNoteBody: "Every fact in this note is deleted for good.",
    deleteOk: "Delete",
    factOne: "fact",
    factMany: "facts",
    lastRead: "Last read back",
    neverRead: "Never read back",
    editNoteLine: "Edit the note's line",
    forgetNote: "Forget this note",
    noteLineAria: "The note's line",
    noteLinePlaceholder: "One line Thursday sees in her list",
    save: "Save",
    cancel: "Cancel",
    addFactAria: "Add a fact",
    addFactPlaceholder: "Add a fact",
    add: "Add",
    forgetFactTitle: "Forget this fact?",
    forgetFactBody: (text) => `"${text}" is deleted for good.`,
    factAria: "Fact",
    editFact: "Edit this fact",
    forgetFact: "Forget this fact",
    sources: { you: "you", call: "on a call", bot: "a bot" },
    kinds: { people: "Person", projects: "Project", topics: "Topic" },
    kindPlaceholders: {
      people: "alex",
      projects: "thursday",
      topics: "scheduling",
    },
    kindFacts: {
      people: "Moved to the platform team in March",
      projects: "Ships behind a feature flag until April",
      topics: "No meetings before 10am",
    },
    newNoteTitle: "New note",
    newNoteDesc: "Where Thursday keeps what she learns about this.",
    create: "Create",
    kindLabel: "Kind",
    nameLabel: "Name",
    summaryLabel: "Summary",
    factsLabel: "Facts",
    summaryPlaceholder: "One line Thursday sees in her list",
    factsPlaceholder: (fact) => `One per line\n${fact}`,
    editMemoryAria: "Edit memory",
    sendAria: "Send",
    editPlaceholder: "Tell memory what changed",
  },
  threads: {
    clearTitle: "Clear finished jobs?",
    clearBody:
      "Everything done or stopped goes, messages included. Running and waiting jobs stay.",
    clearOk: "Clear",
    deleteTitle: (label) => `Delete "${label}"?`,
    deleteBody: "Its messages go with it — nothing can be picked back up.",
    deleteOk: "Delete",
    filter: "Filter by label, bot or word",
    resultCount: (shown, total) => `${shown} of ${total}`,
    emptyMatch: "Nothing here matches. Keep scrolling to search further back.",
    emptyFresh:
      "Nothing yet. When Thursday hands a job to a bot mid-call, it shows up here — while it runs, and after.",
    railShown: (count) => `${count} shown`,
    railWaiting: (count) => ` · ${count} waiting on you`,
    railUnread: (count) => ` · ${count} new result${count === 1 ? "" : "s"}`,
    clearFinished: "Clear finished",
    routineTitle: "Started by a routine",
    closeThread: "Close the thread",
    menuMore: "More",
    stop: "Stop",
    delete: "Delete",
    stopped: "Stopped",
    doneDefault: "Done",
    takingOn: (bot) => `${bot} is taking it on…`,
    stepOne: "step",
    stepMany: "steps",
  },
  routine: {
    startsNote:
      "Starts while Thursday is running on this computer, whether or not a tab is open. A time that passed meanwhile starts once, not once for each.",
    railSetUp: (total, on) => `${total} set up · ${on} on`,
    railMost: (max) => ` · ${max} is the most`,
    newRoutine: "New routine",
    empty:
      'Nothing starts by itself yet. Tell Thursday what should — "every weekday at nine, go through my mail" — or make one here.',
    notRunYet: "Not run yet",
    offBefore: "Off",
    botOff: (bot) => `${bot} is switched off`,
    botGone: (bot) => `${bot} is gone — pick another bot`,
    runningNow: "Running now",
    lastWaits: (said) => `The last run waits on you${said ? `: ${said}` : ""}`,
    nextPrefix: "next",
    offWord: "off",
    onOrOff: (label) => `${label} on or off`,
    openRoutine: (label) => `Open ${label}`,
    deleteTitle: (label) => `Delete "${label}"?`,
    deleteBody: "It starts no more. The jobs it already opened stay.",
    deleteOk: "Delete",
    newTitle: "New routine",
    moreActions: "More",
    deleteAction: "Delete",
    closeRoutine: "Close the routine",
    nameField: "Name",
    namePlaceholder: "e.g. Morning mail",
    nameHint:
      "What it is called in this list, and what she calls it on a call.",
    botField: "Bot",
    botHint: "Who does the job each time it starts.",
    pickBot: "Pick a bot",
    whenField: "When",
    howStarts: "How it starts",
    kindOnce: "Once",
    kindDaily: "On set days",
    kindEvery: "Every few hours",
    onWord: "On",
    atWord: "At",
    orWord: "or",
    inAnHour: "In an hour",
    everyWord: "Every",
    hoursWord: "hours",
    dayNames: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    dayWords: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ],
    daySets: [
      { label: "Every day", days: [1, 2, 3, 4, 5, 6, 7] },
      { label: "Weekdays", days: [1, 2, 3, 4, 5] },
      { label: "Weekends", days: [6, 7] },
    ],
    monthNames: [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ],
    jobField: "Job",
    jobPlaceholder:
      "e.g. Go through the mail that came since the last run and draft replies to what needs one. Send nothing.",
    jobHint:
      "Handed to the bot as a new thread each time, with a line on how the last run ended. Nobody is there to ask, so say everything it needs.",
    runsWord: "Runs",
    notRunYetLine: "Not run yet.",
    stopped: "Stopped",
    noWords: "No words",
    stillNeeds: (missing) => `Still needs ${missing}.`,
    missingName: "a name",
    missingBot: "a bot",
    missingTime: "a time",
    missingTimeAhead: "a time still ahead",
    missingJob: "a job",
    missingNothing: "nothing",
    missingAnd: "and",
    save: "Save",
    lastRunOpen: "Its last run is still open",
    runNow: "Run now",
    create: "Create",
    today: "Today",
    tomorrow: "Tomorrow",
    anotherDay: "Another day",
    timeOfDay: "Time of day",
    timePassed: "That time has passed. Pick a later one.",
    pickTimeAndDay: "Pick a time and at least one day.",
    pickTime: "Pick a time.",
    switchesOff: "then it switches itself off",
    firstStart: "first start",
    nextRun: (when) => `next ${when}`,
    scheduleOnce: (date) => `Once · ${date}`,
    scheduleEveryHour: "Every hour",
    scheduleEveryHours: (hours) => `Every ${hours} hours`,
    scheduleDaily: (time) => `Daily ${time}`,
    scheduleDailyDays: (time, names) => `Daily ${time} · ${names}`,
    scheduleDayTime: (day, time) => `${day} ${time}`,
    nowWord: "now",
    yesterdayWord: "Yesterday",
  },
  files: {
    finishedWord: "finished",
    countEmpty: "empty",
    resultOne: "result",
    resultMany: "results",
    countResults: (shown, total) => `${shown} of ${total} results`,
    countFiles: (files) => ` · ${files} files`,
    revealFolder: "Reveal folder",
    filter: "Filter files",
    everyone: "Everyone",
    unsorted: "Unsorted",
    showMore: (more, total) => `Show ${more} more of ${total}`,
    deletedOk: "Deleted",
    deleteTitle: (name) => `Delete ${name}?`,
    deleteFileBody: "It is deleted from disk for good.",
    deleteFolderBody:
      "The folder and everything in it are deleted from disk for good.",
    deleteOk: "Delete",
    shelfWord: "Shelf",
    fileWord: "file",
    filesWord: "files",
    openNewTab: "Open in a new tab",
    revealManager: "Reveal in the file manager",
    deleteAria: "Delete",
    setEmpty: "Nothing in here the app can open.",
    setRest: (shown, total) =>
      `${shown} of ${total} — the rest are in the folder`,
    nothingEmpty:
      "Nothing finished yet. When a bot ends a job with something to hand over — a page, a report, a set of pictures — it lands here.",
    nothingPick:
      "Pick something on the left. Each bot's work is under its face; a folder it filled is one row, and opens as a sheet.",
  },
  workspace: {
    scratchDone: "Scratch emptied",
    emptyScratchTitle: "Empty scratch?",
    emptyScratchBody: (scratch, artifacts, projects) =>
      `Everything under ${scratch}/ is deleted for good. ${artifacts}/ and ${projects}/ are untouched.`,
    emptyScratchOk: "Empty",
    revealFolder: "Reveal folder",
    emptyScratchBtn: "Empty scratch",
    filter: "Filter this folder",
    nothingMatches: "Nothing matches",
    emptyFolder: "Empty folder",
    foldersWord: "folders",
    filesWord: "files",
    showMore: (more, total) => `Show ${more} more of ${total}`,
    folderOne: "folder",
    folderMany: "folders",
    fileOne: "file",
    fileMany: "files",
    countEmpty: "empty",
    countOf: (total) => ` of ${total}`,
    nothingEmptyHead:
      "Nothing here yet. What a bot writes during a call lands in",
    nothingEmptyTail:
      "— a page, a table, a picture — and shows up here to open.",
    pickFile: "Pick a file on the left.",
    nothingListed:
      "Only what the app can open is listed — a page, a table, a picture, a note. Installed packages and tool leftovers are left out, and no folder is measured, so a folder opens as fast as it lists. Reveal folder, at the foot, opens everything else.",
    fileDeletedOk: "File deleted",
    deleteTitle: (name) => `Delete ${name}?`,
    deleteBody: "It is deleted from disk for good.",
    deleteOk: "Delete",
    openNewTab: "Open in a new tab",
    revealManager: "Reveal in the file manager",
    deleteAria: "Delete",
  },
  bot: {
    botsMost: (count, max) => `${count} bots · ${max} is the most`,
    newBot: "New bot",
    crowded: (count, app) =>
      `${count} bots are on. Each is a line in every prompt, and one more for ${app} to choose between.`,
    emptyPitch: (app) =>
      `${app} talks; bots do the rest — search the web, draft a reply, check a schedule. Give one a job and a model, and work gets handed over mid-call while the conversation keeps going.`,
    readyMade: "Ready-made",
    addDialogTitle: "Bots you can add",
    addDialogDesc:
      "Each one is a starting point — re-prompt it, give it a model of its own. What a bot needs before it can work stands on its row.",
    addDialogTail:
      "What a bot needs before it can work stands on its row; until then it runs on the app default model.",
    alreadyAdded: "already added",
    cancel: "Cancel",
    addOne: (name) => `Add ${name}`,
    addMany: (count) => `Add ${count} bots`,
    readyMadeAria: (count) => `Ready-made bots, ${count} on offer`,
    roomFits: (room) => `${room} more ${room === 1 ? "fits" : "fit"}`,
    noteFullTick: "untick one to pick another",
    noteFullUnticked: (wanted, fit) => `${wanted} ticked · ${fit}`,
    noteNone: "nothing ticked",
    noteSome: (wanted, total) => `${wanted} of ${total} ticked`,
    needsMedia: (needs) => `needs ${needs}`,
    needsAnd: "and",
    mediaWords: {
      image: "an image model",
      video: "a video model",
      speech: "a speech model",
      transcription: "a transcription model",
    },
    createdOk: "Bot created",
    deletedOk: "Bot deleted",
    deleteTitle: (name) => `Delete ${name}?`,
    deleteBody: (app) =>
      `${app} can no longer hand work to it, and what it kept for itself goes with it: its memory and the skills it installed. What it finished stays in Settings › Files, under its name.`,
    deleteOk: "Delete",
    clearLineTitle: (name) => `Clear ${name}'s line?`,
    clearLineBody: (app) =>
      `${app} and the other bots read your description alone again.`,
    clearOk: "Clear",
    newBotTitle: "New bot",
    offWord: "off",
    onOrOffBot: (name) => `${name} on or off`,
    handWorkTip: (app) => `${app} can hand it work`,
    deleteBotAria: "Delete this bot",
    nameRow: "Name",
    namePlaceholder: "e.g. researcher",
    nameHintMade: (app) =>
      `What ${app} calls it when she hands it work. Fixed once the bot is made.`,
    nameHintNew: (app, max) =>
      `What ${app} calls it when she hands it work. Up to ${max} characters, and it can’t be renamed later.`,
    descRow: "Description",
    descPlaceholder: "e.g. Searches the web and answers",
    descHint: (app) =>
      `The one line ${app} and the other bots read when they decide who gets a job.`,
    clearLineAria: "Clear its line",
    mayAddLine: (name) => `${name} may add its own line`,
    mayAddLineHint: "It may add its own line when its work changes for good",
    runsOnRow: "Runs on",
    runsOnHint:
      "What this bot thinks with. App default puts it back on the one in Settings › Models.",
    appDefaultHint: "App default model, and its effort with it.",
    effortRow: "Effort",
    effortHint:
      "How hard it thinks, on the steps this model takes. Auto leaves the step to the model.",
    compactRow: "Compacts at",
    compactFromDefault: "From the app default model",
    compactUnit: "k tokens",
    compactSummary: "A job summarizes itself here and carries on.",
    compactFromDefaultLong: (summarize: string) =>
      `Worked out from the app default model's context window at each run. ${summarize}`,
    compactHandDefault: (summarize: string) =>
      `Set by hand. Emptied, it is worked out from the app default model again. ${summarize}`,
    compactHandModel: (summarize: string) =>
      `Set by hand. Picking a model fills in its own again. ${summarize}`,
    compactPct: (pct: number, k: string, summarize: string) =>
      `${pct}% of this model's ${k}k context window. ${summarize}`,
    compactUnknown: (summarize: string) =>
      `This model's context window is unknown, so the default is filled in. ${summarize}`,
    toolsRow: "Tools",
    promptRow: "Prompt",
    promptPlaceholder:
      "How it should work (optional). e.g.\nSearch the web, answer with a short summary and links.",
    memoryWord: "Memory",
    fileOne: "1 file",
    fileMany: (count: number) => `${count} files`,
    showInManager: "Show in the file manager",
    folderWord: "Folder",
    nothingKept: "Nothing kept yet.",
    deleteFileTitle: (file) => `Delete ${file}?`,
    deleteFileBody: (bot) =>
      `It is deleted from disk for good, and ${bot}'s next job starts without it.`,
    deleteFileAria: (file) => `Delete ${file}`,
    fileDeletedOk: "File deleted",
    railOff: "off",
    tokensSome: (count) => `${count} tokens`,
    tokensNone: "no tokens yet",
    sinceWord: "since",
    needsMissing: (missing) => `Needs ${missing}`,
    keepMemory: "Bots keep their own memory",
    createBot: "Create bot",
    missingName: "a name",
    missingDesc: "a description",
    recentWord: "Recent",
    historyWord: "History",
    recentEmpty: "Nothing handed over yet.",
    jobWaiting: "waiting on you",
    jobWorking: "working",
    jobStopped: "stopped",
    jobDone: "done",
    pinHint:
      "Nothing to pin — connect an MCP server first (Settings › Connectors).",
    pickTools: "Pick tools",
    unpinTool: (name) => `Unpin ${name}`,
    loadedHint: "Loaded from the start — everything else stays searchable",
    searchTools: "Search tools",
    nothingMatches: "Nothing matches",
    rosterWaiting: "waiting on you",
    rosterWorking: (label) => `working · ${label}`,
    rosterOff: "off",
    rosterIdleNone: "idle · no jobs yet",
    rosterIdleLast: (ago) => `idle · last job ${ago}`,
    justNow: "just now",
    agoWord: (ago) => `${ago} ago`,
    seedHints: {
      Jarvis: "Takes whatever nobody else is for",
      Analyst: "Finds out, cites, and lays it out",
      Curator: "Brings what is worth their time",
      Concierge: "Takes errands to the last step",
      Designer: "Draws the options to pick from",
      Tutor: "Explains anything, a picture at a time",
      Writer: "Drafts it in their voice, ready to send",
    },
  },
};
