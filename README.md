# 🤖 Bot Pandawa — Web Scraper

Automated scraper for [Pandawa KKN](https://pandawakkn.id) learning materials. Extracts PPT slides and module documents from the platform and compiles them into PDF files.

## ✨ Features

- 🔐 Auto login to Pandawa KKN
- 📊 Scrape all PPT/Slide images per materi
- 📚 Scrape all module/document pages (handles "Tunggu 5 detik" timer)
- 📄 Auto-generate PDF from scraped images
- 🔧 Configurable via `.env` — no hardcoded credentials

## 📁 Project Structure

```
bot-pandawa/
├── bot.js              # Main scraper script
├── diagnose.js         # Diagnostic tool (debug page structure)
├── .env                # Your credentials (not committed to git)
├── .env.example        # Template for .env
├── package.json        # Dependencies
├── downloads/
│   ├── materi_3/       # Hasil scrape materi ID 3
│   │   ├── ppt/
│   │   └── modul/
│   └── materi_4/       # Hasil scrape materi ID 4
│       ├── ppt/
│       └── modul/
└── output/
    ├── Materi_3_PPT.pdf
    ├── Materi_3_Modul.pdf
    ├── Materi_4_PPT.pdf
    └── Materi_4_Modul.pdf
```

## 🚀 Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/Rex4Red/bot-pandawa.git
cd bot-pandawa
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your Pandawa KKN account:

```env
PANDAWA_USERNAME=your_email@student.upnyk.ac.id
PANDAWA_PASSWORD=your_password_here
MATERI_ID=3
```

| Variable | Description |
|---|---|
| `PANDAWA_USERNAME` | Email akun Pandawa KKN |
| `PANDAWA_PASSWORD` | Password akun Pandawa KKN |
| `MATERI_ID` | ID materi yang ingin di-scrape (angka di URL `/materi-mhs/{id}`) |

### 4. Find your Materi ID

1. Login ke [pandawakkn.id](https://pandawakkn.id) secara manual
2. Buka materi yang ingin kamu scrape
3. Lihat angka di akhir URL, contoh: `https://pandawakkn.id/materi-mhs/3` → **ID = 3**
4. Set `MATERI_ID=3` di file `.env`

## 📖 Usage

### Scrape materi (PPT + Module → PDF)

```bash
node bot.js
```

Bot akan:
1. Login otomatis ke Pandawa KKN
2. Membuka halaman materi sesuai `MATERI_ID`
3. Expand accordion **"Slide / PPT"** → screenshot setiap slide
4. Expand accordion **"Dokumen Materi"** → screenshot setiap halaman (menunggu timer otomatis)
5. Generate 2 file PDF di folder `output/`

### Diagnose page (debug)

```bash
node diagnose.js
```

Mengambil screenshot full page dan dump HTML untuk debugging struktur halaman.

## 📤 Output

Setelah selesai, file PDF akan tersedia di:

- `output/Materi_{id}_PPT.pdf` — Semua slide PPT
- `output/Materi_{id}_Modul.pdf` — Semua halaman dokumen materi

Setiap materi disimpan terpisah, jadi hasil sebelumnya **tidak akan tertimpa**.

## ⚙️ Requirements

- **Node.js** >= 18
- **Google Chrome / Chromium** (otomatis digunakan oleh Puppeteer)

## 🛠 Dependencies

| Package | Usage |
|---|---|
| [puppeteer](https://pptr.dev/) | Browser automation & web scraping |
| [pdf-lib](https://pdf-lib.js.org/) | PDF generation from images |
| [sharp](https://sharp.pixelplumbing.com/) | Image processing & conversion |
| [dotenv](https://github.com/motdotla/dotenv) | Environment variable management |

## ⚠️ Notes

- Bot berjalan dalam mode **non-headless** (browser terlihat) agar bisa menangani konten dinamis
- Pastikan koneksi internet stabil selama proses scraping
- Waktu scraping bergantung pada jumlah slide/halaman (rata-rata 5–15 menit per materi)

## 📝 License

ISC
