"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import {
  instructorCourses,
  type CalendarEvent,
  type CalendarEventType,
} from "@/lib/instructor/mock-data";
import { addCalendarEvent, deleteCalendarEvent } from "@/lib/instructor/data/calendar-events";
import {
  WEEKDAY_LABELS,
  isoToday,
  parseISODate,
  formatMonthLabel,
  addMonths,
  getMonthGrid,
  TYPE_LABEL,
  TYPE_STYLE,
} from "@/lib/instructor/calendar";

const EMPTY_FORM = {
  title: "",
  date: isoToday(),
  type: "live-talk" as CalendarEventType,
  time: "",
  description: "",
  scope: "global" as string, // "global" or a course code
};

export default function CalendarView({
  events,
  onClose,
}: {
  events: CalendarEvent[];
  onClose: () => void;
}) {
  const todayIso = isoToday();
  const now = new Date();

  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(todayIso);
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();

  // `events` is already scoped server-side to this instructor's own courses
  // plus global events — just apply the UI's scope-filter toggle on top.
  const filteredEvents = useMemo(() => {
    if (scopeFilter === "all") return events;
    if (scopeFilter === "global") return events.filter((e) => e.scope === "global");
    return events.filter((e) => e.courseCode === scopeFilter);
  }, [events, scopeFilter]);

  const grid = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of filteredEvents) {
      map.set(event.date, [...(map.get(event.date) ?? []), event]);
    }
    return map;
  }, [filteredEvents]);

  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];

  const goToMonth = (delta: number) => {
    const next = addMonths(viewYear, viewMonth, delta);
    setViewYear(next.year);
    setViewMonth(next.month);
  };

  const goToday = () => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(todayIso);
  };

  const openAddForm = () => {
    setForm({ ...EMPTY_FORM, date: selectedDate ?? todayIso });
    setShowAddForm(true);
  };

  const submitAddForm = (e: React.FormEvent) => {
    e.preventDefault();
    const title = form.title.trim();
    if (!title || !form.date) return;

    const newDate = parseISODate(form.date);
    setViewYear(newDate.getFullYear());
    setViewMonth(newDate.getMonth());
    setSelectedDate(form.date);
    setShowAddForm(false);

    startTransition(async () => {
      await addCalendarEvent({
        date: form.date,
        title,
        type: form.type,
        time: form.time.trim(),
        description: form.description.trim(),
        scope: form.scope === "global" ? "global" : "course",
        courseCode: form.scope === "global" ? undefined : form.scope,
      });
    });
  };

  const removeEvent = (id: string) => {
    startTransition(async () => {
      await deleteCalendarEvent(id);
    });
  };

  const scopeOptions = [
    { value: "all", label: "All events" },
    { value: "global", label: "Global" },
    ...instructorCourses.map((c) => ({ value: c.code, label: c.code })),
  ];

  return (
    <div className={isPending ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-primary tracking-wide">CALENDAR</p>
        <button
          type="button"
          aria-label="Close calendar"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => goToMonth(-1)}
          aria-label="Previous month"
          className="text-primary border border-primary/30 rounded p-1.5 hover:bg-primary/10"
        >
          <ChevronLeft size={16} />
        </button>
        <h2 className="text-xl font-serif font-bold w-48 text-center">
          {formatMonthLabel(viewYear, viewMonth)}
        </h2>
        <button
          type="button"
          onClick={() => goToMonth(1)}
          aria-label="Next month"
          className="text-primary border border-primary/30 rounded p-1.5 hover:bg-primary/10"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="flex justify-center mb-4">
        <button
          type="button"
          onClick={goToday}
          className="text-xs font-bold text-primary hover:underline"
        >
          Jump to today
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-2 mb-4">
        {scopeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setScopeFilter(option.value)}
            className={`text-xs font-bold rounded-full px-3 py-1.5 border ${
              scopeFilter === option.value
                ? "bg-black text-white border-black"
                : "text-gray-600 border-gray-200 hover:bg-gray-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
        <div className="border border-gray-200 rounded-md bg-white p-4">
          <div className="grid grid-cols-7 mb-2">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="text-[10px] font-bold text-gray-400 text-center py-1"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell) => {
              const dayEvents = eventsByDate.get(cell.iso) ?? [];
              const isToday = cell.iso === todayIso;
              const isSelected = cell.iso === selectedDate;

              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => setSelectedDate(cell.iso)}
                  className={`flex flex-col items-center gap-1 rounded py-2 text-xs transition ${
                    !cell.inCurrentMonth ? "text-gray-300" : "text-gray-700"
                  } ${isToday ? "bg-black text-white" : "hover:bg-gray-50"} ${
                    isSelected && !isToday ? "ring-2 ring-primary" : ""
                  }`}
                >
                  <span className="font-bold">{cell.day}</span>
                  <span className="flex gap-0.5 h-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span
                        key={event.id}
                        className={`w-1 h-1 rounded-full ${
                          isToday ? "bg-white" : "bg-primary"
                        }`}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="border border-gray-200 rounded-md bg-white p-4">
            <div className="flex items-center justify-between mb-3 gap-2">
              <h3 className="text-sm font-bold">
                {selectedDate
                  ? parseISODate(selectedDate).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })
                  : "Select a day"}
              </h3>
              <button
                type="button"
                onClick={openAddForm}
                className="shrink-0 flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                <Plus size={13} />
                Add event
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {selectedEvents.map((event) => (
                <div key={event.id} className="group flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-gray-100 text-[10px] font-bold text-gray-500 flex items-center justify-center shrink-0">
                    {event.hostInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span
                      className={`inline-block text-[10px] font-bold rounded px-1.5 py-0.5 mb-1 ${TYPE_STYLE[event.type]}`}
                    >
                      {TYPE_LABEL[event.type].toUpperCase()}
                    </span>
                    <p className="text-xs font-bold leading-tight">{event.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {event.time ? `${event.time} · ` : ""}
                      {event.description}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {event.scope === "global" ? "Global" : event.courseCode} · Hosted by{" "}
                      {event.hostName}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Delete event"
                    onClick={() => removeEvent(event.id)}
                    className="shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 self-start"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              {selectedDate && selectedEvents.length === 0 && (
                <p className="text-xs text-gray-400">No events this day.</p>
              )}
              {!selectedDate && (
                <p className="text-xs text-gray-400">Click a day to see its events.</p>
              )}
            </div>
          </div>

          {showAddForm && (
            <form
              onSubmit={submitAddForm}
              className="border border-gray-200 rounded-md bg-white p-4 flex flex-col gap-2.5"
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold">Add event</h3>
                <button
                  type="button"
                  aria-label="Close add-event form"
                  onClick={() => setShowAddForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              </div>

              <input
                required
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Event title"
                className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-primary/50"
              />

              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 bg-white focus:outline-none focus:border-primary/50"
              />

              <select
                value={form.type}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, type: e.target.value as CalendarEventType }))
                }
                className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 bg-white"
              >
                {Object.entries(TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              <input
                value={form.time}
                onChange={(e) => setForm((prev) => ({ ...prev, time: e.target.value }))}
                placeholder="Time (optional), e.g. 5:00–6:00pm ET"
                className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-primary/50"
              />

              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Description (optional)"
                rows={2}
                className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 resize-none focus:outline-none focus:border-primary/50"
              />

              <select
                value={form.scope}
                onChange={(e) => setForm((prev) => ({ ...prev, scope: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded px-2.5 py-1.5 bg-white"
              >
                <option value="global">Global (all students)</option>
                {instructorCourses.map((course) => (
                  <option key={course.code} value={course.code}>
                    {course.code} — {course.title}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                className="mt-1 w-full text-xs font-bold bg-primary text-white rounded py-1.5"
              >
                Save event
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
