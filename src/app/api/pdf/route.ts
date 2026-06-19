import { NextRequest, NextResponse } from "next/server";
import { buildPdf } from "@/lib/pdf";
import type { Article } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/** HTTP başlığı için hem ASCII yedek hem de UTF-8 (RFC 5987) ad üretir. */
function contentDisposition(title: string): string {
  const trimmed = title.trim().slice(0, 60) || "haber";
  // Türkçe harfleri ASCII karşılıklarına indirgenmiş yedek ad
  const ascii =
    trimmed
      .replace(/[ğĞ]/g, "g")
      .replace(/[üÜ]/g, "u")
      .replace(/[şŞ]/g, "s")
      .replace(/[ıİ]/g, "i")
      .replace(/[öÖ]/g, "o")
      .replace(/[çÇ]/g, "c")
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 60) || "haber";
  const utf8 = encodeURIComponent(trimmed + ".pdf");
  return `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${utf8}`;
}

export async function POST(req: NextRequest) {
  let article: Article;
  try {
    const body = await req.json();
    article = body.article as Article;
    if (!article || !article.title || !Array.isArray(article.body)) {
      throw new Error("eksik veri");
    }
  } catch {
    return NextResponse.json({ error: "Geçersiz haber verisi." }, { status: 400 });
  }

  const origin = req.nextUrl.origin;

  try {
    const pdf = await buildPdf(article, origin);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(article.title),
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "PDF oluşturulurken hata oluştu.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
