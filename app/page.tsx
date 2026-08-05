import Image from "next/image";

export default function Home() {
  return (
    <section className="relative flex flex-col justify-center min-h-screen gap-4 pl-6 md:pl-16 py-16 md:py-0 overflow-hidden">
      <Image src="/hero-background.webp" alt="Carnegie Mellon University" width={2000} height={1000} className="absolute inset-0 w-full h-full object-cover -z-10 opacity-40"/>
      <h1 className="text-4xl md:text-6xl font-bold max-w-2xl font-serif">Take a real <a href="https://www.cmu.edu" className="text-primary">Carnegie Mellon</a> course. Free, live, and on your schedule.</h1>
      <p className="text-base md:text-lg max-w-3xl">SCS Learn brings you real courses from Carnegie Mellon's School of Computer Science,
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
  );
}