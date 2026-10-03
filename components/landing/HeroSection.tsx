import EmailSignupForm from "./EmailSignupForm";
import CourseCarousel, { type CarouselCourse } from "./CourseCarousel";

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
    <section className="flex flex-col bg-white text-black font-text pt-10 pb-16 lg:h-[calc(100svh-5rem)] lg:min-h-[36rem] lg:pt-6 lg:pb-6 short:pt-3">
      <div className="mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:px-16">
        <div className="flex flex-col items-center text-center">
          <h1 className="font-display font-black leading-[0.95] tracking-[-0.02em] text-[2.25rem] sm:text-[3.25rem] lg:text-[4rem] xl:text-[4.625rem] short:text-[3.25rem]">
            <span className="block">
              Take real <span className="text-primary">Carnegie</span>
            </span>
            <span className="block">
              <span className="whitespace-nowrap text-primary">Mellon University</span> courses.
            </span>
          </h1>

          <p className="mt-4 max-w-2xl text-pretty text-base leading-[1.55] text-iron-gray md:text-lg">
            Real courses from the Griffin School of Computer Science, taught live by the
            professors who built them, with an AI tutor trained on the material.
          </p>

          <EmailSignupForm buttonLabel="Claim my spot" className="mt-6" />
        </div>
      </div>

      <div className="mt-12 lg:mt-10 lg:h-[calc(100svh-500px)] lg:min-h-0 short:mt-8">
        <CourseCarousel courses={COURSES} />
      </div>
    </section>
  );
}
