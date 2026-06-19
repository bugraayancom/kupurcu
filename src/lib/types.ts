import { z } from "zod";

/**
 * Claude'un temizlenmiş haber metninden üreteceği yapılandırılmış çıktı.
 * Görseller ayrıca işlenir; burada model yalnızca hangi adayların
 * gerçek içerik görseli olduğunu seçer.
 */
export const ArticleBlockSchema = z.object({
  type: z.enum(["heading", "paragraph"]).describe("Bloğun türü"),
  text: z.string().describe("Bloğun düz metni"),
});

export const ArticleExtractionSchema = z.object({
  title: z.string().describe("Haberin temiz başlığı"),
  source: z
    .string()
    .describe("Yayın kuruluşu / site adı (ör. Reuters, Le Monde)"),
  author: z.string().describe("Yazar adı; bulunamazsa boş bırak").default(""),
  publishedAt: z
    .string()
    .describe("Yayın tarihi metinde nasıl geçiyorsa öyle; yoksa boş")
    .default(""),
  summary: z
    .string()
    .describe("Haberin 1-2 cümlelik özeti / spot")
    .default(""),
  body: z
    .array(ArticleBlockSchema)
    .describe(
      "Reklam, menü, 'ilgili haberler', çerez/abonelik uyarıları, paylaşım butonları temizlenmiş haldeki haber gövdesi"
    ),
  leadImageIndex: z
    .number()
    .int()
    .describe(
      "Aday görseller listesinden ana/kapak görselin indeksi; uygun görsel yoksa -1"
    ),
  contentImageIndexes: z
    .array(z.number().int())
    .describe(
      "Haber içeriğine ait diğer anlamlı görsellerin indeksleri (logo, ikon, reklam görseli hariç)"
    )
    .default([]),
});

export type ArticleExtraction = z.infer<typeof ArticleExtractionSchema>;

/** API'nin frontend'e ve PDF'e döndürdüğü tam haber nesnesi. */
export interface Article {
  url: string;
  title: string;
  source: string;
  author: string;
  publishedAt: string;
  summary: string;
  body: { type: "heading" | "paragraph"; text: string }[];
  logo: string | null; // medya organı logosu (proxied URL)
  leadImage: string | null; // proxied URL
  contentImages: string[]; // proxied URLs
}
