import { Crown, ShieldCheck, UserRound, Users, X } from "lucide-react";
import AppHeader from "@/components/app/AppHeader";
import CourseBanner from "@/components/app/CourseBanner";
import { AddAdminForm, AddCourseInstructorForm, AddInstructorForm } from "@/components/admin/AdminForms";
import { card, eyebrow, pageTitle } from "@/components/app/ui";
import { getAdminOverview } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/admin/session";
import { removeAdmin, removeCourseInstructor, removeInstructor } from "@/lib/admin/actions";

export default async function AdminPage() {
  const me = await requireAdmin();
  const { instructors, courses, admins, migrated } = await getAdminOverview();
  const byId = new Map(instructors.map((i) => [i.id, i]));

  return (
    <main className="min-h-screen bg-gray-50 text-black">
      <AppHeader mode="admin" />

      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-10">
          <p className={`${eyebrow} mb-2`}>Admin</p>
          <h1 className={pageTitle}>Manage SCS Learn</h1>
          <p className="mt-2 text-gray-600">Grant instructor access, staff courses, and manage admins.</p>
        </div>
      </section>

      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
        {!migrated && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Run <code>supabase/migrations/add-admins-and-course-instructors.sql</code> in the Supabase SQL editor to
            enable instructor emails and course staffing.
          </p>
        )}

        {/* Instructors */}
        <section className={`${card} overflow-hidden`}>
          <div className="border-b border-gray-100 p-5">
            <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
              <Users size={18} className="text-gray-400" />
              Instructors
            </h2>
            <p className="mt-1 mb-4 text-sm text-gray-600">
              Adding someone grants instructor access the first time they sign in with that email.
            </p>
            <AddInstructorForm />
          </div>
          <ul className="divide-y divide-gray-100">
            {instructors.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {i.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{i.name}</p>
                  <p className="truncate text-xs text-gray-500">{i.email ?? "No email - access revoked"}</p>
                </div>
                <span
                  className={`hidden rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline ${
                    i.linked ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {i.linked ? "Signed in" : "Invited"}
                </span>
                <span className="w-20 text-right text-xs text-gray-500 tabular-nums">
                  {i.courseCount} {i.courseCount === 1 ? "course" : "courses"}
                </span>
                {(i.email || i.linked) && (
                  <form action={removeInstructor}>
                    <input type="hidden" name="instructorId" value={i.id} />
                    <button
                      type="submit"
                      title="Remove instructor access (courses they own are kept)"
                      className="rounded-md px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-red-50 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
            {instructors.length === 0 && <li className="px-5 py-4 text-sm text-gray-500">No instructors yet.</li>}
          </ul>
        </section>

        {/* Course staff */}
        <section>
          <h2 className="mb-1 flex items-center gap-2 font-serif text-xl font-semibold">
            <UserRound size={18} className="text-gray-400" />
            Course staff
          </h2>
          <p className="mb-4 text-sm text-gray-600">
            Everyone listed can teach and edit the course. Only the owner can delete it.
          </p>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {courses.map((course) => {
              const staff = course.staffIds.map((id) => byId.get(id)).filter((i) => i !== undefined);
              const options = instructors.filter((i) => !course.staffIds.includes(i.id));
              return (
                <div key={course.id} className={`${card} overflow-hidden`}>
                  <CourseBanner code={course.code} className="h-16" />
                  <div className="p-5">
                    <p className="font-serif text-lg font-semibold leading-snug">{course.title}</p>
                    <ul className="mt-3 mb-4 flex flex-col gap-2">
                      {staff.map((i) => {
                        const isOwner = i.id === course.ownerId;
                        return (
                          <li key={i.id} className="flex items-center gap-2 text-sm">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-600">
                              {i.initials}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{i.name}</span>
                            {isOwner ? (
                              <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                <Crown size={11} />
                                Owner
                              </span>
                            ) : (
                              <form action={removeCourseInstructor}>
                                <input type="hidden" name="courseId" value={course.id} />
                                <input type="hidden" name="instructorId" value={i.id} />
                                <button
                                  type="submit"
                                  aria-label={`Remove ${i.name} from ${course.code}`}
                                  className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-700"
                                >
                                  <X size={14} />
                                </button>
                              </form>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {migrated && <AddCourseInstructorForm courseId={course.id} options={options} />}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Admins */}
        <section className={`${card} overflow-hidden`}>
          <div className="border-b border-gray-100 p-5">
            <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
              <ShieldCheck size={18} className="text-gray-400" />
              Admins
            </h2>
            <p className="mt-1 mb-4 text-sm text-gray-600">Admins can use this page. They need a confirmed email to sign in as admin.</p>
            <AddAdminForm />
          </div>
          <ul className="divide-y divide-gray-100">
            {admins.map((a) => (
              <li key={a.email} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{a.email}</span>
                {a.email === me.email ? (
                  <span className="text-xs text-gray-400">You</span>
                ) : (
                  <form action={removeAdmin}>
                    <input type="hidden" name="email" value={a.email} />
                    <button
                      type="submit"
                      className="rounded-md px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-red-50 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
