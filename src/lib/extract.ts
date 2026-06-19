import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { generateObject } from "ai";
import { ArticleExtractionSchema, type Article } from "./types";

/** Çıkarma için kullanılacak model (Vercel AI Gateway üzerinden). */
const MODEL = process.env.EXTRACT_MODEL ?? "anthropic/claude-sonnet-4-6";

/** Tarayıcı taklidi başlıklar — çok sayıda haber sitesi botları engeller. */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "tr,en-US;q=0.9,en;q=0.8",
};

interface CandidateImage {
  src: string;
  alt: string;
}

// Çöp görsel kalıpları — yalnızca sınırlarla (/, _, -, ., baş/son) eşleşir ki
// "uploads" gibi meşru yollardaki "ads" hece parçaları yanlışlıkla elenmesin.
const JUNK_TOKEN =
  /(?:^|[/_-])(?:sprites?|logos?|icons?|avatars?|pixels?|tracking|tracker|spacer|blank|placeholder|advert(?:isement)?|banners?|ads?|doubleclick|googlesyndication|1x1)(?:[/_.-]|$)/;

/** Reklam/ikon/piksel olma ihtimali yüksek görselleri ele. */
function looksLikeJunkImage(src: string): boolean {
  // Sorgu parametrelerini at; yalnızca yol kısmına bak (resize/quality vb. yanıltmasın)
  const path = src.toLowerCase().split("?")[0];
  if (path.startsWith("data:")) return true;
  if (path.endsWith(".svg")) return true;
  if (JUNK_TOKEN.test(path)) return true;
  return false;
}

/** Göreli URL'leri mutlak hale getir. */
function absolutize(src: string, baseUrl: string): string | null {
  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return null;
  }
}

/** Readability içeriğinden aday görselleri sırayla topla. */
function collectImages(contentHtml: string, baseUrl: string): CandidateImage[] {
  const { document } = parseHTML(contentHtml);
  const imgs = Array.from(document.querySelectorAll("img"));
  const seen = new Set<string>();
  const out: CandidateImage[] = [];
  for (const img of imgs) {
    const raw =
      img.getAttribute("src") ||
      img.getAttribute("data-src") ||
      img.getAttribute("data-lazy-src") ||
      "";
    if (!raw) continue;
    const abs = absolutize(raw, baseUrl);
    if (!abs) continue;
    if (looksLikeJunkImage(abs)) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push({ src: abs, alt: img.getAttribute("alt") || "" });
  }
  return out;
}

/** og:image gibi meta görselleri yedek olarak al. */
function metaImage(doc: Document, baseUrl: string): string | null {
  const sel =
    'meta[property="og:image"], meta[name="twitter:image"], meta[property="og:image:url"]';
  const el = doc.querySelector(sel);
  const content = el?.getAttribute("content");
  if (!content) return null;
  const abs = absolutize(content, baseUrl);
  return abs && !looksLikeJunkImage(abs) ? abs : null;
}

function proxied(src: string): string {
  return `/api/image?u=${encodeURIComponent(src)}`;
}

/** JSON-LD ağacında yayıncı (publisher) logosunu derinlemesine ara. */
function logoFromNode(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const x of node) {
      const r = logoFromNode(x);
      if (r) return r;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const pickUrl = (logo: unknown): string | null => {
    if (!logo) return null;
    if (typeof logo === "string") return logo;
    if (typeof logo === "object") {
      const u = (logo as Record<string, unknown>).url;
      if (typeof u === "string") return u;
    }
    return null;
  };
  if (obj.publisher) {
    const p = obj.publisher as Record<string, unknown>;
    const r = pickUrl(p.logo);
    if (r) return r;
  }
  const direct = pickUrl(obj.logo);
  if (direct) return direct;
  if (obj["@graph"]) return logoFromNode(obj["@graph"]);
  return null;
}

