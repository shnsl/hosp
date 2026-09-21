# Terapist Ajanda

Ev ziyareti planlayan terapistler için mobil öncelikli PWA. Hasta listesi, gün/saat ajandası ve araç mesafe/süresine göre rota önerisi.

**Canlı (Pages kurulunca):** https://shnsl.github.io/hosp/

## Özellikler

- PIN ile giriş (Firebase Auth)
- Hasta ekle / düzenle / sil (adres → konum)
- Güne ziyaret planlama, sıra yönetimi
- OSRM ile araç km/dk; yoksa yaklaşık mesafe
- Rota önerisini ajandaya uygulama

## Kurulum

```bash
npm install
cp .env.example .env   # Firebase web config
npm run dev
```

Firebase Console’da Authentication (Email/Password) ve Firestore’u aç; `firestore.rules` dosyasını deploy et.

İlk giriş şifresi: `222222` (Ayarlar’dan değiştir).

`main` push → GitHub Pages’e otomatik deploy (repo secrets gerekli).
