
# Vocab Trainer — Class Edition

Blue/white/black React app for classroom vocabulary learning.
- Admin-only content creation
- Students register/login (Supabase optional), track time/correct answers, earn coins
- **Global progress** (All sets), leaderboard
- Works in **local demo mode** when no Supabase env is set

## Run locally
```bash
npm i
npm run dev
```

## Env (optional)
Create `.env` from `.env.example` with:
```
VITE_SUPABASE_URL=your-url
VITE_SUPABASE_ANON_KEY=your-anon
```

## Deploy (Vercel)
- Connect GitHub repo to Vercel
- Set the two env vars in Project Settings → Environment Variables
- Every push to main triggers deploy

## Schema (Supabase)
See `supabase_schema.sql` for tables and RLS policies.
