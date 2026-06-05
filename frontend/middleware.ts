import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const MAIN_DOMAIN = process.env.NEXT_PUBLIC_DOMAIN ?? 'bazarhq.com';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';

  // In development, support ?_shop=subdomain for subdomain simulation
  const devShop = request.nextUrl.searchParams.get('_shop');

  let subdomain: string | null = null;

  if (devShop && process.env.NODE_ENV === 'development') {
    subdomain = devShop;
  } else if (host !== MAIN_DOMAIN && host.endsWith(`.${MAIN_DOMAIN}`)) {
    subdomain = host.replace(`.${MAIN_DOMAIN}`, '');
  }

  if (subdomain) {
    const url = request.nextUrl.clone();
    // Rewrite /{path} → /_sites/{subdomain}/{path}
    url.pathname = `/_sites/${subdomain}${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
