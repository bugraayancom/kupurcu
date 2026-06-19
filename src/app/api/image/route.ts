import { NextRequest } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 60;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
};

/**
 * Görsel proxy'si: CORS sorunlarını aşar ve referrer kısıtlı haber CDN'lerinden
 * görselleri çekebilmeyi sağlar. Hem önizleme hem PDF bu rotayı kullanır.
 */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");
  if (!u) {
    return new Response("Eksik parametre", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(u);
    if (!["http:", "https:"].includes(target.protocol)) {
      throw new Error("protokol");
    }
  } catch {
    return new Response("Geçersiz URL", { status: 400 });
  }

  try {
    const res = await fetch(target.toString(), {
      headers: {
        ...BROWSER_HEADERS,
        Referer: `${target.protocol}//${target.host}/`,
      },
      redirect: "follow",
    });
    if (!res.ok || !res.body) {
      return new Response("Görsel alınamadı", { status: 502 });
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return new Response("Görsel değil", { status: 415 });
    }

    const input = Buffer.from(await res.arrayBuffer());

    // react-pdf yalnızca JPEG ve PNG destekler. WebP/AVIF/GIF gibi formatları
    // (haber CDN'lerinde yaygın) JPEG'e çeviririz; PNG/JPEG olduğu gibi geçer.
    // Çok büyük görselleri de PDF boyutu için 1600px'e indiririz.
    let outBuf: Buffer = input;
    let outType = contentType;
    try {
      const isJpegOrPng =
        contentType.includes("jpeg") ||
        contentType.includes("jpg") ||
        contentType.includes("png");
      const img = sharp(input, { animated: false }).rotate();
      const meta = await img.metadata();
      const tooWide = (meta.width ?? 0) > 1600;

      if (!isJpegOrPng || tooWide) {
        let pipeline = img;
        if (tooWide) pipeline = pipeline.resize({ width: 1600 });
        if (contentType.includes("png")) {
          outBuf = await pipeline.png().toBuffer();
          outType = "image/png";
        } else {
          outBuf = await pipeline.jpeg({ quality: 82 }).toBuffer();
          outType = "image/jpeg";
        }
      }
    } catch {
      // Dönüştürme başarısız olursa orijinali döndür (önizleme yine çalışır)
      outBuf = input;
      outType = contentType;
    }

    return new Response(new Uint8Array(outBuf), {
      headers: {
        "Content-Type": outType,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new Response("Görsel alınamadı", { status: 502 });
  }
}
