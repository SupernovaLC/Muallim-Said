
import React, { useEffect, useMemo, useState } from "react";

// Helpers
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
const THEME = {
  primary: "bg-blue-600 border-blue-700 text-white",
  primaryGhost: "bg-white text-blue-700 border-blue-300",
  soft: "bg-blue-50 border-blue-100 text-blue-900",
  danger: "bg-red-600 border-red-700 text-white",
  success: "bg-green-600 border-green-700 text-white",
};
const BOX_INTERVALS_DAYS = [1, 2, 4, 7, 15];
const ADMIN_INVITE_CODE = "SUPERNOVA-ADMIN-2025";

// Supabase (safe/lazy)
function getEnv(key) {
  try { return (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[key]) || undefined; } catch { return undefined; }
}
const SUPA_URL = getEnv("VITE_SUPABASE_URL");
const SUPA_KEY = getEnv("VITE_SUPABASE_ANON_KEY");
let __sbClient = null;
let __sbInitPromise = null;
async function initSupabase() {
  if (__sbClient) return __sbClient;
  if (!SUPA_URL || !SUPA_KEY) return null;
  if (__sbInitPromise) return __sbInitPromise;
  __sbInitPromise = (async () => {
    try {
      const mod = await import("@supabase/supabase-js");
      const client = mod.createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: true } });
      __sbClient = client; return client;
    } catch (e) {
      console.warn("Supabase import failed; running in local mode.", e);
      __sbClient = null; return null;
    }
  })();
  return __sbInitPromise;
}

