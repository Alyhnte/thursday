# The itinerary's JSON

`itinerary.mjs` reads one JSON file and writes the page. Only `title` and `days` (each with
`stops`, each with a `name`) are required, and `currency` once any price is there; every section
appears when its field is there.
Words on the page are yours, in the user's language: set `lang` and `labels` when it is not English.

```json
{
  "title": "Lisbon, three easy days",
  "lede": "Nov 12–15 · 2 adults from London · food, the river, a palace on a hill",
  "lang": "en",
  "place": "Lisbon, Portugal",
  "currency": "GBP",
  "travelers": 2,
  "travel": "transit",
  "cover": { "wiki": "Lisbon" },
  "facts": [
    { "value": "Nov 12 – 15", "label": "3 nights" },
    { "value": "18° / 11°", "label": "Usual high / low" }
  ],
  "flights": {
    "legs": [
      { "label": "Out", "date": "2026-11-12", "from": "LHR", "to": "LIS", "dep": "07:25", "arr": "10:05",
        "duration": "2h40", "stops": "nonstop", "airline": "<the airline>" },
      { "label": "Back", "date": "2026-11-15", "from": "LIS", "to": "LHR", "dep": "18:40", "arr": "21:20",
        "duration": "2h40", "stops": "nonstop", "airline": "<the airline>" }
    ],
    "price": 312,
    "priceNote": "round trip for 2, taxes in",
    "note": "Seen on Oct 20 on the flight search.",
    "link": "<the booking link the search gave>"
  },
  "stay": { "name": "<the stay's name>", "area": "Alfama, 5 min walk to the tram", "nights": 3,
            "price": 96, "rating": "4.6 (812 reviews)", "photo": "https://<its own page>",
            "why": "The best-rated private room under £120 a night.", "link": "<its page>" },
  "climate": "No forecast reaches these days yet; the same days in 2021–2025: highs 18°, lows 11°, rain on 7 of 20 days.",
  "days": [
    { "date": "2026-11-13", "title": "The castle hill, then the palace at Sintra", "weather": "18°/11°, dry",
      "travel": "walking",
      "stops": [
        { "time": "09:30", "name": "São Jorge Castle", "what": "Walk up through Alfama, 20 minutes.",
          "wiki": "São Jorge Castle", "hours": "Open 9:00–18:00", "duration": "About 1½ h" },
        { "time": "14:00", "name": "Pena Palace", "what": "Train to Sintra from Rossio, 40 minutes.",
          "wiki": "Pena Palace", "photos": [{ "wiki": "Quinta da Regaleira", "caption": "Quinta da Regaleira, 15 min from the town" }],
          "hours": "Open 9:30–18:30", "book": "Timed entry, sells out", "cost": 20,
          "tip": "Buy the timed ticket the day before." },
        { "time": "19:00", "name": "<a place to eat>", "photo": "https://<the place's own page>",
          "map": "<its name>, Lisbon", "link": "https://<its site>", "linkText": "Hours", "cost": 30 }
      ] }
  ],
  "costs": [
    { "item": "Flights, 2 people", "amount": 312, "note": "round trip" },
    { "item": "<the stay>, 3 nights", "amount": 288 },
    { "item": "Food, about £40 a person a day", "amount": 320 }
  ],
  "more": [
    { "name": "Pastéis de Belém", "tag": "Eat · £", "what": "The custard tart's first bakery.",
      "near": "30 min by tram 15", "wiki": "Pastéis de Belém" }
  ],
  "fx": "<the line fx.mjs printed>",
  "before": [
    { "icon": "entry", "label": "Entry", "text": "UK passports: up to 90 days in any 180 without a visa." },
    { "icon": "power", "label": "Power", "text": "Type C and F plugs, 230 V: a UK plug needs an adapter." }
  ],
  "notes": ["Entry rules checked for the travellers' passports on 2026-10-20."],
  "sources": [{ "url": "https://<the flight search's page>", "label": "<where the flights came from>" }]
}
```

- **A photo per stop** is one of three: `"wiki"`, the English Wikipedia title of the place
  (`"pt:Mosteiro dos Jerónimos"` for another language's — a place outside the English-speaking
  world often has an article, or a picture, only in its own language), whose lead picture comes
  with who made it and, where its file says, its licence; `"photo"` as a page url, whose own share picture is taken through the browser; `"photo"` as a
  file beside the JSON. A stop with none shows without one — the airport, the hotel check-in, a walk.
- **Every link is a full `http(s)` address** — `flights.link`, `stay.link`, a stop's `link`, a
  source's `url`. Anything shorter stops the build by name before a single photo is fetched.
- **Each day opens on a picture**: its `"cover"` (`{ "wiki" }` or `{ "photo" }`, as the trip's),
  else the first stop's photo, which that stop then does not show again.
- **`photos`** adds one or two more pictures to a stop worth seeing more of — a palace and its
  gardens, a view — each `{ "wiki" }` or `{ "photo" }` with an optional `"caption"`. Most stops
  need none: every picture is carried inside the page.
- **What to know at a stop** is a few words each, in the user's language, and only what you read
  on the place's own site or a page you name in `sources`: `"hours"` (the hours on that day, or
  "Closed Mondays"), `"duration"` (how long people stay), `"book"` (true, or what to book: "Timed
  entry, sells out"). Every stop with `book` is also listed under *Before you go* to tick off.
- **Maps.** Each stop links to Google Maps by `"<name>, <place>"`; `"map"` sets a better query,
  `"map": false` leaves the stop off the map and off the day's route. Each day gets one link that
  opens its stops in order; `"travel"` is how it gets between them (`transit` unless said), on a
  day or on the trip.
- **Costs** are numbers in `currency`; the total and per-person share are added up for you and
  also shown at the top. A range is a string (`"$30–50"`) and is left out of the total.
- `stay.price` is one night's price; the stay's total is worked out from `nights`.
- `facts` are the three or four numbers someone checks first: dates, flight time, weather.
- Each `costs` amount is a number in `currency`, the price you read: the page adds them up. A cost
  you could not read is left out and said in `notes`, never given as a guess or a range.
- A leg of `flights.legs` may carry its own `price` when the two halves were bought apart;
  `flights.note` is a line under the panel, for what the price depends on.
- A stop's `linkText` names its link, in place of the site's host.
- **`more`** is places beside the plan — somewhere to eat, a sight for a day that runs short —
  shown as cards after the days: `name` (required), `tag` (what it is and its price band, "Eat ·
  €€"), `what`, `near` (how far from the stay or the plan), a photo as a stop's, `map`, `link`.
  Three to six, or none.
- **`before`** is what to know before going, a line each: `label` and `text`, and an `icon` from
  `entry`, `money`, `tipping`, `power`, `transit`, `emergency`, `health`, `internet`, or none.
  Entry rules are the travellers' passports' and the date you read them goes in `notes`.
- `sources` takes `{ "url", "label" }`, or a plain string when the source is not a page.
- `labels` renames the page's own words: `flights`, `stay`, `weather`, `days`, `costs`, `notes`,
  `total`, `perPerson`, `map`, `route`, `book`, `night`, `nights`, `day`, `sources`, `more`,
  `bookAhead`, `tip`.
