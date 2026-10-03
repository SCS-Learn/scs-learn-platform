import { Camera, AtSign, Link2, Play } from "lucide-react";
import Container from "./ui/Container";

const COLUMNS = [
  {
    title: "Courses",
    links: ["Catalog", "Schedule", "Instructors", "Certificates"],
  },
  {
    title: "Company",
    links: ["About", "Careers", "Press", "Contact"],
  },
  {
    title: "Resources",
    links: ["FAQ", "Help Center", "Blog", "Community"],
  },
  {
    title: "Legal",
    links: ["Terms", "Privacy", "Accessibility", "Cookie Policy"],
  },
];

const SOCIALS = [AtSign, Link2, Play, Camera];

export default function Footer() {
  return (
    <footer className="bg-white text-black">
      <Container className="py-16">
        <div className="flex flex-col md:flex-row justify-between gap-12 mb-16">
          <div className="flex flex-col gap-4 max-w-xs">
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 bg-primary text-white font-serif font-bold flex flex-col justify-center leading-[1.15] text-[0.5rem] px-1.5 shrink-0 whitespace-nowrap">
                <span>Carnegie</span>
                <span>Mellon</span>
                <span>University</span>
              </div>
              <p className="text-primary font-semibold">SCS Learn</p>
            </div>
            <div className="flex gap-3">
              {SOCIALS.map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="w-8 h-8 rounded-full border border-steel-gray flex items-center justify-center hover:bg-gray-light"
                >
                  <Icon size={14} />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 flex-1">
            {COLUMNS.map((col) => (
              <div key={col.title} className="flex flex-col gap-3">
                <h3 className="font-semibold text-sm">{col.title}</h3>
                {col.links.map((link) => (
                  <a key={link} href="#" className="text-sm text-iron-gray hover:text-black">
                    {link}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Container>

      <div className="bg-white text-black text-xs text-center border-t border-steel-gray px-6 py-4">
        © {new Date().getFullYear()} Carnegie Mellon University. All rights reserved.
      </div>
    </footer>
  );
}
