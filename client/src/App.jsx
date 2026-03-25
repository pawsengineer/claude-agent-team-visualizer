import { useState, useEffect, useRef, useCallback } from "react";
import { marked } from "marked";

// ── Agent visual styles ─────────────────────────────────────────────
const MINIONS = [
  "/minions/Minion-12.svg",
  "/minions/Minion-09.svg",
  "/minions/Minion-11.svg",
  "/minions/Minion-10.svg",
  "/minions/Minion-22.svg",
];

const STYLES = [
  { color: "#9B6DFF", accent: "#C4A1FF",  avatar: MINIONS[0] },
  { color: "#00D68F", accent: "#7DFFCF",  avatar: MINIONS[1] },
  { color: "#FF6B6B", accent: "#FFB3B3",  avatar: MINIONS[2] },
  { color: "#FFB347", accent: "#FFD699",  avatar: MINIONS[3] },
  { color: "#5599FF", accent: "#99C2FF",  avatar: MINIONS[4] },
  { color: "#FF69B4", accent: "#FFB6D9",  avatar: MINIONS[0] },
  { color: "#20B2AA", accent: "#7DD4D0",  avatar: MINIONS[1] },
  { color: "#DDA0DD", accent: "#E8C6E8",  avatar: MINIONS[2] },
];

function getPositions(count) {
  if (count <= 1) return [{ x: 50, y: 40 }];
  const pos = [{ x: 50, y: 28 }];
  const n = count - 1;
  const spread = Math.min(n - 1, 4) * 18;
  const startX = 50 - spread;
  for (let i = 0; i < n; i++) {
    pos.push({ x: Math.max(10, Math.min(90, startX + i * 36)), y: 54 + (i % 2) * 10 });
  }
  return pos;
}

// ── Avatar (Minion SVG) ───────────────────────────────────────────────
function Avatar({ style, isActive, isSpeaking }) {
  const src = style.avatar;
  const anim = isSpeaking ? "speak .4s ease-in-out infinite"
    : isActive ? "bob 2s ease-in-out infinite" : "none";
  return (
    <div style={{ width: 90, textAlign: "center", position: "relative", paddingBottom: 10 }}>
      <style>{`
        @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
        @keyframes speak{0%,100%{transform:translateY(0)}25%{transform:translateY(-4px)}75%{transform:translateY(-2px)}}
        @keyframes glow{0%,100%{opacity:.25}50%{opacity:.6}}
      `}</style>
      {isActive && (
        <div style={{
          width: 44, height: 10, borderRadius: "50%", background: style.color,
          position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
          animation: "glow 1.5s ease-in-out infinite",
        }}/>
      )}
      <div style={{ animation: anim, display: "inline-block", position: "relative" }}>
        <img src={src} width={72} height={72} alt="" style={{ display: "block" }}/>
        <div style={{
          position: "absolute", bottom: -4, right: -4,
          fontSize: 16, lineHeight: 1,
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,.8))",
        }}></div>
      </div>
    </div>
  );
}

// ── Message type colors ─────────────────────────────────────────────
const MSG_BG = {
  task_assignment: "#1a2f1a", idle_notification: "#1a1a2e", shutdown_request: "#2e1a1a",
  shutdown_approved: "#2e1a1a", task_completed: "#0a2f2a", direct_message: "#2f2a1a",
  message: "#1f2a3f", text: "#1f2a3f", status_update: "#2a1f4e", result: "#0a2f2a",
};
const MSG_BORDER = {
  task_assignment: "#00D68F", idle_notification: "#666", shutdown_request: "#FF6B6B",
  shutdown_approved: "#FF6B6B", task_completed: "#00D68F", direct_message: "#FFB347",
  message: "#5599ff", text: "#5599ff", status_update: "#9B6DFF", result: "#00D68F",
};
const TYPE_LABEL = {
  task_assignment: "📋 TASK", idle_notification: "💤 IDLE", shutdown_request: "🛑 SHUTDOWN",
  shutdown_approved: "✅ SHUTDOWN OK", task_completed: "✅ DONE", direct_message: "💬 DM",
  status_update: "📡 STATUS", result: "📦 RESULT",
};

