// frontend/src/App.jsx
// ─────────────────────────────────────────────────────────────────────────────
// CHANGES FROM CLAUDE ARTIFACT VERSION:
//   1. Removed all window.storage / sget / sset / KEYS / initData
//   2. Removed in-memory seed data
//   3. Login now calls POST /api/auth/login and stores JWT in sessionStorage
//   4. App root loads data via API on mount (loadAllData)
//   5. AmbassadorPortal: onSave calls createEvent() API instead of sset
//   6. AudiencePage: submit calls uploadScreenshot() + createSubmission() API
//   7. AdminDashboard: onSave calls createAmbassador() API instead of sset
//   8. refresh() re-fetches from API instead of reading from window.storage
//   9. Audience page now fetches event directly from API (no longer needs full data)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import {
  login as apiLogin,
  clearToken,
  getToken,
  loadAllData,
  createEvent,
  createSubmission,
  uploadScreenshot,
  createAmbassador,
  getAmbassadors,
  getScreenshotUrl,
} from "./api.js";

// ============================================================
// UTILS
// ============================================================
function computeStats(ambassador, events, submissions) {
  const myEvents = events.filter(e => e.ambassadorIds.includes(ambassador.id));
  let totalReach = 0;
  for (const ev of myEvents) {
    totalReach += (ev.totalAudience || 0) / ev.ambassadorIds.length;
  }
  const myEventIds = myEvents.map(e => e.id);
  const proofs = submissions.filter(s => myEventIds.includes(s.eventId)).length;
  return {
    events: myEvents.length,
    reach: Math.round(totalReach),
    proofs,
    conversionRate: totalReach > 0 ? Math.round((proofs / totalReach) * 100) : 0,
  };
}

