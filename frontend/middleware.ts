import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const MAIN_DOMAIN = process.env.NEXT_PUBLIC_DOMAIN ?? 'bazarhq.com';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  // Skip rewrites for dashboard and auth routes (route-group prefix (auth) is not part of the URL)
  if (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/verify-email') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/superadmin')
  ) {
    return NextResponse.next();
  }

  const devShop = request.nextUrl.searchParams.get('_shop');
  let subdomain: string | null = null;

  if (process.env.NODE_ENV === 'development') {
    if (devShop) {
      // Persist in cookie so subsequent navigation keeps the shop context
      subdomain = devShop;
      const url = request.nextUrl.clone();
      url.pathname = `/_sites/${subdomain}${pathname}`;
      const response = NextResponse.rewrite(url);
      response.cookies.set('_dev_shop', subdomain, { path: '/', sameSite: 'lax' });
      return response;
    }
    // Use cookie set by previous ?_shop= visit
    const cookieShop = request.cookies.get('_dev_shop')?.value;
    if (cookieShop) subdomain = cookieShop;
  }

  if (!subdomain) {
    const hostname = host.split(':')[0]; // strip port
    if (hostname !== MAIN_DOMAIN && hostname.endsWith(`.${MAIN_DOMAIN}`)) {
      subdomain = hostname.slice(0, -(`.${MAIN_DOMAIN}`.length));
    }
  }

  if (subdomain) {
    const url = request.nextUrl.clone();
    url.pathname = `/_sites/${subdomain}${pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|_sites).*)'],
};
