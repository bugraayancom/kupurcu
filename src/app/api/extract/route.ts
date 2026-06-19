import { NextRequest, NextResponse } from "next/server";
import { extractArticle } from "@/lib/extract";

export const maxDuration = 180;

export async function POST(req: NextRequest) {
  let url: string;
  try {
    const body = await req.json();
    url = String(body.url ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  if (!url) {
    return NextResponse.json({ error: "URL gerekli." }, { status: 400 });
  }
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("protokol");
    }
  } catch {
    return NextResponse.json(
      { error: "Geçerli bir http/https adresi girin." },
      { status: 400 }
    );
  }

  try {
    const result = await extractArticle(url);
    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Haber çıkarılırken bir hata oluştu.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
