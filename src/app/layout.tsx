import type { Metadata } from "next";
// The brand fonts ship with the app: no page asks Google Fonts for them. MuseoModerno for
// headings and Raleway for body text are variable fonts (every weight in one file); IBM Plex
// Mono, for ids and code, comes in the weights the stylesheet uses.
import "@fontsource-variable/museomoderno";
import "@fontsource-variable/raleway";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
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
