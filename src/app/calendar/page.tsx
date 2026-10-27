"use client";
// Calendar — your own week: add events (one-off or repeating), see them on a week grid or a 24 h day,
// and overlay what intra already knows (the campus events you're subscribed to and your scheduled
// evaluations). Your events are saved per 42 login on the server, with this browser as a fallback.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiPlus } from "react-icons/fi";
import { useStoredState } from "@/component/tracker/useTracker";
import { CAL_CATS, type CalCat, type CalEvent, type CalRepeat, type IntraItem } from "@/app/api/calendar/calendar.types";

type Cat = CalCat | "intra";
const CAT_LABEL: Record<Cat, string> = {
  study: "42 & study", eval: "Evaluations", exam: "Exams", work: "Work", sport: "Sport", life: "Life", intra: "Intra events",
};
const REPEAT_LABEL: Record<CalRepeat, string> = { none: "Does not repeat", daily: "Every day", weekdays: "Every weekday (Mon–Fri)", weekly: "Every week" };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const iso = (d: Date) => d.toLocaleDateString("en-CA");
const fromIso = (s: string) => new Date(`${s}T00:00:00`);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const fmtH = (min: number) => `${Math.floor(min / 60)}${min % 60 ? `h${String(min % 60).padStart(2, "0")}` : " h"}`;
const weekIdx = (d: Date) => (d.getDay() + 6) % 7;
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const HOUR = 44; // px per hour (week view)

/** One block on one day: a user event (or the part of it on that day), or an intra item. */
interface Seg { key: string; date: string; start: number; end: number; title: string; cat: Cat; ev?: CalEvent; intra?: IntraItem }

function occursOn(e: CalEvent, d: Date) {
  const day = iso(d);
  if (day < e.date) return false;
  if (e.repeat === "none") return day === e.date;
  if (e.repeat === "daily") return true;
  if (e.repeat === "weekdays") return d.getDay() >= 1 && d.getDay() <= 5;
  return d.getDay() === fromIso(e.date).getDay();
}

// An event whose end is at or before its start runs past midnight: "23:00–01:00" on Monday is
// Mon 23:00–24:00 + Tue 00:00–01:00.
function userSegs(events: CalEvent[], dates: Date[]): Seg[] {
  return dates.flatMap((d) => events.flatMap((e): Seg[] => {
    const start = toMin(e.start), end = toMin(e.end), overnight = end <= start;
    const out: Seg[] = [];
    if (occursOn(e, d)) out.push({ key: `${e.id}@${iso(d)}`, date: iso(d), start, end: overnight ? 24 * 60 : end, title: e.title, cat: e.cat, ev: e });
    if (overnight && end > 0 && occursOn(e, addDays(d, -1))) out.push({ key: `${e.id}@${iso(d)}~`, date: iso(d), start: 0, end, title: e.title, cat: e.cat, ev: e });
    return out;
  }));
}

function intraSegs(items: IntraItem[], dates: Date[]): Seg[] {
  return dates.flatMap((d) => {
    const dayStart = d.getTime(), dayEnd = addDays(d, 1).getTime();
    return items.flatMap((it): Seg[] => {
      const b = new Date(it.begin).getTime(), e = new Date(it.end).getTime();
      if (e <= dayStart || b >= dayEnd) return [];
      return [{
        key: `${it.id}@${iso(d)}`, date: iso(d), title: it.title, cat: it.kind === "eval" ? "eval" : "intra", intra: it,
        start: Math.round((Math.max(b, dayStart) - dayStart) / 60_000), end: Math.round((Math.min(e, dayEnd) - dayStart) / 60_000),
      }];
    });
  });
}

/** Free stretches of at least 30 min between a day's blocks. */
function freeGaps(segs: Seg[]) {
  const sorted = [...segs].sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  let t = 0;
  for (const s of sorted) { if (s.start - t >= 30) out.push({ start: t, end: s.start }); t = Math.max(t, s.end); }
  if (24 * 60 - t >= 30) out.push({ start: t, end: 24 * 60 });
  return out;
}

type Sync = "loading" | "saved" | "saving" | "local";

/**
 * Your events: loaded from /api/calendar, cached in this browser, saved back on every change.
 * The cache is tagged with the login so a shared computer never hands one student's events to the next.
 */
