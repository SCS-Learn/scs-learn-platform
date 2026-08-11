"use client";

import { CheckCircle2, AlertTriangle, OctagonAlert } from "lucide-react";
import InstructorHeader from "@/components/instructor/InstructorHeader";
import {
  courseAnalytics,
  type InstructorCourse,
  type StudentStatus,
} from "@/lib/instructor/mock-data";

const statusConfig: Record<
  StudentStatus,
  { label: string; icon: typeof CheckCircle2; text: string; dot: string }
> = {
  "on-track": { label: "On track", icon: CheckCircle2, text: "text-green-700", dot: "bg-green-600" },
  behind: { label: "Behind", icon: AlertTriangle, text: "text-amber-700", dot: "bg-amber-500" },
  "at-risk": { label: "At risk", icon: OctagonAlert, text: "text-red-700", dot: "bg-red-600" },
};

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 bg-white p-5">
      <p className="text-xs font-bold text-gray-500 tracking-wide mb-2">{label}</p>
      <p className="text-3xl font-serif font-bold tabular-nums">{value}</p>
    </div>
  );
}

export default function AnalyticsClient({ course }: { course: InstructorCourse }) {
  const analytics = courseAnalytics[course.code];

  if (!analytics) {
    return (
      <main className="min-h-screen bg-gray-50 text-black">
        <InstructorHeader backHref="/instructor" backLabel="Back to dashboard" />
        <div className="w-[60%] mx-auto px-6 py-10 text-gray-500">
          No analytics available for this course.
        </div>
      </main>
    );
  }

  const maxQuizCount = Math.max(...analytics.quizScoreDistribution.map((b) => b.count), 1);

  return (
    <main className="min-h-screen bg-gray-50 text-black">
      <InstructorHeader backHref={`/instructor/${course.code}`} backLabel="Back to editor" />

      <div className="w-[70%] mx-auto px-6 py-10">
        <p className="text-xs font-bold text-primary tracking-wide mb-1">
          {course.code} · ANALYTICS
        </p>
        <h1 className="text-3xl font-serif font-bold mb-1">{course.title}</h1>
        <p className="text-gray-500 mb-8">
          Sample data for demo purposes — not connected to real student activity yet.
        </p>

        {analytics.totalStudents === 0 ? (
          <div className="border border-dashed border-gray-300 bg-white p-10 text-center text-gray-400">
            No students enrolled yet. Analytics will appear once this course opens.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-4 mb-8">
              <StatTile label="TOTAL STUDENTS" value={String(analytics.totalStudents)} />
              <StatTile label="AVG. PROGRESS" value={`${analytics.avgProgress}%`} />
              <StatTile label="AVG. QUIZ SCORE" value={`${analytics.avgQuizScore}%`} />
              <StatTile label="ACTIVE THIS WEEK" value={String(analytics.activeThisWeek)} />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="border border-gray-200 bg-white p-5">
                <h2 className="text-sm font-bold mb-4">Completion by unit</h2>
                <div className="flex flex-col gap-3">
                  {analytics.unitCompletion.map((unit) => (
                    <div key={unit.unitCode}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-700">
                          {unit.unitCode} — {unit.unitTitle}
                        </span>
                        <span className="text-gray-500 tabular-nums shrink-0 ml-3">
                          {unit.completionPercent === null ? "No content" : `${unit.completionPercent}%`}
                        </span>
                      </div>
                      <div
                        className="h-2 bg-gray-100 w-full"
                        title={
                          unit.completionPercent === null
                            ? `${unit.unitCode}: no lessons yet`
                            : `${unit.unitCode}: ${unit.completionPercent}% of students completed`
                        }
                      >
                        {unit.completionPercent !== null && (
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${unit.completionPercent}%` }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-gray-200 bg-white p-5">
                <h2 className="text-sm font-bold mb-4">Quiz score distribution</h2>
                <div className="flex items-end justify-between gap-3 h-40">
                  {analytics.quizScoreDistribution.map((bucket) => (
                    <div
                      key={bucket.range}
                      className="flex-1 flex flex-col items-center justify-end h-full"
                      title={`${bucket.range}: ${bucket.count} students`}
                    >
                      <span className="text-xs text-gray-500 tabular-nums mb-1">{bucket.count}</span>
                      <div
                        className="w-full bg-primary/80 hover:bg-primary transition-colors"
                        style={{ height: `${(bucket.count / maxQuizCount) * 100}%` }}
                      />
                      <span className="text-[11px] text-gray-400 mt-2">{bucket.range}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-bold">Students</h2>
                <span className="text-xs text-gray-400">
                  Showing {analytics.students.length} of {analytics.totalStudents}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold text-gray-500 border-b border-gray-100">
                    <th className="px-5 py-2.5 font-bold">Student</th>
                    <th className="px-5 py-2.5 font-bold">Progress</th>
                    <th className="px-5 py-2.5 font-bold">Quiz avg.</th>
                    <th className="px-5 py-2.5 font-bold">Last active</th>
                    <th className="px-5 py-2.5 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.students.map((student) => {
                    const status = statusConfig[student.status];
                    const StatusIcon = status.icon;
                    return (
                      <tr key={student.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="w-7 h-7 shrink-0 flex items-center justify-center bg-gray-100 text-xs font-bold text-gray-600">
                              {student.initials}
                            </span>
                            {student.name}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-gray-100">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${student.progressPercent}%` }}
                              />
                            </div>
                            <span className="text-gray-500 tabular-nums text-xs">
                              {student.lessonsCompleted}/{student.totalLessons}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 tabular-nums text-gray-700">
                          {student.avgQuizScore > 0 ? `${student.avgQuizScore}%` : "—"}
                        </td>
                        <td className="px-5 py-3 text-gray-500">{student.lastActive}</td>
                        <td className="px-5 py-3">
                          <span className={`flex items-center gap-1.5 text-xs font-bold ${status.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                            <StatusIcon size={13} />
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
