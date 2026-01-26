# Supabase Setup Guide

Complete SQL and configuration for MusicReader backend.

## 1. Database Schema

Run in SQL Editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Scores table
CREATE TABLE scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    composer TEXT,
    tags TEXT[] DEFAULT '{}',
    file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'musicxml', 'mxl')),
    storage_bucket TEXT NOT NULL DEFAULT 'scores',
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_opened_at TIMESTAMPTZ,
    last_position JSONB,
    is_favorite BOOLEAN NOT NULL DEFAULT false
);

-- Viewer preferences table
CREATE TABLE viewer_prefs (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    trigger_next TEXT NOT NULL DEFAULT 'double_blink',
    trigger_prev TEXT NOT NULL DEFAULT 'long_blink',
    sensitivity FLOAT NOT NULL DEFAULT 1.0,
    cooldown_ms INT NOT NULL DEFAULT 900,
    show_debug BOOLEAN NOT NULL DEFAULT false,
    metronome_bpm INT NOT NULL DEFAULT 80,
    keyboard_next TEXT NOT NULL DEFAULT 'ArrowRight',
    keyboard_prev TEXT NOT NULL DEFAULT 'ArrowLeft',
    dark_mode BOOLEAN NOT NULL DEFAULT false,
    stage_mode BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Setlists table
CREATE TABLE setlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Setlist items table
CREATE TABLE setlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setlist_id UUID NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
    score_id UUID NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
    sort_order INT NOT NULL,
    UNIQUE(setlist_id, score_id)
);

-- Indexes
CREATE INDEX idx_scores_user_id ON scores(user_id);
CREATE INDEX idx_scores_last_opened ON scores(user_id, last_opened_at DESC NULLS LAST);
CREATE INDEX idx_scores_favorite ON scores(user_id, is_favorite) WHERE is_favorite = true;
CREATE INDEX idx_setlists_user_id ON setlists(user_id);
CREATE INDEX idx_setlist_items_setlist ON setlist_items(setlist_id, sort_order);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scores_updated_at BEFORE UPDATE ON scores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER viewer_prefs_updated_at BEFORE UPDATE ON viewer_prefs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER setlists_updated_at BEFORE UPDATE ON setlists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

## 2. Row Level Security (RLS)

```sql
-- Enable RLS
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE viewer_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE setlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE setlist_items ENABLE ROW LEVEL SECURITY;

-- Scores policies
CREATE POLICY "Users can view own scores" ON scores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own scores" ON scores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own scores" ON scores FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own scores" ON scores FOR DELETE USING (auth.uid() = user_id);

-- Viewer prefs policies
CREATE POLICY "Users can view own prefs" ON viewer_prefs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own prefs" ON viewer_prefs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own prefs" ON viewer_prefs FOR UPDATE USING (auth.uid() = user_id);

-- Setlists policies
CREATE POLICY "Users can view own setlists" ON setlists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own setlists" ON setlists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own setlists" ON setlists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own setlists" ON setlists FOR DELETE USING (auth.uid() = user_id);

-- Setlist items policies (via setlist ownership)
CREATE POLICY "Users can view own setlist items" ON setlist_items FOR SELECT
USING (EXISTS (SELECT 1 FROM setlists WHERE setlists.id = setlist_items.setlist_id AND setlists.user_id = auth.uid()));

CREATE POLICY "Users can insert own setlist items" ON setlist_items FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM setlists WHERE setlists.id = setlist_items.setlist_id AND setlists.user_id = auth.uid()));

CREATE POLICY "Users can update own setlist items" ON setlist_items FOR UPDATE
USING (EXISTS (SELECT 1 FROM setlists WHERE setlists.id = setlist_items.setlist_id AND setlists.user_id = auth.uid()));

CREATE POLICY "Users can delete own setlist items" ON setlist_items FOR DELETE
USING (EXISTS (SELECT 1 FROM setlists WHERE setlists.id = setlist_items.setlist_id AND setlists.user_id = auth.uid()));
```

## 3. Storage Setup

1. Go to Storage in Supabase Dashboard
2. Create bucket: `scores` (PRIVATE - uncheck "Public bucket")
3. Run storage policies:

```sql
-- Storage policies for scores bucket
CREATE POLICY "Users can upload to own folder" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'scores' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'scores' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own files" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'scores' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'scores' AND (storage.foldername(name))[1] = auth.uid()::text);
```

## 4. Authentication

Enable Email/Password auth in Authentication → Providers.

Optional: Configure email templates for confirmation emails.