/** Medya organının logosunu bul: JSON-LD > apple-touch-icon > yüksek çöz. favicon. */
function findLogo(doc: Document, baseUrl: string): string | null {
  // 1) JSON-LD publisher.logo (gerçek wordmark — en iyi seçenek)
  const scripts = Array.from(
    doc.querySelectorAll('script[type="application/ld+json"]')
  );
  for (const s of scripts) {
    try {
      const data = JSON.parse(s.textContent || "");
      const logo = logoFromNode(data);
      if (logo) {
        const abs = absolutize(logo, baseUrl);
        if (abs) return abs;
      }
    } catch {
      /* bozuk JSON-LD'yi atla */
    }
  }
  // 2) apple-touch-icon (genelde kare, ~180px, temiz)
  const apple = doc.querySelector(
    'link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'
  );
  const appleHref = apple?.getAttribute("href");
  if (appleHref) {
    const abs = absolutize(appleHref, baseUrl);
    if (abs) return abs;
  }
  // 3) Yüksek çözünürlüklü favicon servisi (her zaman bir şey döner)
  try {
    const host = new URL(baseUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
  } catch {
    return null;
  }
}

/**
 * Düz çekimin engellendiğini/eksik olduğunu gösteren işaretler.
 * (ServicePipe, Cloudflare, DataDome gibi anti-bot challenge sayfaları küçük
 * olur ve bu imzaları içerir.)
 */
function looksBlocked(html: string): boolean {
  if (html.length < 2500) return true;
  return /servicepipe|checkjs|datadome|captcha-delivery|cf-browser-verification|challenge-platform|__cf_chl|just a moment|enable javascript|incapsula|_imperva|distil_r_blocked/i.test(
    html
  );
}

async function fetchPlain(url: string): Promise<string> {
  const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
  if (!res.ok) throw new Error(`Sayfa ${res.status} durum koduyla yanıt verdi.`);
  return res.text();
}

/**
 * ScrapingBee üzerinden çek: gerçek tarayıcıda JS render + residential proxy +
 * anti-bot bypass. Yalnızca düz çekim engellenince çağrılır (kota tasarrufu).
 */
async function fetchViaScrapingBee(url: string): Promise<string> {
  const key = process.env.SCRAPINGBEE_API_KEY;
  if (!key) throw new Error("SCRAPINGBEE_API_KEY tanımlı değil.");
  const params = new URLSearchParams({
    api_key: key,
    url,
    render_js: "true",
    premium_proxy: "true", // korumalı siteler için residential proxy
    // Görsel/CSS/font indirmeyi bloklayarak render'ı hızlandırırız; metin ve
    // görsel URL'leri (img src + og:image meta) yine HTML'de bulunur.
    block_resources: "true",
    wait: "3500", // anti-bot challenge'ın çözülüp yönlenmesi için bekle
  });
  const res = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, {
    // Korumalı siteleri render + anti-bot çözümü ~1 dk sürebilir
    signal: AbortSignal.timeout(110_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `ScrapingBee hatası (${res.status})${detail ? ": " + detail.slice(0, 200) : ""}`
    );
  }
  return res.text();
}

/** Önce düz fetch; engel görülürse ScrapingBee'ye düş. */
async function fetchHtml(
  url: string
): Promise<{ html: string; via: "direct" | "scrapingbee" }> {
  const hasBee = !!process.env.SCRAPINGBEE_API_KEY;
  let plainHtml = "";
  let plainErr: unknown;
  try {
    plainHtml = await fetchPlain(url);
    if (!looksBlocked(plainHtml)) return { html: plainHtml, via: "direct" };
  } catch (e) {
    plainErr = e;
  }

  if (hasBee) {
    try {
      const html = await fetchViaScrapingBee(url);
      return { html, via: "scrapingbee" };
    } catch (beeErr) {
      // ScrapingBee de başarısız olursa, elde düz HTML varsa onu kullan
      if (plainHtml) return { html: plainHtml, via: "direct" };
      throw beeErr;
    }
  }

  if (plainHtml) return { html: plainHtml, via: "direct" };
  throw new Error(
    `Sayfa çekilemedi: ${plainErr instanceof Error ? plainErr.message : "bilinmeyen hata"}`
  );
}

export interface ExtractResult {
  article: Article;
  warning?: string;
}

function runReadability(html: string, url: string) {
  // linkedom: saf-JS DOM, serverless'ta jsdom'un ESM/native sorunları olmadan çalışır.
  // Göreli URL çözümü için <base> ekleyelim (linkedom documentURI ayarlamaz).
  const baseTag = `<base href="${url.replace(/"/g, "&quot;")}">`;
  const withBase = /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (m) => m + baseTag)
    : baseTag + html;
  const { document } = parseHTML(withBase);
  const doc = document as unknown as Document;
  // Readability DOM'u değiştirir; orijinali görsel/meta için koruyalım diye klonla
  const clone = doc.cloneNode(true) as Document;
  const reader = new Readability(clone);
  return { doc, parsed: reader.parse() };
}

