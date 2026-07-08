// Backend: turns a messy voice note into structured tasks.
// Uses the Meesho Buildathon "Bifrost" gateway (OpenAI-style chat completions).
// The API key is read from an environment variable, so it is never in the browser.
// This version is defensive: it accepts several possible response shapes and
// several possible JSON layouts, so small differences in the gateway output
// won't break it.

const SYSTEM_PROMPT = `You convert messy voice notes into clean to-do lists.
Return ONLY a valid JSON object. No markdown, no code fences, no commentary.
Use exactly this shape:
{"tasks":[{"title":"...","category":"...","priority":"...","due":"...","group":"..."}]}

Rules:
- Extract only actionable tasks. Ignore filler words and non-tasks.
- "title": short, clean, imperative (max ~8 words).
- "category": one of Work, Personal, Shopping, Health, Finance, Follow-up, Other.
- "priority": High, Medium, or Low based on urgency words and deadlines.
- "due": the timing mentioned (e.g. "today", "tomorrow", "Friday evening", "next week"), or "" if none.
- "group": exactly one of Today, Tomorrow, This Week, Later, Work, Personal, Shopping.
  If a timing is detected, prefer the time group (today->Today, tomorrow->Tomorrow,
  this week/named weekday->This Week, next week or later->Later).
  If no timing, use the closest category group (Work, Shopping, else Personal).
- If there are no actionable tasks, return {"tasks":[]}.`;

// Pull the model's text out of whatever response shape the gateway returns.
function extractText(data) {
  if (!data) return "";
  // OpenAI chat style
  if (data.choices && data.choices[0]) {
    const c = data.choices[0];
    if (c.message && typeof c.message.content === "string") return c.message.content;
    if (typeof c.text === "string") return c.text;
    // content as array of parts
    if (c.message && Array.isArray(c.message.content)) {
      return c.message.content.map(p => (typeof p === "string" ? p : (p.text || ""))).join("");
    }
  }
  // Anthropic style
  if (Array.isArray(data.content)) {
    return data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
  }
  if (typeof data.content === "string") return data.content;
  if (typeof data.output_text === "string") return data.output_text;
  if (typeof data.text === "string") return data.text;
  return "";
}

// Find a JSON object/array inside a text blob and parse it.
function parseTasks(raw) {
  const cleaned = String(raw).replace(/```json/gi, "").replace(/```/g, "").trim();
  // Try direct parse first.
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };

  let obj = tryParse(cleaned);
  if (!obj) {
    // Grab the outermost {...}
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    if (s !== -1 && e !== -1 && e > s) obj = tryParse(cleaned.slice(s, e + 1));
  }
  if (!obj) {
    // Maybe it's a bare array [...]
    const s = cleaned.indexOf("[");
    const e = cleaned.lastIndexOf("]");
    if (s !== -1 && e !== -1 && e > s) {
      const arr = tryParse(cleaned.slice(s, e + 1));
      if (Array.isArray(arr)) return arr;
    }
  }
  if (Array.isArray(obj)) return obj;
  if (obj && Array.isArray(obj.tasks)) return obj.tasks;
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST." });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server is missing the API key." });
  }
  const text = (req.body && req.body.text ? String(req.body.text) : "").slice(0, 4000);
  if (!text.trim()) {
    return res.status(400).json({ error: "No text provided." });
  }

  try {
    const r = await fetch("https://gateway-buildathon.ltl.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 1000,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: "Voice note:\n" + text }
        ]
      })
    });

    const data = await r.json();
    if (!r.ok) {
      const msg = (data && data.error && (data.error.message || data.error)) || "Gateway error.";
      return res.status(502).json({ error: String(msg) });
    }

    const raw = extractText(data);
    const tasks = parseTasks(raw);

    if (!tasks) {
      // Could not find JSON. Surface a short snippet so it's debuggable.
      return res.status(500).json({
        error: "AI reply wasn't in the expected format.",
        debug: String(raw).slice(0, 300)
      });
    }
    return res.status(200).json({ tasks });
  } catch (err) {
    return res.status(500).json({ error: "Something went wrong: " + err.message });
  }
};
