import { useMemo, useState } from "react";
import type {
  CreateRecoveryActivityBody,
  RecoveryActivity,
  RecoveryActivityCategory,
  RecoverySession,
} from "@health-dashboard/shared";
import {
  useArchiveRecoveryActivity,
  useCreateRecoveryActivity,
  useCreateRecoverySession,
  useDeleteRecoverySession,
  useRecoveryActivities,
  useRecoverySessions,
  useUpdateRecoveryActivity,
  useUpdateRecoverySession,
  useUserTimezone,
} from "../api/queries";
import {
  addDays,
  formatDateInTz,
  formatLocalDateTimeInput,
  localDateTimeToUtc,
  todayInTz,
} from "../lib/userTz";

const tabs = ["Log", "Library"] as const;
type Tab = (typeof tabs)[number];
type HistoryRange = "30d" | "90d" | "all";
const inputClass = "w-full rounded-lg bg-surface-container-lowest border border-outline-variant/20 px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelClass = "text-[10px] text-outline uppercase tracking-wider font-bold mb-1 block";

export function Recovery() {
  const [activeTab, setActiveTab] = useState<Tab>("Log");
  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-on-surface">Recovery</h1>
          <p className="text-on-surface-variant mt-1">Log heat therapy, massage, and other recovery sessions.</p>
        </div>
        <div className="flex gap-1 p-1.5 bg-surface-container-low rounded-2xl border border-outline-variant/10">
          {tabs.map((tab) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-widest ${activeTab === tab ? "bg-primary text-on-primary-fixed" : "text-outline hover:text-on-surface"}`}>
              {tab}
            </button>
          ))}
        </div>
      </header>
      {activeTab === "Log" ? <RecoveryLog /> : <RecoveryLibrary />}
    </div>
  );
}
function RecoveryLog() {
  const timezone = useUserTimezone();
  const today = todayInTz(timezone);
  const [range, setRange] = useState<HistoryRange>("30d");
  const start = range === "all" ? undefined : addDays(today, range === "30d" ? -30 : -90);
  const activities = useRecoveryActivities();
  const sessions = useRecoverySessions(start, today);
  const create = useCreateRecoverySession();
  const update = useUpdateRecoverySession();
  const remove = useDeleteRecoverySession();
  const [selected, setSelected] = useState<RecoveryActivity | null>(null);
  const [editing, setEditing] = useState<RecoverySession | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const partitioned = useMemo(() => {
    const rows = sessions.data ?? [];
    return {
      today: rows.filter((row) => formatDateInTz(row.startedAt, timezone) === today),
      history: rows.filter((row) => formatDateInTz(row.startedAt, timezone) !== today),
    };
  }, [sessions.data, timezone, today]);
  const editorActivity = editing
    ? activities.data?.find((activity) => activity.id === editing.activityId) ?? null
    : selected;

  return (
    <div className="space-y-6">
      {editorActivity && (
        <SessionEditor
          key={`${editing?.id ?? "new"}-${editorActivity.id}`}
          activity={editorActivity}
          session={editing}
          timezone={timezone}
          saving={create.isPending || update.isPending}
          serverError={create.error?.message ?? update.error?.message ?? null}
          onClose={() => { setSelected(null); setEditing(null); create.reset(); update.reset(); }}
          onSave={async (body) => {
            if (editing) await update.mutateAsync({ id: editing.id, body });
            else await create.mutateAsync({ activityId: editorActivity.id, ...body });
            setSelected(null);
            setEditing(null);
          }}
        />
      )}

      <section className="bg-surface-container rounded-xl p-4 sm:p-5 border border-outline-variant/10">
        <h2 className="font-headline text-lg font-semibold text-on-surface mb-1">Quick log</h2>
        <p className="text-sm text-on-surface-variant mb-4">Choose an activity, then confirm its time and duration.</p>
        {activities.isLoading ? <p className="text-sm text-outline">Loading activities…</p> : activities.error ? (
          <p role="alert" className="text-sm text-error">{activities.error.message}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {(activities.data ?? []).map((activity) => (
              <button key={activity.id} type="button" aria-label={`Quick log ${activity.name}`}
                onClick={() => { setEditing(null); setSelected(activity); }}
                className="text-left p-4 rounded-xl bg-surface-container-low hover:bg-primary/10 border border-outline-variant/10 focus:outline-none focus:ring-2 focus:ring-primary/40">
                <span className="material-symbols-outlined text-secondary" aria-hidden="true">
                  {activity.category === "heat_therapy" ? "heat" : activity.category === "massage" ? "spa" : "self_improvement"}
                </span>
                <span className="block font-headline font-semibold text-on-surface mt-2">{activity.name}</span>
                <span className="block text-xs text-outline mt-1">
                  {activity.defaultDurationMinutes ? `${activity.defaultDurationMinutes} min default` : "Duration required"}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <SessionList title="Today" sessions={partitioned.today} timezone={timezone}
        empty="No recovery sessions logged today." editingId={editing?.id ?? null}
        deletingId={remove.isPending ? remove.variables ?? null : null} confirmDelete={confirmDelete}
        onEdit={(session) => { setSelected(null); setEditing(session); }}
        onAskDelete={setConfirmDelete} onDelete={async (id) => { await remove.mutateAsync(id); setConfirmDelete(null); }} />

      <SessionList title="History" sessions={partitioned.history} timezone={timezone}
        empty="No recovery sessions in this range." editingId={editing?.id ?? null}
        deletingId={remove.isPending ? remove.variables ?? null : null} confirmDelete={confirmDelete}
        onEdit={(session) => { setSelected(null); setEditing(session); }}
        onAskDelete={setConfirmDelete} onDelete={async (id) => { await remove.mutateAsync(id); setConfirmDelete(null); }}
        range={range} onRangeChange={setRange} />
    </div>
  );
}

function SessionEditor({ activity, session, timezone, saving, serverError, onClose, onSave }: {
  activity: RecoveryActivity;
  session: RecoverySession | null;
  timezone: string;
  saving: boolean;
  serverError: string | null;
  onClose: () => void;
  onSave: (body: {
    startedAt: string; durationMinutes: number; intensity: number | null;
    temperatureF: number | null; massageType: string | null; notes: string | null;
  }) => Promise<void>;
}) {
  const [startedLocal, setStartedLocal] = useState(() => formatLocalDateTimeInput(session?.startedAt ?? new Date(), timezone));
  const [duration, setDuration] = useState(session ? String(session.durationMinutes) : activity.defaultDurationMinutes?.toString() ?? "");
  const [intensity, setIntensity] = useState(session?.intensity?.toString() ?? "");
  const [temperature, setTemperature] = useState(session?.temperatureF?.toString() ?? "");
  const [massageType, setMassageType] = useState(session?.massageType ?? "");
  const [notes, setNotes] = useState(session?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes <= 0) { setError("Duration must be a positive whole number of minutes."); return; }
    try {
      await onSave({
        startedAt: localDateTimeToUtc(startedLocal, timezone),
        durationMinutes: minutes,
        intensity: intensity ? Number(intensity) : null,
        temperatureF: temperature ? Number(temperature) : null,
        massageType: massageType.trim() || null,
        notes: notes.trim() || null,
      });
      onClose();
    } catch {
      // Mutation errors stay in the form for retry.
    }
  };

  return (
    <section role="region" aria-label={`${session ? "Edit" : "Log"} ${activity.name} session`}
      className="bg-surface-container-high rounded-2xl p-4 sm:p-5 border border-primary/25 shadow-sm">
      <h2 className="font-headline text-lg font-bold text-on-surface">{session ? "Edit" : "Log"} {activity.name}</h2>
      <p className="text-xs text-outline mt-1 mb-5">Times use {timezone}.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label><span className={labelClass}>Started at</span><input aria-label="Started at" type="datetime-local" value={startedLocal} onChange={(e) => setStartedLocal(e.target.value)} className={inputClass} /></label>
        <label><span className={labelClass}>Duration minutes</span><input aria-label="Duration minutes" type="number" min="1" step="1" value={duration} onChange={(e) => setDuration(e.target.value)} className={inputClass} /></label>
        <label><span className={labelClass}>Intensity optional</span><select aria-label="Intensity" value={intensity} onChange={(e) => setIntensity(e.target.value)} className={inputClass}><option value="">Not recorded</option>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        {activity.category === "heat_therapy" && <label><span className={labelClass}>Temperature °F optional</span><input aria-label="Temperature °F" type="number" min="1" step="0.1" value={temperature} onChange={(e) => setTemperature(e.target.value)} className={inputClass} /></label>}
        {activity.category === "massage" && <label><span className={labelClass}>Massage type optional</span><input aria-label="Massage type" value={massageType} onChange={(e) => setMassageType(e.target.value)} placeholder="e.g. deep tissue" className={inputClass} /></label>}
      </div>
      <label className="block mt-3"><span className={labelClass}>Notes optional</span><textarea aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} /></label>
      {(error || serverError) && <p role="alert" className="text-sm text-error mt-3">{error ?? serverError}</p>}
      <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2 mt-5">
        <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2.5 text-xs font-bold rounded-lg text-outline hover:bg-surface-container-highest">Cancel</button>
        <button type="button" onClick={() => void submit()} disabled={saving} className="px-5 py-2.5 text-xs font-bold rounded-lg bg-primary text-on-primary-fixed disabled:opacity-50">{saving ? "Saving…" : "Save session"}</button>
      </div>
    </section>
  );
}

function SessionList({ title, sessions, timezone, empty, editingId, deletingId, confirmDelete, onEdit, onAskDelete, onDelete, range, onRangeChange }: {
  title: string; sessions: RecoverySession[]; timezone: string; empty: string; editingId: number | null;
  deletingId: number | null; confirmDelete: number | null; onEdit: (session: RecoverySession) => void;
  onAskDelete: (id: number | null) => void; onDelete: (id: number) => Promise<void>;
  range?: HistoryRange; onRangeChange?: (range: HistoryRange) => void;
}) {
  return (
    <section className="bg-surface-container rounded-xl p-4 sm:p-5 border border-outline-variant/10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="font-headline text-lg font-semibold text-on-surface">{title}</h2>
        {range && onRangeChange && <div className="flex gap-1" role="group" aria-label="History range">{(["30d","90d","all"] as const).map((value) => <button key={value} type="button" aria-pressed={range === value} onClick={() => onRangeChange(value)} className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${range === value ? "bg-primary text-on-primary-fixed" : "bg-surface-container-low text-outline"}`}>{value}</button>)}</div>}
      </div>
      {sessions.length === 0 ? <p className="text-sm text-on-surface-variant">{empty}</p> : <div className="space-y-2">{sessions.map((session) => {
        const when = new Intl.DateTimeFormat([], { timeZone: timezone, month: title === "Today" ? undefined : "short", day: title === "Today" ? undefined : "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(session.startedAt));
        return <article key={session.id} className={`p-3 rounded-xl bg-surface-container-low ${editingId === session.id ? "ring-2 ring-primary/30" : ""}`}>
          <div className="flex items-start gap-3"><span className="material-symbols-outlined text-secondary" aria-hidden="true">{session.activityCategory === "heat_therapy" ? "heat" : session.activityCategory === "massage" ? "spa" : "self_improvement"}</span>
            <div className="flex-1 min-w-0"><p className="font-headline font-semibold text-sm text-on-surface">{session.activityName}</p><p className="text-xs text-on-surface-variant">{when} · {session.durationMinutes} min{session.intensity ? ` · intensity ${session.intensity}` : ""}</p>
              {(session.temperatureF || session.massageType) && <p className="text-xs text-outline mt-1">{session.temperatureF ? `${session.temperatureF} °F` : session.massageType}</p>}
              {session.notes && <p className="text-xs text-outline mt-1 break-words">{session.notes}</p>}
              <p className="text-[10px] text-outline mt-1 uppercase tracking-wider">{session.source === "ai_chat" ? "Logged through AI chat" : "Logged manually"}</p>
            </div>
            <button type="button" aria-label={`Edit ${session.activityName} session`} onClick={() => onEdit(session)} className="h-10 w-10 text-outline hover:text-on-surface rounded-lg"><span className="material-symbols-outlined text-base">edit</span></button>
            <button type="button" aria-label={`Delete ${session.activityName} session`} onClick={() => onAskDelete(session.id)} className="h-10 w-10 text-outline hover:text-error rounded-lg"><span className="material-symbols-outlined text-base">delete</span></button>
          </div>
          {confirmDelete === session.id && <div className="mt-3 pt-3 border-t border-outline-variant/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2"><p className="text-xs text-on-surface-variant">Delete this session? This cannot be undone.</p><div className="flex gap-2"><button type="button" onClick={() => onAskDelete(null)} className="px-3 py-2 text-xs font-bold text-outline">Keep</button><button type="button" disabled={deletingId === session.id} onClick={() => void onDelete(session.id)} className="px-3 py-2 text-xs font-bold text-error bg-error/10 rounded-lg">{deletingId === session.id ? "Deleting…" : "Delete"}</button></div></div>}
        </article>;
      })}</div>}
    </section>
  );
}

