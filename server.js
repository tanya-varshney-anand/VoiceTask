// OPTIONAL local runner (only if you run the app on your laptop via Claude Code).
// The deployed Vercel version does NOT use this file.
//
// Start it with:   node server.js
// Then open:       http://localhost:9080
//
// It serves the frontend (index.html) and the Node.js backend (/api/organize)
// from one process on port 9080 (Meesho buildathon frontend port).
// API key: set the ANTHROPIC_API_KEY environment variable, OR paste your key
// into a file named apikey.txt in this folder (never upload that file anywhere).

const http = require("http");
const fs = require("fs");
const path = require("path");
const organize = require("./api/organize.js");

if (!process.env.ANTHROPIC_API_KEY) {
  const keyFile = path.join(__dirname, "apikey.txt");
  if (fs.existsSync(keyFile)) {
    process.env.ANTHROPIC_API_KEY = fs.readFileSync(keyFile, "utf8").trim();
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/api/organize") {
    let body = "";
    req.on("data", c => (body += c));
    req.on("end", () => {
      try { req.body = JSON.parse(body || "{}"); } catch { req.body = {}; }
      // Minimal Express-style shims so the Vercel handler works locally too.
      res.status = code => { res.statusCode = code; return res; };
      res.json = obj => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
      organize(req, res);
    });
    return;
  }
  // Serve the one-page frontend for everything else.
  fs.readFile(path.join(__dirname, "index.html"), (err, html) => {
    if (err) { res.writeHead(500); return res.end("Could not load index.html"); }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });
});

server.listen(9080, () => {
  console.log("VoiceTask running → open http://localhost:9080");
  console.log(process.env.ANTHROPIC_API_KEY
    ? "Claude API key: found ✔"
    : "Claude API key: MISSING — set ANTHROPIC_API_KEY or create apikey.txt");
});
