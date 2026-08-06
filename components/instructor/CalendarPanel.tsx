"use client";

import { ChevronLeft, ChevronRight, CalendarPlus } from "lucide-react";
import {
  calendarMonthLabel,
  calendarWeekStrip,
  calendarEvents,
  type CalendarEventType,
} from "@/lib/instructor/mock-data";

const TYPE_LABEL: Record<CalendarEventType, string> = {
  "live-talk": "Live talk",
  "office-hours": "Office hours",
  "new-unit": "New unit",
  "cohort-launch": "Cohort launch",
};

const TYPE_STYLE: Record<CalendarEventType, string> = {
  "live-talk": "bg-red-100 text-red-700",
  "office-hours": "bg-gray-100 text-gray-600",
  "new-unit": "bg-blue-100 text-blue-700",
  "cohort-launch": "bg-purple-100 text-purple-700",
};

export default function CalendarPanel() {
  return (
    <div className="border border-gray-200 rounded-md bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">{calendarMonthLabel}</h3>
        <div className="flex items-center gap-1 text-gray-300">
          <ChevronLeft size={15} />
          <ChevronRight size={15} />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-4">
        {calendarWeekStrip.map((cell, i) => (
          <div
            key={i}
            className={`flex flex-col items-center gap-1 rounded py-1.5 ${
              i === 0 ? "bg-black text-white" : cell.dimmed ? "text-gray-300" : "text-gray-700"
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
        {calendarEvents.map((event) => (
          <div key={event.id} className="flex gap-3 py-2.5">
            <div className="w-9 shrink-0 text-center">
              <p className="text-[10px] text-gray-400">{event.weekday}</p>
              <p className="text-sm font-bold">{event.day}</p>
            </div>
            <div className="flex-1 min-w-0">
              <span
                className={`inline-block text-[10px] font-bold rounded px-1.5 py-0.5 mb-1 ${TYPE_STYLE[event.type]}`}
              >
                {TYPE_LABEL[event.type].toUpperCase()}
              </span>
              <p className="text-xs font-bold leading-tight">{event.label}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {event.time ? `${event.time} · ` : ""}
                {event.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => window.alert("This would give you an iCal subscription link.")}
        className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-bold text-primary border border-primary/30 rounded py-1.5 hover:bg-primary/5"
      >
        <CalendarPlus size={13} />
        Subscribe to this calendar
      </button>
    </div>
  );
}
