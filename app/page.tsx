import Image from "next/image";

export default function Home() {
  return (
    <section className="flex flex-col justify-center h-screen gap-4 ml-16">
      <Image src="/hero-background.webp" alt="Carnegie Mellon University" width={2000} height={1000} className="absolute top-0 left-0 w-full h-full object-cover -z-1 opacity-40"/>
      <h1 className="text-6xl font-bold max-w-2xl font-serif">Take a real <a href="https://www.cmu.edu" className="text-primary">Carnegie Mellon</a> course. Free, live, and on your schedule.</h1>
      <p className="text-lg max-w-3xl">SCS Learn brings you real courses from Carnegie Mellon's School of Computer Science,
        taught live by the professors who built them, with an AI tutor trained on the material.
        Build the computing skills the age of AI demands, wherever you are and whatever your career.
      </p>
      <p className="text-primary font-bold">Join 2400+ active learners.</p>
      <div className="flex flex-row">
        <input type="email" placeholder="andrew@gmail.com" className="border-2 border-gray-300 px-4 py-2 w-96" />
        <button className="bg-primary text-white px-4 py-2 font-inter w-48">Get Started</button>
      </div>
      <p className="italic">Free, no application, no prerequisites.</p>  
    </section>
  );
}