function useCalendarEvents() {
  const [cache, setCache] = useStoredState<{ login: string | null; events: CalEvent[] }>("37c-calendar-events", { login: null, events: [] });
  const [sync, setSync] = useState<Sync>("loading");

  const push = useCallback((next: CalEvent[]) => {
    setSync("saving");
    fetch("/api/calendar", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { events: next } }) })
      .then((r) => setSync(r.ok ? "saved" : "local"))
      .catch(() => setSync("local"));
  }, []);

  useEffect(() => {
    fetch("/api/calendar", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const { login, data } = await r.json() as { login: string; data: { events: CalEvent[] } | null };
        if (data) { setCache({ login, events: data.events }); setSync("saved"); return; }
        // Nothing on the server yet: upload what this browser saved for the same login while offline.
        let local: { login: string | null; events: CalEvent[] } | null = null;
        try { local = JSON.parse(localStorage.getItem("37c-calendar-events") || "null"); } catch { /* storage unavailable */ }
        const mine = local?.login === login ? local.events : [];
        setCache({ login, events: mine });
        if (mine.length) push(mine); else setSync("saved");
      })
      .catch(() => setSync("local"));
  }, [setCache, push]);

  const save = useCallback((next: CalEvent[]) => { setCache((c) => ({ ...c, events: next })); push(next); }, [setCache, push]);
  return { events: cache.events ?? [], save, sync };
}

