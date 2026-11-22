import { NextRequest, NextResponse } from "next/server";
import { CABINET_ENABLED } from "@/lib/cabinet-mode";

export function middleware(request: NextRequest) {
  if (!CABINET_ENABLED) return NextResponse.next();

  const response = request.cookies.get("__Host-brenvio_session")?.value
    ? NextResponse.next()
    : new NextResponse(null, { status: 307, headers: { Location: "/auth/telegram" } });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/", "/projects/:path*", "/workspace", "/documents", "/settings"],
};
