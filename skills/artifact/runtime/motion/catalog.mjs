// Every kind of scene in one line and one example, for `motion.mjs kinds`: what a bot reads to
// pick a scene and copy its shape. scripts/motion.test.mts puts every example through the
// schema, so an example here is always one that passes.

export const CATALOG = {
  // Words
  title: {
    about: "A headline, with a small kicker above and a line under it.",
    example: {
      kicker: "How it works",
      title: "Invoices that pay themselves",
      sub: "Upload, set rules, done",
    },
  },
  text: {
    about:
      "One line that builds itself — style rise, blur, type, slam (word by word on the beats), mask or decode; *marked* words get a marker, underline, circle, strike or color.",
    example: {
      text: "Make a video in *one* message",
      style: "rise",
      mark: "circle",
    },
  },
  swap: {
    about: "A fixed line with one word that rolls to the next on each beat.",
    example: {
      before: "Make a",
      words: ["deck", "video", "sheet"],
      after: "by asking",
    },
  },
  quote: {
    about: "A quote, its words fading in, with who said it.",
    example: { text: "Small steps, every day.", by: "A coach" },
  },
  chapter: {
    about: "A dark card that opens a new part: a number and a title.",
    example: { number: "02", title: "Make your own" },
  },
  lower: {
    about:
      "A name and role under someone speaking — over their own video, in an area.",
    example: { name: "Alex Kim", role: "Product lead" },
  },
  end: {
    about: "The closing card: a mark, a name and where to find it.",
    example: { icon: "bolt", title: "[PRODUCT]", sub: "[their address]" },
  },
  logo: {
    about:
      "A mark that lands, then the name letter by letter beside it, and a tagline.",
    example: { name: "[PRODUCT]", tagline: "[their line]", icon: "sparkle" },
  },
  // This app
  orb: {
    about: "Her letter orb, alive, speaking, with a line under it.",
    example: { label: "Just talk to her." },
  },
  call: {
    about:
      "A call as the app shows it: what you said on one side, her answer on the other, her orb between.",
    example: {
      you: "Find me flights to Osaka in October.",
      her: "On it. Concierge is looking.",
    },
  },
  bots: {
    about:
      "The bots' faces in a row, their names and roles; one can be shown at work.",
    example: {
      bots: [
        { name: "Concierge", role: "trips" },
        { name: "Designer", role: "screens" },
        { name: "Tutor", role: "explains" },
      ],
      active: 1,
    },
  },
  notify: {
    about: "A bot's card when its work is back, one after another.",
    example: {
      cards: [
        {
          bot: "Concierge",
          title: "Osaka flights, October",
          text: "Three fares compared. The Tuesday morning one is the pick.",
        },
      ],
    },
  },
  agent: {
    about:
      "A bot at work: each step shimmers while it runs and is ticked when done.",
    example: {
      bot: "Researcher",
      steps: ["Read 12 sources", "Compared prices", "Wrote the report"],
      done: "Finished",
    },
  },
  prompt: {
    about:
      "A request typed into a box and sent; the result comes back in the card under it.",
    example: {
      text: "Make a 20 second launch video",
      result: "launch.mp4",
      detail: "0:20 · 1920x1080",
      icon: "play",
    },
  },
  // Things pressed
  pill: {
    about: "A button pressed by the cursor, with a small badge.",
    example: { icon: "sparkle", label: "New skill", badge: "New" },
  },
  options: {
    about:
      "A switch between options; the cursor picks each in turn and the marker slides.",
    example: {
      label: "Pick a shape",
      options: ["16:9", "9:16", "1:1"],
      pick: [1, 2],
    },
  },
  toggles: {
    about: "Settings whose switches the cursor flips.",
    example: {
      title: "Settings",
      items: [{ label: "Captions", on: true }, { label: "Voice" }],
      flip: [1],
    },
  },
  slider: {
    about: "A slider dragged from one value to another.",
    example: { label: "Speed", from: 20, to: 80, unit: "%" },
  },
  search: {
    about: "A search typed; the list narrows to what matches.",
    example: {
      query: "chart",
      items: ["Bar chart", "Title", "Line chart"],
      placeholder: "Search",
    },
  },
  toast: {
    about: "A small island that opens into a message.",
    example: {
      icon: "check",
      title: "Video ready",
      text: "launch.mp4 · 24 seconds",
    },
  },
  // Lists and steps
  list: {
    about: "Rows that come in one by one, or a checklist ticked (check).",
    example: {
      title: "This week",
      items: ["Walk 10 minutes", "Read 5 pages"],
      check: true,
    },
  },
  progress: {
    about: "Tasks whose bars fill in turn, each ticked.",
    example: { title: "Rendering", items: ["Drawing", "Blending", "Encoding"] },
  },
  steps: {
    about: "A numbered path walked step by step.",
    example: { items: ["Write", "Look", "Render"] },
  },
  timeline: {
    about: "Dates on a rail that fills from one to the next.",
    example: {
      events: [
        { when: "2019", what: "First shop" },
        { when: "2022", what: "Online" },
        { when: "2025", what: "Ten cities" },
      ],
    },
  },
  grid: {
    about: "Tiles of what something does, landing one after another.",
    example: {
      title: "What it does",
      items: [
        { icon: "mic", title: "Talks", text: "A call, in your language" },
        {
          icon: "bot",
          title: "Works",
          text: "Bots with a shell and a browser",
        },
        { icon: "bell", title: "Tells you", text: "When it is ready" },
      ],
    },
  },
  hub: {
    about:
      "One thing in the middle and what it reaches, drawn out spoke by spoke.",
    example: {
      center: "Thursday",
      icon: "sparkle",
      around: ["Calls", "Bots", "Files", "Routines", "Phone"],
    },
  },
  compare: {
    about: "Two sides and a vs between them; one can be picked.",
    example: {
      left: { title: "Before", points: ["By hand"] },
      right: { title: "After", points: ["Asked for"] },
      pick: "right",
    },
  },
  // Numbers
  number: {
    about: "One figure that counts up, with what it counts.",
    example: { value: 20, suffix: " kinds", label: "of scene to build with" },
  },
  stats: {
    about: "Two to four figures side by side, each counting up.",
    example: {
      stats: [
        { value: 3, label: "bots at once" },
        { value: 40, label: "kinds of scene" },
        { value: 0, label: "servers to rent" },
      ],
    },
  },
  bars: {
    about: "Columns that grow, one highlighted; values given, never made up.",
    example: {
      title: "Pictures taken",
      bars: [
        { label: "Every frame", value: 100 },
        { label: "Reused", value: 38 },
      ],
      highlight: 1,
    },
  },
  line: {
    about: "A line that draws itself across its values, a dot riding its end.",
    example: {
      title: "Weekly users",
      values: [3, 4, 4, 6, 9, 14],
      labels: ["W1", "W2", "W3", "W4", "W5", "W6"],
      label: "14k",
    },
  },
  ring: {
    about: "A ring that fills to a share, the figure counting in its middle.",
    example: { value: 72, label: "done", title: "This quarter" },
  },
  table: {
    about: "A table whose rows come in; one can be highlighted.",
    example: {
      columns: ["Plan", "Seats", "Price"],
      rows: [
        ["Free", "1", "$0"],
        ["Team", "10", "[PRICE]"],
      ],
      highlight: 1,
    },
  },
  // Screens and code
  phone: {
    about:
      "A phone that turns into view, with messages, a list or a picture on its screen.",
    example: {
      messages: [
        { from: "me", text: "Is it ready?" },
        { from: "them", text: "Yes — sent to your inbox." },
      ],
      caption: "Works from your phone",
    },
  },
  browser: {
    about:
      "A browser: the address typed, the page loading, what is on it coming in.",
    example: {
      url: "example.com/pricing",
      title: "Pricing",
      items: ["Free for one", "Team for ten"],
    },
  },
  chat: {
    about: "Chat bubbles, the other side typing first.",
    example: {
      messages: [
        { from: "me", text: "Make a launch video" },
        { from: "them", text: "On it." },
      ],
    },
  },
  terminal: {
    about: "A terminal: commands typed after $, their output after them.",
    example: {
      title: "shell",
      lines: ["$ npx thursday-agent", "Ready on http://localhost:3000"],
    },
  },
  code: {
    about: "Code, its lines in, a band moving to the lines that matter.",
    example: {
      title: "video.json",
      code: '{\n  "kind": "pill",\n  "label": "New"\n}',
      highlight: [2, 3],
    },
  },
  // Pictures
  image: {
    about:
      "A picture from the video's folder, slowly pushed in, with a caption.",
    example: { src: "pictures/shot.png", caption: "What it looks like" },
  },
  beforeafter: {
    about: "Two pictures, a line sweeping from before to after.",
    example: { before: "pictures/before.png", after: "pictures/after.png" },
  },
};
