// The faces as the app draws them, from its own geometry
const g = await import(new URL("../features/bot/mark.geometry.ts", import.meta.url).href);
const bots = {
  Jarvis: { color: "currentColor", shape: "blob" },
  Analyst: { color: "#8B5CF6", shape: "squircle" },
  Curator: { color: "#10B981", shape: "blob" },
  Concierge: { color: "#0EA5E9", shape: "poly" },
  Designer: { paint: "rainbow", shape: "heart" },
  Writer: { color: "#EC4899", shape: "poly" },
  Tutor: { color: "#EAB308", shape: "blob" },
};
const out: Record<string, unknown> = {};
for (const [name, icon] of Object.entries(bots)) out[name] = g.markStill(name, icon as never);
console.log(JSON.stringify({ box: g.BOX, marks: out }, null, 1));
