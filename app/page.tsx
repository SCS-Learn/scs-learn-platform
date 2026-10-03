import NavBar from "@/components/landing/NavBar";
import HeroSection from "@/components/landing/HeroSection";
// import ProblemSection from "@/components/landing/ProblemSection";
import ValuePropsSection from "@/components/landing/ValuePropsSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
// import AiTutorSection from "@/components/landing/AiTutorSection";
// import EducatorsSection from "@/components/landing/EducatorsSection";
import BuildSection from "@/components/landing/BuildSection";
import OfferingsSection from "@/components/landing/OfferingsSection";
import FaqSection from "@/components/landing/FaqSection";
// import FinalCtaSection from "@/components/landing/FinalCtaSection";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <main>
      <NavBar />
      <HeroSection />
      {/* <ProblemSection /> */}
      <ValuePropsSection />
      <BuildSection />
      <HowItWorksSection />
      {/* <AiTutorSection /> */}
      {/* <EducatorsSection /> */}
      <OfferingsSection />
      <FaqSection />
      {/* <FinalCtaSection /> */}
      <Footer />
    </main>
  );
}