function tooThin(parsed: ReturnType<typeof runReadability>["parsed"]): boolean {
  return (
    !parsed || !parsed.textContent || parsed.textContent.trim().length < 200
  );
}

export async function extractArticle(url: string): Promise<ExtractResult> {
  // 1) Sayfayı çek (engellenirse otomatik ScrapingBee'ye düşer)
  let { html, via } = await fetchHtml(url);

  // 2) Readability ile kaba temizlik
  let { doc, parsed } = runReadability(html, url);

  // İçerik hâlâ ince ve henüz ScrapingBee denenmediyse, bir kez de onunla dene
  if (tooThin(parsed) && via === "direct" && process.env.SCRAPINGBEE_API_KEY) {
    try {
      html = await fetchViaScrapingBee(url);
      via = "scrapingbee";
      ({ doc, parsed } = runReadability(html, url));
    } catch {
      // ScrapingBee başarısız olursa eldeki düz sonuçla devam et
    }
  }

  let warning: string | undefined;
  if (tooThin(parsed)) {
    warning =
      via === "scrapingbee"
        ? "Sayfa içeriği yine de az çıktı — site içeriği olağandışı bir yapıda olabilir. Sonuç eksik olabilir."
        : "Sayfa içeriği çok az çıktı — site içeriği JavaScript ile yüklüyor olabilir. Sonuç eksik olabilir.";
  }

  // 3) Aday görseller (Readability içeriği + meta yedeği)
  let images = parsed?.content ? collectImages(parsed.content, url) : [];
  const og = metaImage(doc, url);
  if (og && !images.some((i) => i.src === og)) {
    images.unshift({ src: og, alt: "" });
  }
  images = images.slice(0, 12); // makul sınır

  // 4) Claude ile yapılandır
  const textForModel = (parsed?.textContent ?? doc.body?.textContent ?? "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 24000);

  const imageList = images
    .map((img, i) => `[${i}] ${img.src}${img.alt ? ` — alt: "${img.alt}"` : ""}`)
    .join("\n");

  const { object } = await generateObject({
    model: MODEL,
    schema: ArticleExtractionSchema,
    system:
      "Sen bir haber içeriği çıkarma asistanısın. Sana bir haber sayfasından kabaca temizlenmiş metin ve aday görsel listesi verilir. " +
      "Görevin: reklam, menü, 'ilgili haberler', çerez/abonelik uyarıları, paylaşım butonları, yorum bölümleri ve site navigasyonu gibi haberle ilgisiz her şeyi ayıklayıp YALNIZCA gerçek haber içeriğini düzgün bloklar halinde döndürmek. " +
      "Metni özetleme, çevirme veya yeniden yazma — kaynak dilde, olduğu gibi koru; sadece temizle ve yapılandır. " +
      "Görsel listesinden ana/kapak görseli (leadImageIndex) ve habere ait diğer anlamlı görselleri seç; logo, ikon, reklam ve alakasız görselleri dışla.",
    prompt:
      `Haber URL'si: ${url}\n\n` +
      `--- KABA TEMİZLENMİŞ METİN ---\n${textForModel}\n\n` +
      `--- ADAY GÖRSELLER ---\n${imageList || "(görsel bulunamadı)"}\n`,
  });

  const leadImage =
    object.leadImageIndex >= 0 && images[object.leadImageIndex]
      ? proxied(images[object.leadImageIndex].src)
      : images[0]
        ? proxied(images[0].src)
        : null;

  const contentImages = (object.contentImageIndexes ?? [])
    .filter((i) => i !== object.leadImageIndex && images[i])
    .map((i) => proxied(images[i].src));

  const logoSrc = findLogo(doc, url);

  const article: Article = {
    url,
    title: object.title || parsed?.title || "Başlıksız",
    source: object.source || parsed?.siteName || new URL(url).hostname,
    author: object.author || parsed?.byline || "",
    publishedAt: object.publishedAt || parsed?.publishedTime || "",
    summary: object.summary || parsed?.excerpt || "",
    body: object.body,
    logo: logoSrc ? proxied(logoSrc) : null,
    leadImage,
    contentImages,
  };

  return { article, warning };
}
