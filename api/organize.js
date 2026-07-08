// Backend: turns a messy voice note into structured tasks.
// Uses the Meesho Buildathon "Bifrost" gateway (OpenAI-style chat completions).
// The API key is read from an environment variable, so it is never in the browser.

const SYSTEM_PROMPT = `You convert messy voice notes into clean to-do lists.
Return ONLY valid JSON, no markdown fences, no commentary, in this exact shape:
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

    const raw = (data.choices && data.choices[0] && data.choices[0].message
      && data.choices[0].message.content) || "";

    const cleaned = String(raw).replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const parsed = JSON.parse(cleaned.slice(start, end + 1));

    return res.status(200).json({ tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [] });
  } catch (err) {
    return res.status(500).json({ error: "Could not parse the AI response. Please try again." });
  }
};
