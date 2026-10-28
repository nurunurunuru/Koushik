import { NextRequest, NextResponse } from "next/server";
import { getAuthServer } from "@/src/lib/authoption";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/src/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getAuthServer();

  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    // Check file
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    // Only PDF
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Please upload a PDF file" },
        { status: 400 }
      );
    }

    // Maximum 8MB
    const MAX_SIZE = 8 * 1024 * 1024;

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        {
          error: "File is too large. Maximum size is 8MB.",
        },
        { status: 400 }
      );
    }

    // Generate unique ID
    const fileId = randomUUID();

    // Supabase Storage path
    const storagePath = `resumes/${fileId}.pdf`;

    // Convert File -> Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from("resumes")
      .upload(storagePath, buffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError);

      return NextResponse.json(
        {
          error: "Failed to upload resume to storage.",
        },
        { status: 500 }
      );
    }

    // Keep the same API URL structure
    // So existing frontend/database logic doesn't need to change
    const resumeUrl = `/api/resumes/${fileId}`;

    return NextResponse.json({
      success: true,
      resumeUrl,
      fileName: file.name,
      fileId,
    });
  } catch (error) {
    console.error("Resume upload failed:", error);

    return NextResponse.json(
      {
        error: "Failed to upload resume.",
      },
      { status: 500 }
    );
  }
}