// ============================================================
// STYLES
// ============================================================
const G = {
  bg: "#0a0e1a",
  surface: "#111827",
  card: "#1a2235",
  border: "#1e3a5f",
  accent: "#0078d4",
  accentHover: "#106ebe",
  accentGlow: "rgba(0,120,212,0.3)",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  text: "#e2e8f0",
  textMuted: "#64748b",
  textDim: "#94a3b8",
  copilot: "#00b7ff",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${G.bg}; color: ${G.text}; font-family: 'DM Sans', sans-serif; min-height: 100vh; }
  ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: ${G.bg}; } ::-webkit-scrollbar-thumb { background: ${G.border}; border-radius: 3px; }
  .app { min-height: 100vh; display: flex; flex-direction: column; }
  .nav { background: ${G.surface}; border-bottom: 1px solid ${G.border}; padding: 0 32px; height: 60px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; backdrop-filter: blur(12px); }
  .nav-brand { display: flex; align-items: center; gap: 10px; }
  .nav-logo { width: 28px; height: 28px; background: linear-gradient(135deg, ${G.accent}, ${G.copilot}); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 14px; }
  .nav-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 16px; color: ${G.text}; }
  .nav-subtitle { font-size: 11px; color: ${G.textMuted}; margin-top: 1px; }
  .nav-right { display: flex; align-items: center; gap: 12px; }
  .nav-user { font-size: 13px; color: ${G.textDim}; }
  .nav-badge { background: ${G.accentGlow}; border: 1px solid ${G.accent}; color: ${G.copilot}; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .btn { padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
  .btn-primary { background: ${G.accent}; color: white; }
  .btn-primary:hover { background: ${G.accentHover}; box-shadow: 0 0 20px ${G.accentGlow}; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-ghost { background: transparent; color: ${G.textDim}; border: 1px solid ${G.border}; }
  .btn-ghost:hover { border-color: ${G.accent}; color: ${G.text}; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .page { padding: 32px; max-width: 1200px; margin: 0 auto; width: 100%; }
  .page-wide { padding: 32px; width: 100%; }
  .card { background: ${G.card}; border: 1px solid ${G.border}; border-radius: 12px; padding: 24px; }
  .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .card-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 16px; }
  .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .stat-card { background: ${G.card}; border: 1px solid ${G.border}; border-radius: 12px; padding: 20px; position: relative; overflow: hidden; }
  .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, ${G.accent}, ${G.copilot}); }
  .stat-value { font-family: 'Syne', sans-serif; font-size: 32px; font-weight: 800; color: ${G.copilot}; line-height: 1; }
  .stat-label { font-size: 12px; color: ${G.textMuted}; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 10px 14px; color: ${G.textMuted}; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid ${G.border}; }
  td { padding: 12px 14px; border-bottom: 1px solid rgba(30,58,95,0.4); color: ${G.textDim}; vertical-align: middle; }
  tr:hover td { background: rgba(0,120,212,0.04); }
  tr:last-child td { border-bottom: none; }
  .form-group { margin-bottom: 16px; }
  label { display: block; font-size: 12px; color: ${G.textMuted}; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  input, select { width: 100%; background: ${G.surface}; border: 1px solid ${G.border}; border-radius: 8px; padding: 10px 14px; color: ${G.text}; font-family: 'DM Sans', sans-serif; font-size: 14px; outline: none; transition: border-color 0.2s; }
  input:focus, select:focus { border-color: ${G.accent}; box-shadow: 0 0 0 3px ${G.accentGlow}; }
  input::placeholder { color: ${G.textMuted}; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 200; backdrop-filter: blur(4px); }
  .modal { background: ${G.card}; border: 1px solid ${G.border}; border-radius: 16px; padding: 28px; width: 90%; max-width: 520px; max-height: 90vh; overflow-y: auto; }
  .modal-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 18px; margin-bottom: 20px; }
  .login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: ${G.bg}; position: relative; overflow: hidden; }
  .login-glow { position: absolute; width: 600px; height: 600px; background: radial-gradient(circle, rgba(0,120,212,0.12) 0%, transparent 70%); top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; }
  .login-box { background: ${G.card}; border: 1px solid ${G.border}; border-radius: 20px; padding: 40px; width: 100%; max-width: 400px; position: relative; }
  .login-logo { width: 52px; height: 52px; background: linear-gradient(135deg, ${G.accent}, ${G.copilot}); border-radius: 14px; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; font-size: 24px; }
  .login-title { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 24px; margin-bottom: 4px; }
  .login-sub { color: ${G.textMuted}; font-size: 14px; margin-bottom: 32px; }
  .login-tabs { display: flex; gap: 4px; background: ${G.surface}; border-radius: 8px; padding: 4px; margin-bottom: 24px; }
  .login-tab { flex: 1; padding: 8px; text-align: center; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; color: ${G.textMuted}; transition: all 0.2s; border: none; background: none; font-family: 'DM Sans', sans-serif; }
  .login-tab.active { background: ${G.accent}; color: white; }
  .error-msg { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #fca5a5; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
  .tabs { display: flex; gap: 4px; background: ${G.surface}; border-radius: 10px; padding: 4px; margin-bottom: 28px; width: fit-content; }
  .tab { padding: 8px 18px; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 500; color: ${G.textMuted}; transition: all 0.2s; border: none; background: none; font-family: 'DM Sans', sans-serif; }
  .tab.active { background: ${G.accent}; color: white; }
  .badge { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .badge-blue { background: rgba(0,120,212,0.15); color: ${G.copilot}; }
  .badge-green { background: rgba(16,185,129,0.15); color: ${G.success}; }
  .page-header { margin-bottom: 28px; }
  .page-header h1 { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 26px; }
  .page-header p { color: ${G.textMuted}; font-size: 14px; margin-top: 4px; }
  .lb-row { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 1px solid rgba(30,58,95,0.4); }
  .lb-rank { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 18px; color: ${G.textMuted}; width: 28px; text-align: center; }
  .lb-rank.top { color: ${G.warning}; }
  .lb-avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, ${G.accent}, ${G.copilot}); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
  .lb-info { flex: 1; }
  .lb-name { font-weight: 500; font-size: 14px; }
  .lb-campus { font-size: 12px; color: ${G.textMuted}; }
  .lb-bar-wrap { width: 140px; }
  .lb-bar { height: 6px; background: ${G.border}; border-radius: 3px; overflow: hidden; }
  .lb-bar-fill { height: 100%; background: linear-gradient(90deg, ${G.accent}, ${G.copilot}); border-radius: 3px; transition: width 0.6s ease; }
  .lb-stat { text-align: right; }
  .lb-stat-val { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 16px; color: ${G.text}; }
  .lb-stat-label { font-size: 11px; color: ${G.textMuted}; }
  .audience-hero { min-height: 100vh; background: ${G.bg}; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .audience-card { background: ${G.card}; border: 1px solid ${G.border}; border-radius: 20px; padding: 40px; width: 100%; max-width: 480px; }
  .copilot-logo-big { width: 64px; height: 64px; background: linear-gradient(135deg, ${G.accent}, ${G.copilot}); border-radius: 18px; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; font-size: 28px; }
  .success-check { width: 72px; height: 72px; background: rgba(16,185,129,0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; font-size: 32px; }
  .upload-area { border: 2px dashed ${G.border}; border-radius: 12px; padding: 32px; text-align: center; cursor: pointer; transition: all 0.2s; }
  .upload-area:hover { border-color: ${G.accent}; background: rgba(0,120,212,0.05); }
  .upload-area.has-file { border-color: ${G.success}; background: rgba(16,185,129,0.05); }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 640px) { .grid2 { grid-template-columns: 1fr; } .stats-row { grid-template-columns: 1fr 1fr; } }
  .w-full { width: 100%; }
`;

// ============================================================
// QR CODE (visual pseudo-QR, unchanged)
// ============================================================
function QRCode({ value, size = 140 }) {
  const seed = value.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = (i) => ((seed * 9301 + i * 49297 + 233) % 233280) / 233280 > 0.45;
  const cells = Array.from({ length: 49 }, (_, i) => rng(i));
  const corners = [0,1,2,3,4,5,6, 7,14, 42,43,44,45,46,47,48, 41,34, 13,20,27];
  return (
    <div style={{ background: "white", borderRadius: 12, padding: 12, width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, width: "100%", height: "100%" }}>
        {cells.map((on, i) => (
          <div key={i} style={{ background: (on || corners.includes(i)) ? "#000" : "#fff", borderRadius: 1 }} />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// APP ROOT  ← CHANGED: uses API, not window.storage
// ============================================================
export default function App() {
  const [data, setData] = useState(null);
  const [session, setSession] = useState(null);
  const [view, setView] = useState("login");
  const [audienceEventId, setAudienceEventId] = useState(null);

  useEffect(() => {
    // Check URL path for audience view: /audience/<eventId>
    // Azure Static Web Apps uses path routing, not hash routing
    const path = window.location.pathname;
    if (path.startsWith("/audience/")) {
      const eid = path.replace("/audience/", "");
      setAudienceEventId(eid);
      setView("audience");
      return; // audience page fetches its own event — no need to loadAllData
    }

    // Restore session from sessionStorage if token exists
    const token = getToken();
    const savedUser = sessionStorage.getItem("amb_user");
    if (token && savedUser) {
      const user = JSON.parse(savedUser);
      setSession({ type: user.role, user });
      setView(user.role === "admin" ? "admin" : "ambassador");
    }

    // Always load fresh data from API
    loadAllData().then(d => setData(d)).catch(() => setData({ ambassadors: [], events: [], submissions: [] }));
  }, []);

  const refresh = useCallback(async () => {
    const d = await loadAllData();
    setData(d);
  }, []);

  // Audience page doesn't need full data — it fetches its own event
  if (view === "audience") {
    return (
      <>
        <style>{css}</style>
        <AudiencePage eventId={audienceEventId} />
      </>
    );
  }

  if (!data) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: G.bg, color: G.copilot, fontFamily: "sans-serif" }}>
      Loading...
    </div>
  );

  if (view === "login" || !session) {
    return (
      <>
        <style>{css}</style>
        <LoginPage onLogin={(type, user) => {
          sessionStorage.setItem("amb_user", JSON.stringify(user));
          setSession({ type, user });
          setView(type === "admin" ? "admin" : "ambassador");
        }} />
      </>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <nav className="nav">
          <div className="nav-brand">
            <div className="nav-logo">⚡</div>
            <div>
              <div className="nav-title">Copilot Ambassador Hub</div>
              <div className="nav-subtitle">{session.type === "admin" ? "Admin Dashboard" : "Ambassador Portal"}</div>
            </div>
          </div>
          <div className="nav-right">
            <span className="nav-user">{session.user.name || session.user.email}</span>
            <span className="nav-badge">{session.type === "admin" ? "Admin" : session.user.campus}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              clearToken();
              sessionStorage.removeItem("amb_user");
              setSession(null);
              setView("login");
            }}>Sign out</button>
          </div>
        </nav>
        {session.type === "admin"
          ? <AdminDashboard data={data} refresh={refresh} />
          : <AmbassadorPortal data={data} ambassador={session.user} refresh={refresh} />
        }
      </div>
    </>
  );
}

// ============================================================
// LOGIN PAGE  ← CHANGED: calls apiLogin() instead of local lookup
// ============================================================
function LoginPage({ onLogin }) {
  const [tab, setTab] = useState("ambassador");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setError("");
    setLoading(true);
    try {
      const user = await apiLogin(email, password, tab); // calls POST /api/auth/login
      onLogin(user.role, user);
    } catch (err) {
      setError(err.message || "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-glow" />
      <div className="login-box">
        <div className="login-logo">⚡</div>
        <div className="login-title">Ambassador Hub</div>
        <div className="login-sub">Microsoft Copilot Campus Program</div>
        <div className="login-tabs">
          <button className={`login-tab ${tab === "ambassador" ? "active" : ""}`} onClick={() => { setTab("ambassador"); setError(""); }}>Ambassador</button>
          <button className={`login-tab ${tab === "admin" ? "active" : ""}`} onClick={() => { setTab("admin"); setError(""); }}>Admin</button>
        </div>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group">
          <label>Email</label>
          <input type="email" placeholder="you@university.edu" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && login()} />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && login()} />
        </div>
        <button className="btn btn-primary w-full" style={{ justifyContent: "center", marginTop: 8 }} onClick={login} disabled={loading}>
          {loading ? "Signing in..." : "Sign In →"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// AMBASSADOR PORTAL  ← CHANGED: onSave calls createEvent() API
// ============================================================
function AmbassadorPortal({ data, ambassador, refresh }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [showQR, setShowQR] = useState(null);

  const myEvents = data.events.filter(e => e.ambassadorIds.includes(ambassador.id));
  const stats = computeStats(ambassador, data.events, data.submissions);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Welcome back, {ambassador.name.split(" ")[0]} 👋</h1>
        <p>Track your impact, log events, and share your QR codes with audiences.</p>
      </div>
      <div className="stats-row">
        <div className="stat-card"><div className="stat-value">{stats.events}</div><div className="stat-label">Events Held</div></div>
        <div className="stat-card"><div className="stat-value">{stats.reach}</div><div className="stat-label">Audience Reached</div></div>
        <div className="stat-card"><div className="stat-value">{stats.proofs}</div><div className="stat-label">Proof Uploads</div></div>
        <div className="stat-card"><div className="stat-value">{stats.conversionRate}%</div><div className="stat-label">Conversion Rate</div></div>
      </div>
      <div className="tabs">
        <button className={`tab ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>My Events</button>
        <button className={`tab ${activeTab === "submissions" ? "active" : ""}`} onClick={() => setActiveTab("submissions")}>Proof Submissions</button>
      </div>
      {activeTab === "overview" && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">My Events</div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNewEvent(true)}>+ Log Event</button>
          </div>
          {myEvents.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: G.textMuted }}>No events yet. Log your first presentation!</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Event</th><th>Date</th><th>Campus</th><th>Ambassadors</th><th>Audience</th><th>Your Reach</th><th>Proofs</th><th>QR</th></tr></thead>
                <tbody>
                  {myEvents.map(ev => {
                    const coAmbs = ev.ambassadorIds.map(id => data.ambassadors.find(a => a.id === id)?.name?.split(" ")[0]).filter(Boolean);
                    const myReach = Math.round((ev.totalAudience || 0) / ev.ambassadorIds.length);
                    const proofCount = data.submissions.filter(s => s.eventId === ev.id).length;
                    return (
                      <tr key={ev.id}>
                        <td style={{ color: G.text, fontWeight: 500 }}>{ev.title}</td>
                        <td>{ev.date}</td>
                        <td><span className="badge badge-blue">{ev.campus}</span></td>
                        <td style={{ fontSize: 12 }}>{coAmbs.join(", ")}</td>
                        <td>{ev.totalAudience}</td>
                        <td style={{ color: G.copilot, fontWeight: 600 }}>{myReach}</td>
                        <td><span className="badge badge-green">{proofCount}</span></td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => setShowQR(ev)}>Show QR</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {activeTab === "submissions" && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 20 }}>Proof Submissions from Your Events</div>
          <SubmissionsTable submissions={data.submissions.filter(s => myEvents.map(e => e.id).includes(s.eventId))} events={data.events} />
        </div>
      )}
      {showNewEvent && (
        <NewEventModal
          data={data}
          ambassador={ambassador}
          onClose={() => setShowNewEvent(false)}
          onSave={async (eventData) => {
            await createEvent(eventData); // ← API call instead of sset
            await refresh();
            setShowNewEvent(false);
          }}
        />
      )}
      {showQR && <QRModal event={showQR} onClose={() => setShowQR(null)} />}
    </div>
  );
}

