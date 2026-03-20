import { useState, useEffect, useCallback } from "react";

// ── Google Fonts ──────────────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap";
document.head.appendChild(fontLink);

// ── Supabase config ───────────────────────────────────────────────────────────
const SUPA_URL = "https://awjliusaeqrwcycfezpl.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3amxpdXNhZXFyd2N5Y2ZlenBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzI1NzAsImV4cCI6MjA4OTYwODU3MH0.BFqXghRYEWaJErgkBtyCCuKBlVufdc5Zao9Y0vAoXyM";
const HEADERS  = {
  "Content-Type": "application/json",
  "apikey": SUPA_KEY,
  "Authorization": `Bearer ${SUPA_KEY}`,
  "Prefer": "return=representation"
};
const DB = `${SUPA_URL}/rest/v1/requests`;

function fromDB(r) {
  return { id: r.id, team: r.team, field: r.field, date: r.date, start: r.start_time, end: r.end_time, status: r.status, note: r.note || "" };
}
function toDB(r) {
  return { team: r.team, field: r.field, date: r.date, start_time: r.start, end_time: r.end, status: "pending", note: "" };
}

async function dbFetch() {
  const res = await fetch(`${DB}?order=date.asc,start_time.asc`, { headers: HEADERS });
  const data = await res.json();
  return data.map(fromDB);
}
async function dbInsert(req) {
  const res = await fetch(DB, { method: "POST", headers: HEADERS, body: JSON.stringify(toDB(req)) });
  const data = await res.json();
  return fromDB(data[0]);
}
async function dbUpdate(id, patch) {
  await fetch(`${DB}?id=eq.${id}`, { method: "PATCH", headers: HEADERS, body: JSON.stringify(patch) });
}

// ── App config ────────────────────────────────────────────────────────────────
const FIELDS = ["WRAC", "U8/U9 Field", "Pomponio"];
const FIELD_COLORS = {
  "WRAC":        { light: "#E6FFF5", text: "#00754A" },
  "U8/U9 Field": { light: "#EFF6FF", text: "#1D4ED8" },
  "Pomponio":    { light: "#FFFBEB", text: "#B45309" },
};
const MAX_TEAMS  = 4;
const TIME_SLOTS = ["3:00 PM","3:30 PM","4:00 PM","4:30 PM","5:00 PM","5:30 PM","6:00 PM","6:30 PM","7:00 PM","7:30 PM","8:00 PM"];
const DAYS_SHORT = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const MONTHS     = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const ADMIN      = { email: "admin@soccer.com", password: "admin123" };

const today   = new Date();
const fmt     = d => d.toISOString().split("T")[0];
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function toMins(t) {
  const [time, ampm] = t.split(" ");
  let [h, m] = time.split(":").map(Number);
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

function countOverlapping(requests, { field, date, start, end }) {
  const s = toMins(start), e = toMins(end);
  return requests.filter(r =>
    r.status === "approved" &&
    r.field  === field &&
    r.date   === date &&
    toMins(r.start) < e &&
    toMins(r.end)   > s
  ).length;
}

function getCalDays(y, m) {
  const first = new Date(y, m, 1).getDay();
  const total = new Date(y, m + 1, 0).getDate();
  const days  = [];
  for (let i = 0; i < first; i++) days.push(null);
  for (let i = 1; i <= total; i++) days.push(i);
  return days;
}

// ── Shared atoms ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = { pending: ["🟡","pending"], approved: ["✅","approved"], denied: ["❌","denied"] };
  const [icon, cls] = map[status] || ["",""];
  return <span className={`badge badge-${cls}`}>{icon} {status.toUpperCase()}</span>;
}

function FieldPill({ field }) {
  const c = FIELD_COLORS[field] || { light: "#eee", text: "#333" };
  return <span className="field-pill" style={{ background: c.light, color: c.text }}>{field}</span>;
}

function FieldLegend() {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {FIELDS.map(f => <FieldPill key={f} field={f} />)}
    </div>
  );
}

function Spinner() {
  return <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Loading…</div>;
}