export default function CalendarPage() {
  const { events, save, sync } = useCalendarEvents();
  const [now, setNow] = useState<Date | null>(null);
  const [view, setView] = useStoredState<"week" | "day">("37c-calendar-view", "week");
  const [offset, setOffset] = useState(0); // weeks from this one (week view) or days from today (day view)
  const [hidden, setHidden] = useStoredState<Cat[]>("37c-calendar-hidden", []);
  const [showNight, setShowNight] = useStoredState<boolean>("37c-calendar-night", false);
  const [showIntra, setShowIntra] = useStoredState<boolean>("37c-calendar-intra", true);
  const [intra, setIntra] = useState<IntraItem[]>([]);
  const [intraError, setIntraError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Seg | null>(null);
  const [draft, setDraft] = useState<CalEvent | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);

  const today = now ? iso(now) : "";
  const monday = now ? addDays(fromIso(today), -weekIdx(now) + offset * 7) : null;
  const dayDate = now ? addDays(fromIso(today), offset) : null;
  const dates = useMemo(() => (view === "day" ? (dayDate ? [dayDate] : []) : monday ? DAYS.map((_, i) => addDays(monday, i)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, today, offset]);
  const rangeFrom = dates[0] ? iso(dates[0]) : "";
  const rangeTo = dates.length ? iso(addDays(dates[dates.length - 1], 1)) : "";

  useEffect(() => {
    if (!showIntra || !rangeFrom) return;
    let live = true;
    const qs = new URLSearchParams({ from: fromIso(rangeFrom).toISOString(), to: fromIso(rangeTo).toISOString() });
    fetch(`/api/calendar/intra?${qs}`, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
        if (live) { setIntra(body.items); setIntraError(null); }
      })
      .catch((e: Error) => live && setIntraError(e.message));
    return () => { live = false; };
  }, [showIntra, rangeFrom, rangeTo]);

  const segs = useMemo(() => [...userSegs(events, dates), ...(showIntra ? intraSegs(intra, dates) : [])], [events, intra, showIntra, dates]);
  const isVisible = (s: Seg) => !hidden.includes(s.cat) && !(s.intra && hidden.includes("intra"));
  const visible = segs.filter(isVisible);

  // The day view is always the full 24 h. The week view starts at 07:00 (or the earliest block) unless "Full 24 h" is on.
  const earliest = Math.min(...visible.map((s) => s.start), 7 * 60);
  const from = view === "day" || showNight ? 0 : Math.floor(earliest / 60) * 60;
  const hours = Array.from({ length: (24 * 60 - from) / 60 }, (_, i) => from / 60 + i);
  const hourPx = view === "day" ? 52 : HOUR;
  const nowMin = now ? now.getHours() * 60 + now.getMinutes() : -1;

  const openNew = useCallback((date: string, startMin = 9 * 60) => {
    const start = Math.min(startMin, 23 * 60);
    setDraft({ id: newId(), title: "", cat: "study", date, start: hhmm(start), end: hhmm(Math.min(start + 60, 24 * 60 - 5)), repeat: "none" });
    setSelected(null);
    setFormError(null);
  }, []);
  const isNew = !!draft && !events.some((e) => e.id === draft.id);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) { setFormError("Give the event a title."); return; }
    if (draft.start === draft.end) { setFormError("Start and end can't be the same time."); return; }
    const clean: CalEvent = { ...draft, title, notes: draft.notes?.trim() || undefined };
    save(isNew ? [...events, clean] : events.map((x) => (x.id === clean.id ? clean : x)));
    setDraft(null);
  };
  const remove = (id: string) => {
    if (!window.confirm("Delete this event (and every repeat of it)?")) return;
    save(events.filter((e) => e.id !== id));
    setDraft(null);
    setSelected(null);
  };

  const switchView = (v: "week" | "day") => { setView(v); setOffset(0); setSelected(null); };
  const openDay = (date: Date) => { if (!now) return; setView("day"); setOffset(Math.round((date.getTime() - fromIso(today).getTime()) / 86_400_000)); setSelected(null); };
  // ← / → move by a week or a day; D / W switch view; N adds an event.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowLeft") setOffset((o) => o - 1);
      if (e.key === "ArrowRight") setOffset((o) => o + 1);
      if (e.key === "d" || e.key === "w") { setView(e.key === "d" ? "day" : "week"); setOffset(0); }
      if (e.key === "n" && now) openNew(iso(now), Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [setView, now, openNew]);

  const stats = useMemo(() => {
    const own = segs.filter((s) => s.ev);
    const sum = (cats: Cat[]) => own.filter((s) => cats.includes(s.cat)).reduce((a, s) => a + s.end - s.start, 0);
    return {
      total: sum([...CAL_CATS]), study: sum(["study", "eval", "exam"]), work: sum(["work"]), sport: sum(["sport"]),
      evals: segs.filter((s) => s.intra?.kind === "eval").length, intraEvents: segs.filter((s) => s.intra?.kind === "event").length,
    };
  }, [segs]);

  const toggleCat = (c: Cat) => setHidden((h) => (h.includes(c) ? h.filter((x) => x !== c) : [...h, c]));
  const clickSlot = (date: string, e: React.MouseEvent<HTMLDivElement>) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    openNew(date, Math.floor((from + (y / hourPx) * 60) / 30) * 30);
  };
  const daySegs = (date: string) => visible.filter((s) => s.date === date);
  const period = view === "day" ? "day" : "week";

  return (
    <div className="cg-page">
      <div className="cg-toolbar">
        <button className="cg-button" onClick={() => now && openNew(view === "day" && dayDate ? iso(dayDate) : today)} title="New event (N)"><FiPlus style={{ verticalAlign: -2 }} /> New event</button>
        <span className="cg-tabs" role="group" aria-label="View">
          <button className="cg-tab" aria-pressed={view === "week"} onClick={() => switchView("week")} title="Week (W)">Week</button>
          <button className="cg-tab" aria-pressed={view === "day"} onClick={() => switchView("day")} title="Day (D)">Day · 24 h</button>
        </span>
        <span className="cal-nav">
          <button className="c-icon-btn" aria-label={`Previous ${period}`} title="← key" onClick={() => setOffset((o) => o - 1)}><FiChevronLeft /></button>
          <button className="cg-button" disabled={offset === 0} onClick={() => setOffset(0)}>{view === "week" ? "This week" : "Today"}</button>
          <button className="c-icon-btn" aria-label={`Next ${period}`} title="→ key" onClick={() => setOffset((o) => o + 1)}><FiChevronRight /></button>
        </span>
        <b>{view === "day"
          ? dayDate?.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) ?? ""
          : monday ? `${monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${addDays(monday, 6).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}</b>
        <span className="cal-legend">
          {(Object.keys(CAT_LABEL) as Cat[]).filter((c) => c !== "intra" || showIntra).map((c) => (
            <button key={c} className={`cal-chip cal-c-${c}`} aria-pressed={!hidden.includes(c)} onClick={() => toggleCat(c)}>{CAT_LABEL[c]}</button>
          ))}
        </span>
        <label className="cal-night"><input type="checkbox" checked={showIntra} onChange={(e) => setShowIntra(e.target.checked)} /> Show intra</label>
        {view === "week" && <label className="cal-night"><input type="checkbox" checked={showNight} onChange={(e) => setShowNight(e.target.checked)} /> Full 24 h</label>}
        <span className="cg-muted" role="status">
          {sync === "loading" ? "Loading…" : sync === "saving" ? "Saving…" : sync === "saved" ? "Saved to your account" : "Saved in this browser only (server unavailable)"}
        </span>
      </div>

      <div className="cg-row">
        <div className="cg-stat"><b>{fmtH(stats.total)}</b><span>planned this {period}</span></div>
        <div className="cg-stat"><b>{fmtH(stats.study)}</b><span>42, evaluations &amp; exams</span></div>
        <div className="cg-stat"><b>{fmtH(stats.work)}</b><span>work</span></div>
        <div className="cg-stat"><b>{fmtH(stats.sport)}</b><span>sport</span></div>
        {showIntra && <div className="cg-stat"><b>{stats.evals} · {stats.intraEvents}</b><span>{intraError ? `intra unavailable: ${intraError}` : "evaluations · events on intra"}</span></div>}
      </div>

      <div className={`cal-day-layout ${view === "day" ? "is-day" : ""}`}>
        <div className="cal-wrap" role="region" aria-label={view === "day" ? "Day calendar" : "Week calendar"} tabIndex={0}>
          <div className={`cal-grid ${view === "day" ? "cal-grid--day" : ""}`}>
            <div className="cal-corner" />
            {dates.map((date) => {
              const d = iso(date);
              return (
                <button key={d} className={`cal-head ${d === today ? "is-today" : ""}`} onClick={() => view === "week" && openDay(date)}
                  title={view === "week" ? "Open this day hour by hour" : undefined} disabled={view === "day"}>
                  <span>{DAYS[weekIdx(date)]}</span>
                  <b>{date.getDate()}</b>
                  <small>{(() => { const n = daySegs(d).length; return n ? `${n} block${n > 1 ? "s" : ""}` : "free"; })()}</small>
                </button>
              );
            })}

            <div className="cal-times" style={{ height: hours.length * hourPx }}>
              {hours.map((h) => <span key={h} style={{ top: (h * 60 - from) / 60 * hourPx }}>{String(h).padStart(2, "0")}:00</span>)}
            </div>
            {dates.map((date) => {
              const d = iso(date);
              const mine = daySegs(d);
              return (
                <div key={d} className={`cal-col cal-col--add ${d === today ? "is-today" : ""}`} style={{ height: hours.length * hourPx }}
                  onClick={(e) => clickSlot(d, e)} title="Click an empty slot to add an event">
                  {hours.map((h) => <i key={h} className="cal-line" style={{ top: (h * 60 - from) / 60 * hourPx }} />)}
                  {view === "day" && hours.map((h) => <i key={`h${h}`} className="cal-line cal-line--half" style={{ top: (h * 60 + 30 - from) / 60 * hourPx }} />)}
                  {view === "day" && freeGaps(mine).filter((g) => g.end - g.start >= 60).map((g) => (
                    <span key={g.start} className="cal-free" style={{ top: g.start / 60 * hourPx + 2, height: (g.end - g.start) / 60 * hourPx - 4 }}>free {hhmm(g.start)}–{hhmm(g.end)}</span>
                  ))}
                  {mine.filter((s) => s.end > from).map((s) => {
                    const top = (Math.max(s.start, from) - from) / 60 * hourPx;
                    const height = Math.max(18, (s.end - Math.max(s.start, from)) / 60 * hourPx - 2);
                    const active = selected?.key === s.key;
                    return (
                      <button key={s.key} className={`cal-ev cal-c-${s.cat} ${s.intra ? "is-intra" : ""} ${active ? "is-active" : ""} ${height < 34 ? "is-short" : ""}`}
                        style={{ top, height }} title={`${s.title} · ${hhmm(s.start)}–${hhmm(s.end)}`}
                        onClick={(e) => { e.stopPropagation(); setSelected(active ? null : s); setDraft(null); }}>
                        <b>{s.title}</b><span>{hhmm(s.start)}–{hhmm(s.end)} · {fmtH(s.end - s.start)}</span>
                        {s.ev?.notes && height > 70 && <em>{s.ev.notes}</em>}
                      </button>
                    );
                  })}
                  {d === today && nowMin >= from && <i className="cal-now" style={{ top: (nowMin - from) / 60 * hourPx }} />}
                </div>
              );
            })}
          </div>
        </div>
        {view === "day" && dayDate && (
          <section className="hp-card cal-agenda">
            <header><b>Hour by hour</b><span className="cg-muted">{DAYS[weekIdx(dayDate)]}</span></header>
            <ol>
              {[...daySegs(iso(dayDate)).map((s) => ({ start: s.start, end: s.end, s })), ...freeGaps(daySegs(iso(dayDate))).map((g) => ({ ...g, s: null }))]
                .sort((a, b) => a.start - b.start)
                .map(({ start, end, s }) => (
                  <li key={s?.key ?? `free${start}`} className={s ? `cal-c-${s.cat}` : "is-free"}>
                    <time>{hhmm(start)}–{hhmm(end)}</time>
                    {s ? <button onClick={() => { setSelected(s); setDraft(null); }}>{s.title}</button> : <button className="cg-muted" onClick={() => openNew(iso(dayDate), start)}>Free — add</button>}
                    <small>{fmtH(end - start)}</small>
                  </li>
                ))}
            </ol>
          </section>
        )}
      </div>

      <div className="hp-grid">
        <section className="hp-card">
          {draft ? (
            <form className="cal-form" onSubmit={submit}>
              <header><b>{isNew ? "New event" : "Edit event"}</b></header>
              <label>Title<input autoFocus value={draft.title} maxLength={120} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. ft_irc with my team" /></label>
              <div className="cal-form-row">
                <label>Category
                  <select value={draft.cat} onChange={(e) => setDraft({ ...draft, cat: e.target.value as CalCat })}>
                    {CAL_CATS.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                  </select>
                </label>
                <label>Repeat
                  <select value={draft.repeat} onChange={(e) => setDraft({ ...draft, repeat: e.target.value as CalRepeat })}>
                    {(Object.keys(REPEAT_LABEL) as CalRepeat[]).map((r) => <option key={r} value={r}>{REPEAT_LABEL[r]}</option>)}
                  </select>
                </label>
              </div>
              <div className="cal-form-row">
                <label>{draft.repeat === "none" ? "Date" : "Starting"}<input type="date" required value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
                <label>From<input type="time" required step={300} value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></label>
                <label>To<input type="time" required step={300} value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></label>
              </div>
              {toMin(draft.end) < toMin(draft.start) && <p className="cg-muted">Ends the next day, at {draft.end}.</p>}
              <label>Notes<textarea rows={3} maxLength={2000} value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
              {formError && <p className="cal-check--warn" role="alert">{formError}</p>}
              <div className="cg-toolbar">
                <button type="submit" className="cg-button">{isNew ? "Add event" : "Save"}</button>
                <button type="button" className="cg-button" onClick={() => setDraft(null)}>Cancel</button>
                {!isNew && <button type="button" className="cg-button" onClick={() => remove(draft.id)}>Delete</button>}
              </div>
            </form>
          ) : selected ? (
            <>
              <header><b>{selected.title}</b><span className="cg-muted">{fmtH(selected.end - selected.start)}</span></header>
              <p className="cg-muted">
                {fromIso(selected.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · {hhmm(selected.start)}–{hhmm(selected.end)} · {CAT_LABEL[selected.cat]}
                {selected.ev && selected.ev.repeat !== "none" ? ` · ${REPEAT_LABEL[selected.ev.repeat].toLowerCase()}` : ""}
              </p>
              {selected.ev?.notes && <p className="hp-note" style={{ whiteSpace: "pre-wrap" }}>{selected.ev.notes}</p>}
              {selected.intra && (
                <>
                  {selected.intra.location && <p className="hp-note">📍 {selected.intra.location}</p>}
                  {selected.intra.detail && <p className="hp-note">{selected.intra.detail}</p>}
                  <p className="cg-muted">From intra — change it on intra.</p>
                </>
              )}
              {selected.ev && (
                <div className="cg-toolbar">
                  <button className="cg-button" onClick={() => { setDraft(selected.ev!); setFormError(null); }}>Edit</button>
                  <button className="cg-button" onClick={() => remove(selected.ev!.id)}>Delete</button>
                </div>
              )}
            </>
          ) : (
            <>
              <header><b>Your calendar</b></header>
              <p className="cg-muted">Click an empty slot (or press N) to add an event, and click an event to see or edit it. Events can repeat every day, every weekday or every week, and an end time before the start runs past midnight.</p>
              {events.length === 0 && <p className="cg-muted">No events yet — block out your project sessions, exams and evaluations.</p>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
