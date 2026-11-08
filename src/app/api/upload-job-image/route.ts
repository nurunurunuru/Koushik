import { NextRequest, NextResponse } from "next/server";
import { getAuthServer } from "@/src/lib/authoption";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/src/lib/supabase";

export const runtime = "nodejs";

const BUCKET = "job-images";
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

let bucketReady = false;

// Creates the private "job-images" bucket the first time it is needed,
// so no manual Supabase setup is required.
async function ensureBucket() {
  if (bucketReady) return;
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_SIZE,
    allowedMimeTypes: Object.keys(EXTENSIONS),
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error;
  }
  bucketReady = true;
}

// Admin only: uploads the job banner/logo image and returns the URL to store on the job.
export async function POST(req: NextRequest) {
  const session = await getAuthServer();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
    }

    const extension = EXTENSIONS[file.type];
    if (!extension) {
      return NextResponse.json(
        { error: "Please upload a JPG, PNG or WEBP image." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Image is too large. Maximum size is 5MB." },
        { status: 400 }
      );
    }

    await ensureBucket();

    const fileName = `${randomUUID()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(fileName, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error("Supabase job image upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload image to storage." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imageUrl: `/api/job-images/${fileName}`,
    });
  } catch (error) {
    console.error("Job image upload failed:", error);
    return NextResponse.json({ error: "Failed to upload image." }, { status: 500 });
  }
}
