import Image from "next/image";
import { X } from "lucide-react";
import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <main>
    <section className="relative flex flex-col justify-center min-h-screen gap-4 pl-6 md:pl-16 py-16 md:py-0 overflow-hidden">
      <Image src="/hero-background.webp" alt="Carnegie Mellon University" width={2000} height={1000} className="absolute inset-0 w-full h-full object-cover -z-10 opacity-40"/>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black -z-3" />
      <h1 className="text-4xl md:text-6xl font-bold max-w-2xl font-serif">Take a real <a href="https://www.cmu.edu" className="text-primary">Carnegie Mellon</a> course. Free, live, and on your schedule.</h1>
      <p className="text-sm md:text-lg max-w-3xl">SCS Learn brings you real courses from Carnegie Mellon's School of Computer Science,
        taught live by the professors who built them, with an AI tutor trained on the material.
        Build the computing skills the age of AI demands, wherever you are and whatever your career.
      </p>
      <p className="text-primary font-bold">Join 2400+ active learners.</p>
      <div className="flex flex-col md:flex-row gap-2 md:gap-0 max-w-2xl">
        <input type="email" placeholder="andrew@gmail.com" className="border-2 border-gray-300 px-4 py-2 w-full md:w-96" />
        <button className="bg-primary text-white px-4 py-2 font-inter w-full md:w-48">Get Started</button>
      </div>
      <p className="italic">Free, no application, no prerequisites.</p>  
    </section>

    <section className="bg-black text-white px-6 md:px-16 py-24">
      <h2 className="text-3xl md:text-4xl font-serif max-w-3xl mb-16 leading-snug">
        The world is undergoing a computational revolution, and your learning options are...
      </h2>

     <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
        <div className="flex gap-3">
          <X className="text-primary shrink-0" />
         <p className="text-2xl">A degree that you may not have <strong>time</strong> for</p>
       </div>
       <div className="flex gap-3">
         <X className="text-primary shrink-0" />
         <p className="text-2xl">A bootcamp you cannot justify the <strong>price</strong> of</p>
       </div>
       <div className="flex gap-3">
          <X className="text-primary shrink-0" />
          <p className="text-2xl">Free material to work through <strong>on your own</strong></p>
        </div>
     </div>

     <p className="text-4xl font-serif">It doesn't have to be that way.</p>
     </section>
     <section className="bg-black text-white px-6 md:px-16 py-12 md:py-24">
  <h2 className="text-3xl md:text-4xl font-serif font-bold mb-16">
    Here's how it works.
  </h2>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
    {/* LEFT: numbered steps */}
    <div className="flex flex-col gap-8">
      <div className="flex gap-4 border-b border-gray-700 pb-8">
        <span className="text-primary text-2xl font-serif">1</span>
        <div>
          <h3 className="font-bold mb-2">Sign up for free.</h3>
          <p className="text-sm text-gray-400 italic">
            No application, no payment, no prerequisites — just your email to reserve your spot.
          </p>
        </div>
      </div>

      <div className="flex gap-4 border-b border-gray-700 pb-8">
        <span className="text-primary text-2xl font-serif">2</span>
        <div>
          <h3 className="font-bold mb-2">Join your professor live.</h3>
          <p className="text-sm text-gray-400 italic">
            Real sessions with the CMU faculty member teaching the course, answering your questions in real time.
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <span className="text-primary text-2xl font-serif">3</span>
        <div>
          <h3 className="font-bold mb-2">Learn on your schedule, with an AI tutor beside you.</h3>
          <p className="text-sm text-gray-400 italic">
            Trained on the course materials, our tutor reviews your work, tells you what went wrong, and what to try next.
          </p>
        </div>
      </div>
    </div>

    {/* RIGHT: course card */}
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-400 italic">First course launching Sept 21.</p>
      <Image src="/course-preview.webp" alt="Course preview" width={600} height={400} className="w-full object-cover" />
      <h3 className="font-bold">
        Great Ideas in Computational Biology, <span className="font-normal">06-204</span>
      </h3>
      <p className="text-gray-400">Phillip Compeau</p>
      <p className="text-sm text-gray-400">Python · Intro · Certificate</p>
      <button className="bg-primary text-white px-4 py-3 font-inter mt-2">
        Get early access →
      </button>
    </div>
  </div>
 </section>
    </main>
  );
}