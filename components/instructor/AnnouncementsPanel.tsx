"use client";

import { useState } from "react";
import { Send, X } from "lucide-react";
import {
  instructorName,
  initialAnnouncements,
  type Announcement,
} from "@/lib/instructor/mock-data";

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AnnouncementsPanel({
  courses,
}: {
  courses: { code: string; title: string }[];
}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialAnnouncements);
  const [draft, setDraft] = useState("");
  const [targetCourseCode, setTargetCourseCode] = useState(courses[0]?.code ?? "");

  const post = () => {
    const message = draft.trim();
    if (!message || !targetCourseCode) return;
    setAnnouncements((prev) => [
      {
        id: `ann-${Date.now()}`,
        authorName: instructorName,
        authorInitials: initialsOf(instructorName),
        courseCode: targetCourseCode,
        timestamp: "Just now",
        message,
      },
      ...prev,
    ]);
    setDraft("");
  };

  const remove = (id: string) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="border border-gray-200 rounded-md bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">Announcements</h3>
      </div>

      <div className="mb-4">
        <select
          value={targetCourseCode}
          onChange={(e) => setTargetCourseCode(e.target.value)}
          className="w-full text-xs font-bold text-gray-600 border border-gray-200 rounded px-2 py-1.5 mb-2 bg-white"
        >
          {courses.map((course) => (
            <option key={course.code} value={course.code}>
              {course.code} — {course.title}
            </option>
          ))}
        </select>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Post an update to your students…"
          rows={2}
          className="w-full text-sm border border-gray-200 rounded px-2.5 py-2 resize-none focus:outline-none focus:border-primary/50"
        />
        <button
          type="button"
          onClick={post}
          disabled={!draft.trim() || !targetCourseCode}
          className="mt-1.5 w-full flex items-center justify-center gap-1.5 text-xs font-bold bg-primary text-white rounded py-1.5 disabled:opacity-40"
        >
          <Send size={13} />
          Post announcement
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {announcements.map((announcement) => (
          <div key={announcement.id} className="group flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gray-100 text-[10px] font-bold text-gray-500 flex items-center justify-center shrink-0">
              {announcement.authorInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold">{announcement.authorName}</span>
                <span className="text-[10px] font-bold text-primary">
                  {announcement.courseCode}
                </span>
                <span className="text-[10px] text-gray-400">{announcement.timestamp}</span>
              </div>
              <p className="text-xs text-gray-600 mt-0.5">{announcement.message}</p>
            </div>
            <button
              type="button"
              aria-label="Delete announcement"
              onClick={() => remove(announcement.id)}
              className="shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 self-start"
            >
              <X size={13} />
            </button>
          </div>
        ))}
        {announcements.length === 0 && (
          <p className="text-xs text-gray-400">No announcements yet.</p>
        )}
      </div>
    </div>
  );
}
