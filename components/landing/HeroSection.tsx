import Image from "next/image";
import Link from "next/link";
import CourseCarousel, { type CarouselCourse } from "./CourseCarousel";
import CmuLink from "./ui/CmuLink";
import { heading1, heading2 } from "./ui/typography";

const COURSES: CarouselCourse[] = [
  {
    code: "06-204",
    title: "Great Ideas in Computational Biology",
    meta: "Phillip Compeau · Python · Intro",
    image: "/landing/courses/lab.jpg",
  },
  {
    code: "15-112",
    title: "Fundamentals of Programming and Computer Science",
    meta: "Python · Intro",
    image: "/landing/courses/studio.jpg",
  },
  {
    code: "10-301",
    title: "Introduction to Machine Learning",
    meta: "Python · Intermediate",
    image: "/landing/courses/classroom.jpg",
  },
  {
    code: "15-122",
    title: "Principles of Imperative Computation",
    meta: "C · Intro",
    image: "/landing/courses/workshop.jpg",
  },
  {
    code: "11-411",
    title: "Natural Language Processing",
    meta: "Python · Advanced",
    image: "/landing/courses/lab.jpg",
  },
  {
    code: "15-213",
    title: "Introduction to Computer Systems",
    meta: "C · Intermediate",
    image: "/landing/courses/studio.jpg",
  },
  {
    code: "16-311",
    title: "Introduction to Robotics",
    meta: "Python · Intermediate",
    image: "/landing/courses/classroom.jpg",
  },
  {
    code: "05-391",
    title: "Designing Human-Centered Software",
    meta: "Design · Intro",
    image: "/landing/courses/workshop.jpg",
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
          className="-z-20 object-cover"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/85 via-black/60 to-black/20" />

        <div className="mx-auto w-full max-w-7xl px-4 pb-14 pt-24 sm:px-6 md:px-12 lg:px-16 lg:pb-20">
          <h1 className={`${heading1} max-w-3xl`}>Take real Carnegie Mellon courses.</h1>
          <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-white/85">
            Real courses from the Griffin School of Computer Science, taught live by the professors who built them,
            with an AI tutor trained on the material.
          </p>
          <div className="mt-8 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
            <CmuLink href="/student" tone="dark">
              Start learning, free
            </CmuLink>
            <Link href="/instructor" className="text-sm font-semibold underline underline-offset-4 hover:text-white/80">
              I teach a course
            </Link>
          </div>
        </div>
      </section>

      <section id="courses" className="scroll-mt-4 bg-white text-black pt-14 pb-16 md:pt-20 md:pb-20">
        <div className="mx-auto mb-8 flex w-full max-w-7xl flex-col gap-4 px-4 sm:px-6 md:flex-row md:items-end md:justify-between md:px-12 lg:px-16">
          <h2 className={heading2}>Courses taught by the faculty who built them</h2>
          <Link href="/student" className="shrink-0 text-sm font-semibold underline underline-offset-4 hover:text-primary">
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
