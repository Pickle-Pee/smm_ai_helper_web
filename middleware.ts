import { NextRequest, NextResponse } from "next/server";
import { CABINET_ENABLED } from "@/lib/cabinet-mode";

export function middleware(request: NextRequest) {
  if (!CABINET_ENABLED) return NextResponse.next();

  let response = NextResponse.next();
  if (!request.cookies.get("__Host-brenvio_session")?.value) {
    const login = new URL("/auth/telegram", request.url);
    // Caddy preserves the public Host. The standalone request URL can use the bind address.
    const host = request.headers.get("host");
    if (host) {
      login.port = "";
      login.host = host;
    }
    response = NextResponse.redirect(login);
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/", "/projects/:path*", "/workspace", "/documents", "/settings"],
};
