import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import chokidar from "chokidar";
import cors from "cors";
import fs from "fs";
import path from "path";
import os from "os";

// ── Resolve .claude directories ──────────────────────────────────────
//
// Priority:
//   1. --claude-dir /path1 --claude-dir /path2  (CLI args, repeatable)
//   2. CLAUDE_DIR=/path1:/path2                  (env var, colon-separated)
//   3. Auto-detect: ~/.claude + ./.claude        (default)
//
// Each dir should contain teams/ and/or tasks/ subdirectories.

function resolveClaudeDirs() {
  const dirs = new Set();

  // 1. CLI args: --claude-dir /some/path (repeatable)
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--claude-dir" && args[i + 1]) {
      dirs.add(path.resolve(args[++i]));
    }
  }

  // 2. Env var: CLAUDE_DIR=/path1:/path2
  if (process.env.CLAUDE_DIR) {
    for (const p of process.env.CLAUDE_DIR.split(path.delimiter)) {
      if (p.trim()) dirs.add(path.resolve(p.trim()));
    }
  }

  // 3. Default: global + local project
  if (dirs.size === 0) {
    dirs.add(path.join(os.homedir(), ".claude"));
    // Also check CWD for project-level .claude/
    const localClaude = path.resolve(".claude");
    if (fs.existsSync(localClaude) && localClaude !== path.join(os.homedir(), ".claude")) {
      dirs.add(localClaude);
    }
  }

  return [...dirs];
}

const CLAUDE_DIRS = resolveClaudeDirs();
const PORT = process.env.PORT || 3847;

const app = express();
app.use(cors());
app.use(express.json());

const clientDist = path.join(import.meta.dirname, "client", "dist");
if (fs.existsSync(clientDist)) app.use(express.static(clientDist));

const server = createServer(app);
const wss = new WebSocketServer({ server });

function safeReadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8").trim());
  } catch { return null; }
}

function parseMessageText(textField) {
  if (!textField || typeof textField !== "string") return null;
  try { return JSON.parse(textField); }
  catch { return { type: "text", content: textField }; }
}

/**
 * Scan all CLAUDE_DIRS for teams/ and tasks/ subdirectories.
 * Returns a list of { teamName, teamsDir, tasksDir, source } objects.
 */
