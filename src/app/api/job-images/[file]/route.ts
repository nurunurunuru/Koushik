import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabase";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Job images are part of the public job post, so candidates (and the login/register
// pages) can load them. The bucket itself stays private; files are streamed from here.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;

  // Prevent invalid names / path traversal
  const match = /^[a-f0-9-]+\.(jpg|png|webp)$/i.exec(file);
  if (!match) {
    return new NextResponse("Invalid file", { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.storage
      .from("job-images")
      .download(file);

    if (error || !data) {
      return new NextResponse("Image not found", { status: 404 });
    }

    return new NextResponse(await data.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[match[1].toLowerCase()],
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Job image read failed:", error);
    return new NextResponse("Image not found", { status: 404 });
  }
}
