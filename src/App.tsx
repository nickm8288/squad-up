import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Shooting Squad Finder with Supabase backend
//
// This file contains the core React components for the Squad Up app.
// The original version of this application stored data in
// localStorage.  To make the app multi‑user friendly and
// deployable, it now uses Supabase for authentication and data
// persistence.  The client reads and writes squads and members to
// Postgres tables via Supabase's API and listens to realtime
// changes to update the UI automatically.

// Configure the Supabase client using environment variables.  These
// values must be defined in your `.env` file (or set via the hosting
// provider) as VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.  See
// README or deployment guide for details.
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!,
);

// Supported disciplines for shooting squads.  Feel free to add more
// disciplines here if needed.
const DISCIPLINES = [
  "Sporting Clays",
  "Trap",
  "Skeet",
  "Five Stand",
  "Other",
] as const;

// Valid contact methods for squad leaders.  The ContactType type
// below references these strings directly.
const CONTACT_TYPES = ["Email", "Phone", "Text", "Link"] as const;
type ContactType = typeof CONTACT_TYPES[number];

// The Squad type used throughout the UI.  `members` are kept in
// memory on the client; on the backend they live in a separate
// `members` table keyed by squad_id.
export type Squad = {
  id: string;
  title: string;
  leaderName: string;
  date: string;
  time: string;
  location: string;
  discipline: string;
  capacity: number;
  message?: string;
  contact: { type: ContactType; value: string };
  leaderPin: string;
  members: { name: string; note?: string; joinedAt: number }[];
  createdAt: number;
};

// Row shape returned from Supabase for the squads table.  We use
// snake_case fields because that is how the SQL table is defined.  A
// helper below maps these rows to our client‑side Squad type.
type DBSquad = {
  id: string;
  title: string;
  leader_name: string;
  date: string;
  time: string;
  location: string;
  discipline: string;
  capacity: number;
  message: string | null;
  contact_type: ContactType;
  contact_value: string;
  leader_pin: string;
  created_at: string;
  created_by: string | null;
};

// Convert a row from the database into our Squad type.  Members are
// attached separately.
function mapFromDB(row: DBSquad): Omit<Squad, "members"> {
  return {
    id: row.id,
    title: row.title,
    leaderName: row.leader_name,
    date: row.date,
    time: row.time,
    location: row.location,
    discipline: row.discipline,
    capacity: row.capacity,
    message: row.message ?? undefined,
    contact: { type: row.contact_type, value: row.contact_value },
    leaderPin: row.leader_pin,
    createdAt: new Date(row.created_at).getTime(),
  };
}

// Generate a UUID as a fallback for client‑side keys.  Supabase
// generates its own UUIDs for rows, but when editing or joining
// squads locally we still use this helper for temporary keys (e.g.,
// list keys for React).  Modern browsers support crypto.randomUUID.
function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// Utility for cleaning phone numbers.  Removes anything that isn't
// a digit or plus sign so that phone numbers are consistently
// formatted when stored.
function sanitizePhone(p: string) {
  return p.replace(/[^+\d]/g, "");
}

// Provide a human readable label for the contact button based on the
// chosen contact method.
function contactLabel(method: ContactType) {
  if (method === "Email") return "Email leader";
  if (method === "Phone") return "Call leader";
  if (method === "Text") return "Text leader";
  return "Contact leader";
}

// Format a date and optional time string into a locale aware string.
function niceDate(dateStr: string, timeStr?: string) {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const [hh = 0, mm = 0] = (timeStr || "00:00").split(":").map(Number);
    const dt = new Date(y, m - 1, d, hh, mm);
    return dt.toLocaleString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return `${dateStr} ${timeStr || ""}`.trim();
  }
}

// Compare squads by upcoming date/time.  Used for sorting.
function byUpcoming(a: Squad, b: Squad) {
  return (
    new Date(`${a.date}T${a.time || "00:00"}`).getTime() -
    new Date(`${b.date}T${b.time || "00:00"}`).getTime()
  );
}

