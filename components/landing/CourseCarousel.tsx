import Image from "next/image";

export type CarouselCourse = {
  code: string;
  title: string;
  meta: string;
  image: string;
};

export default function CourseCarousel({ courses }: { courses: CarouselCourse[] }) {
  return (
    <div className="group/marquee h-full overflow-hidden pl-4 motion-reduce:overflow-x-auto lg:pl-6">
      <div className="flex h-full w-max animate-marquee items-start group-hover/marquee:[animation-play-state:paused] group-focus-within/marquee:[animation-play-state:paused] motion-reduce:animate-none">
        {[0, 1].map((copy) =>
          courses.map((course) => (
            <div
              key={`${copy}-${course.code}`}
              aria-hidden={copy === 1 || undefined}
              className="shrink-0 pr-5 lg:h-full"
            >
              <a
                href="#"
                tabIndex={copy === 1 ? -1 : undefined}
                aria-label={`View course: ${course.code} ${course.title}`}
                className="group relative isolate flex aspect-[4/5] w-[82vw] flex-col justify-end overflow-hidden rounded-[1.5rem] bg-black p-5 text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 sm:w-[calc((100vw-2rem)/1.6)] md:w-[calc((100vw-3rem)/2.5)] lg:aspect-auto lg:h-full lg:w-[calc((100vw-5rem)/3.4)] 2xl:w-[calc((100vw-6rem)/4.4)]"
              >
                <Image
                  src={course.image}
                  alt=""
                  fill
                  sizes="(min-width: 96rem) 23vw, (min-width: 64rem) 29vw, (min-width: 48rem) 39vw, (min-width: 40rem) 61vw, 82vw"
                  className="-z-20 object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/60 via-45% to-black/0"
                />

                <span className="absolute left-5 top-5 rounded-full bg-black/45 px-3 py-1 text-sm font-semibold backdrop-blur-md">
                  {course.code}
                </span>
                <h3 className="text-balance font-display text-[1.375rem] font-semibold leading-[1.15] tracking-tight xl:text-2xl">
                  {course.title}
                </h3>
                <p className="mt-1.5 text-sm text-white/75">{course.meta}</p>
              </a>
            </div>
          )),
        )}
      </div>
    </div>
  );
}