function discoverTeams() {
  const found = new Map(); // teamName → { teamsPath, tasksPath, source }

  for (const claudeDir of CLAUDE_DIRS) {
    const teamsRoot = path.join(claudeDir, "teams");
    const tasksRoot = path.join(claudeDir, "tasks");

    if (fs.existsSync(teamsRoot)) {
      for (const d of fs.readdirSync(teamsRoot, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const key = `${claudeDir}::${d.name}`;
        if (!found.has(key)) {
          found.set(key, {
            teamName: d.name,
            teamsPath: path.join(teamsRoot, d.name),
            tasksPath: fs.existsSync(path.join(tasksRoot, d.name))
              ? path.join(tasksRoot, d.name) : null,
            source: claudeDir,
          });
        }
      }
    }

    // Also check for tasks dirs that don't have matching teams dirs
    if (fs.existsSync(tasksRoot)) {
      for (const d of fs.readdirSync(tasksRoot, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const key = `${claudeDir}::${d.name}`;
        if (!found.has(key)) {
          found.set(key, {
            teamName: d.name,
            teamsPath: null,
            tasksPath: path.join(tasksRoot, d.name),
            source: claudeDir,
          });
        }
      }
    }
  }

  return [...found.values()];
}

function getTeamInboxes(teamsPath) {
  if (!teamsPath) return { agents: [], messages: [] };
  const inboxDir = path.join(teamsPath, "inboxes");
  if (!fs.existsSync(inboxDir)) return { agents: [], messages: [] };
  const agents = new Set();
  const allMessages = [];
  const files = fs.readdirSync(inboxDir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    const recipient = file.replace(".json", "");
    agents.add(recipient);
    const inbox = safeReadJSON(path.join(inboxDir, file));
    if (!Array.isArray(inbox)) continue;
    for (const msg of inbox) {
      const parsed = parseMessageText(msg.text);
      agents.add(msg.from);
      allMessages.push({
        from: msg.from,
        to: recipient,
        timestamp: msg.timestamp,
        read: msg.read,
        type: parsed?.type || "message",
        taskId: parsed?.taskId || null,
        subject: parsed?.subject || null,
        description: parsed?.description || null,
        content: parsed?.content || parsed?.message || parsed?.subject || (typeof msg.text === "string" ? msg.text.slice(0, 300) : ""),
        raw: parsed,
      });
    }
  }
  allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return { agents: [...agents], messages: allMessages };
}

function getTeamConfig(teamsPath) {
  if (!teamsPath) return null;
  return safeReadJSON(path.join(teamsPath, "config.json"));
}

function getTeamTasks(tasksPath) {
  if (!tasksPath || !fs.existsSync(tasksPath)) return [];
  return fs.readdirSync(tasksPath)
    .filter((f) => /^\d+\.json$/.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b))
    .map((f) => safeReadJSON(path.join(tasksPath, f)))
    .filter(Boolean);
}

function getFullTeamState(teamInfo) {
  const { teamName, teamsPath, tasksPath, source } = teamInfo;
  const { agents, messages } = getTeamInboxes(teamsPath);
  const config = getTeamConfig(teamsPath);
  let tasks = getTeamTasks(tasksPath);

  // Try to match tasks from other dirs in same source if none found
  if (tasks.length === 0 && messages.some((m) => m.taskId)) {
    const tasksRoot = path.join(source, "tasks");
    if (fs.existsSync(tasksRoot)) {
      const taskIds = messages.filter((m) => m.taskId).map((m) => String(m.taskId));
      for (const dir of fs.readdirSync(tasksRoot, { withFileTypes: true }).filter((d) => d.isDirectory())) {
        const candidate = getTeamTasks(path.join(tasksRoot, dir.name));
        if (candidate.some((t) => taskIds.includes(String(t.id)))) { tasks = candidate; break; }
      }
    }
  }

  // Label to show which .claude dir this team came from
  const isGlobal = source === path.join(os.homedir(), ".claude");
  const sourceLabel = isGlobal ? "~/.claude" : source.replace(os.homedir(), "~");

  return { name: teamName, config, agents, messages, tasks, source: sourceLabel, timestamp: Date.now() };
}

function getAllTeamsState() {
  const teams = discoverTeams().map(getFullTeamState);
  return { teams, claudeDirs: CLAUDE_DIRS };
}

// REST
app.get("/api/teams", (_, res) => res.json(getAllTeamsState()));
app.get("/api/teams/:name", (req, res) => {
  const all = discoverTeams();
  const match = all.find((t) => t.teamName === req.params.name);
  if (!match) return res.status(404).json({ error: "Team not found" });
  res.json(getFullTeamState(match));
});
app.get("/api/health", (_, res) => {
  const teams = discoverTeams();
  res.json({
    ok: true,
    claudeDirs: CLAUDE_DIRS.map((d) => ({ path: d, exists: fs.existsSync(d) })),
    teams: teams.map((t) => {
      const inboxDir = t.teamsPath ? path.join(t.teamsPath, "inboxes") : null;
      const inboxFiles = inboxDir && fs.existsSync(inboxDir)
        ? fs.readdirSync(inboxDir).filter((f) => f.endsWith(".json")) : [];
      return { name: t.teamName, source: t.source, agents: inboxFiles.map((f) => f.replace(".json", "")) };
    }),
  });
});

// WebSocket
const clients = new Set();
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "init", data: getAllTeamsState() }));
  ws.on("close", () => clients.delete(ws));
});
function broadcast(msg) {
  const payload = JSON.stringify(msg);
  for (const ws of clients) if (ws.readyState === 1) ws.send(payload);
}

// File watcher — watch all .claude dirs
const watchPaths = [];
for (const claudeDir of CLAUDE_DIRS) {
  const teamsDir = path.join(claudeDir, "teams");
  const tasksDir = path.join(claudeDir, "tasks");
  if (fs.existsSync(teamsDir)) watchPaths.push(teamsDir);
  if (fs.existsSync(tasksDir)) watchPaths.push(tasksDir);
}

if (watchPaths.length > 0) {
  const watcher = chokidar.watch(watchPaths, {
    persistent: true, ignoreInitial: true, depth: 5,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });
  let debounce = null;
  watcher.on("all", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      broadcast({ type: "refresh", data: getAllTeamsState() });
    }, 200);
  });
}

server.listen(PORT, () => {
  const teams = discoverTeams();
  console.log(`\n⚔️  Agent Team Visualizer — http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}\n`);
  console.log(`   Watching ${CLAUDE_DIRS.length} .claude dir(s):`);
  for (const d of CLAUDE_DIRS) {
    const exists = fs.existsSync(d);
    console.log(`     ${exists ? "✅" : "⏳"} ${d.replace(os.homedir(), "~")}`);
  }
  if (teams.length === 0) {
    console.log(`\n   ⏳ No teams yet — start one in Claude Code`);
  } else {
    console.log(`\n   📋 Found ${teams.length} team(s):`);
    for (const t of teams) {
      const inboxDir = t.teamsPath ? path.join(t.teamsPath, "inboxes") : null;
      const a = inboxDir && fs.existsSync(inboxDir)
        ? fs.readdirSync(inboxDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""))
        : [];
      const src = t.source.replace(os.homedir(), "~");
      console.log(`     ${t.teamName.slice(0, 20)} → [${a.join(", ")}] (${src})`);
    }
  }
  console.log("");
});