function RecoveryLibrary() {
  const activities = useRecoveryActivities(true);
  const create = useCreateRecoveryActivity();
  const update = useUpdateRecoveryActivity();
  const archive = useArchiveRecoveryActivity();
  const [editing, setEditing] = useState<RecoveryActivity | "new" | null>(null);
  return <div className="space-y-4">
    <div className="flex justify-between items-center"><div><h2 className="font-headline text-xl font-semibold text-on-surface">Activity library</h2><p className="text-sm text-on-surface-variant">Set defaults or add another recovery activity.</p></div><button type="button" onClick={() => setEditing("new")} className="px-4 py-2.5 rounded-xl bg-primary text-on-primary-fixed text-xs font-bold">Add activity</button></div>
    {editing && <ActivityEditor key={editing === "new" ? "new" : editing.id} activity={editing === "new" ? null : editing} saving={create.isPending || update.isPending} onClose={() => setEditing(null)} onSave={async (body) => { if (editing === "new") await create.mutateAsync(body as CreateRecoveryActivityBody); else await update.mutateAsync({ id: editing.id, body }); setEditing(null); }} />}
    {activities.isLoading ? <p className="text-sm text-outline">Loading activities…</p> : <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{(activities.data ?? []).map((activity) => <article key={activity.id} className="p-4 rounded-xl bg-surface-container border border-outline-variant/10"><div className="flex justify-between gap-3"><div><h3 className="font-headline font-semibold text-on-surface">{activity.name}</h3><p className="text-xs text-outline">{activity.category.replace("_", " ")} · {activity.defaultDurationMinutes ? `${activity.defaultDurationMinutes} min default` : "no duration default"}{activity.isActive ? "" : " · archived"}</p>{activity.notes && <p className="text-sm text-on-surface-variant mt-2">{activity.notes}</p>}</div><div className="flex"><button type="button" aria-label={`Edit ${activity.name}`} onClick={() => setEditing(activity)} className="h-10 w-10 text-outline"><span className="material-symbols-outlined">edit</span></button>{activity.isActive && <button type="button" aria-label={`Archive ${activity.name}`} onClick={() => void archive.mutateAsync(activity.id)} className="h-10 w-10 text-outline hover:text-error"><span className="material-symbols-outlined">archive</span></button>}</div></div></article>)}</div>}
  </div>;
}

