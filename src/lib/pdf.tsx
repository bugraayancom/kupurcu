import path from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Article } from "./types";

const FONT_DIR = path.join(process.cwd(), "fonts");

// DejaVu Sans — tam Türkçe karakter kapsamı (ğ, ş, Ş, İ, ı, ç, ö, ü) için seçildi.
Font.register({
  family: "DejaVu",
  fonts: [
    { src: path.join(FONT_DIR, "DejaVuSans.ttf") },
    { src: path.join(FONT_DIR, "DejaVuSans-Bold.ttf"), fontWeight: 700 },
    {
      src: path.join(FONT_DIR, "DejaVuSans-Oblique.ttf"),
      fontStyle: "italic",
    },
  ],
});

// Korece/CJK (Hangul) — DejaVu Hangul içermez. İtalik varyantı yok; italik
// istekleri normale düşsün diye regular'ı italic olarak da kaydediyoruz.
Font.register({
  family: "Nanum",
  fonts: [
    { src: path.join(FONT_DIR, "NanumGothic-Regular.ttf") },
    { src: path.join(FONT_DIR, "NanumGothic-Bold.ttf"), fontWeight: 700 },
    { src: path.join(FONT_DIR, "NanumGothic-Regular.ttf"), fontStyle: "italic" },
  ],
});

// Arapça — DejaVu Arapça içermez. İtalik varyantı yok; aynı şekilde normale düş.
Font.register({
  family: "Amiri",
  fonts: [
    { src: path.join(FONT_DIR, "Amiri-Regular.ttf") },
    { src: path.join(FONT_DIR, "Amiri-Bold.ttf"), fontWeight: 700 },
    { src: path.join(FONT_DIR, "Amiri-Regular.ttf"), fontStyle: "italic" },
  ],
});

// Türkçe metinde uzun kelimelerde garip kırılmaları azalt
Font.registerHyphenationCallback((word) => [word]);

/**
 * İçeriğin baskın yazı sistemine göre font ailesi seç. Bir haber genelde tek
 * dilde olduğu için tüm belgeye tek font uygulamak yeterli (KR/AR fontları
 * Latin harfleri de içerir, karışık içerik de düzgün görünür).
 */
function pickFontFamily(article: Article): string {
  const sample = (
    article.title +
    " " +
    article.body.map((b) => b.text).join(" ")
  ).slice(0, 4000);
  let hangul = 0;
  let arabic = 0;
  for (const ch of sample) {
    const c = ch.codePointAt(0)!;
    if (c >= 0xac00 && c <= 0xd7a3) hangul++;
    else if ((c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f))
      arabic++;
  }
  if (hangul > 20) return "Nanum";
  if (arabic > 20) return "Amiri";
  return "DejaVu";
}

/** Arapça gibi sağdan-sola yazılan içerik mi? */
function isRtl(article: Article): boolean {
  return pickFontFamily(article) === "Amiri";
}

// DES şartnamesi: A4 dikey, kenar boşluğu ≥2cm (≈57pt), başlık 14-18pt, metin 12pt,
// alt/üst bilgi ve sayfa numarası YOK.
const MARGIN = 57; // 2 cm

const styles = StyleSheet.create({
  page: {
    fontFamily: "DejaVu",
    padding: MARGIN,
    fontSize: 12, // metin 12 punto
    lineHeight: 1.5,
    color: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  logo: {
    height: 24,
    maxWidth: 150,
    objectFit: "contain",
    marginRight: 9,
  },
  source: {
    fontSize: 11,
    fontWeight: 700,
    color: "#b91c1c",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 17, // başlık 14-18 punto aralığında
    fontWeight: 700,
    lineHeight: 1.3,
    marginBottom: 8,
    color: "#111111",
  },
  meta: {
    fontSize: 10,
    color: "#6b7280",
    marginBottom: 14,
  },
  summary: {
    fontSize: 12,
    fontStyle: "italic",
    color: "#374151",
    marginBottom: 16,
    lineHeight: 1.5,
  },
  leadImage: {
    width: "100%",
    marginBottom: 16,
    objectFit: "cover",
  },
  heading: {
    fontSize: 13.5,
    fontWeight: 700,
    marginTop: 10,
    marginBottom: 4,
    color: "#111111",
  },
  paragraph: {
    marginBottom: 9,
    textAlign: "justify",
  },
  contentImage: {
    width: "100%",
    marginVertical: 10,
  },
});

function abs(origin: string, src: string | null): string | null {
  if (!src) return null;
  return src.startsWith("http") ? src : `${origin}${src}`;
}

function ArticleDocument({
  article,
  origin,
}: {
  article: Article;
  origin: string;
}) {
  const lead = abs(origin, article.leadImage);
  const logo = abs(origin, article.logo);
  const metaParts = [article.author, article.publishedAt].filter(Boolean);
  const fontFamily = pickFontFamily(article);
  const rtl = isRtl(article);
  const textStart = rtl ? ("right" as const) : ("left" as const);

  return (
    <Document
      title={article.title}
      author={article.author || article.source}
      creator="İletişim Başkanlığı Haber Aracı"
    >
      <Page size="A4" style={[styles.page, { fontFamily }]} wrap>
        <View
          style={[
            styles.header,
            rtl ? { flexDirection: "row-reverse" as const } : {},
          ]}
        >
          {logo && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={logo} style={styles.logo} />
          )}
          <Text style={styles.source}>{article.source}</Text>
        </View>
        <Text style={[styles.title, { textAlign: textStart }]}>
          {article.title}
        </Text>
        {metaParts.length > 0 && (
          <Text style={[styles.meta, { textAlign: textStart }]}>
            {metaParts.join("  •  ")}
          </Text>
        )}

        {lead && (
          <>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={lead} style={styles.leadImage} />
          </>
        )}

        {article.summary ? (
          <Text style={[styles.summary, { textAlign: textStart }]}>
            {article.summary}
          </Text>
        ) : null}

        {article.body.map((block, i) =>
          block.type === "heading" ? (
            <Text key={i} style={[styles.heading, { textAlign: textStart }]}>
              {block.text}
            </Text>
          ) : (
            <Text
              key={i}
              style={[
                styles.paragraph,
                { textAlign: rtl ? ("right" as const) : ("justify" as const) },
              ]}
            >
              {block.text}
            </Text>
          )
        )}

        {article.contentImages.map((src, i) => {
          const a = abs(origin, src);
          return a ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image key={i} src={a} style={styles.contentImage} />
          ) : null;
        })}
        {/* DES şartnamesi gereği alt bilgi / sayfa numarası eklenmez. */}
      </Page>
    </Document>
  );
}

export async function buildPdf(
  article: Article,
  origin: string
): Promise<Buffer> {
  return renderToBuffer(<ArticleDocument article={article} origin={origin} />);
}