// Authentication gate.  Wraps the app and either shows a sign in
// form or renders the children when authenticated.  Uses Supabase
// magic link sign in via email.  If the user is not signed in, an
// email form is shown; when the link is clicked in the user's
// email, Supabase will update the auth state and the app will
// re‑render with the user context.
function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Check if a user is already signed in on mount.
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });
    // Listen for auth state changes.  When the auth session
    // updates (for example, after clicking a magic link), update
    // local user state.
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      },
    );
    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  // If no user is present, render a simple email sign in form.
  if (!user) {
    async function signInWithMagic(email: string) {
      // Trigger magic link sign in.  Supabase will send an email
      // to the provided address.  When the link is clicked, the
      // auth listener above will update the user state.
      await supabase.auth.signInWithOtp({ email });
      alert("Check your email for a sign in link");
    }

    return (
      <div className="min-h-screen grid place-items-center p-4 bg-slate-50">
        <div className="bg-white rounded-2xl shadow p-6 w-full max-w-md">
          <h2 className="text-xl font-semibold">Sign in</h2>
          <p className="text-sm text-slate-600 mt-1">
            Use your email to receive a magic link.
          </p>
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const email = formData.get("email") as string;
              signInWithMagic(email);
            }}
          >
            <input
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <button
              className="mt-3 px-4 py-2 rounded-xl bg-slate-900 text-white"
            >
              Send link
            </button>
          </form>
        </div>
      </div>
    );
  }

  // When authenticated, render the children.
  return <>{children}</>;
}

