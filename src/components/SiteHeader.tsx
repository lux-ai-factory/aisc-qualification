import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="inner">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/laif-logo.svg" alt="Luxembourg AI Factory" />
          <span className="divider" />
          <span>AI System Qualification</span>
        </Link>
      </div>
    </header>
  );
}
