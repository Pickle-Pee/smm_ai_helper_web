import { NextRequest, NextResponse } from "next/server";
import { CABINET_ENABLED } from "@/lib/cabinet-mode";

export function middleware(request: NextRequest) {
  if (!CABINET_ENABLED) return NextResponse.next();

  const response = request.cookies.get("__Host-brenvio_session")?.value
    ? NextResponse.next()
    : NextResponse.redirect(new URL("/auth/telegram", request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/", "/projects/:path*", "/workspace", "/documents", "/settings"],
};