function ChatBubble({ msg, agentMap }) {
  const sStyle = agentMap[msg.from] || { color: "#888", emoji: "❓" };
  const rStyle = agentMap[msg.to] || { color: "#aaa", emoji: "" };
  const ts = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : "";
  const typeLabel = TYPE_LABEL[msg.type] || "";
  const rawText = msg.subject || msg.content || "";
  let parsedContent = null;
  if (rawText.trim().startsWith("{")) {
    try { parsedContent = JSON.parse(rawText); } catch {}
  }
  const displayText = parsedContent ? null : (rawText || "(no content)");

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px",
      background: MSG_BG[msg.type] || "#1a1a2e",
      borderLeft: `3px solid ${MSG_BORDER[msg.type] || "#555"}`,
      borderRadius: 8, animation: "fadeIn .3s ease-out",
      fontFamily: "var(--mono)",
    }}>
      <span style={{ fontSize: 11, flexShrink: 0, marginTop: 2 }}>{sStyle.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: sStyle.color, fontSize: 11, fontFamily: "var(--mono)" }}>{msg.from}</span>
          <span style={{ color: "#555", fontSize: 11 }}>→</span>
          <span style={{ fontWeight: 600, color: rStyle.color, fontSize: 11, fontFamily: "var(--mono)" }}>{msg.to}</span>
          {typeLabel && <span style={{ fontSize: 11, color: "#999", background: "rgba(255,255,255,.04)", padding: "1px 6px", borderRadius: 4 }}>{typeLabel}</span>}
          <span style={{ color: "#444", fontSize: 11, fontFamily: "var(--mono)", marginLeft: "auto" }}>{ts}</span>
        </div>
        {parsedContent ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px", marginTop: 2 }}>
            {Object.entries(parsedContent)
              .filter(([k]) => !["type","from","to","timestamp"].includes(k))
              .map(([k, v]) => (
                <span key={k} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
                  borderRadius: 4, padding: "2px 7px", fontSize: 10, fontFamily: "var(--mono)",
                }}>
                  <span style={{ color: "#888" }}>{k}</span>
                  <span style={{ color: "#ddd" }}>{String(v)}</span>
                </span>
              ))}
          </div>
        ) : (
          <div className="md" style={{ color: "#ddd", fontSize: 11, lineHeight: 1.6, wordBreak: "break-word" }}
            dangerouslySetInnerHTML={{ __html: marked.parse(displayText) }} />
        )}
        {msg.description && msg.type === "task_assignment" && (
          <details style={{ marginTop: 6 }}>
            <summary style={{ fontSize: 11, color: "#888", cursor: "pointer" }}>Show full description</summary>
            <pre style={{
              fontSize: 11, color: "#999", marginTop: 6, whiteSpace: "pre-wrap",
              lineHeight: 1.5, maxHeight: 240, overflow: "auto",
              background: "rgba(0,0,0,.3)", padding: 10, borderRadius: 6,
            }}>{msg.description}</pre>
          </details>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task }) {
  const sc = {
    pending: { bg: "#2a2a1a", border: "#FFB347", text: "#FFB347" },
    in_progress: { bg: "#1a2a3a", border: "#5599FF", text: "#5599FF" },
    completed: { bg: "#0a2a1a", border: "#00D68F", text: "#00D68F" },
    blocked: { bg: "#2a1a1a", border: "#FF6B6B", text: "#FF6B6B" },
  };
  const s = sc[task.status] || sc.pending;
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 8, border: `1px solid ${s.border}33`,
      background: s.bg, fontSize: 11, fontFamily: "var(--mono)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: s.text, fontWeight: 700 }}>#{task.id} {(task.status || "pending").toUpperCase()}</span>
        {task.owner && <span style={{ color: "#888" }}>@{task.owner}</span>}
      </div>
      <div style={{ color: "#bbb", fontSize: 11 }}>{task.subject || task.description?.slice(0, 100) || "—"}</div>
    </div>
  );
}

function ConnLine({ from, to, color, active }) {
  if (!from || !to) return null;
  return <line x1={`${from.x}%`} y1={`${from.y+12}%`} x2={`${to.x}%`} y2={`${to.y}%`}
    stroke={color} strokeWidth={active ? 3 : 0.5}
    strokeDasharray={active ? "8 4" : "4 4"} opacity={active ? .9 : .1}
    style={active ? {animation:"dash 1s linear infinite"} : {}} />;
}

