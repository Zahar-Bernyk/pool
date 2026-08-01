import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Захист адмін-панелі: без сесії → на сторінку входу.
  // (Перевірку списку ADMIN_EMAILS робить серверний layout адмінки.)
  // Панель подій (ресторан) — окремий вхід і власна сторінка логіну.
  const isEventsArea = path.startsWith('/admin-restaurant') && path !== '/admin-restaurant/login';
  if (isEventsArea && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin-restaurant/login';
    return NextResponse.redirect(url);
  }
  if (path === '/admin-restaurant/login' && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin-restaurant';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Панель басейну й готелю
  const isAdminArea =
    path.startsWith('/admin') && !path.startsWith('/admin-restaurant') && path !== '/admin/login';
  if (isAdminArea && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  // Якщо вже залогінений і відкриває /admin/login → на дашборд.
  if (path === '/admin/login' && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/admin-restaurant/:path*'],
};
