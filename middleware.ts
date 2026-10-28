import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

const ADMIN_ROUTES = ["/dashboard", "/jobs", "/candidates", "/calls"];
const CANDIDATE_ROUTES = ["/portal"];

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const role = token?.role;

    const isAdminRoute = ADMIN_ROUTES.some((r) => path.startsWith(r));
    const isCandidateRoute = CANDIDATE_ROUTES.some((r) => path.startsWith(r));

    if (isAdminRoute) {
      if (!token) return NextResponse.redirect(new URL("/login", req.url));
      if (role !== "ADMIN") {
        return NextResponse.redirect(new URL("/portal/jobs", req.url));
      }
    }

    if (isCandidateRoute) {
      if (!token) return NextResponse.redirect(new URL("/login", req.url));
      if (role !== "CANDIDATE") {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        // Public routes
        if (path === "/" || path === "/login" || path === "/register") return true;
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/jobs/:path*",
    "/candidates/:path*",
    "/calls/:path*",
    "/portal/:path*",
  ],
};
