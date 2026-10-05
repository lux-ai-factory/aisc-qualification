import type { Metadata } from "next";
// Inter ships with the app: no page asks Google Fonts for it.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/inter/900.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI System Qualification",
  description:
    "Describe the project's AI system and keep its AI card, version by version",
};

// Pages read from the database on every request, so they render dynamically. This
// also keeps `next build` (for the Docker image) from prerendering them against the DB.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* The header is rendered by each page's own layout, because inside a
            project it links inside that project and outside one it cannot. */}
        {children}
      </body>
    </html>
  );
}