// ============================================================
// NEW EVENT MODAL (unchanged logic, same as before)
// ============================================================
function NewEventModal({ data, ambassador, onClose, onSave }) {
  const [title, setTitle] = useState("");
  const [campus, setCampus] = useState(ambassador.campus || "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [audience, setAudience] = useState("");
  const [coAmbs, setCoAmbs] = useState([{ email: "", resolved: null, status: "pending" }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const totalAmbs = 1 + coAmbs.filter(c => c.status === "found").length;
  const perAmbReach = audience ? Math.round(parseInt(audience) / totalAmbs) : 0;

  const resolveEmail = (email) => {
    if (!email.trim()) return { resolved: null, status: "pending" };
    if (email.trim().toLowerCase() === ambassador.email.toLowerCase()) return { resolved: null, status: "self" };
    const found = data.ambassadors.find(a => a.email.toLowerCase() === email.trim().toLowerCase());
    return found ? { resolved: found, status: "found" } : { resolved: null, status: "notfound" };
  };

  const updateCoAmb = (index, emailVal) => {
    setCoAmbs(prev => {
      const next = [...prev];
      const { resolved, status } = resolveEmail(emailVal);
      next[index] = { email: emailVal, resolved, status };
      return next;
    });
  };

  const addRow = () => setCoAmbs(prev => [...prev, { email: "", resolved: null, status: "pending" }]);
  const removeRow = (index) => setCoAmbs(prev => prev.filter((_, i) => i !== index));

  const hasDuplicates = () => {
    const ids = coAmbs.filter(c => c.status === "found").map(c => c.resolved.id);
    return ids.length !== new Set(ids).size;
  };

  const save = async () => {
    setError("");
    if (!title || !campus || !date || !audience) { setError("Please fill in all required fields."); return; }
    if (parseInt(audience) < 1) { setError("Audience count must be at least 1."); return; }
    const notFoundRows = coAmbs.filter(c => c.email.trim() !== "" && c.status === "notfound");
    if (notFoundRows.length > 0) { setError(`Not registered: ${notFoundRows.map(c => c.email).join(", ")}`); return; }
    if (coAmbs.some(c => c.status === "self")) { setError("You cannot add yourself as a co-ambassador."); return; }
    if (hasDuplicates()) { setError("Duplicate co-ambassador emails detected."); return; }

    setSaving(true);
    const coAmbIds = coAmbs.filter(c => c.status === "found").map(c => c.resolved.id);
    try {
      await onSave({
        title, campus, date,
        totalAudience: parseInt(audience),
        ambassadorIds: [ambassador.id, ...coAmbIds],
      });
    } catch (err) {
      setError(err.message || "Failed to save event.");
      setSaving(false);
    }
  };

  const filledCoAmbs = coAmbs.filter(c => c.status === "found");

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Log New Event</div>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group"><label>Event Title</label><input placeholder="e.g. Intro to Copilot Workshop" value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div className="grid2">
          <div className="form-group"><label>Campus</label><input placeholder="e.g. NUS" value={campus} onChange={e => setCampus(e.target.value)} /></div>
          <div className="form-group"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        </div>
        <div className="form-group"><label>Total Audience Count</label><input type="number" placeholder="e.g. 45" value={audience} onChange={e => setAudience(e.target.value)} /></div>
        <div className="form-group">
          <label>Co-Ambassadors (optional)</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            {coAmbs.map((coAmb, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <input
                    placeholder="co-ambassador@university.edu"
                    value={coAmb.email}
                    onChange={e => updateCoAmb(i, e.target.value)}
                    style={{
                      borderColor: coAmb.status === "found" ? G.success : coAmb.status === "notfound" || coAmb.status === "self" ? G.danger : G.border,
                      paddingRight: coAmb.status !== "pending" ? "36px" : "14px",
                    }}
                  />
                  {coAmb.status !== "pending" && (
                    <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, pointerEvents: "none" }}>
                      {coAmb.status === "found" ? "✅" : "❌"}
                    </span>
                  )}
                </div>
                {coAmb.status === "found" && (
                  <span style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: G.success, borderRadius: 20, padding: "3px 10px", fontSize: 12, whiteSpace: "nowrap", fontWeight: 500 }}>
                    {coAmb.resolved.name}
                  </span>
                )}
                {(coAmb.status === "notfound") && <span style={{ color: G.danger, fontSize: 12, whiteSpace: "nowrap" }}>Not found</span>}
                {(coAmb.status === "self") && <span style={{ color: G.danger, fontSize: 12, whiteSpace: "nowrap" }}>That's you</span>}
                {coAmbs.length > 1 && (
                  <button onClick={() => removeRow(i)} style={{ background: "none", border: "none", color: G.textMuted, cursor: "pointer", fontSize: 16, padding: "0 4px", lineHeight: 1, flexShrink: 0 }} title="Remove">×</button>
                )}
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={addRow}>+ Add another co-ambassador</button>
          </div>
        </div>
        <div style={{ background: G.surface, borderRadius: 10, padding: "14px 16px", fontSize: 13, color: G.textDim, marginBottom: 16, border: `1px solid ${G.border}` }}>
          <div style={{ marginBottom: 8, fontWeight: 500, color: G.text }}>👥 Reach Preview</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{ background: "rgba(0,120,212,0.12)", border: "1px solid rgba(0,120,212,0.3)", color: G.copilot, borderRadius: 20, padding: "3px 10px", fontSize: 12 }}>{ambassador.name.split(" ")[0]}</span>
            {filledCoAmbs.map(c => (
              <span key={c.resolved.id} style={{ background: "rgba(0,120,212,0.12)", border: "1px solid rgba(0,120,212,0.3)", color: G.copilot, borderRadius: 20, padding: "3px 10px", fontSize: 12 }}>{c.resolved.name.split(" ")[0]}</span>
            ))}
          </div>
          {audience
            ? <div style={{ marginTop: 10, fontSize: 13 }}>{parseInt(audience)} audience ÷ {totalAmbs} ambassador{totalAmbs > 1 ? "s" : ""} = <strong style={{ color: G.copilot }}>{perAmbReach} reach each</strong></div>
            : <div style={{ marginTop: 8, color: G.textMuted, fontSize: 12 }}>Enter audience count to see reach split.</div>
          }
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Create Event & Generate QR →"}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// QR MODAL  ← CHANGED: uses /audience/<id> path, not hash
// ============================================================
function QRModal({ event, onClose }) {
  const url = `${window.location.origin}/audience/${event.id}`;
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ textAlign: "center" }}>
        <div className="modal-title">Event QR Code</div>
        <div style={{ color: G.textMuted, fontSize: 14, marginBottom: 24 }}>{event.title} · {event.date} · {event.campus}</div>
        <QRCode value={event.id} size={160} />
        <div style={{ marginTop: 20, background: G.surface, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: G.textMuted, wordBreak: "break-all" }}>{url}</div>
        <p style={{ fontSize: 13, color: G.textDim, marginTop: 16 }}>Show this QR code at your presentation. Audience scans it to upload their Copilot proof.</p>
        <div style={{ marginTop: 20 }}><button className="btn btn-ghost" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

// ============================================================
// AUDIENCE PAGE  ← CHANGED: fetches event from API, uploads file to Blob
// ============================================================
function AudiencePage({ eventId }) {
  const [event, setEvent] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [email, setEmail] = useState("");
  const [campus, setCampus] = useState("");
  const [file, setFile] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch just the one event by querying submissions API with eventId
  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(ev => setEvent(ev))
      .catch(() => setNotFound(true));
  }, [eventId]);

  if (notFound) return (
    <div className="audience-hero">
      <div className="audience-card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
        <h2 style={{ fontFamily: "Syne, sans-serif", marginBottom: 8 }}>Event Not Found</h2>
        <p style={{ color: G.textMuted }}>This QR code may be invalid or expired.</p>
      </div>
    </div>
  );

  if (!event) return (
    <div className="audience-hero">
      <div style={{ color: G.copilot }}>Loading event...</div>
    </div>
  );

  const submit = async () => {
    if (!email || !campus || !file) { setError("Please fill in all fields and upload a screenshot."); return; }
    setLoading(true);
    setError("");
    try {
      // 1. Upload screenshot to Blob Storage
      const { blobPath, fileName: screenshotName } = await uploadScreenshot(file);
      // 2. Save submission record to Cosmos DB (store blobPath, not the URL)
      await createSubmission({ eventId: event.id, email, campus, blobPath, screenshotName });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) return (
    <div className="audience-hero">
      <div className="audience-card" style={{ textAlign: "center" }}>
        <div className="success-check">✅</div>
        <h2 style={{ fontFamily: "Syne, sans-serif", marginBottom: 8 }}>Proof Submitted!</h2>
        <p style={{ color: G.textMuted, fontSize: 14 }}>Thanks for trying Microsoft Copilot! Your submission has been recorded for <strong style={{ color: G.text }}>{event.title}</strong>.</p>
        <div style={{ marginTop: 24, background: G.surface, borderRadius: 10, padding: "16px", fontSize: 13, color: G.textDim }}>
          Keep exploring Copilot — it's your AI companion for study, research, and creativity 🚀
        </div>
      </div>
    </div>
  );

  return (
    <div className="audience-hero">
      <div className="audience-card">
        <div className="copilot-logo-big">⚡</div>
        <h2 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 4 }}>Submit Your Copilot Proof</h2>
        <p style={{ color: G.textMuted, fontSize: 14, marginBottom: 8 }}>Event: <strong style={{ color: G.text }}>{event.title}</strong></p>
        <p style={{ color: G.textMuted, fontSize: 13, marginBottom: 28 }}>Upload a screenshot showing you've used Microsoft Copilot at least once.</p>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group"><label>Your Email</label><input type="email" placeholder="you@university.edu" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="form-group"><label>Your Campus / University</label><input placeholder="e.g. NUS, NTU, SMU..." value={campus} onChange={e => setCampus(e.target.value)} /></div>
        <div className="form-group">
          <label>Copilot Screenshot Proof</label>
          <div className={`upload-area ${file ? "has-file" : ""}`} onClick={() => document.getElementById("fileInput").click()}>
            {file ? (
              <><div style={{ fontSize: 28, marginBottom: 8 }}>🖼️</div><div style={{ color: G.success, fontWeight: 500 }}>{file.name}</div><div style={{ color: G.textMuted, fontSize: 12, marginTop: 4 }}>Click to change</div></>
            ) : (
              <><div style={{ fontSize: 32, marginBottom: 8 }}>📸</div><div style={{ color: G.textDim, fontSize: 14 }}>Click to upload your screenshot</div><div style={{ color: G.textMuted, fontSize: 12, marginTop: 4 }}>PNG, JPG, GIF up to 10MB</div></>
            )}
            <input id="fileInput" type="file" accept="image/*" style={{ display: "none" }} onChange={e => setFile(e.target.files[0])} />
          </div>
        </div>
        <button className="btn btn-primary w-full" style={{ justifyContent: "center", marginTop: 8 }} onClick={submit} disabled={loading}>
          {loading ? "Uploading & Submitting..." : "Submit Proof →"}
        </button>
        <div style={{ marginTop: 20, fontSize: 12, color: G.textMuted, textAlign: "center" }}>
          Microsoft Copilot Ambassador Program · Submission recorded for program tracking only.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ADMIN DASHBOARD  ← CHANGED: onSave calls createAmbassador() API
// ============================================================
function AdminDashboard({ data, refresh }) {
  const [activeTab, setActiveTab] = useState("leaderboard");
  const [showAddAmb, setShowAddAmb] = useState(false);
  const [showQR, setShowQR] = useState(null);

  const totalEvents = data.events.length;
  const totalAmbassadors = data.ambassadors.length;
  const totalSubmissions = data.submissions.length;
  const totalReach = data.events.reduce((sum, ev) => sum + (ev.totalAudience || 0), 0);

  const exportCSV = () => {
    const rows = [["Ambassador", "Campus", "Events", "Reach", "Proofs", "Conversion%"]];
    for (const amb of data.ambassadors) {
      const s = computeStats(amb, data.events, data.submissions);
      rows.push([amb.name, amb.campus, s.events, s.reach, s.proofs, s.conversionRate]);
    }
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "ambassador_stats.csv";
    a.click();
  };

  const ambStats = data.ambassadors
    .map(a => ({ ...a, ...computeStats(a, data.events, data.submissions) }))
    .sort((a, b) => b.reach - a.reach);
  const maxReach = ambStats[0]?.reach || 1;

  return (
    <div className="page-wide" style={{ padding: "32px" }}>
      <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: 26 }}>Admin Dashboard</h1>
          <p style={{ color: G.textMuted, fontSize: 14, marginTop: 4 }}>Microsoft Copilot Ambassador Program Overview</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV}>⬇ Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddAmb(true)}>+ Add Ambassador</button>
        </div>
      </div>
      <div className="stats-row">
        <div className="stat-card"><div className="stat-value">{totalAmbassadors}</div><div className="stat-label">Ambassadors</div></div>
        <div className="stat-card"><div className="stat-value">{totalEvents}</div><div className="stat-label">Total Events</div></div>
        <div className="stat-card"><div className="stat-value">{totalReach}</div><div className="stat-label">Total Audience</div></div>
        <div className="stat-card"><div className="stat-value">{totalSubmissions}</div><div className="stat-label">Proof Uploads</div></div>
      </div>
      <div className="tabs">
        <button className={`tab ${activeTab === "leaderboard" ? "active" : ""}`} onClick={() => setActiveTab("leaderboard")}>Leaderboard</button>
        <button className={`tab ${activeTab === "events" ? "active" : ""}`} onClick={() => setActiveTab("events")}>All Events</button>
        <button className={`tab ${activeTab === "submissions" ? "active" : ""}`} onClick={() => setActiveTab("submissions")}>Submissions</button>
        <button className={`tab ${activeTab === "ambassadors" ? "active" : ""}`} onClick={() => setActiveTab("ambassadors")}>Ambassadors</button>
      </div>
      {activeTab === "leaderboard" && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 24 }}>🏆 Ambassador Leaderboard</div>
          {ambStats.map((a, i) => (
            <div className="lb-row" key={a.id}>
              <div className={`lb-rank ${i < 3 ? "top" : ""}`}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</div>
              <div className="lb-avatar">{a.name[0]}</div>
              <div className="lb-info"><div className="lb-name">{a.name}</div><div className="lb-campus">{a.campus} · {a.events} events</div></div>
              <div className="lb-bar-wrap">
                <div style={{ fontSize: 11, color: G.textMuted, marginBottom: 4 }}>Reach</div>
                <div className="lb-bar"><div className="lb-bar-fill" style={{ width: `${(a.reach / maxReach) * 100}%` }} /></div>
              </div>
              <div className="lb-stat" style={{ minWidth: 60 }}><div className="lb-stat-val">{a.reach}</div><div className="lb-stat-label">reach</div></div>
              <div className="lb-stat" style={{ minWidth: 60 }}><div className="lb-stat-val">{a.proofs}</div><div className="lb-stat-label">proofs</div></div>
              <div className="lb-stat" style={{ minWidth: 70 }}><div className="lb-stat-val" style={{ color: a.conversionRate > 50 ? G.success : G.textDim }}>{a.conversionRate}%</div><div className="lb-stat-label">convert</div></div>
            </div>
          ))}
        </div>
      )}
      {activeTab === "events" && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 20 }}>All Events</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Event</th><th>Date</th><th>Campus</th><th>Ambassadors</th><th>Audience</th><th>Proofs</th><th>QR</th></tr></thead>
              <tbody>
                {[...data.events].sort((a, b) => b.createdAt - a.createdAt).map(ev => {
                  const ambNames = ev.ambassadorIds.map(id => data.ambassadors.find(a => a.id === id)?.name?.split(" ")[0]).filter(Boolean);
                  const proofCount = data.submissions.filter(s => s.eventId === ev.id).length;
                  return (
                    <tr key={ev.id}>
                      <td style={{ color: G.text, fontWeight: 500 }}>{ev.title}</td>
                      <td>{ev.date}</td>
                      <td><span className="badge badge-blue">{ev.campus}</span></td>
                      <td style={{ fontSize: 12 }}>{ambNames.join(", ")}</td>
                      <td>{ev.totalAudience}</td>
                      <td><span className="badge badge-green">{proofCount}</span></td>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => setShowQR(ev)}>QR</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {activeTab === "submissions" && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 20 }}>All Proof Submissions</div>
          <SubmissionsTable submissions={data.submissions} events={data.events} />
        </div>
      )}
      {activeTab === "ambassadors" && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 20 }}>All Ambassadors</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Campus</th><th>Events</th><th>Reach</th><th>Proofs</th><th>Conversion</th></tr></thead>
              <tbody>
                {ambStats.map(a => (
                  <tr key={a.id}>
                    <td style={{ color: G.text, fontWeight: 500 }}>{a.name}</td>
                    <td style={{ fontSize: 12 }}>{a.email}</td>
                    <td><span className="badge badge-blue">{a.campus}</span></td>
                    <td>{a.events}</td>
                    <td style={{ color: G.copilot, fontWeight: 600 }}>{a.reach}</td>
                    <td><span className="badge badge-green">{a.proofs}</span></td>
                    <td style={{ color: a.conversionRate > 50 ? G.success : G.textDim }}>{a.conversionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {showAddAmb && (
        <AddAmbassadorModal
          onClose={() => setShowAddAmb(false)}
          onSave={async (ambData) => {
            await createAmbassador(ambData); // ← API call instead of sset
            await refresh();
            setShowAddAmb(false);
          }}
        />
      )}
      {showQR && <QRModal event={showQR} onClose={() => setShowQR(null)} />}
    </div>
  );
}

// ============================================================
// ADD AMBASSADOR MODAL  ← CHANGED: no longer needs data prop for dup check (API handles it)
// ============================================================
function AddAmbassadorModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [campus, setCampus] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name || !email || !campus || !password) { setError("All fields required."); return; }
    setSaving(true);
    try {
      await onSave({ name, email, campus, password });
    } catch (err) {
      setError(err.message || "Failed to create ambassador.");
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Add New Ambassador</div>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group"><label>Full Name</label><input placeholder="e.g. Sarah Lee" value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="form-group"><label>Email</label><input type="email" placeholder="sarah@university.edu" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="grid2">
          <div className="form-group"><label>Campus</label><input placeholder="e.g. SMU" value={campus} onChange={e => setCampus(e.target.value)} /></div>
          <div className="form-group"><label>Temp Password</label><input type="text" placeholder="pass123" value={password} onChange={e => setPassword(e.target.value)} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Adding..." : "Add Ambassador"}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SUBMISSIONS TABLE (unchanged)
// ============================================================
function SubmissionsTable({ submissions, events }) {
  if (submissions.length === 0) return (
    <div style={{ textAlign: "center", padding: "40px 0", color: G.textMuted }}>No submissions yet.</div>
  );
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Email</th><th>Campus</th><th>Event</th><th>Screenshot</th><th>Submitted</th></tr></thead>
        <tbody>
          {[...submissions].sort((a, b) => b.uploadedAt - a.uploadedAt).map(s => {
            const ev = events.find(e => e.id === s.eventId);
            return (
              <tr key={s.id}>
                <td>{s.email}</td>
                <td><span className="badge badge-blue">{s.campus}</span></td>
                <td style={{ fontSize: 12, color: G.textDim }}>{ev?.title || "—"}</td>
                <td style={{ fontSize: 12 }}>
                  {s.blobPath
                    ? <ViewScreenshotButton blobPath={s.blobPath} />
                    : <span>🖼️ {s.screenshotName}</span>
                  }
                </td>
                <td style={{ fontSize: 12, color: G.textMuted }}>{new Date(s.uploadedAt).toLocaleDateString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// VIEW SCREENSHOT BUTTON
// Fetches a fresh SAS URL on click, opens in new tab
// Blob stays private — only authenticated users can generate view URLs
// ============================================================
function ViewScreenshotButton({ blobPath }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleView = async () => {
    setLoading(true);
    setError(false);
    try {
      const sasUrl = await getScreenshotUrl(blobPath);
      window.open(sasUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (error) return <span style={{ color: G.danger, fontSize: 12 }}>Failed to load</span>;

  return (
    <button
      onClick={handleView}
      disabled={loading}
      style={{
        background: "none", border: "none", color: G.copilot,
        cursor: loading ? "wait" : "pointer", fontSize: 13,
        padding: 0, fontFamily: "inherit", textDecoration: "underline"
      }}
    >
      {loading ? "Loading..." : "🖼️ View"}
    </button>
  );
}
