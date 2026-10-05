import Image from "next/image";
import Link from "next/link";
import CourseCarousel, { type CarouselCourse } from "./CourseCarousel";
import EmailSignupForm from "./EmailSignupForm";
import { heading1, heading2 } from "./ui/typography";

const COURSES: CarouselCourse[] = [
  {
    code: "06-204",
    title: "Great Ideas in Computational Biology",
    meta: "Phillip Compeau · Python · Intro",
    image: "/landing/photos/comp-bio-poster-session.jpg",
  },
  {
    code: "15-112",
    title: "Fundamentals of Programming and Computer Science",
    meta: "Python · Intro",
    image: "/landing/photos/students-coding.jpg",
  },
  {
    code: "10-301",
    title: "Introduction to Machine Learning",
    meta: "Python · Intermediate",
    image: "/landing/photos/ml-visualization.jpg",
  },
  {
    code: "15-122",
    title: "Principles of Imperative Computation",
    meta: "C · Intro",
    image: "/landing/photos/gates-center-study.jpg",
  },
  {
    code: "11-411",
    title: "Natural Language Processing",
    meta: "Python · Advanced",
    image: "/landing/photos/language-technologies-group.jpg",
  },
  {
    code: "15-213",
    title: "Introduction to Computer Systems",
    meta: "C · Intermediate",
    image: "/landing/photos/hardware-lab.jpg",
  },
  {
    code: "16-311",
    title: "Introduction to Robotics",
    meta: "Python · Intermediate",
    image: "/landing/photos/robotic-arm-lab.jpg",
  },
  {
    code: "05-391",
    title: "Designing Human-Centered Software",
    meta: "Design · Intro",
    image: "/landing/photos/vr-hci-study.jpg",
  },
];

export default function HeroSection() {
  return (
    <>
      {/* cmu.edu's hero: full-bleed photo under a dark scrim, white serif headline, red-arrow CTA. */}
      <section className="relative isolate flex min-h-[32rem] items-end bg-black text-white lg:min-h-[38rem]">
        <Image
          src="/hero-background.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          // The file is already a compressed 2000px WebP, the largest copy we
          // have. Re-encoding it through the optimizer (q75) compounded the
          // loss, so it's served exactly as-is.
          unoptimized
          className="-z-20 object-cover animate-fade-in"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/85 via-black/60 to-black/20" />

        <div className="mx-auto w-full max-w-7xl px-4 pb-14 pt-24 sm:px-6 md:px-12 lg:px-16 lg:pb-20">
          <h1 className={`${heading1} max-w-3xl animate-fade-in-up [animation-delay:300ms]`}>
            Take real Carnegie Mellon courses.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-white/85 animate-fade-in-up [animation-delay:450ms]">
            Real courses from the Griffin School of Computer Science, taught live by the professors who built them,
            with an AI tutor trained on the material.
          </p>
          <div className="mt-8 animate-fade-in-up [animation-delay:600ms]">
            <EmailSignupForm buttonLabel="Claim my spot" source="hero" />
            <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/85">
              <Link href="/login" className="link-swipe font-semibold text-white">
                Already enrolled? Sign in
              </Link>
              <Link href="/instructor" className="link-swipe font-semibold text-white">
                I teach a course
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section id="courses" className="scroll-mt-4 bg-white text-black pt-14 pb-16 md:pt-20 md:pb-20">
        <div className="mx-auto mb-8 flex w-full max-w-7xl flex-col gap-4 px-4 sm:px-6 md:flex-row md:items-end md:justify-between md:px-12 lg:px-16">
          <h2 className={`${heading2} reveal`}>Courses taught by the faculty who built them</h2>
          <Link href="/student" className="link-swipe reveal shrink-0 self-start text-sm font-semibold md:self-auto">
            Sign in to start a course
          </Link>
        </div>
        <div className="h-[26rem] sm:h-[28rem]">
          <CourseCarousel courses={COURSES} />
        </div>
      </section>
    </>
  );
}