// Main application component.  Encapsulates browsing, posting,
// editing, and joining squads.  All data operations go through
// Supabase; realtime updates ensure state stays current without
// manual refreshes.
function MainApp() {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [tab, setTab] = useState<"browse" | "post">("browse");
  const [filters, setFilters] = useState({ query: "", discipline: "All", onlyUpcoming: true });
  const [joinTarget, setJoinTarget] = useState<Squad | null>(null);
  const [editTarget, setEditTarget] = useState<Squad | null>(null);
  const [toast, setToast] = useState<{ kind: "info" | "success" | "error"; text: string } | null>(null);

  // Load squads from Supabase and subscribe to realtime changes.  The
  // load function fetches all squads and their members, then sorts
  // them by upcoming date/time.  The subscription re‑runs load on
  // any insert, update, or delete event in the squads or members
  // tables.
  useEffect(() => {
    async function load() {
      const { data: rows } = await supabase
        .from("squads")
        .select("*")
        .order("date", { ascending: true });
      const squadRows = rows as DBSquad[] | null;
      const ids = squadRows?.map((r) => r.id) ?? [];
      // Fetch members for the fetched squads.
      const { data: membersData } = await supabase
        .from("members")
        .select("*")
        .in("squad_id", ids);
      // Group members by squad_id.
      const bySquad: Record<string, { name: string; note?: string; joinedAt: number }[]> = {};
      (membersData ?? []).forEach((m: any) => {
        const key = m.squad_id as string;
        if (!bySquad[key]) bySquad[key] = [];
        bySquad[key].push({
          name: m.name,
          note: m.note ?? undefined,
          joinedAt: new Date(m.joined_at).getTime(),
        });
      });
      // Map DB rows to client squads, attach members.
      const mapped = (squadRows ?? []).map((r) => {
        const base = mapFromDB(r);
        return {
          ...base,
          members: bySquad[base.id] ?? [],
        } as Squad;
      });
      setSquads(mapped.sort(byUpcoming));
    }
    load();
    // Subscribe to all changes on squads and members.  The channel
    // name can be arbitrary; using a single channel for both tables
    // simplifies cleanup.
    const ch = supabase.channel("squads-and-members");
    ch
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "squads" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "members" },
        () => load(),
      )
      .subscribe();
    // Cleanup subscription on unmount.
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  // Handler to add a new squad.  Inserts a row into the squads
  // table with all fields.  Note that row‑level security ensures
  // only authenticated users can insert rows; the created_by field
  // stores the current user's ID.
  async function addSquad(data: Omit<Squad, "id" | "members" | "createdAt">) {
    const user = (await supabase.auth.getUser()).data.user;
    await supabase.from("squads").insert({
      title: data.title,
      leader_name: data.leaderName,
      date: data.date,
      time: data.time,
      location: data.location,
      discipline: data.discipline,
      capacity: data.capacity,
      message: data.message ?? null,
      contact_type: data.contact.type,
      contact_value: data.contact.value,
      leader_pin: data.leaderPin,
      created_by: user?.id ?? null,
    });
    setTab("browse");
    setToast({ kind: "success", text: "Squad posted" });
  }

  // Handler to join a squad.  Adds a row to the members table.  Any
  // user (even not authenticated) can join according to the
  // Supabase policy.  After insertion, the realtime subscription
  // will refresh the state.
  async function joinSquad(id: string, member: { name: string; note?: string }) {
    await supabase.from("members").insert({
      squad_id: id,
      name: member.name,
      note: member.note ?? null,
    });
    setJoinTarget(null);
    setToast({ kind: "success", text: "Joined this squad" });
  }

  // Handler to delete a squad.  Verifies the leader PIN before
  // calling the Supabase delete API.  Only the creator of the squad
  // may delete it on the server, as enforced by row‑level security.
  async function deleteSquad(id: string, pin: string) {
    const s = squads.find((x) => x.id === id);
    if (!s) return;
    if (pin !== s.leaderPin) {
      setToast({ kind: "error", text: "PIN is incorrect" });
      return;
    }
    await supabase.from("squads").delete().eq("id", id);
    setToast({ kind: "success", text: "Squad deleted" });
  }

  // Handler to open the edit modal if the correct pin is provided.
  function startEdit(id: string, pin: string) {
    const s = squads.find((x) => x.id === id);
    if (!s) {
      setToast({ kind: "error", text: "Not found" });
      return;
    }
    if (pin !== s.leaderPin) {
      setToast({ kind: "error", text: "PIN is incorrect" });
      return;
    }
    setEditTarget(s);
  }

  // Handler to save edits to a squad.  Writes updated fields back
  // into the database.  After the update, the realtime subscription
  // will refresh the local state.
  async function saveEdit(updated: Squad) {
    await supabase
      .from("squads")
      .update({
        title: updated.title,
        leader_name: updated.leaderName,
        date: updated.date,
        time: updated.time,
        location: updated.location,
        discipline: updated.discipline,
        capacity: updated.capacity,
        message: updated.message ?? null,
        contact_type: updated.contact.type,
        contact_value: updated.contact.value,
        leader_pin: updated.leaderPin,
      })
      .eq("id", updated.id);
    setEditTarget(null);
    setToast({ kind: "success", text: "Squad updated" });
  }

  // Compute the visible squads based on current filters.  Only
  // upcoming squads are shown unless the filter is disabled.  Query
  // and discipline filters narrow down the list.
  const visible = useMemo(() => {
    const now = Date.now();
    return squads
      .filter((s) => {
        if (filters.onlyUpcoming) {
          const when = new Date(`${s.date}T${s.time || "00:00"}`).getTime();
          // drop squads older than 24h in the past
          if (when < now - 86_400_000) return false;
        }
        if (filters.discipline !== "All" && s.discipline !== filters.discipline) return false;
        if (filters.query) {
          const q = filters.query.toLowerCase();
          const hay = `${s.title} ${s.location} ${s.message || ""} ${s.leaderName}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort(byUpcoming);
  }, [squads, filters]);

  // Render the main UI: header with navigation, conditional post or
  // browse view, footer, and modals for joining and editing.
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-bold">Shooting Squad Finder</h1>
          <nav className="flex gap-2">
            <button
              className={`px-3 py-1.5 rounded-full text-sm ${
                tab === "browse"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-200 hover:bg-slate-300"
              }`}
              onClick={() => setTab("browse")}
            >
              Browse
            </button>
            <button
              className={`px-3 py-1.5 rounded-full text-sm ${
                tab === "post"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-200 hover:bg-slate-300"
              }`}
              onClick={() => setTab("post")}
            >
              Post
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {tab === "post" ? (
          <PostForm onSubmit={addSquad} />
        ) : (
          <>
            <Filters filters={filters} setFilters={setFilters} />
            {visible.length === 0 ? (
              <EmptyState onCreate={() => setTab("post")} />
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {visible.map((s) => (
                  <SquadCard
                    key={s.id}
                    squad={s}
                    onJoin={() => setJoinTarget(s)}
                    onDelete={(p) => deleteSquad(s.id, p)}
                    onEdit={(p) => startEdit(s.id, p)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="max-w-5xl mx-auto px-4 pb-10 text-xs text-slate-500">
        <p>
          Tip: set a 6 digit PIN that you will remember. You will need
          it to edit or delete your squad.
        </p>
        <p className="mt-1">This site is powered by Supabase and stores data in the cloud.</p>
      </footer>

      {joinTarget && (
        <JoinModal
          squad={joinTarget}
          onClose={() => setJoinTarget(null)}
          onJoin={(name, note) => joinSquad(joinTarget.id, { name, note })}
        />
      )}
      {editTarget && (
        <EditModal
          squad={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={saveEdit}
        />
      )}

      {toast && (
        <Toast kind={toast.kind} onClose={() => setToast(null)}>
          {toast.text}
        </Toast>
      )}
    </div>
  );
}

// Filters component for searching and narrowing down squads.  Passes
// updated filter state back to the parent via setFilters.
function Filters({ filters, setFilters }: any) {
  return (
    <div className="mb-6 grid gap-3 md:grid-cols-4">
      <div className="md:col-span-2">
        <label className="block text-sm font-medium mb-1">Search</label>
        <input
          type="text"
          placeholder="Search title, leader, or location"
          value={filters.query}
          onChange={(e) =>
            setFilters((f: any) => ({ ...f, query: e.target.value }))
          }
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Discipline</label>
        <select
          value={filters.discipline}
          onChange={(e) =>
            setFilters((f: any) => ({ ...f, discipline: e.target.value }))
          }
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
        >
          <option>All</option>
          {DISCIPLINES.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </div>
      <div className="flex items-end">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={filters.onlyUpcoming}
            onChange={(e) =>
              setFilters((f: any) => ({ ...f, onlyUpcoming: e.target.checked }))
            }
          />
          Only upcoming
        </label>
      </div>
    </div>
  );
}

// Form for posting a new squad.  Handles local validation and
// sanitisation before delegating to the supplied onSubmit handler.
function PostForm({ onSubmit }: { onSubmit: (s: Omit<Squad, "id" | "members" | "createdAt">) => void }) {
  const [title, setTitle] = useState("");
  const [leaderName, setLeaderName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [discipline, setDiscipline] = useState(DISCIPLINES[0]);
  const [capacity, setCapacity] = useState(4);
  const [message, setMessage] = useState("");
  const [contactType, setContactType] = useState<ContactType>("Email");
  const [contactValue, setContactValue] = useState("");
  const [leaderPin, setLeaderPin] = useState("");
  const [errors, setErrors] = useState<any>({});

  function validate() {
    const e: any = {};
    if (!title.trim()) e.title = "Title is required";
    if (!leaderName.trim()) e.leaderName = "Leader name is required";
    if (!date) e.date = "Date is required";
    if (!time) e.time = "Time is required";
    if (!location.trim()) e.location = "Location is required";
    if (!capacity || Number(capacity) < 1) e.capacity = "Capacity must be at least 1";
    if (!contactValue.trim()) e.contact = "Contact detail is required";
    if (
      contactType === "Email" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactValue.trim())
    )
      e.contact = "Enter a valid email";
    if (
      (contactType === "Phone" || contactType === "Text") &&
      !/^\+?\d[\d\s().-]{6,}$/.test(contactValue.trim())
    )
      e.contact = "Enter a valid phone number";
    if (!leaderPin.trim()) e.leaderPin = "PIN is required";
    else if (!/^\d{6}$/.test(leaderPin.trim())) e.leaderPin = "PIN must be 6 digits";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit(e: any) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      title: title.trim(),
      leaderName: leaderName.trim(),
      date,
      time,
      location: location.trim(),
      discipline,
      capacity: Number(capacity),
      message: message.trim(),
      contact: {
        type: contactType,
        value:
          contactType === "Phone" || contactType === "Text"
            ? sanitizePhone(contactValue)
            : contactValue.trim(),
      },
      leaderPin: leaderPin.trim(),
    });
    setTitle("");
    setLeaderName("");
    setDate("");
    setTime("");
    setLocation("");
    setDiscipline(DISCIPLINES[0]);
    setCapacity(4);
    setMessage("");
    setContactType("Email");
    setContactValue("");
    setLeaderPin("");
  }

  return (
    <form
      onSubmit={submit}
      className="bg-white rounded-2xl shadow p-4 md:p-6 grid gap-4"
    >
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Title" error={errors.title}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Saturday clays"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
          />
        </Field>
        <Field label="Leader name" error={errors.leaderName}>
          <input
            value={leaderName}
            onChange={(e) => setLeaderName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
          />
        </Field>
        <Field label="Date" error={errors.date}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
          />
        </Field>
        <Field label="Time" error={errors.time}>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
          />
        </Field>
        <Field label="Location" error={errors.location}>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Club name or address"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
          />
        </Field>
        <Field label="Discipline">
          <select
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value as typeof DISCIPLINES[number])}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
          >
            {DISCIPLINES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Capacity (includes leader)" error={errors.capacity}>
          <input
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
          />
        </Field>
        <Field label="Contact" error={errors.contact}>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={contactType}
              onChange={(e) => setContactType(e.target.value as ContactType)}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
            >
              {CONTACT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <input
              value={contactValue}
              onChange={(e) => setContactValue(e.target.value)}
              placeholder={
                contactType === "Email"
                  ? "name@email.com"
                  : contactType === "Phone" || contactType === "Text"
                  ? "+1 555 123 4567"
                  : "https://example.com/chat"
              }
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
        </Field>
      </div>
      <Field label="Leader PIN" error={errors.leaderPin}>
        <input
          type="password"
          value={leaderPin}
          onChange={(e) => setLeaderPin(e.target.value)}
          placeholder="6 digit PIN"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
        />
      </Field>
      <Field label="Details (optional)">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Easy pace, new shooters welcome"
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
        />
      </Field>
      <div className="flex gap-3">
        <button
          type="submit"
          className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
        >
          Post squad
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300"
          onClick={() => {
            setTitle("");
            setLeaderName("");
            setDate("");
            setTime("");
            setLocation("");
            setDiscipline(DISCIPLINES[0]);
            setCapacity(4);
            setMessage("");
            setContactType("Email");
            setContactValue("");
            setLeaderPin("");
          }}
        >
          Reset
        </button>
      </div>
    </form>
  );
}

// Display an individual squad card in the list.  Shows details and
// includes buttons for contact, join, edit, and delete.
function SquadCard({
  squad,
  onJoin,
  onDelete,
  onEdit,
}: {
  squad: Squad;
  onJoin: () => void;
  onDelete: (pin: string) => void;
  onEdit: (pin: string) => void;
}) {
  const used = 1 + squad.members.length;
  const left = Math.max(0, squad.capacity - used);
  const full = left === 0;

  return (
    <div className="bg-white rounded-2xl shadow p-4 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{squad.title}</h3>
          <p className="text-sm text-slate-600">
            {niceDate(squad.date, squad.time)}
          </p>
          <p className="text-sm text-slate-600">{squad.location}</p>
        </div>
        <span className="inline-flex items-center text-xs rounded-full px-2 py-1 bg-slate-100 border border-slate-200">
          {squad.discipline}
        </span>
      </div>

      {squad.message && (
        <p className="mt-3 text-sm text-slate-800">{squad.message}</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <div className="text-slate-500">Leader</div>
          <div className="font-medium">{squad.leaderName}</div>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <div className="text-slate-500">Spots</div>
          <div className="font-medium">
            {used} of {squad.capacity} filled
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-sm font-medium">Roster</div>
        {squad.members.length === 0 ? (
          <p className="text-sm text-slate-500">No joiners yet</p>
        ) : (
          <ul className="text-sm list-disc pl-5">
            {squad.members.map((m, i) => (
              <li key={i} className="text-slate-800">
                <span className="font-medium">{m.name}</span>
                {m.note ? (
                  <span className="text-slate-600"> - {m.note}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <ContactReveal contact={squad.contact} />
        <button
          disabled={full}
          onClick={onJoin}
          className={`px-3 py-2 rounded-xl text-sm border ${full
            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
            : "bg-white hover:bg-slate-50 border-slate-300"}
          `}
        >
          {full ? "Squad is full" : "Join squad"}
        </button>
        <PinAction label="Edit" color="amber" onSubmit={onEdit} />
        <PinAction label="Delete" color="red" onSubmit={onDelete} />
      </div>
    </div>
  );
}

// Button and display to reveal a leader's contact info on demand.
function ContactReveal({ contact }: { contact: { type: ContactType; value: string } }) {
  const [shown, setShown] = useState(false);
  const label = contactLabel(contact.type);
  return (
    <div>
      {!shown ? (
        <button
          onClick={() => setShown(true)}
          className="px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-sm"
        >
          {label}
        </button>
      ) : (
        <div className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm">
          <span className="font-medium mr-1">{contact.type}:</span>
          <span className="break-all">{contact.value}</span>
        </div>
      )}
    </div>
  );
}

// Generic button that prompts for a PIN before invoking the callback.
// Used for editing and deleting squads.  Colour schemes are derived
// based on the provided colour prop.
function PinAction({
  label,
  color,
  onSubmit,
}: {
  label: string;
  color: "red" | "amber";
  onSubmit: (pin: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const colors =
    color === "red"
      ? {
          btn: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
          cta: "bg-red-600 hover:bg-red-500",
        }
      : {
          btn: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
          cta: "bg-amber-600 hover:bg-amber-500",
        };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`px-3 py-2 rounded-xl border text-sm ${colors.btn}`}
      >
        {label}
      </button>
      {open && (
        <div className="absolute z-10 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow p-3">
          <div className="text-sm mb-2">
            Enter leader PIN to {label.toLowerCase()}
          </div>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="6 digit PIN"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
          />
          <div className="mt-2 flex gap-2 justify-end">
            <button
              className="px-3 py-1.5 text-sm rounded-lg bg-slate-200"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              className={`px-3 py-1.5 text-sm rounded-lg text-white ${colors.cta}`}
              onClick={() => {
                onSubmit(pin.trim());
                setPin("");
                setOpen(false);
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Modal for joining a squad.  Collects a name and an optional note
// from the user and invokes the provided onJoin callback with the
// values.  Displays an error if the name is missing.
function JoinModal({
  squad,
  onClose,
  onJoin,
}: {
  squad: Squad;
  onClose: () => void;
  onJoin: (name: string, note?: string) => void;
}) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  function submit(e: any) {
    e.preventDefault();
    if (!name.trim()) {
      setErr("Name is required");
      return;
    }
    onJoin(name.trim(), note.trim());
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-4">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold">Join squad</h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-slate-600 mt-1">
          {squad.title} at {niceDate(squad.date, squad.time)}
        </p>
        <form onSubmit={submit} className="mt-4 grid gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Your name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Note for the leader (optional)
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="I can bring shells"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-sm"
            >
              Join
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal for editing a squad.  Prepopulates fields with the current
// squad values.  When the form is submitted, it calls onSave with
// the updated squad object.  Note that editing does not permit
// changing the PIN; the original PIN remains unchanged.
function EditModal({
  squad,
  onClose,
  onSave,
}: {
  squad: Squad;
  onClose: () => void;
  onSave: (s: Squad) => void;
}) {
  const [title, setTitle] = useState(squad.title);
  const [leaderName, setLeaderName] = useState(squad.leaderName);
  const [date, setDate] = useState(squad.date);
  const [time, setTime] = useState(squad.time);
  const [location, setLocation] = useState(squad.location);
  const [discipline, setDiscipline] = useState(squad.discipline);
  const [capacity, setCapacity] = useState(squad.capacity);
  const [message, setMessage] = useState(squad.message ?? "");
  const [contactType, setContactType] = useState<ContactType>(squad.contact.type);
  const [contactValue, setContactValue] = useState(squad.contact.value);
  const [members] = useState(squad.members);
  const [err, setErr] = useState<any>({});

  function validate() {
    const e: any = {};
    if (!title.trim()) e.title = "Title is required";
    if (!leaderName.trim()) e.leaderName = "Leader name is required";
    if (!date) e.date = "Date is required";
    if (!time) e.time = "Time is required";
    if (!location.trim()) e.location = "Location is required";
    if (!capacity || Number(capacity) < 1) e.capacity = "Capacity must be at least 1";
    if (!contactValue.trim()) e.contact = "Contact detail is required";
    if (
      contactType === "Email" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactValue.trim())
    )
      e.contact = "Enter a valid email";
    if (
      (contactType === "Phone" || contactType === "Text") &&
      !/^\+?\d[\d\s().-]{6,}$/.test(contactValue.trim())
    )
      e.contact = "Enter a valid phone number";
    setErr(e);
    return Object.keys(e).length === 0;
  }

  function submit(e: any) {
    e.preventDefault();
    if (!validate()) return;
    onSave({
      id: squad.id,
      members,
      createdAt: squad.createdAt,
      leaderPin: squad.leaderPin,
      title: title.trim(),
      leaderName: leaderName.trim(),
      date,
      time,
      location: location.trim(),
      discipline,
      capacity: Number(capacity),
      message: message.trim() || undefined,
      contact: {
        type: contactType,
        value:
          contactType === "Phone" || contactType === "Text"
            ? sanitizePhone(contactValue)
            : contactValue.trim(),
      },
    });
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-4">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold">Edit squad</h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800"
          >
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="mt-4 grid gap-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Title" error={err.title}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
              />
            </Field>
            <Field label="Leader name" error={err.leaderName}>
              <input
                value={leaderName}
                onChange={(e) => setLeaderName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
              />
            </Field>
            <Field label="Date" error={err.date}>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
              />
            </Field>
            <Field label="Time" error={err.time}>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
              />
            </Field>
            <Field label="Location" error={err.location}>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
              />
            </Field>
            <Field label="Discipline">
              <select
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value as typeof DISCIPLINES[number])}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
              >
                {DISCIPLINES.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Capacity (includes leader)" error={err.capacity}>
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
              />
            </Field>
            <Field label="Contact" error={err.contact}>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={contactType}
                  onChange={(e) => setContactType(e.target.value as ContactType)}
                  className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
                >
                  {CONTACT_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <input
                  value={contactValue}
                  onChange={(e) => setContactValue(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
            </Field>
          </div>
          <Field label="Details (optional)">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-sm"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Simple wrapper for labelled form fields with optional error
// messages.  Used by both PostForm and EditModal to reduce
// repetition.
function Field({ label, children, error }: any) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
    </div>
  );
}

// Empty state displayed when there are no squads available to show.
// Provides a quick link back to the posting form.
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-20">
      <p className="text-lg">No squads to display.</p>
      <button
        onClick={onCreate}
        className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
      >
        Post a squad
      </button>
    </div>
  );
}

// Toast component for displaying transient messages.  Shows the
// message text and dismisses itself after a few seconds.  The kind
// prop controls the colour of the toast.
function Toast({ kind, onClose, children }: { kind: "info" | "success" | "error"; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [onClose]);
  const colours =
    kind === "success"
      ? {
          bg: "bg-green-50",
          text: "text-green-800",
          border: "border-green-200",
        }
      : kind === "error"
      ? {
          bg: "bg-red-50",
          text: "text-red-800",
          border: "border-red-200",
        }
      : {
          bg: "bg-blue-50",
          text: "text-blue-800",
          border: "border-blue-200",
        };
  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
      <div
        className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow ${colours.bg} ${colours.border} border`}
      >
        <span className={`${colours.text}`}>{children}</span>
        <button onClick={onClose} className="text-sm">
          ✕
        </button>
      </div>
    </div>
  );
}

// Export the top‑level component.  AuthGate wraps MainApp to ensure
// that only authenticated users can access the main functionality.
export default function App() {
  return (
    <AuthGate>
      <MainApp />
    </AuthGate>
  );
}