function ActivityEditor({ activity, saving, onClose, onSave }: { activity: RecoveryActivity | null; saving: boolean; onClose: () => void; onSave: (body: CreateRecoveryActivityBody | { name: string; defaultDurationMinutes: number | null; notes: string | null; isActive?: boolean }) => Promise<void> }) {
  const [name, setName] = useState(activity?.name ?? "");
  const [category, setCategory] = useState<RecoveryActivityCategory>(activity?.category ?? "other");
  const [duration, setDuration] = useState(activity?.defaultDurationMinutes?.toString() ?? "");
  const [notes, setNotes] = useState(activity?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const submit = async () => { if (!name.trim()) { setError("Name is required."); return; } const value = duration ? Number(duration) : null; if (value != null && (!Number.isInteger(value) || value <= 0)) { setError("Default duration must be a positive whole number."); return; } const base = { name: name.trim(), defaultDurationMinutes: value, notes: notes.trim() || null }; try { await onSave(activity ? base : { ...base, code: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""), category }); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save activity."); } };
  return <section className="p-4 sm:p-5 rounded-2xl bg-surface-container-high border border-primary/25"><h3 className="font-headline font-bold text-on-surface mb-4">{activity ? `Edit ${activity.name}` : "Add recovery activity"}</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label><span className={labelClass}>Name</span><input aria-label="Activity name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></label>{!activity && <label><span className={labelClass}>Category</span><select aria-label="Activity category" value={category} onChange={(e) => setCategory(e.target.value as RecoveryActivityCategory)} className={inputClass}><option value="heat_therapy">Heat therapy</option><option value="massage">Massage</option><option value="other">Other</option></select></label>}<label><span className={labelClass}>Default duration minutes optional</span><input aria-label="Default duration minutes" type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} className={inputClass} /></label><label><span className={labelClass}>Notes optional</span><input aria-label="Activity notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} /></label></div>{error && <p role="alert" className="text-sm text-error mt-3">{error}</p>}<div className="flex justify-end gap-2 mt-4"><button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-outline">Cancel</button><button type="button" disabled={saving} onClick={() => void submit()} className="px-4 py-2 rounded-lg bg-primary text-on-primary-fixed text-xs font-bold">{saving ? "Saving…" : "Save activity"}</button></div></section>;
}