// ── Calendar month widget ─────────────────────────────────────────────────────
function CalMonth({ requests, filterStatus, showActions, onApprove, onDeny, onCancel }) {
  const [cm,  setCm]  = useState(today.getMonth());
  const [cy,  setCy]  = useState(today.getFullYear());
  const [sel, setSel] = useState(null);
  const todayStr = fmt(today);
  const days = getCalDays(cy, cm);
  const vis  = filterStatus ? requests.filter(r => filterStatus.includes(r.status)) : requests;

  const evForDay = day => {
    const d = fmt(new Date(cy, cm, day));
    return vis.filter(r => r.date === d).sort((a, b) => a.start.localeCompare(b.start));
  };

  const prev = () => { if (cm === 0) { setCm(11); setCy(y => y - 1); } else setCm(m => m - 1); };
  const next = () => { if (cm === 11) { setCm(0); setCy(y => y + 1); } else setCm(m => m + 1); };

  return (
    <>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button onClick={prev} style={{ background: "none", border: "none", color: "#F8FAFC", fontSize: 22, cursor: "pointer", padding: "0 8px" }}>‹</button>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 2 }}>{MONTHS[cm]} {cy}</span>
          <button onClick={next} style={{ background: "none", border: "none", color: "#F8FAFC", fontSize: 22, cursor: "pointer", padding: "0 8px" }}>›</button>
        </div>
        <div className="cal-grid">
          {DAYS_SHORT.map(d => <div key={d} className="cal-header">{d}</div>)}
          {days.map((day, i) => {
            if (!day) return <div key={`e${i}`} className="cal-day empty" />;
            const dStr  = fmt(new Date(cy, cm, day));
            const isSel = sel === day;
            const hasEv = evForDay(day).length > 0;
            return (
              <div key={day}
                className={`cal-day ${dStr === todayStr ? "today" : ""} ${isSel ? "selected" : ""} ${hasEv && !isSel ? "has-events" : ""}`}
                onClick={() => setSel(sel === day ? null : day)}>
                {day}
              </div>
            );
          })}
        </div>
      </div>

      {sel && (
        <div className="card">
          <div className="card-title">
            {new Date(cy, cm, sel).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
          {evForDay(sel).length === 0 ? (
            <div className="empty" style={{ padding: "16px 0" }}>
              <div className="empty-icon">🌿</div>
              <div className="empty-text">No slots this day</div>
            </div>
          ) : evForDay(sel).map(r => (
            <div key={r.id} className="slot-item">
              <div style={{ minWidth: 82 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>{r.start}–{r.end}</div>
                <FieldPill field={r.field} />
              </div>
              <div style={{ flex: 1, paddingLeft: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.team}</div>
                <StatusBadge status={r.status} />
              </div>
              {showActions && (
                <div style={{ display: "flex", gap: 4 }}>
                  {r.status === "pending" && <>
                    <button className="btn-secondary btn-approve" style={{ padding: "6px 8px", fontSize: 12 }} onClick={() => onApprove(r.id, r)}>✅</button>
                    <button className="btn-secondary btn-deny"    style={{ padding: "6px 8px", fontSize: 12 }} onClick={() => onDeny(r.id, r)}>❌</button>
                  </>}
                  {r.status === "approved" &&
                    <button className="btn-secondary btn-muted" style={{ padding: "6px 8px", fontSize: 12 }} onClick={() => onCancel(r.id, r)}>Cancel</button>
                  }
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Main public + request view ────────────────────────────────────────────────
function MainView({ requests, loading, onSubmitRequest }) {
  const [tab,        setTab]        = useState("calendar");
  const [form,       setForm]       = useState({ team: "", field: FIELDS[0], date: fmt(addDays(today, 1)), start: "4:00 PM", end: "5:30 PM" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [formErr,    setFormErr]    = useState("");

  async function handleSubmit() {
    if (!form.team.trim())     { setFormErr("Please enter your team name."); return; }
    if (form.start === form.end) { setFormErr("Start and end time must be different."); return; }
    const overlapping = countOverlapping(requests, form);
    if (overlapping >= MAX_TEAMS) {
      setFormErr(`⚠️ ${form.field} already has ${overlapping} approved teams during that time — the field is full (max ${MAX_TEAMS}). Please choose a different time or field.`);
      return;
    }
    setFormErr("");
    setSubmitting(true);
    try {
      await onSubmitRequest(form);
      setSubmitted(true);
      setForm({ team: "", field: FIELDS[0], date: fmt(addDays(today, 1)), start: "4:00 PM", end: "5:30 PM" });
      setTimeout(() => setSubmitted(false), 3500);
      setTab("calendar");
    } catch (e) {
      setFormErr("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const upcoming   = requests.filter(r => r.status === "approved" && r.date >= fmt(today)).slice(0, 8);
  const capCount   = form.field && form.date && form.start !== form.end ? countOverlapping(requests, form) : 0;
  const capColor   = capCount >= MAX_TEAMS ? "#EF4444" : capCount >= 3 ? "#F59E0B" : "#00C87A";

  return (
    <div>
      <div className="screen">
        {tab === "calendar" && (
          <>
            {submitted && <div className="success-banner">✅ Request submitted! Waiting for admin approval.</div>}
            <div style={{ marginBottom: 12 }}>
              <div className="section-heading" style={{ marginBottom: 2 }}>FIELD SCHEDULE</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Approved practice slots</div>
            </div>
            <FieldLegend />
            {loading ? <Spinner /> : <CalMonth requests={requests} filterStatus={["approved"]} />}
            <div className="section-heading" style={{ marginTop: 4 }}>UPCOMING SLOTS</div>
            {loading ? <Spinner /> : upcoming.length === 0
              ? <div className="empty"><div className="empty-icon">📭</div><div className="empty-text">No upcoming approved slots yet</div></div>
              : upcoming.map(r => (
                <div key={r.id} className="req-item">
                  <div className="req-row"><span className="req-name">{r.team}</span><FieldPill field={r.field} /></div>
                  <div className="req-detail">
                    {new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    &nbsp;·&nbsp;{r.start} – {r.end}
                  </div>
                </div>
              ))
            }
          </>
        )}

        {tab === "request" && (
          <>
            <div className="section-heading" style={{ marginBottom: 4 }}>REQUEST FIELD TIME</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
              No login needed — enter your team name and submit
            </div>
            <div className="card">
              <div className="form-group">
                <label className="form-label">Team Name</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.team}
                  onChange={e => setForm({ ...form, team: e.target.value })}
                  placeholder="e.g. U8/U9 Boys, U9 Girls…"
                  maxLength={50}
                />
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>
                  Type your team name exactly as you want it to appear
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Field</label>
                <select className="form-select" value={form.field} onChange={e => setForm({ ...form, field: e.target.value })}>
                  {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={form.date} min={fmt(addDays(today, 1))} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Start</label>
                  <select className="form-select" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })}>
                    {TIME_SLOTS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">End</label>
                  <select className="form-select" value={form.end} onChange={e => setForm({ ...form, end: e.target.value })}>
                    {TIME_SLOTS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {capCount > 0 && form.start !== form.end && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Field capacity for this slot</span>
                    <span style={{ color: capColor, fontWeight: 700 }}>{capCount} / {MAX_TEAMS} teams</span>
                  </div>
                  <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(capCount / MAX_TEAMS, 1) * 100}%`, background: capColor, borderRadius: 3, transition: "width 0.3s" }} />
                  </div>
                  {capCount >= MAX_TEAMS && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "#EF4444", fontWeight: 600 }}>
                      🔴 Slot is full — please pick a different time or field
                    </div>
                  )}
                </div>
              )}

              {formErr && <div style={{ color: "#EF4444", fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>{formErr}</div>}
              <button className="btn-primary" onClick={handleSubmit} disabled={submitting} style={{ opacity: submitting ? 0.6 : 1 }}>
                {submitting ? "SUBMITTING…" : "SUBMIT REQUEST"}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="bottom-nav">
        <button className={`nav-item ${tab === "calendar" ? "active" : ""}`} onClick={() => setTab("calendar")}><span className="nav-icon">📅</span>SCHEDULE</button>
        <button className={`nav-item ${tab === "request"  ? "active" : ""}`} onClick={() => setTab("request")} ><span className="nav-icon">➕</span>REQUEST</button>
      </div>
    </div>
  );
}

// ── Admin login ───────────────────────────────────────────────────────────────
function AdminLogin({ onLogin, onBack }) {
  const [email, setEmail] = useState("");
  const [pass,  setPass]  = useState("");
  const [err,   setErr]   = useState("");

  function go() {
    if (email === ADMIN.email && pass === ADMIN.password) { onLogin(); return; }
    setErr("Invalid admin credentials.");
  }

  return (
    <div className="login-wrap">
      <div className="login-logo">⚽ FIELDTIME</div>
      <div className="login-sub">Admin Access</div>
      <div className="login-card">
        {err && <div className="login-error">{err}</div>}
        <div className="form-group">
          <label className="form-label">Email</label>
          <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@soccer.com" />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input className="form-input" type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && go()} />
        </div>
        <button className="btn-primary" onClick={go}>SIGN IN AS ADMIN</button>
        <button onClick={onBack} style={{ display: "block", width: "100%", marginTop: 12, background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontFamily: "'DM Sans',sans-serif", fontSize: 14, cursor: "pointer", padding: "8px 0" }}>
          ← Back to Schedule
        </button>
        <div className="login-hint">
          <strong style={{ color: "rgba(255,255,255,0.6)" }}>Admin credentials</strong><br />
          Set your real email &amp; password in App.jsx line 46
        </div>
      </div>
    </div>
  );
}

// ── Admin dashboard ───────────────────────────────────────────────────────────
function AdminDashboard({ requests, loading, onApprove, onDeny, onCancel, onLogout }) {
  const [tab,   setTab]   = useState("queue");
  const [modal, setModal] = useState(null);
  const [note,  setNote]  = useState("");
  const [saving,setSaving]= useState(false);

  const pending  = requests.filter(r => r.status === "pending");
  const approved = requests.filter(r => r.status === "approved");
  const all      = [...requests].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const wouldOverfill = req => countOverlapping(requests, req) >= MAX_TEAMS;

  async function confirmAction() {
    if (!modal) return;
    setSaving(true);
    try {
      if (modal.action === "approve") await onApprove(modal.id);
      if (modal.action === "deny")    await onDeny(modal.id, note);
      if (modal.action === "cancel")  await onCancel(modal.id, note);
    } finally {
      setSaving(false); setModal(null); setNote("");
    }
  }

  return (
    <div>
      <div className="screen">
        <div style={{ marginBottom: 20 }}>
          <div className="section-heading" style={{ marginBottom: 2 }}>ADMIN PANEL</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Field Schedule Manager</div>
        </div>

        <div className="stats-row">
          <div className="stat-box"><div className="stat-num pulse" style={{ color: "#F59E0B" }}>{pending.length}</div><div className="stat-label">Pending</div></div>
          <div className="stat-box"><div className="stat-num" style={{ color: "#00C87A" }}>{approved.length}</div><div className="stat-label">Approved</div></div>
          <div className="stat-box"><div className="stat-num" style={{ color: "rgba(255,255,255,0.5)" }}>{requests.length}</div><div className="stat-label">Total</div></div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {[["queue", `Queue (${pending.length})`], ["calendar", "Calendar"], ["all", "All"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: "1", padding: "10px 12px", borderRadius: 10, border: "none",
              fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer",
              background: tab === k ? "#00C87A" : "rgba(255,255,255,0.07)",
              color: tab === k ? "#0B1F3A" : "rgba(255,255,255,0.6)",
              transition: "all 0.15s"
            }}>{l}</button>
          ))}
        </div>

        {tab === "queue" && (loading ? <Spinner /> :
          pending.length === 0
            ? <div className="empty"><div className="empty-icon">🎉</div><div className="empty-text">All caught up! No pending requests.</div></div>
            : pending.map(r => {
              const full = wouldOverfill(r);
              return (
                <div key={r.id} className="req-item">
                  <div className="req-row"><span className="req-name">{r.team}</span><FieldPill field={r.field} /></div>
                  <div className="req-detail" style={{ marginTop: 4 }}>
                    {new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    &nbsp;·&nbsp;{r.start} – {r.end}
                  </div>
                  {full && (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(239,68,68,0.12)", borderRadius: 8, fontSize: 12, color: "#EF4444", fontWeight: 600 }}>
                      ⚠️ Field already has {MAX_TEAMS} teams in this slot
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="btn-secondary btn-approve" onClick={() => setModal({ id: r.id, action: "approve", req: r })}>✅ Approve</button>
                    <button className="btn-secondary btn-deny"    onClick={() => setModal({ id: r.id, action: "deny",    req: r })}>❌ Deny</button>
                  </div>
                </div>
              );
            })
        )}

        {tab === "calendar" && (loading ? <Spinner /> : (
          <>
            <FieldLegend />
            <CalMonth requests={requests} showActions
              onApprove={(id, req) => setModal({ id, action: "approve", req })}
              onDeny={(id,    req) => setModal({ id, action: "deny",    req })}
              onCancel={(id,  req) => setModal({ id, action: "cancel",  req })}
            />
          </>
        ))}

        {tab === "all" && (loading ? <Spinner /> :
          ["pending", "approved", "denied"].map(status => {
            const group = all.filter(r => r.status === status);
            if (!group.length) return null;
            return (
              <div key={status}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: 2, color: "rgba(255,255,255,0.4)", marginBottom: 8, marginTop: 4 }}>
                  {status.toUpperCase()} ({group.length})
                </div>
                {group.map(r => (
                  <div key={r.id} className="req-item">
                    <div className="req-row"><span style={{ fontWeight: 700 }}>{r.team}</span><FieldPill field={r.field} /></div>
                    <div className="req-detail" style={{ marginTop: 4 }}>
                      {new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      &nbsp;·&nbsp;{r.start}–{r.end}
                    </div>
                    {r.note && <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Note: {r.note}</div>}
                    {status === "approved" && (
                      <button className="btn-secondary btn-muted" style={{ marginTop: 10, width: "100%" }} onClick={() => setModal({ id: r.id, action: "cancel", req: r })}>
                        Override / Cancel Slot
                      </button>
                    )}
                    {status === "pending" && (
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button className="btn-secondary btn-approve" onClick={() => setModal({ id: r.id, action: "approve", req: r })}>✅ Approve</button>
                        <button className="btn-secondary btn-deny"    onClick={() => setModal({ id: r.id, action: "deny",    req: r })}>❌ Deny</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => !saving && setModal(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 2, marginBottom: 4 }}>
              {modal.action === "approve" ? "✅ APPROVE REQUEST" : modal.action === "deny" ? "❌ DENY REQUEST" : "🚫 CANCEL SLOT"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
              {modal.req.team} · {modal.req.field}<br />
              {new Date(modal.req.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {modal.req.start}–{modal.req.end}
            </div>
            {modal.action === "approve" && wouldOverfill(modal.req) && (
              <div style={{ marginBottom: 14, padding: "10px 12px", background: "rgba(239,68,68,0.12)", borderRadius: 10, fontSize: 13, color: "#EF4444", fontWeight: 600 }}>
                ⚠️ Slot already has {MAX_TEAMS} approved teams. You can still override and approve.
              </div>
            )}
            {modal.action !== "approve" && (
              <div className="form-group">
                <label className="form-label">Message back to coach (optional)</label>
                <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Field unavailable that day…" />
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-secondary btn-muted" style={{ flex: 1, padding: 14 }} onClick={() => setModal(null)} disabled={saving}>Back</button>
              <button
                className={`btn-secondary ${modal.action === "approve" ? "btn-approve" : "btn-deny"}`}
                style={{ flex: 2, padding: 14, fontWeight: 700, fontSize: 15, opacity: saving ? 0.6 : 1 }}
                onClick={confirmAction}
                disabled={saving}
              >
                {saving ? "Saving…" : modal.action === "approve" ? "Confirm Approval" : modal.action === "deny" ? "Confirm Denial" : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bottom-nav">
        <button className={`nav-item ${tab === "queue"    ? "active" : ""}`} onClick={() => setTab("queue")}   ><span className="nav-icon">📥</span>QUEUE</button>
        <button className={`nav-item ${tab === "calendar" ? "active" : ""}`} onClick={() => setTab("calendar")}><span className="nav-icon">📅</span>CALENDAR</button>
        <button className={`nav-item ${tab === "all"      ? "active" : ""}`} onClick={() => setTab("all")}     ><span className="nav-icon">📋</span>ALL</button>
        <button className="nav-item" onClick={onLogout}><span className="nav-icon">🚪</span>OUT</button>
      </div>
    </div>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0B1F3A; }
  .app { font-family: 'DM Sans', sans-serif; background: #0B1F3A; min-height: 100vh; max-width: 430px; margin: 0 auto; color: #F8FAFC; overflow-x: hidden; }
  .topbar { background: #0B1F3A; padding: 16px 20px 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08); position: sticky; top: 0; z-index: 100; }
  .topbar-logo { font-family: 'Bebas Neue', sans-serif; font-size: 22px; letter-spacing: 2px; color: #00C87A; }
  .topbar-sub { font-size: 11px; color: rgba(255,255,255,0.4); letter-spacing: 1px; text-transform: uppercase; margin-top: 1px; }
  .topbar-btn { background: rgba(255,255,255,0.08); border: none; color: #F8FAFC; font-family: 'DM Sans', sans-serif; font-size: 13px; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-weight: 600; }
  .topbar-btn:hover { background: rgba(255,255,255,0.14); }
  .screen { padding: 20px; padding-bottom: 100px; }
  .bottom-nav { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px; background: #0D2545; border-top: 1px solid rgba(255,255,255,0.08); display: flex; z-index: 200; }
  .nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 10px 0 12px; gap: 4px; cursor: pointer; border: none; background: none; color: rgba(255,255,255,0.35); font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; transition: color 0.15s; }
  .nav-item.active { color: #00C87A; }
  .nav-icon { font-size: 20px; }
  .card { background: #112B50; border-radius: 16px; padding: 18px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.06); }
  .card-title { font-family: 'Bebas Neue', sans-serif; font-size: 18px; letter-spacing: 1px; margin-bottom: 14px; }
  .badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; }
  .badge-pending  { background: rgba(245,158,11,0.15); color: #F59E0B; }
  .badge-approved { background: rgba(0,200,122,0.15);  color: #00C87A; }
  .badge-denied   { background: rgba(239,68,68,0.15);  color: #EF4444; }
  .field-pill { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; }
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .cal-header { text-align: center; font-size: 11px; color: rgba(255,255,255,0.4); font-weight: 700; padding: 4px 0; letter-spacing: 1px; }
  .cal-day { aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; position: relative; transition: background 0.15s; }
  .cal-day.today { background: rgba(0,200,122,0.2); color: #00C87A; }
  .cal-day.has-events::after { content: ''; position: absolute; bottom: 4px; width: 5px; height: 5px; border-radius: 50%; background: #00C87A; }
  .cal-day.selected { background: #00C87A; color: #0B1F3A; }
  .cal-day:hover:not(.selected) { background: rgba(255,255,255,0.06); }
  .cal-day.empty { opacity: 0; pointer-events: none; }
  .req-item { padding: 14px; background: rgba(255,255,255,0.04); border-radius: 12px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.06); }
  .req-row { display: flex; align-items: center; justify-content: space-between; }
  .req-name { font-weight: 700; font-size: 15px; }
  .req-detail { font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 4px; }
  .form-label { font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 6px; display: block; }
  .form-group { margin-bottom: 18px; }
  .form-input, .form-select { width: 100%; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #F8FAFC; font-family: 'DM Sans', sans-serif; font-size: 15px; padding: 12px 14px; outline: none; transition: border 0.15s; }
  .form-input:focus, .form-select:focus { border-color: #00C87A; }
  .form-input::placeholder { color: rgba(255,255,255,0.25); }
  .form-select option { background: #112B50; }
  .btn-primary { width: 100%; background: #00C87A; color: #0B1F3A; border: none; border-radius: 12px; font-family: 'Bebas Neue', sans-serif; font-size: 18px; letter-spacing: 2px; padding: 14px; cursor: pointer; transition: background 0.15s, transform 0.1s; }
  .btn-primary:hover { background: #00E089; }
  .btn-primary:active { transform: scale(0.98); }
  .btn-secondary { flex: 1; padding: 10px; border-radius: 10px; border: none; font-family: 'DM Sans', sans-serif; font-weight: 700; font-size: 14px; cursor: pointer; transition: all 0.15s; }
  .btn-approve { background: rgba(0,200,122,0.15); color: #00C87A; }
  .btn-approve:hover { background: rgba(0,200,122,0.25); }
  .btn-deny { background: rgba(239,68,68,0.15); color: #EF4444; }
  .btn-deny:hover { background: rgba(239,68,68,0.25); }
  .btn-muted { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.6); }
  .btn-muted:hover { background: rgba(255,255,255,0.14); }
  .section-heading { font-family: 'Bebas Neue', sans-serif; font-size: 24px; letter-spacing: 2px; margin-bottom: 16px; }
  .slot-item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
  .stat-box { background: rgba(255,255,255,0.04); border-radius: 12px; padding: 14px 10px; text-align: center; border: 1px solid rgba(255,255,255,0.06); }
  .stat-num { font-family: 'Bebas Neue', sans-serif; font-size: 28px; line-height: 1; }
  .stat-label { font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 4px; letter-spacing: 0.5px; }
  @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }
  .pulse { animation: pulse 2s ease-in-out infinite; }
  .empty { text-align: center; padding: 40px 20px; color: rgba(255,255,255,0.25); }
  .empty-icon { font-size: 40px; margin-bottom: 10px; }
  .empty-text { font-size: 14px; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 300; display: flex; align-items: flex-end; justify-content: center; }
  .modal-sheet { background: #112B50; border-radius: 20px 20px 0 0; padding: 24px 20px 40px; width: 100%; max-width: 430px; border-top: 1px solid rgba(255,255,255,0.1); }
  .modal-handle { width: 40px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; margin: 0 auto 20px; }
  .success-banner { padding: 12px; background: rgba(0,200,122,0.15); border-radius: 10px; color: #00C87A; font-weight: 700; margin-bottom: 16px; text-align: center; }
  .login-wrap { min-height: 100vh; background: #0B1F3A; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 24px; font-family: 'DM Sans', sans-serif; }
  .login-logo { font-family: 'Bebas Neue', sans-serif; font-size: 48px; letter-spacing: 4px; color: #00C87A; margin-bottom: 4px; }
  .login-sub { color: rgba(255,255,255,0.4); font-size: 13px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 40px; }
  .login-card { width: 100%; max-width: 360px; background: #112B50; border-radius: 20px; padding: 28px 24px; border: 1px solid rgba(255,255,255,0.08); }
  .login-error { color: #EF4444; font-size: 13px; margin-bottom: 12px; text-align: center; }
  .login-hint { margin-top: 16px; padding: 12px; background: rgba(0,200,122,0.08); border-radius: 10px; font-size: 12px; color: rgba(255,255,255,0.5); line-height: 1.6; }
`;

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,   setScreen]   = useState("main");
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [dbError,  setDbError]  = useState(false);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dbFetch();
      setRequests(data);
      setDbError(false);
    } catch (e) {
      console.error(e);
      setDbError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(loadRequests, 30000);
    return () => clearInterval(id);
  }, [loadRequests]);

  async function handleSubmit(req) {
    const newReq = await dbInsert(req);
    setRequests(p => [...p, newReq]);
  }
  async function handleApprove(id) {
    await dbUpdate(id, { status: "approved" });
    setRequests(p => p.map(r => r.id === id ? { ...r, status: "approved" } : r));
  }
  async function handleDeny(id, note) {
    await dbUpdate(id, { status: "denied", note });
    setRequests(p => p.map(r => r.id === id ? { ...r, status: "denied", note } : r));
  }
  async function handleCancel(id, note) {
    const n = note || "Cancelled by admin";
    await dbUpdate(id, { status: "denied", note: n });
    setRequests(p => p.map(r => r.id === id ? { ...r, status: "denied", note: n } : r));
  }

  return (
    <>
      <style>{css}</style>
      <div className="app">
        {dbError && (
          <div style={{ background: "#EF4444", color: "#fff", fontSize: 13, fontWeight: 600, textAlign: "center", padding: "10px" }}>
            ⚠️ Could not connect to database. Check your connection and refresh.
          </div>
        )}

        {screen === "main" && (
          <>
            <div className="topbar">
              <div>
                <div className="topbar-logo">⚽ FIELDTIME</div>
                <div className="topbar-sub">U9 Soccer · Field Scheduler</div>
              </div>
              <button className="topbar-btn" onClick={() => setScreen("adminLogin")}>Admin</button>
            </div>
            <MainView requests={requests} loading={loading} onSubmitRequest={handleSubmit} />
          </>
        )}

        {screen === "adminLogin" && (
          <AdminLogin onLogin={() => { setScreen("admin"); loadRequests(); }} onBack={() => setScreen("main")} />
        )}

        {screen === "admin" && (
          <>
            <div className="topbar">
              <div>
                <div className="topbar-logo">⚽ FIELDTIME</div>
                <div className="topbar-sub">Admin Panel</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="topbar-btn" onClick={loadRequests} title="Refresh">🔄</button>
                <button className="topbar-btn" onClick={() => setScreen("main")}>← Public</button>
              </div>
            </div>
            <AdminDashboard
              requests={requests}
              loading={loading}
              onApprove={handleApprove}
              onDeny={handleDeny}
              onCancel={handleCancel}
              onLogout={() => setScreen("main")}
            />
          </>
        )}
      </div>
    </>
  );
}
