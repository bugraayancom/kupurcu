# Haber → Temiz PDF Aracı

Haber sayfalarından **reklam, menü, "ilgili haberler" ve çerez uyarılarından arınmış**, görselli ve düzenli bir PDF üretir. Tercümanların ekran görüntüsü alıp reklam temizlemekle uğraşmasına gerek kalmaz.

## Nasıl çalışır?

1. **Çekme** — Sayfa tarayıcı taklidi başlıklarla indirilir.
2. **Kaba temizlik** — [Mozilla Readability](https://github.com/mozilla/readability) reklam/menü/footer'ın büyük kısmını atar.
3. **Yapay zekâ ile yorumlama** — Temizlenmiş metin Claude'a verilir; geriye kalan reklam/abonelik/paylaşım kalıntılarını ayıklar, haberi başlık + spot + gövde + görsel olarak yapılandırır. (Geçen yıl zayıf kalan adım; artık modele _ham HTML değil_, ön-temizlenmiş metin verildiği için çok daha isabetli.)
4. **PDF** — `@react-pdf/renderer` ile tam Türkçe karakter desteğiyle (DejaVu Sans) temiz bir belge üretilir.

> Metin **çevrilmez veya özetlenmez** — kaynak dilde, olduğu gibi korunur; çeviriyi tercüman yapar.

## Kurulum

```bash
npm install
cp .env.example .env.local
```

`.env.local` içine **Vercel AI Gateway** anahtarınızı girin:

```
AI_GATEWAY_API_KEY=...
```

> Anahtar: [vercel.com/dashboard](https://vercel.com/dashboard) → **AI Gateway** → **API Keys**. Claude modellerine bu kapıdan erişilir; ayrıca doğrudan Anthropic anahtarı kurmaya gerek yoktur.

Çalıştırma:

```bash
npm run dev      # http://localhost:3000
```

## Model seçimi

Varsayılan: `anthropic/claude-sonnet-4-6` (hızlı, isabetli). Daha zor sayfalar için `.env.local` ile yükseltin:

```
EXTRACT_MODEL=anthropic/claude-opus-4-8
```

## Bilinen sınır

- İçeriğini **tamamen JavaScript ile** yükleyen siteler (bazı SPA haber siteleri) düz çekimde boş gelebilir. Bu durumda arayüz uyarı gösterir. Gerekirse ileride headless tarayıcıyla (Playwright / Vercel Sandbox) çekim eklenebilir.

## Dağıtım (Vercel)

```bash
vercel
```

Üretimde `AI_GATEWAY_API_KEY` yerine Vercel'in OIDC token'ı otomatik kullanılabilir; ayrı anahtar gerekmez. Font dosyaları `next.config.ts` içindeki `outputFileTracingIncludes` ile PDF fonksiyonuna dahil edilir.

## Proje yapısı

```
src/
  app/
    page.tsx                 Arayüz (URL gir → önizleme → PDF indir)
    api/extract/route.ts     Çekme + Readability + Claude yapılandırma
    api/image/route.ts       Görsel proxy (CORS/referrer aşımı)
    api/pdf/route.ts         PDF üretimi
  lib/
    extract.ts               Çekirdek çıkarma mantığı
    pdf.tsx                  PDF belge şablonu
    types.ts                 Şema + tipler
fonts/                       DejaVu Sans (tam Türkçe karakter desteği)
```
