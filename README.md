# MusicReader 🎵

A production-ready sheet music viewer with facial gesture page-turning, hosted on GitHub Pages with Supabase backend.

## Features

- **PDF & MusicXML Support**: View PDF scores or render MusicXML/MXL files musically using OpenSheetMusicDisplay
- **Facial Gesture Controls**: Turn pages with blinks and head movements (all processing local, never uploaded)
- **Keyboard & Foot Pedal Support**: Arrow keys, Space, Enter, or remap to your foot pedal's output
- **Metronome**: Built-in metronome with tap tempo
- **Setlists**: Organize scores for performances
- **Performance Mode**: Minimal UI for stage use
- **Dark Mode & Stage Mode**: High contrast themes for different lighting
- **Offline PWA**: App shell cached for offline access

## Tech Stack

- **Frontend**: Vite + Vanilla JavaScript (ES Modules)
- **Backend**: Supabase (Auth, Database, Storage)
- **PDF Rendering**: PDF.js
- **Music Notation**: OpenSheetMusicDisplay (OSMD)
- **Face Detection**: MediaPipe Face Landmarker
- **Hosting**: GitHub Pages

## Setup

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/MusicReader.git
cd MusicReader
```

### 2. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **anon public key** from Settings → API

### 3. Run Database Migrations

In the Supabase SQL Editor, run the SQL from `SUPABASE_SETUP.md` (see below).

### 4. Create Storage Bucket

1. Go to **Storage** in Supabase Dashboard
2. Create a new bucket named `scores`
3. **IMPORTANT**: Keep it PRIVATE (uncheck "Public bucket")

### 5. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 6. Install & Run

```bash
npm install
npm run dev
```

## Deployment to GitHub Pages

### Automatic Deployment

1. Push to the `main` branch
2. Add repository secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Enable GitHub Pages (Settings → Pages → Source: GitHub Actions)
4. The workflow will build and deploy automatically

### Manual Build

```bash
VITE_BASE_PATH=/MusicReader/ npm run build
```

## Project Structure

```
MusicReader/
├── src/
│   ├── main.js          # App entry point
│   ├── router.js        # Hash-based SPA router
│   ├── supabaseClient.js # Supabase initialization
│   ├── auth.js          # Login/signup
│   ├── library.js       # Score library
│   ├── viewer.js        # Main viewer orchestrator
│   ├── pdfViewer.js     # PDF.js integration
│   ├── xmlViewer.js     # OSMD integration
│   ├── faceControl.js   # MediaPipe gesture detection
│   ├── metronome.js     # Metronome feature
│   ├── setlists.js      # Setlist management
│   └── settings.js      # User preferences
├── styles/              # CSS files
├── public/              # Static assets & PWA files
└── .github/workflows/   # CI/CD
```

## Security

- ✅ All storage buckets are PRIVATE
- ✅ Row-Level Security (RLS) on all tables
- ✅ Signed URLs for file access (5 min expiry)
- ✅ Camera data NEVER leaves the device
- ✅ No React/Next.js (avoiding CVE-2025-55182)

## Privacy

Webcam video is processed entirely on-device using MediaPipe.
No video frames are ever uploaded or stored. See `/privacy` for full policy.

## License

MIT
