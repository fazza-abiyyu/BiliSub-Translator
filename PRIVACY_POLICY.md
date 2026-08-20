# Kebijakan Privasi BiliSub

Terakhir diperbarui: Agustus 2026

## 1. Data yang dikirim ke pihak ketiga

Saat fitur Auto-Translation aktif, BiliSub mengirim **teks subtitle** (baris caption video, misalnya teks bahasa Mandarin yang tampil di layar) ke layanan penerjemahan pihak ketiga untuk diterjemahkan:

- **Google Translate** (`translate.googleapis.com`, `translate.google.com`) — layanan utama
- **Lingva** (`lingva.ml`) dan **MyMemory** (`api.mymemory.translated.net`) — fallback jika Google gagal

Yang dikirim hanya teks subtitle dan bahasa target pilihan pengguna. Tidak ada identitas pengguna, tidak ada URL video, tidak ada data akun, dan tidak ada konteks video yang dikirim ke layanan penerjemah. Jika pengguna mematikan Auto-Translation, tidak ada teks yang dikirim.

Perlu dicatat: Google, Lingva, dan MyMemory adalah layanan pihak ketiga dengan kebijakan privasinya masing-masing. BiliSub tidak mengontrol cara mereka memproses data tersebut.

## 2. Apakah URL video dikirim?

Tidak. BiliSub tidak mengirim URL video ke penerjemah. Ekstensi hanya mengakses API milik Bilibili (`api.bilibili.com`) di dalam halaman video untuk mengambil daftar track subtitle yang sudah tersedia. Permintaan ini tetap satu domain dengan situs yang sedang dibuka pengguna, bukan ke pihak ketiga.

## 3. Analytics & telemetry

Tidak ada. BiliSub tidak memuat kode analytics, tidak mengirim telemetry, dan tidak memiliki server/backend milik pengembang. Semua pemrosesan terjadi di perangkat pengguna.

## 4. Penyimpanan data

BiliSub hanya menyimpan **pengaturan pengguna** melalui `chrome.storage.sync`:

- Bahasa target
- Ukuran font
- Mode subtitle (dual / translation only)
- Status on/off auto-translate
- Posisi panel subtitle yang digeser pengguna

Data ini disinkronkan antar perangkat pengguna sendiri oleh browser. Cache terjemahan hanya berada di memori dan hilang saat halaman dimuat ulang. Tidak ada subtitle, video, atau riwayat yang disimpan.

## 5. Permissions yang digunakan

- `storage` & `alarms` — menyimpan pengaturan dan menjaga background tetap berjalan
- `activeTab` & `tabs` — membaca halaman aktif agar subtitle bisa dideteksi dan popup mengelola pengaturan
- Akses host: `bilibili.com`, `youtube.com` (tempat subtitle diambil), `hdslb.com` (CDN subtitle Bilibili), serta domain penerjemah `translate.googleapis.com`, `translate.google.com`, `lingva.ml`, `api.mymemory.translated.net`