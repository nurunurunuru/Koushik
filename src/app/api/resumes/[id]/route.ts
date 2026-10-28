import { NextRequest, NextResponse } from "next/server";
import { getAuthServer } from "@/src/lib/authoption";
import { supabaseAdmin } from "@/src/lib/supabase";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthServer();

  // Must be logged in
  if (!session?.user) {
    return new NextResponse("Unauthorized", {
      status: 401,
    });
  }

  try {
    const { id } = await params;

    // Only admins can view candidate CVs
    if (session.user.role !== "ADMIN") {
      return new NextResponse("Forbidden", {
        status: 403,
      });
    }

    // Prevent invalid IDs / path traversal
    if (!/^[a-f0-9-]+$/i.test(id)) {
      return new NextResponse("Invalid file", {
        status: 400,
      });
    }

    // File path inside Supabase Storage
    const storagePath = `resumes/${id}.pdf`;

    // Download file from private Supabase bucket
    const { data, error } = await supabaseAdmin.storage
      .from("resumes")
      .download(storagePath);

    if (error || !data) {
      console.error("Supabase resume download error:", error);

      return new NextResponse("Resume not found", {
        status: 404,
      });
    }

    // Convert Blob to ArrayBuffer
    const arrayBuffer = await data.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    console.error("Resume read failed:", error);

    return new NextResponse("Resume not found", {
      status: 404,
    });
  }
}