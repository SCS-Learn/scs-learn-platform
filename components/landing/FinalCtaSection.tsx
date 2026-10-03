import Image from "next/image";
import EmailSignupForm from "./EmailSignupForm";

export default function FinalCtaSection() {
  return (
    <section className="relative isolate overflow-hidden bg-black text-white font-text py-28 md:py-40">
      <Image
        src="/hero-background.webp"
        alt=""
        fill
        sizes="100vw"
        className="-z-20 object-cover"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-black/70" />

      <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center px-6 text-center md:px-12 lg:px-16">
        <h2 className="max-w-[12em] font-display font-black leading-[0.95] tracking-[-0.02em] text-[2.5rem] sm:text-[3.5rem] lg:text-[4.5rem]">
          Be first in when it opens.
        </h2>
        <p className="mt-5 max-w-2xl text-pretty text-lg leading-[1.55] text-white/75 md:text-xl">
          Add your name to the waitlist and we&apos;ll email you the moment your course opens for
          enrollment.
        </p>
        <EmailSignupForm buttonLabel="Get early access" className="mt-8" />
      </div>
    </section>
  );
}
