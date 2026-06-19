"use client";

import { useState } from "react";
import type { Article } from "@/lib/types";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [article, setArticle] = useState<Article | null>(null);

  async function handleExtract(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWarning(null);
    setArticle(null);
    setLoading(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      // Yanıtı önce metin olarak al; JSON değilse (ör. sunucu yeniden
      // derleniyorken dönen HTML hata sayfası) anlaşılır bir mesaj göster.
      const raw = await res.text();
      let data: { article?: Article; warning?: string; error?: string };
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(
          res.ok
            ? "Sunucudan beklenmeyen bir yanıt geldi. Sunucu yeniden başlıyor olabilir; lütfen birkaç saniye sonra tekrar deneyin."
            : `Sunucu hatası (${res.status}). Lütfen tekrar deneyin.`
        );
      }
      if (!res.ok) throw new Error(data.error || "Bilinmeyen hata");
      if (!data.article) throw new Error("Haber içeriği alınamadı.");
      setArticle(data.article);
      setWarning(data.warning ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePdf() {
    if (!article) return;
    setPdfLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "PDF oluşturulamadı");
      }
      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = (article.title || "haber").slice(0, 60) + ".pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dlUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF hatası");
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="min-h-full bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-5">
          <h1 className="text-lg font-semibold tracking-tight">
            Haber → Temiz PDF Aracı
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Haber bağlantısını yapıştırın; reklamlardan arınmış, görselli ve
            düzenli bir PDF oluşturun.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <form onSubmit={handleExtract} className="flex gap-2">
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://ornek-haber-sitesi.com/haber-baslik"
            className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Getiriliyor…" : "Haberi Getir"}
          </button>
        </form>

        {loading && (
          <p className="mt-4 text-sm text-slate-500">
            Sayfa çekiliyor, temizleniyor ve yapay zekâ ile yorumlanıyor…
            Çoğu site birkaç saniyede gelir; bot korumalı siteler (ör. bazı
            ajanslar) bir dakikaya kadar sürebilir, lütfen bekleyin.
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {warning && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            ⚠️ {warning}
          </div>
        )}

        {article && (
          <>
            <div className="mt-6 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-slate-500">Önizleme</h2>
              <button
                onClick={handlePdf}
                disabled={pdfLoading}
                className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {pdfLoading ? "PDF hazırlanıyor…" : "PDF İndir"}
              </button>
            </div>

            <article className="mt-3 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
              <div className="flex items-center gap-2">
                {article.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={article.logo}
                    alt=""
                    className="h-6 max-w-[150px] object-contain"
                  />
                )}
                <p className="text-xs font-bold uppercase tracking-wide text-red-700">
                  {article.source}
                </p>
              </div>
              <h3 className="mt-2 text-2xl font-bold leading-snug text-slate-900">
                {article.title}
              </h3>
              {(article.author || article.publishedAt) && (
                <p className="mt-2 text-xs text-slate-500">
                  {[article.author, article.publishedAt]
                    .filter(Boolean)
                    .join("  •  ")}
                </p>
              )}

              {article.leadImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={article.leadImage}
                  alt=""
                  className="mt-4 w-full rounded"
                />
              )}

              {article.summary && (
                <p className="mt-4 text-base italic text-slate-600">
                  {article.summary}
                </p>
              )}

              <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-slate-800">
                {article.body.map((b, i) =>
                  b.type === "heading" ? (
                    <h4
                      key={i}
                      className="pt-2 text-lg font-bold text-slate-900"
                    >
                      {b.text}
                    </h4>
                  ) : (
                    <p key={i}>{b.text}</p>
                  )
                )}
              </div>

              {article.contentImages.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="mt-4 w-full rounded" />
              ))}

              <p className="mt-6 border-t border-slate-100 pt-3 text-xs text-slate-400">
                Kaynak: {article.url}
              </p>
            </article>
          </>
        )}

        {!article && !loading && !error && (
          <p className="mt-8 text-center text-sm text-slate-400">
            Başlamak için bir haber bağlantısı girin.
          </p>
        )}
      </main>
    </div>
  );
}