// Local fallback
const LS = { CARDS:"vt_cards_v2", SETS:"vt_sets_v1", USERS:"vt_users_v1", SESSION:"vt_session_v1" };
function addDays(date, days){ const d=new Date(date); d.setDate(d.getDate()+days); return d.getTime(); }
function mulberry32(a){ let t=a>>>0; return function(){ t+=0x6D2B79F5; let r=Math.imul(t^(t>>>15),1|t); r^=r+Math.imul(r^(r>>>7),61|r); return ((r^(r>>>14))>>>0)/4294967296; }; }
function shuffle(arr, rng=Math.random){ const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
function pickN(arr,n,rng=Math.random){ return shuffle(arr,rng).slice(0,n); }
function loadJSON(k,f){ try{ const raw=localStorage.getItem(k); if(!raw) return f; const v=JSON.parse(raw); return v??f; }catch{return f;} }
function saveJSON(k,v){ localStorage.setItem(k, JSON.stringify(v)); }

const DEFAULT_SET_ID = uid();
const DEFAULT_SETS = [ { id: DEFAULT_SET_ID, book: "Book A", unit: 1, title: "Book A • Unit 1", createdAt: Date.now() } ];
const DEFAULT_CARDS = [
  { id: uid(), term: "meticulous", definition: "very careful; precise", example: "She kept meticulous notes.", language: "EN", box: 1, nextReview: Date.now(), setId: DEFAULT_SET_ID },
  { id: uid(), term: "inevitable", definition: "certain to happen", example: "Rain felt inevitable.", language: "EN", box: 1, nextReview: Date.now(), setId: DEFAULT_SET_ID },
  { id: uid(), term: "coherent", definition: "logical and consistent", example: "A coherent essay.", language: "EN", box: 1, nextReview: Date.now(), setId: DEFAULT_SET_ID },
];
function ensureSeeded(){
  if(!localStorage.getItem(LS.SETS)) saveJSON(LS.SETS, DEFAULT_SETS);
  if(!localStorage.getItem(LS.CARDS)) saveJSON(LS.CARDS, DEFAULT_CARDS);
  if(!localStorage.getItem(LS.USERS)){
    const admin = { id: uid(), name: "Admin", email: "admin@example.com", password: "admin", isAdmin: true, coins: 0, timeMs: 0, correct: 0, createdAt: Date.now() };
    saveJSON(LS.USERS, [admin]); saveJSON(LS.SESSION, admin.id);
  }
}
function loadUsers(){ return loadJSON(LS.USERS, []); }
function saveUsers(u){ saveJSON(LS.USERS, u); }
function loadCards(){ return loadJSON(LS.CARDS, []); }
function saveCards(c){ saveJSON(LS.CARDS, c); }
function loadSets(){ return loadJSON(LS.SETS, []); }
function saveSets(s){ saveJSON(LS.SETS, s); }
function currentUserId(){ return loadJSON(LS.SESSION, null); }
function setSession(id){ saveJSON(LS.SESSION, id); }

// Helper: support global (all sets) or single set view
function visibleCardsFor(cards, activeSetId){
  if (!activeSetId) return cards; // global view
  return cards.filter(c=> (c.set_id || c.setId) === activeSetId);
}

// UI primitives
function Button({ children, onClick, variant="primary", type="button", className="" }){
  const styles = { primary: THEME.primary, ghost: THEME.primaryGhost, soft: THEME.soft, danger: THEME.danger, success: THEME.success };
  return <button type={type} onClick={onClick} className={`px-4 py-2 rounded-2xl text-sm font-medium border transition active:scale-[.98] ${styles[variant]} ${className}`}>{children}</button>;
}
function Card({ children, className="" }){ return <div className={`rounded-2xl border shadow-sm p-4 bg-white ${className}`}>{children}</div>; }
function Stat({ label, value }){ return (<div className="flex flex-col items-start p-4 rounded-2xl border shadow-sm bg-white"><div className="text-2xl font-bold text-black">{value}</div><div className="text-sm opacity-70">{label}</div></div>); }
function Pill({ children }){ return <span className="px-2 py-0.5 rounded-full text-xs border bg-blue-50 border-blue-200 text-blue-800">{children}</span>; }

export default function App(){
  const [sb, setSb] = useState(null);
  const [users, setUsers] = useState(loadUsers());
  const [cards, setCards] = useState(loadCards());
  const [sets, setSets] = useState(loadSets());
  const [tab, setTab] = useState("review");
  const [query, setQuery] = useState("");
  const [reveal, setReveal] = useState(false);
  const [seed, setSeed] = useState(0);
  const [activeSetId, setActiveSetId] = useState(null); // null => All sets (global)
  const [me, setMe] = useState(null);
  const [testOutput, setTestOutput] = useState(null);

  useEffect(()=>{
    ensureSeeded();
    (async () => {
      const client = await initSupabase();
      if(!client) return;
      setSb(client);
      const { data: sub } = client.auth.onAuthStateChange(async (_evt, session) => {
        if(!session){ setMe(null); return; }
        await refreshFromSupabase(client, session.user.id);
      });
      const { data: { session } } = await client.auth.getSession();
      if (session?.user?.id) await refreshFromSupabase(client, session.user.id);
      return () => { sub?.subscription?.unsubscribe?.(); };
    })();
  }, []);

  async function refreshFromSupabase(client, userId){
    const { data: profile } = await client.from('profiles').select('*').eq('id', userId).single();
    setMe(profile || null);
    const { data: setRows } = await client.from('sets').select('*').order('created_at', { ascending: false });
    setSets(setRows || []);
    setActiveSetId(null); // global by default
    const { data: cardRows } = await client.from('cards').select('*');
    setCards(cardRows || []);
    const { data: profiles } = await client.from('profiles').select('*').order('coins', { ascending: false });
    setUsers(profiles || []);
  }

  useEffect(()=>{
    if (sb) return;
    const m = (loadUsers().find(u=> u.id===currentUserId())) || null; setMe(m);
    if (!activeSetId) setActiveSetId(null);
  }, [sb]);

  useEffect(()=>{ if (!sb) saveUsers(users); }, [users, sb]);
  useEffect(()=>{ if (!sb) saveCards(cards); }, [cards, sb]);
  useEffect(()=>{ if (!sb) saveSets(sets); }, [sets, sb]);

  const now = Date.now();
  const [progress, setProgress] = useState({});
  useEffect(()=>{ (async () => {
    if (!sb || !me) return;
    const { data } = await sb.from('progress').select('*').eq('user_id', me.id);
    const map = {}; (data||[]).forEach(r=> { map[r.card_id] = { box: r.box, nextReview: new Date(r.next_review).getTime() }; });
    setProgress(map);
  })(); }, [sb, me, activeSetId]);

  const visibleCards = visibleCardsFor(cards, activeSetId);
  function getBox(c){ return sb ? (progress[c.id]?.box || 1) : c.box; }
  function getNextReview(c){ return sb ? (progress[c.id]?.nextReview || 0) : c.nextReview; }

  const dueToday = visibleCards.filter((c)=> (getNextReview(c) || 0) <= now).length;
  const mastered = visibleCards.filter((c)=> getBox(c) >= 5).length;

  if (!me){
    return <AuthScreen users={users} setUsers={setUsers} onAuthed={async (u)=>{ if (sb) { setMe(u); } else { setSession(u.id); setUsers((s)=>[...s]); }} } supabaseClient={sb} />
  }

  useEffect(()=>{
    if (!me) return;
    let start = Date.now();
    const iv = setInterval(()=>{
      if (!sb){
        setUsers((arr)=> arr.map((u)=> u.id===me.id ? { ...u, timeMs: (u.timeMs||0) + 1000 } : u));
      }
    }, 1000);
    return ()=>{
      clearInterval(iv);
      const dt = Date.now() - start;
      if (sb) { sb.rpc('add_study_time', { p_user_id: me.id, p_ms: dt }); }
      else { setUsers((arr)=> arr.map((u)=> u.id===me.id ? { ...u, timeMs: (u.timeMs||0) + dt } : u)); }
    };
  }, [me?.id, tab, activeSetId, sb]);

  const reviewQueue = useMemo(()=>{
    const due = visibleCards.filter((c)=> (getNextReview(c) || 0) <= now);
    const rng = mulberry32(seed); return due.sort(()=> rng() - 0.5);
  }, [visibleCards, seed, now, progress]);
  const current = reviewQueue[0];

  async function gradeCard(card, isEasy){
    if (sb){
      const prev = progress[card.id] || { box: 1, nextReview: 0 };
      const newBox = Math.max(1, Math.min(5, isEasy ? prev.box + 1 : 1));
      const next = addDays(Date.now(), BOX_INTERVALS_DAYS[newBox - 1]);
      await sb.from('progress').upsert({ user_id: me.id, card_id: card.id, box: newBox, next_review: new Date(next).toISOString() }, { onConflict: 'user_id,card_id' });
      if (isEasy){ await sb.rpc('add_coins', { p_user_id: me.id, p_amount: 10 }); await sb.rpc('add_correct', { p_user_id: me.id, p_amount: 1 }); }
      setProgress((m)=> ({ ...m, [card.id]: { box: newBox, nextReview: next } }));
      const { data: profiles } = await sb.from('profiles').select('*').order('coins', { ascending: false });
      setUsers(profiles || []); setReveal(false); return;
    }
    const idx = cards.findIndex((c)=> c.id===card.id); if (idx===-1) return;
    const old = cards[idx]; const newBox = Math.max(1, Math.min(5, isEasy ? old.box + 1 : 1));
    const next = addDays(Date.now(), BOX_INTERVALS_DAYS[newBox - 1]);
    const updated = { ...old, box: newBox, nextReview: next };
    const newList = [...cards]; newList[idx]=updated; setCards(newList); setReveal(false);
    if (isEasy) awardLocal(me.id, 10);
  }

  const quizItems = useMemo(()=>{
    const pool = visibleCards;
    const rng = mulberry32(seed + 999);
    return pool.slice(0, Math.min(15, pool.length)).map((c)=>{
      const wrongs = pickN(pool.filter((x)=> x.id !== c.id), Math.min(3, Math.max(1, pool.length-1)), rng).map((w)=> w.definition);
      const options = shuffle([c.definition, ...wrongs], rng);
      return { id: c.id, question: c.term, answer: c.definition, options };
    });
  }, [visibleCards, seed]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const quizDone = quizIndex >= quizItems.length && quizItems.length > 0;

  async function answerQuiz(choice){
    const item = quizItems[quizIndex]; if (!item) return;
    if (choice === item.answer){
      setQuizScore((s)=> s+1);
      if (sb){
        await sb.rpc('add_coins', { p_user_id: me.id, p_amount: 10 });
        await sb.rpc('add_correct', { p_user_id: me.id, p_amount: 1 });
        const { data: profiles } = await sb.from('profiles').select('*').order('coins', { ascending: false });
        setUsers(profiles || []);
      } else {
        awardLocal(me.id, 10);
        setUsers((arr)=> arr.map(u=> u.id===me.id? { ...u, correct:(u.correct||0)+1 } : u));
      }
    }
    setQuizIndex((i)=> i+1);
  }
  function resetQuiz(){ setSeed(Math.floor(Math.random()*1e9)); setQuizIndex(0); setQuizScore(0); }
  function awardLocal(userId, coins){ setUsers((arr)=> arr.map((u)=> u.id===userId? { ...u, coins:(u.coins||0)+coins } : u)); }

  const isAdmin = !!(sb ? me?.role === 'admin' : me?.isAdmin);
  async function addSet(book, unit){
    const title = `${book} • Unit ${unit}`;
    if (sb){
      const { data } = await sb.from('sets').insert({ book, unit: Number(unit), title }).select().single();
      setSets((s)=> [data, ...s]); setActiveSetId(data.id);
    } else {
      const newSet = { id: uid(), book, unit: Number(unit), title, createdAt: Date.now() };
      setSets((s)=> [newSet, ...s]); setActiveSetId(newSet.id);
    }
  }
  async function addCard(form){
    const fd = new FormData(form);
    const term = String(fd.get("term")).trim();
    const definition = String(fd.get("definition")).trim();
    const example = String(fd.get("example")||"");
    const language = String(fd.get("language") || "EN").slice(0,5).toUpperCase();
    const setId = String(fd.get("setId"));
    if (!term || !definition || !setId) return;
    if (sb){
      const { data } = await sb.from('cards').insert({ term, definition, example, language, set_id: setId }).select().single();
      setCards((s)=> [data, ...s]);
    } else {
      const newCard = { id: uid(), term, definition, example, language, box: 1, nextReview: Date.now(), setId };
      setCards((s)=> [newCard, ...s]);
    }
    form.reset();
  }

  const leaderboard = [...users].sort((a,b)=> (b.coins||0) - (a.coins||0));

  function runSelfTests(){
    const out = [];
    const ids = new Set([uid(), uid(), uid()]); out.push({ name: 'uid uniqueness', pass: ids.size === 3 });
    const t0 = new Date('2020-01-01T00:00:00Z').getTime(); const t1 = addDays(t0, 2);
    const dtDays = Math.round((t1 - t0) / (1000*60*60*24)); out.push({ name: 'addDays +2', pass: dtDays === 2 });
    const arr = [1,2,3,4,5]; const sh = shuffle(arr); out.push({ name: 'shuffle same length', pass: sh.length === arr.length });
    const tcards = [{id:'1', set_id:'A'},{id:'2', set_id:'B'}];
    out.push({ name: 'visibleCards ALL', pass: visibleCardsFor(tcards, null).length === 2 });
    out.push({ name: 'visibleCards filter A', pass: visibleCardsFor(tcards, 'A').length === 1 });
    const seededSets = loadSets(); const seededCards = loadCards();
    out.push({ name: 'fallback seeded sets', pass: Array.isArray(seededSets) && seededSets.length >= 1 });
    out.push({ name: 'fallback seeded cards', pass: Array.isArray(seededCards) && seededCards.length >= 1 });
    out.push({ name: 'supabase configured', pass: !!(SUPA_URL && SUPA_KEY) });
    setTestOutput(out);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 text-gray-900">
      <header className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-black text-white grid place-items-center font-bold">VT</div>
          <div>
            <h1 className="text-xl font-bold text-black">Vocab Trainer — Class Edition</h1>
            <div className="text-xs text-blue-700">Blue • White • Black theme</div>
          </div>
        </div>
        <nav className="flex gap-2">
          {[
            ["review", "Review"],
            ["quiz", "Quiz"],
            ["leaderboard", "Leaderboard"],
            ...(isAdmin ? [["manage", "Manage"], ["settings", "Settings"]] : []),
          ].map(([key, label]) => (
            <Button key={key} variant={tab===key?"primary":"ghost"} onClick={()=>setTab(key)} className="rounded-2xl">{label}</Button>
          ))}
          {sb ? (
            <Button variant="ghost" onClick={async ()=> { await sb.auth.signOut(); setMe(null); }}>Logout</Button>
          ) : (
            <Button variant="ghost" onClick={()=>{ setSession(null); setMe(null); }}>Logout</Button>
          )}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-16">
        <section className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Stat label="Due now" value={dueToday} />
          <Stat label="Words in view" value={visibleCards.length} />
          <Stat label="Mastered" value={mastered} />
          <Stat label="Coins" value={me.coins || 0} />
          <Stat label="Study time (min)" value={Math.floor((me.time_ms||me.timeMs||0)/60000)} />
        </section>

        <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <SetPicker sets={sets} activeSetId={activeSetId} onChange={setActiveSetId} />
          <div className="text-sm opacity-70">Signed in as <b>{me.name}</b> {(isAdmin) && <span className="ml-1">(<span className="text-blue-700">Admin</span>)</span>}</div>
        </div>

        {tab === "review" && (
          <section className="grid gap-4">
            {!current ? (
              <Card className="text-center py-16">
                <div className="text-2xl font-semibold">🎉 Nothing due</div>
                <p className="opacity-70 mt-2">Try Quiz mode or switch to another set.</p>
                <div className="mt-4 flex gap-2 justify-center">
                  <Button onClick={() => setTab("quiz")} variant="ghost">Go to Quiz</Button>
                  <Button onClick={() => setSeed((s) => s + 1)} variant="soft">Shuffle</Button>
                </div>
              </Card>
            ) : (
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Pill>Box {getBox(current)}</Pill>
                  <Pill>{sets.find(s=>s.id===current.set_id || s.id===current.setId)?.title || "—"}</Pill>
                  <Pill>{current.language}</Pill>
                </div>
                <div className="text-3xl font-bold text-black">{current.term}</div>
                {!reveal ? (
                  <div className="mt-6">
                    <Button onClick={() => setReveal(true)} className="w-full">Reveal</Button>
                  </div>
                ) : (
                  <div className="mt-6 grid gap-4">
                    <div>
                      <div className="text-sm opacity-70 mb-1">Definition</div>
                      <div className="text-lg">{current.definition}</div>
                    </div>
                    {current.example && (
                      <div>
                        <div className="text-sm opacity-70 mb-1">Example</div>
                        <div>“{current.example}”</div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <Button variant="success" onClick={() => gradeCard(current, true)}>Easy</Button>
                      <Button variant="danger" onClick={() => gradeCard(current, false)}>Hard</Button>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </section>
        )}

        {tab === "quiz" && (
          <section className="grid gap-4">
            <Card>
              {quizDone ? (
                <div className="text-center py-12">
                  <div className="text-3xl font-bold text-black">Score: {quizScore} / {quizItems.length}</div>
                  <p className="opacity-70 mt-2">+{quizScore*10} coins earned</p>
                  <div className="mt-4 flex gap-2 justify-center">
                    <Button onClick={resetQuiz}>Try again</Button>
                    <Button variant="ghost" onClick={() => setTab("review")}>Back to Review</Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-sm opacity-70">Question {Math.min(quizIndex + 1, quizItems.length)} / {quizItems.length}</div>
                  <div className="text-2xl font-bold mt-1 text-black">{quizItems[quizIndex]?.question}</div>
                  <div className="grid gap-2 mt-4">
                    {quizItems[quizIndex]?.options.map((opt, i) => (
                      <Button key={i} variant="soft" onClick={() => answerQuiz(opt)} className="text-left">{opt}</Button>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </section>
        )}

        {tab === "leaderboard" && (
          <section className="grid md:grid-cols-2 gap-4">
            <Card>
              <h2 className="text-lg font-semibold mb-3 text-black">🏆 Leaderboard (Coins)</h2>
              <ol className="grid gap-2">
                {leaderboard.map((u, idx) => (
                  <li key={u.id} className="flex items-center justify-between border rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full grid place-items-center text-white ${idx===0?"bg-blue-700":idx===1?"bg-blue-600":"bg-blue-500"}`}>{idx+1}</div>
                      <div>
                        <div className="font-semibold text-black">{u.name}</div>
                        <div className="text-xs opacity-70">Correct: {u.correct||u.correct_count||0} • Study: {Math.floor(((u.time_ms||u.timeMs||0)/60000))}m</div>
                      </div>
                    </div>
                    <div className="font-bold text-blue-700">{u.coins||0}🪙</div>
                  </li>
                ))}
              </ol>
            </Card>
            <Card>
              <h2 className="text-lg font-semibold mb-3 text-black">📚 Sets</h2>
              <SetList sets={sets} cards={cards.map(c=> ({...c, setId: c.set_id || c.setId}))} activeSetId={activeSetId} onSelect={setActiveSetId} />
            </Card>
          </section>
        )}

        {tab === "manage" && isAdmin && (
          <section className="grid md:grid-cols-3 gap-4 items-start">
            <Card className="md:col-span-1">
              <h2 className="text-lg font-semibold mb-3 text-black">Create Set</h2>
              <form onSubmit={async (e)=>{e.preventDefault(); const fd=new FormData(e.currentTarget); await addSet(String(fd.get("book")||"Book A"), String(fd.get("unit")||"1")); e.currentTarget.reset();}} className="grid gap-2">
                <label className="grid gap-1">
                  <span className="text-sm">Book</span>
                  <input name="book" className="border rounded-xl px-3 py-2" placeholder="Book A" defaultValue="Book A" />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm">Unit</span>
                  <input name="unit" className="border rounded-xl px-3 py-2" placeholder="1" defaultValue="1" />
                </label>
                <Button type="submit">Add Set</Button>
              </form>
            </Card>

            <Card className="md:col-span-2">
              <h2 className="text-lg font-semibold mb-3 text-black">Add Words (Admin only)</h2>
              <form onSubmit={async (e)=>{e.preventDefault(); await addCard(e.currentTarget);}} className="grid md:grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <span className="text-sm">Term *</span>
                  <input name="term" className="border rounded-xl px-3 py-2" required />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm">Definition *</span>
                  <input name="definition" className="border rounded-xl px-3 py-2" required />
                </label>
                <label className="md:col-span-2 grid gap-1">
                  <span className="text-sm">Example</span>
                  <textarea name="example" className="border rounded-xl px-3 py-2" />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm">Language</span>
                  <input name="language" className="border rounded-xl px-3 py-2" defaultValue="EN" />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm">Set</span>
                  <select name="setId" className="border rounded-xl px-3 py-2" value={activeSetId||""} onChange={()=>{}} required>
                    <option value="" disabled>Select a set</option>
                    {sets.map((s)=> <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </label>
                <div className="md:col-span-2">
                  <Button type="submit" className="w-full">Add Word</Button>
                </div>
              </form>
            </Card>
          </section>
        )}

        {tab === "settings" && isAdmin && (
          <section className="grid md:grid-cols-2 gap-4 items-start">
            <Card>
              <h2 className="text-lg font-semibold mb-2 text-black">Users</h2>
              <div className="text-sm opacity-70 mb-2">Admin invite code (on signup): <code className="bg-blue-50 px-1 py-0.5 rounded">{ADMIN_INVITE_CODE}</code></div>
              <ol className="grid gap-2">
                {users.map((u)=> (
                  <li key={u.id} className="flex items-center justify-between border rounded-xl p-3">
                    <div>
                      <div className="font-semibold text-black">{u.name} {((u.role||u.isAdmin)? (u.role==='admin' || u.isAdmin) : false) && <span className="ml-1 text-xs text-blue-700">(Admin)</span>}</div>
                      <div className="text-xs opacity-70">{u.email}</div>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-4">
                <Button variant="soft" onClick={runSelfTests}>Run self-tests</Button>
              </div>
            </Card>
            <Card>
              <h2 className="text-lg font-semibold mb-2 text-black">Backup (fallback only)</h2>
              <div className="text-sm opacity-70">Managed by database when Supabase is configured; local export disabled in this build.</div>
            </Card>
          </section>
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-4 pb-8 text-center text-xs text-blue-700">
        {sb ? 'Connected to Supabase • Secure auth & data' : 'Demo mode • Data in this browser only'}
      </footer>
    </div>
  );

  function awardLocal(userId, coins){ setUsers((arr)=> arr.map((u)=> u.id===userId? { ...u, coins:(u.coins||0)+coins } : u)); }
}

function AuthScreen({ users, setUsers, onAuthed, supabaseClient }) {
  const [mode, setMode] = useState("login");
  const [err, setErr] = useState("");
  const useSupabase = !!supabaseClient;

  async function onLoginSB(e){
    e.preventDefault(); setErr("");
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email")).toLowerCase();
    const password = String(fd.get("password"));
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { setErr(error.message); return; }
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
    onAuthed(profile);
  }

  async function onRegisterSB(e){
    e.preventDefault(); setErr("");
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name")).trim();
    const email = String(fd.get("email")).toLowerCase();
    const password = String(fd.get("password"));
    const invite = String(fd.get("invite")||"");
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) { setErr(error.message); return; }
    const role = invite === ADMIN_INVITE_CODE ? 'admin' : 'student';
    await supabaseClient.from('profiles').upsert({ id: data.user.id, email, name, role, coins: 0, time_ms: 0, correct: 0 });
    const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', data.user.id).single();
    onAuthed(profile);
  }

  function onLoginLocal(e){
    e.preventDefault(); setErr("");
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email")).toLowerCase();
    const password = String(fd.get("password"));
    const u = users.find((x)=> x.email.toLowerCase()===email && x.password===password);
    if (!u) { setErr("Invalid email or password"); return; }
    onAuthed(u);
  }
