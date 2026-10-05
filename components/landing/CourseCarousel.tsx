import Image from "next/image";

export type CarouselCourse = {
  code: string;
  title: string;
  meta: string;
  image: string;
};

export default function CourseCarousel({ courses }: { courses: CarouselCourse[] }) {
  return (
    <div className="group/marquee h-full overflow-hidden pl-4 motion-reduce:overflow-x-auto lg:pl-6" aria-label="Course catalog">
      <div className="flex h-full w-max animate-marquee items-start group-hover/marquee:[animation-play-state:paused] group-focus-within/marquee:[animation-play-state:paused] motion-reduce:animate-none">
        {[0, 1].map((copy) =>
          courses.map((course) => (
            <div
              key={`${copy}-${course.code}`}
              aria-hidden={copy === 1 || undefined}
              className="h-full shrink-0 pr-4"
            >
              <div
                className="group relative isolate flex h-full w-[78vw] flex-col justify-end overflow-hidden bg-black p-5 text-white sm:w-[calc((100vw-2rem)/1.8)] md:w-[calc((100vw-3rem)/2.6)] lg:w-[calc((100vw-5rem)/3.6)] 2xl:w-[calc((100vw-6rem)/4.6)]"
              >
                <Image
                  src={course.image}
                  alt=""
                  fill
                  sizes="(min-width: 96rem) 22vw, (min-width: 64rem) 28vw, (min-width: 48rem) 38vw, (min-width: 40rem) 55vw, 78vw"
                  className="-z-20 object-cover transition-transform duration-[3s] ease-out group-hover:scale-110"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/60 via-45% to-black/0"
                />

                <span className="absolute left-0 top-5 bg-primary px-3 py-1 text-sm font-semibold">{course.code}</span>
                <h3 className="text-balance font-brand text-[1.375rem] font-semibold leading-[1.2] xl:text-2xl">
                  {course.title}
                </h3>
                <p className="mt-1.5 text-sm text-white/75">{course.meta}</p>
              </div>
            </div>
          )),
        )}
      </div>
    </div>
  );
}
