import CompareTray from './_components/CompareTray';

// Wraps every marketplace route so the comparison tray survives navigation
// between the landing grid and the full product list. The selection itself lives
// higher up (app/providers.tsx) because it is cross-shop; only its UI is scoped
// here, so the tray never appears over a merchant's storefront or the dashboard.
export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CompareTray />
    </>
  );
}
