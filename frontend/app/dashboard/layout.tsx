export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav>{/* Merchant sidebar */}</nav>
      <main>{children}</main>
    </div>
  );
}
