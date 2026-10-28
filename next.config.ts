import type { NextConfig } from "next";
import path from "path";

// The Griffin School Computing Education Innovation Fund's giving form, fund
// preselected, with advancement's source tracking (Danielle Hoffman,
// 2026-10-27): one tracked link for the site's Give buttons and one for the
// QR code on every video's closing card.
const GIVING_FORM_WEBSITE =
  "https://givenow.cmu.edu/campaigns/42968/donations/new?a=14504178&designation=griffinschoolcomputingeducationinnovationfund";
const GIVING_FORM_YOUTUBE =
  "https://givenow.cmu.edu/campaigns/42968/donations/new?a=14504181&designation=griffinschoolcomputingeducationinnovationfund";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    // Next 16 only serves qualities on this list. 75 is the default; 90 is for
    // the landing page photography, where 75 visibly softens fine detail.
    qualities: [75, 90],
    // AVIF first (smaller), WebP as the fallback.
    formats: ["image/avif", "image/webp"],
    // Default widths plus 1536: a 760px-wide card on a 2x screen, so the
    // landing cards don't jump to the 1920 file.
    deviceSizes: [640, 750, 828, 1080, 1200, 1536, 1920, 2048, 3840],
    // YouTube video thumbnails, for the landing page's click-to-play previews.
    remotePatterns: [new URL("https://i.ytimg.com/vi/**")],
  },
  // Our own giving addresses. The QR code on every video's closing card points
  // at /give/youtube, and a published video can't be re-rendered, so these
  // stay temporary (307) redirects: browsers don't cache them, and changing a
  // destination here moves every video and button at once. A new permanent
  // placement (trailer, flyer) gets its own path and tracked link from
  // advancement.
  async redirects() {
    return [
      { source: "/give", destination: GIVING_FORM_WEBSITE, permanent: false },
      { source: "/give/youtube", destination: GIVING_FORM_YOUTUBE, permanent: false },
    ];
  },
};

export default nextConfig;
