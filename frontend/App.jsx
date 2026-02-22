import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

/* ── helpers ── */
const authHeaders = (token) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
});

const api = {
  post: (path, body, token) =>
    fetch(`${API}${path}`, {
      method: "POST",
      headers: token ? authHeaders(token) : { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json()),
  get: (path, token) =>
    fetch(`${API}${path}`, { headers: authHeaders(token) }).then((r) => r.json()),
  patch: (path, body, token) =>
    fetch(`${API}${path}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    }).then((r) => r.json()),
  delete: (path, token) =>
    fetch(`${API}${path}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }).then((r) => r.json()),
};

const formatTime = (iso) =>
  iso
    ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/* ── Toast ── */
function Toast({ toasts, remove }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => remove(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((message, type = "info") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);
  const remove = useCallback((id) => setToasts((p) => p.filter((t) => t.id !== id)), []);
  return { toasts, toast: { success: (m) => add(m, "success"), error: (m) => add(m, "error"), info: (m) => add(m, "info") }, remove };
}

/* ── Auth Screen ── */
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "employee" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const path = mode === "login" ? "/auth/login" : "/auth/signup";
    const body = mode === "login"
      ? { email: form.email, password: form.password }
      : form;
    const data = await api.post(path, body);
    setLoading(false);
    if (data.success) {
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      onAuth(data.token, data.user);
    } else {
      setError(data.message || "Something went wrong");
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-icon">⬡</div>
          <h1 className="brand-name">WorkPulse</h1>
          <p className="brand-sub">Attendance & Task Manager</p>
        </div>

        <div className="auth-tabs">
          <button className={mode === "login" ? "tab active" : "tab"} onClick={() => { setMode("login"); setError(""); }}>
            Sign In
          </button>
          <button className={mode === "signup" ? "tab active" : "tab"} onClick={() => { setMode("signup"); setError(""); }}>
            Sign Up
          </button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === "signup" && (
            <div className="field">
              <label>Full Name</label>
              <input placeholder="Alex Morgan" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
          )}
          <div className="field">
            <label>Email</label>
            <input type="email" placeholder="you@company.com" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" placeholder={mode === "signup" ? "Min 8 chars, 1 uppercase, 1 number" : "••••••••"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          {mode === "signup" && (
            <div className="field">
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          )}
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <span className="spinner" /> : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Attendance Panel ── */
function AttendancePanel({ token, toast }) {
  const [today, setToday] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchToday = useCallback(async () => {
    const d = await api.get("/attendance/today", token);
    if (d.success) setToday(d.record);
  }, [token]);

  const fetchHistory = useCallback(async () => {
    const d = await api.get("/attendance?limit=10", token);
    if (d.success) setHistory(d.records);
  }, [token]);

  useEffect(() => {
    fetchToday();
    fetchHistory();
  }, [fetchToday, fetchHistory]);

  const checkIn = async () => {
    setLoading(true);
    const d = await api.post("/attendance/checkin", { status: "present" }, token);
    setLoading(false);
    if (d.success) {
      toast.success("Checked in successfully!");
      setToday(d.attendance);
      fetchHistory();
    } else {
      toast.error(d.message || "Check-in failed");
    }
  };

  const checkOut = async () => {
    setLoading(true);
    const d = await api.patch("/attendance/checkout", {}, token);
    setLoading(false);
    if (d.success) {
      toast.success("Checked out. Have a great day!");
      setToday(d.attendance);
      fetchHistory();
    } else {
      toast.error(d.message || "Check-out failed");
    }
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="panel">
      <div className="att-hero">
        <div className="att-date">{dateStr}</div>
        <Clock />
        <div className="att-status-wrap">
          {!today ? (
            <div className="att-badge badge-absent">Not Checked In</div>
          ) : today.checked_out_at ? (
            <div className="att-badge badge-done">✓ Day Complete</div>
          ) : (
            <div className="att-badge badge-present">● Active</div>
          )}
        </div>

        <div className="att-times">
          <div className="time-block">
            <div className="time-label">Check In</div>
            <div className="time-value">{today ? formatTime(today.checked_in_at) : "—"}</div>
          </div>
          <div className="time-divider">→</div>
          <div className="time-block">
            <div className="time-label">Check Out</div>
            <div className="time-value">{today ? formatTime(today.checked_out_at) : "—"}</div>
          </div>
        </div>

        <div className="att-actions">
          {!today ? (
            <button className="btn-checkin" onClick={checkIn} disabled={loading}>
              {loading ? <span className="spinner" /> : "Check In"}
            </button>
          ) : !today.checked_out_at ? (
            <button className="btn-checkout" onClick={checkOut} disabled={loading}>
              {loading ? <span className="spinner" /> : "Check Out"}
            </button>
          ) : (
            <div className="att-complete-msg">Great work today! 🎉</div>
          )}
        </div>
      </div>

      <div className="section-title">Recent Attendance</div>
      <div className="att-history">
        {history.length === 0 ? (
          <div className="empty-state">No attendance records yet</div>
        ) : (
          history.map((r) => (
            <div key={r.id} className="att-row">
              <div className="att-row-date">{formatDate(r.date)}</div>
              <div className="att-row-times">
                <span>{formatTime(r.checked_in_at)}</span>
                <span className="arr">→</span>
                <span>{formatTime(r.checked_out_at)}</span>
              </div>
              <div className={`status-chip chip-${r.status}`}>{r.status}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="live-clock">
      {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </div>
  );
}

/* ── Tasks Panel ── */
const PRIORITY_ICON = { high: "🔴", medium: "🟡", low: "🟢" };
const STATUS_LABELS = ["pending", "in-progress", "completed", "cancelled"];

function TasksPanel({ token, toast }) {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", due_date: "" });
  const [loading, setLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    const qs = filter !== "all" ? `?status=${filter}` : "";
    const d = await api.get(`/tasks${qs}`, token);
    if (d.success) setTasks(d.tasks);
  }, [token, filter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const createTask = async (e) => {
    e.preventDefault();
    setLoading(true);
    const body = { ...form };
    if (!body.due_date) delete body.due_date;
    const d = await api.post("/tasks", body, token);
    setLoading(false);
    if (d.success) {
      toast.success("Task created!");
      setTasks((p) => [d.task, ...p]);
      setForm({ title: "", description: "", priority: "medium", due_date: "" });
      setShowForm(false);
    } else {
      toast.error(d.message || "Failed to create task");
    }
  };

  const updateStatus = async (task, status) => {
    const d = await api.patch(`/tasks/${task.id}`, { status }, token);
    if (d.success) {
      setTasks((p) => p.map((t) => (t.id === task.id ? d.task : t)));
    } else toast.error("Update failed");
  };

  const deleteTask = async (id) => {
    const d = await api.delete(`/tasks/${id}`, token);
    if (d.success) {
      setTasks((p) => p.filter((t) => t.id !== id));
      toast.success("Task deleted");
    } else toast.error("Delete failed");
  };

  const stats = {
    total: tasks.length,
    done: tasks.filter((t) => t.status === "completed").length,
    high: tasks.filter((t) => t.priority === "high" && t.status !== "completed").length,
  };

  return (
    <div className="panel">
      <div className="tasks-header">
        <div className="task-stats">
          <div className="stat-pill">
            <span className="stat-n">{stats.total}</span>
            <span className="stat-l">Total</span>
          </div>
          <div className="stat-pill pill-done">
            <span className="stat-n">{stats.done}</span>
            <span className="stat-l">Done</span>
          </div>
          <div className="stat-pill pill-high">
            <span className="stat-n">{stats.high}</span>
            <span className="stat-l">Urgent</span>
          </div>
        </div>
        <button className="btn-add" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "✕ Cancel" : "+ New Task"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createTask} className="task-form">
          <input placeholder="Task title *" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <textarea placeholder="Description (optional)" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          <div className="form-row">
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">🟢 Low</option>
              <option value="medium">🟡 Medium</option>
              <option value="high">🔴 High</option>
            </select>
            <input type="date" value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <span className="spinner" /> : "Create Task"}
          </button>
        </form>
      )}

      <div className="filter-bar">
        {["all", "pending", "in-progress", "completed"].map((f) => (
          <button key={f} className={filter === f ? "filter-btn active" : "filter-btn"}
            onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="task-list">
        {tasks.length === 0 ? (
          <div className="empty-state">No tasks found. Add your first task!</div>
        ) : (
          tasks.map((t) => (
            <TaskCard key={t.id} task={t} onStatus={updateStatus} onDelete={deleteTask} />
          ))
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, onStatus, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "completed";

  return (
    <div className={`task-card ${task.status === "completed" ? "card-done" : ""}`}>
      <div className="task-card-main" onClick={() => setExpanded((e) => !e)}>
        <div className="task-priority">{PRIORITY_ICON[task.priority]}</div>
        <div className="task-info">
          <div className={`task-title ${task.status === "completed" ? "striked" : ""}`}>
            {task.title}
          </div>
          {task.due_date && (
            <div className={`task-due ${isOverdue ? "overdue" : ""}`}>
              {isOverdue ? "⚠ " : "📅 "}
              {formatDate(task.due_date)}
            </div>
          )}
        </div>
        <div className={`task-status-chip chip-${task.status.replace("-", "")}`}>
          {task.status}
        </div>
      </div>

      {expanded && (
        <div className="task-card-details">
          {task.description && <p className="task-desc">{task.description}</p>}
          <div className="task-actions">
            <select
              value={task.status}
              onChange={(e) => onStatus(task, e.target.value)}
              onClick={(e) => e.stopPropagation()}
            >
              {STATUS_LABELS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button className="btn-delete" onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main App ── */
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
  });
  const [tab, setTab] = useState("attendance");
  const { toasts, toast, remove } = useToast();

  const handleAuth = (t, u) => { setToken(t); setUser(u); };

  const logout = () => {
    localStorage.clear();
    setToken(null);
    setUser(null);
  };

  if (!token || !user) return (
    <>
      <AuthScreen onAuth={handleAuth} />
      <Toast toasts={toasts} remove={remove} />
    </>
  );

  return (
    <div className="app">
      <Toast toasts={toasts} remove={remove} />
      <nav className="navbar">
        <div className="nav-brand">
          <span className="brand-icon-sm">⬡</span>
          <span className="nav-title">WorkPulse</span>
        </div>
        <div className="nav-tabs">
          <button className={tab === "attendance" ? "nav-tab active" : "nav-tab"}
            onClick={() => setTab("attendance")}>
            📋 Attendance
          </button>
          <button className={tab === "tasks" ? "nav-tab active" : "nav-tab"}
            onClick={() => setTab("tasks")}>
            ✓ Tasks
          </button>
        </div>
        <div className="nav-user">
          <div className="user-avatar">{user.name?.[0]?.toUpperCase() || "U"}</div>
          <span className="user-name">{user.name}</span>
          <button className="btn-logout" onClick={logout}>Sign Out</button>
        </div>
      </nav>

      <main className="main-content">
        {tab === "attendance" ? (
          <AttendancePanel token={token} toast={toast} />
        ) : (
          <TasksPanel token={token} toast={toast} />
        )}
      </main>
    </div>
  );
}