function NoTeams({ health }) {
  return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🏕️</div>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 24, color: "#9B6DFF", marginBottom: 14 }}>
        No agent teams detected
      </h2>
      <div style={{ color: "#777", fontSize: 15, lineHeight: 1.8, maxWidth: 540, margin: "0 auto" }}>
        <p style={{ marginBottom: 12 }}>Watching <code style={{ color: "#FFB347" }}>.claude/</code> directories for active teams.</p>
        <div style={{
          background: "#1a1a2e", border: "1px solid #333", borderRadius: 10,
          padding: "14px 18px", textAlign: "left", fontFamily: "var(--mono)",
          fontSize: 11, color: "#00D68F", marginBottom: 14,
        }}>
          <div style={{ color: "#555" }}># Watch global ~/.claude (default)</div>
          <div>npm run dev</div>
          <div style={{ color: "#555", marginTop: 10 }}># Watch a project-level .claude</div>
          <div>CLAUDE_DIR=./my-project/.claude npm run dev</div>
          <div style={{ color: "#555", marginTop: 10 }}># Watch multiple dirs</div>
          <div>node server.js --claude-dir ~/.claude --claude-dir ./project/.claude</div>
        </div>
        {health?.teams?.length > 0 && (
          <div style={{ fontSize: 11, color: "#555" }}>
            Found dirs: {health.teams.map(t => t.name).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [health, setHealth] = useState(null);
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState("all");
  const chatRef = useRef(null);

  // ✅ FIX: Use a ref to track selected so WebSocket callback always sees latest value
  const selectedRef = useRef(null);
  const updateSelected = useCallback((val) => {
    selectedRef.current = val;
    setSelected(val);
  }, []);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(`ws://${window.location.hostname}:3847`);
      ws.onopen = () => setLive(true);
      ws.onclose = () => { setLive(false); setTimeout(connect, 3000); };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "init" || msg.type === "refresh") {
          setData(msg.data);
          // Only auto-select if user hasn't picked one yet
          if (!selectedRef.current && msg.data.teams?.length > 0) {
            updateSelected(msg.data.teams[0].name);
          }
        } else if (msg.type === "update") {
          setData((prev) => {
            if (!prev) return prev;
            const teams = prev.teams.map((t) => t.name === msg.team ? msg.data : t);
            if (!teams.find((t) => t.name === msg.team)) teams.push(msg.data);
            return { ...prev, teams };
          });
        }
      };
    }
    connect();
    fetch("/api/health").then(r => r.json()).then(setHealth).catch(() => {});
  }, [updateSelected]);

  const prevMsgCount = useRef(0);
  useEffect(() => {
    const team = data?.teams?.find(t => t.name === selectedRef.current);
    prevMsgCount.current = team?.messages?.length || 0;
  }, [data, selected]);

  const team = data?.teams?.find(t => t.name === selected);

  // Build styled agents
  const agentNames = team?.agents || [];
  const sorted = [...agentNames].sort((a, b) => {
    if (a === "team-lead") return -1;
    if (b === "team-lead") return 1;
    return a.localeCompare(b);
  });
  const positions = getPositions(sorted.length);
  const styledAgents = sorted.map((name, i) => ({
    name, style: STYLES[i % STYLES.length], pos: positions[i],
    isLead: name === "team-lead",
  }));
  const agentMap = {};
  for (const a of styledAgents) agentMap[a.name] = a.style;

  // Filter messages
  const messages = team?.messages || [];
  const filtered = filter === "all" ? messages
    : filter === "tasks" ? messages.filter(m => m.type === "task_assignment")
    : filter === "dm" ? messages.filter(m => m.type === "direct_message" || m.type === "message" || m.type === "text")
    : messages.filter(m => m.type === "status_update" || m.type === "result" || m.type === "idle_notification");

  const last = messages[messages.length - 1];
  const tasksDone = (team?.tasks || []).filter(t => t.status === "completed").length;


  return (
    <div style={{
      minHeight: "100vh", width: "100%",
      background: "linear-gradient(180deg,#0a0a1a 0%,#12122a 40%,#0d1117 100%)",
      color: "#e0ddd5", fontFamily: "'Segoe UI',-apple-system,sans-serif",
      position: "relative",
    }}>
      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes dash{to{stroke-dashoffset:-24}}
        @keyframes twinkle{0%,100%{opacity:.15}50%{opacity:.7}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        :root{--mono:'JetBrains Mono',monospace;--display:'Orbitron',monospace}
        *{box-sizing:border-box}
        html,body{margin:0;padding:0;height:100%;overflow-x:hidden}
        ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#333;border-radius:3px}
        ::-webkit-scrollbar-thumb:hover{background:#555}
        .md p{margin:0 0 6px}
        .md p:last-child{margin-bottom:0}
        .md ul,.md ol{margin:4px 0 6px;padding-left:18px}
        .md li{margin-bottom:2px}
        .md code{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);border-radius:3px;padding:1px 5px;font-family:var(--mono);font-size:10px}
        .md pre{background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:10px 12px;overflow-x:auto;margin:6px 0}
        .md pre code{background:none;border:none;padding:0;font-size:10px}
        .md h1,.md h2,.md h3{margin:8px 0 4px;font-family:var(--display);color:#c4a1ff;font-size:12px;font-weight:700;letter-spacing:1px}
        .md a{color:#5599ff;text-decoration:underline}
        .md blockquote{border-left:3px solid #444;margin:4px 0;padding:2px 10px;color:#aaa}
        .md strong{color:#fff}
        .md hr{border:none;border-top:1px solid #333;margin:8px 0}
      `}</style>

      {/* Stars */}
      <svg style={{position:"fixed",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0}}>
        {Array.from({length:50},(_,i)=>(
          <circle key={i} cx={`${Math.random()*100}%`} cy={`${Math.random()*100}%`}
            r={Math.random()*1.5+.5} fill="#fff"
            style={{animation:`twinkle ${2+Math.random()*3}s ease-in-out infinite`,animationDelay:`${Math.random()*3}s`}}/>
        ))}
      </svg>

      <div style={{position:"relative",zIndex:1,maxWidth:1200,width:"100%",margin:"0 auto",padding:"20px 24px"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div>
            <h1 style={{fontFamily:"var(--display)",fontSize:24,fontWeight:900,
              background:"linear-gradient(135deg,#9B6DFF,#00D68F,#FFB347)",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",margin:0,letterSpacing:3}}>
              🐱 PAWS MINIONS
            </h1>
            <div style={{fontSize:11,color:"#555",fontFamily:"var(--mono)",marginTop:3}}>
              Live · {data?.claudeDirs?.length || 1} source(s)
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:live?"#00D68F":"#FF6B6B",
              animation:live?"pulse 2s infinite":"none"}}/>
            <span style={{fontSize:11,color:"#777",fontFamily:"var(--mono)"}}>{live?"LIVE":"RECONNECTING..."}</span>
          </div>
        </div>

        {/* Team tabs */}
        {data?.teams?.length > 1 && (
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            {data.teams.map(t=>(
              <button key={`${t.source}::${t.name}`} onClick={()=>updateSelected(t.name)} style={{
                padding:"6px 14px",borderRadius:6,
                border:selected===t.name?"1px solid #9B6DFF":"1px solid #333",
                background:selected===t.name?"rgba(155,109,255,.15)":"rgba(255,255,255,.02)",
                color:selected===t.name?"#C4A1FF":"#777",
                fontSize:11,fontFamily:"var(--mono)",cursor:"pointer",transition:"all .15s",
              }}>
                <span>{t.name.length > 14 ? t.name.slice(0,10)+"…" : t.name}</span>
                <span style={{color:"#555",marginLeft:6,fontSize:11}}>{t.source}</span>
              </button>
            ))}
          </div>
        )}

        {(!data || data.teams?.length === 0) && <NoTeams health={health}/>}

        {team && <>
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 500px",gap:16,alignItems:"start"}}>
            {/* LEFT: arena */}
            <div style={{
              position:"relative",height:"calc(50vh - 140px)",minHeight:200,borderRadius:14,
              background:"radial-gradient(ellipse at 50% 80%,rgba(155,109,255,.06) 0%,transparent 60%)",
              border:"1px solid rgba(155,109,255,.1)",overflow:"hidden",
            }}>
              <div style={{position:"absolute",inset:0,pointerEvents:"none",
                background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,.01) 2px,rgba(255,255,255,.01) 4px)"}}/>

              {/* Connection lines */}
              <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
                {styledAgents.slice(1).map(a=>(
                  <ConnLine key={a.name} from={styledAgents[0]?.pos} to={a.pos} color={a.style.color}
                    active={last&&(last.from===a.name||last.to===a.name)}/>
                ))}
                {styledAgents.length>2 && styledAgents.slice(1).map((a,i)=>
                  styledAgents.slice(i+2).map(b=>(
                    <ConnLine key={`${a.name}-${b.name}`} from={a.pos} to={b.pos} color="#FFB34766"
                      active={last&&((last.from===a.name&&last.to===b.name)||(last.from===b.name&&last.to===a.name))}/>
                  ))
                )}
              </svg>

              {/* Agents */}
              {styledAgents.map(agent=>{
                const isActive = !last || last.from===agent.name || last.to===agent.name;
                const isSpeaking = last && last.from===agent.name;
                return (
                  <div key={agent.name} style={{
                    position:"absolute",left:`${agent.pos.x}%`,top:`${agent.pos.y}%`,
                    transform:"translate(-50%,-50%)",textAlign:"center",transition:"all .3s",
                    filter:(last&&!isActive)?"brightness(0.35)":"brightness(1)",
                  }}>
                    <Avatar style={agent.style} isActive={isActive} isSpeaking={isSpeaking}/>
                    <div style={{
                      marginTop:4,fontSize:11,fontWeight:700,color:agent.style.color,
                      fontFamily:"var(--mono)",textShadow:`0 0 14px ${agent.style.color}55`,
                      maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                    }}>{agent.name}</div>
                    <div style={{fontSize:11,color:"#666",fontFamily:"var(--mono)"}}>
                      {agent.isLead?"LEAD":"TEAMMATE"}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RIGHT: team header + filters + tasks + messages */}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* Team header bar */}
              <div style={{
                display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"8px 16px",flexShrink:0,
                background:"rgba(155,109,255,.06)",borderRadius:8,
                border:"1px solid rgba(155,109,255,.15)",
                fontFamily:"var(--mono)",fontSize:11,
              }}>
                <span style={{color:"#C4A1FF"}}>⚔️ {team.name.length>22?team.name.slice(0,18)+"…":team.name}</span>
                <span style={{color:"#777"}}>{sorted.length} · {tasksDone}/{team.tasks?.length||0} tasks</span>
              </div>

              {/* Filter tabs */}
              <div style={{display:"flex",gap:6,flexShrink:0,flexWrap:"wrap"}}>
                {[["all","All"],["tasks","Tasks"],["dm","Messages"],["status","Status"]].map(([k,label])=>(
                  <button key={k} onClick={()=>setFilter(k)} style={{
                    padding:"5px 12px",borderRadius:6,fontSize:11,fontFamily:"var(--mono)",
                    background:filter===k?"rgba(155,109,255,.15)":"rgba(255,255,255,.02)",
                    border:filter===k?"1px solid #9B6DFF55":"1px solid #222",
                    color:filter===k?"#C4A1FF":"#666",cursor:"pointer",transition:"all .15s",
                  }}>{label} {k==="all"?`(${messages.length})`:""}</button>
                ))}
              </div>

              {/* Task board */}
              <div style={{flexShrink:0}}>
                <div style={{fontSize:11,color:"#666",fontFamily:"var(--mono)",marginBottom:6,padding:"0 4px"}}>
                  TASK BOARD ({team.tasks?.length||0})
                </div>
                <div style={{
                  height:480,overflowY:"auto",borderRadius:10,
                  background:"rgba(0,0,0,.25)",border:"1px solid rgba(255,255,255,.04)",
                  padding:8,display:"flex",flexDirection:"column",gap:5,
                }}>
                  {(team.tasks||[]).length===0 && (
                    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
                      color:"#444",fontFamily:"var(--mono)",fontSize:11}}>
                      No task files found
                    </div>
                  )}
                  {(team.tasks||[]).map((task,i)=><TaskCard key={task.id||i} task={task}/>)}
                </div>
              </div>

            </div>
          </div>

          {/* Message log — full width below arena + task board */}
          <div style={{marginTop:16}}>
            <div style={{fontSize:11,color:"#666",fontFamily:"var(--mono)",marginBottom:6,padding:"0 4px"}}>
              MESSAGE LOG ({filtered.length})
            </div>
            <div ref={chatRef} style={{
              height:830,overflowY:"auto",borderRadius:10,
              background:"rgba(0,0,0,.35)",border:"1px solid rgba(255,255,255,.06)",
              padding:8,display:"flex",flexDirection:"column",gap:5,
            }}>
              {filtered.length===0 && (
                <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
                  color:"#444",fontFamily:"var(--mono)",fontSize:11}}>
                  {messages.length===0?"Waiting for agent messages...":"No messages match filter"}
                </div>
              )}
              {[...filtered].reverse().map((msg,i)=><ChatBubble key={i} msg={msg} agentMap={agentMap}/>)}
            </div>
          </div>
        </>}

        <div style={{textAlign:"center",marginTop:16,fontSize:11,color:"#2a2a2a",fontFamily:"var(--mono)"}}>
          Watching .claude/ dirs · Auto-updates via WebSocket
        </div>
      </div>
    </div>
  );
}
