"use client";

import { useState } from "react";
import { CalendarDays, CalendarPlus } from "lucide-react";
import CalendarModal from "@/components/instructor/CalendarModal";
import type { CalendarEvent, InstructorCourse } from "@/lib/instructor/mock-data";
import { isoToday, toISODate, parseISODate, TYPE_LABEL, TYPE_STYLE } from "@/lib/instructor/calendar";

export default function CalendarPanel({
  events,
  courses,
}: {
  events: CalendarEvent[];
  courses: InstructorCourse[];
}) {
  const [showCalendar, setShowCalendar] = useState(false);
  const today = new Date();
  const todayIso = isoToday();

  const weekStrip = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const iso = toISODate(date);
    return {
      iso,
      day: date.getDate(),
      weekday: date.toLocaleDateString("en-US", { weekday: "narrow" }),
      isToday: iso === todayIso,
      hasEvent: events.some((event) => event.date === iso),
    };
  });

  const upcomingEvents = events
    .filter((event) => event.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  return (
    <div className="border border-gray-200 rounded-md bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold flex items-center gap-1.5">
          <CalendarDays size={14} className="text-primary" />
          Upcoming
        </h3>
        <button
          type="button"
          onClick={() => setShowCalendar(true)}
          className="text-xs font-bold text-primary hover:underline"
        >
          View full calendar
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-4">
        {weekStrip.map((cell) => (
          <div
            key={cell.iso}
            className={`flex flex-col items-center gap-1 rounded py-1.5 ${
              cell.isToday ? "bg-black text-white" : "text-gray-700"
            }`}
          >
            <span className="text-[10px]">{cell.weekday}</span>
            <span className="text-xs font-bold">{cell.day}</span>
            <span
              className={`w-1 h-1 rounded-full ${
                cell.hasEvent ? "bg-primary" : "bg-transparent"
              }`}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col divide-y divide-gray-100">
        {upcomingEvents.map((event) => {
          const date = parseISODate(event.date);
          return (
            <div key={event.id} className="flex gap-3 py-2.5">
              <div className="w-9 shrink-0 text-center">
                <p className="text-[10px] text-gray-400">
                  {date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                </p>
                <p className="text-sm font-bold">{date.getDate()}</p>
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
              </div>
            </div>
          );
        })}
        {upcomingEvents.length === 0 && (
          <p className="text-xs text-gray-400 py-2">No upcoming events.</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => window.alert("This would give you an iCal subscription link.")}
        className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-bold text-gray-500 border border-gray-200 rounded py-1.5 hover:bg-gray-50"
      >
        <CalendarPlus size={13} />
        Subscribe to this calendar
      </button>

      {showCalendar && (
        <CalendarModal events={events} courses={courses} onClose={() => setShowCalendar(false)} />
      )}
    </div>
  );
}
