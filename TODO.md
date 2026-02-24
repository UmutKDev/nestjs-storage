# TODO

## Dosya & Depolama

- [ ] **File Versioning** — Dosyalarin onceki surumlerini saklama ve geri yukleme (S3 versioning ile)
- [ ] **Trash / Cop Kutusu** — Silinen dosyalari soft-delete ile belirli sure saklama, geri yukleme endpoint'i
- [ ] **File Sharing & Public Links** — Dosya/klasor paylasim linkleri olusturma (sure sinirli, parola korumali, indirme limiti)
- [ ] **Thumbnail Generation** — Resim ve video dosyalari icin otomatik thumbnail uretimi (Sharp/FFmpeg + BullMQ job)
- [ ] **File Preview** — PDF, resim, metin dosyalari icin inline preview endpoint'i
- [ ] **Duplicate Detection** — Content hash (SHA-256) ile ayni dosyanin tekrar yuklenmesini engelleme (deduplication)
- [ ] **Favorites / Pinned Files** — Kullanicinin sik kullandigi dosyalari isaretlemesi

## Kullanici & Isbirligi

- [ ] **Activity Log / Audit Trail** — Tum dosya islemleri icin tarihce (kim, ne zaman, ne yapti)
- [ ] **Notifications** — WebSocket veya SSE ile gercek zamanli bildirimler (upload tamamlandi, paylasim daveti, kota uyarisi)
- [ ] **Shared Workspaces / Teams** — Birden fazla kullanicinin ortak klasorlerde calismasi
- [ ] **Granular Permissions** — Klasor/dosya bazinda okuma/yazma/silme yetkileri

## Guvenlik & Uyumluluk

- [ ] **OAuth2 / Social Login** — Google, GitHub gibi harici saglayicilarla giris
- [ ] **End-to-End Encryption (Client-side)** — Sunucu tarafinda dosya icerigine erisilemyen sifreleme destegi
- [ ] **IP-based Access Restrictions** — Kullanici hesabi duzeyinde IP kisitlamasi
- [ ] **GDPR Data Export** — Kullanicinin tum verilerini disa aktarma endpoint'i

## Altyapi & Performans

- [ ] **Webhook System** — Belirli olaylarda (upload, delete, share) harici URL'lere bildirim gonderme
- [ ] **CDN Integration** — Sik erisilen dosyalar icin CloudFront/CDN entegrasyonu
- [ ] **Storage Analytics Dashboard** — Depolama kullanim istatistikleri, dosya tipi dagilimi, upload/download grafikleri
- [ ] **Scheduled Tasks** — Suresi dolan paylasim linklerini temizleme, cop kutusunu bosaltma (cron jobs)
- [ ] **Multi-bucket / Multi-region** — Farkli bolgelerde depolama secenegi

## API & Entegrasyon

- [ ] **GraphQL API** — REST'e ek olarak GraphQL destegi
- [ ] **S3-compatible API Layer** — Projenin kendisinin S3 protokolunu expose etmesi (S3 uyumlu client'larla kullanim)
- [ ] **CLI Tool** — Projeyle etkilesim icin terminal araci
- [ ] **SDK / Client Library** — TypeScript/JavaScript client paketi
