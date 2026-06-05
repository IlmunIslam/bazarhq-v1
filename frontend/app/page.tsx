import Link from 'next/link';

export default function LandingPage() {
  return (
    <main>
      <h1>BazarHQ</h1>
      <p>Start your online store in minutes.</p>
      <Link href="/register">Get Started</Link>
    </main>
  );
}
