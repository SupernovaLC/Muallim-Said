import React, { useEffect, useMemo, useState } from "react";

// =============================================
// Vocab Trainer — Class Edition (Single-file MVP)
// Roles: Admin / Student
// Features: Auth, Word Sets (Book/Unit), Review, Quiz, Coins, Leaderboard
// Storage: localStorage (demo only — not production-secure)
// Theme: blue • white • black
// =============================================

// -------- Helpers & Types --------
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

const BOX_INTERVALS_DAYS = [1, 2, 4, 7, 15]; // Leitner 1..5
const ADMIN_INVITE_CODE = "SUPERNOVA-ADMIN-2025"; // change this in prod

const LS = {
  CARDS: "vt_cards_v2", // shared word bank
  SETS: "vt_sets_v1",   // book/unit groupings
  USERS: "vt_users_v1", // registered users
  SESSION: "vt_session_v1", // current user id
};

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

function mulberry32(a) {
  let t = a >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickN(arr, n, rng = Math.random) { return shuffle(arr, rng).slice(0, n); }

// -------- Storage --------
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const val = JSON.parse(raw);
    return val ?? fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// seed one default set and a few cards for first run
const DEFAULT_SET_ID = uid();
const DEFAULT_SETS = [
  { id: DEFAULT_SET_ID, book: "Book A", unit: 1, title: "Book A • Unit 1", createdAt: Date.now() },
];
const DEFAULT_CARDS = [
  { id: uid(), term: "meticulous", definition: "very careful; precise", example: "She kept meticulous notes.", language: "EN", box: 1, nextReview: Date.now(), setId: DEFAULT_SET_ID },
  { id: uid(), term: "inevitable", definition: "certain to happen", example: "Rain felt inevitable.", language: "EN", box: 1, nextReview: Date.now(), setId: DEFAULT_SET_ID },
  { id: uid(), term: "coherent", definition: "logical and consistent", example: "A coherent essay.", language: "EN", box: 1, nextReview: Date.now(), setId: DEFAULT_SET_ID },
];

function ensureSeeded() {
  if (!localStorage.getItem(LS.SETS)) saveJSON(LS.SETS, DEFAULT_SETS);
  if (!localStorage.getItem(LS.CARDS)) saveJSON(LS.CARDS, DEFAULT_CARDS);
  if (!localStorage.getItem(LS.USERS)) {
    const admin = { id: uid(), name: "Admin", email: "admin@example.com", password: "admin", isAdmin: true, coins: 0, timeMs: 0, correct: 0, createdAt: Date.now() };
    saveJSON(LS.USERS, [admin]);
    saveJSON(LS.SESSION, admin.id);
  }
}
ensureSeeded();

function loadUsers() { return loadJSON(LS.USERS, []); }
function saveUsers(u) { saveJSON(LS.USERS, u); }
function loadCards() { return loadJSON(LS.CARDS, []); }
function saveCards(c) { saveJSON(LS.CARDS, c); }
function loadSets() { return loadJSON(LS.SETS, []); }
function saveSets(s) { saveJSON(LS.SETS, s); }
function currentUserId() { return loadJSON(LS.SESSION, null); }
function setSession(uidVal) { saveJSON(LS.SESSION, uidVal); }

// -------- UI Primitives --------
function Button({ children, onClick, variant = "primary", type = "button", className = "" }) {
  const styles = {
    primary: THEME.primary,
    ghost: THEME.primaryGhost,
    soft: THEME.soft,
    danger: THEME.danger,
    success: THEME.success,
  };
  return (
    <button type={type} onClick={onClick} className={`px-4 py-2 rounded-2xl text-sm font-medium border transition active:scale-[.98] ${styles[variant]} ${className}`}>{children}</button>
  );
}
function Card({ children, className = "" }) {
  return <div className={`rounded-2xl border shadow-sm p-4 bg-white ${className}`}>{children}</div>;
}
function Stat({ label, value }) {
  return (
    <div className="flex flex-col items-start p-4 rounded-2xl border shadow-sm bg-white">
      <div className="text-2xl font-bold text-black">{value}</div>
      <div className="text-sm opacity-70">{label}</div>
    </div>
  );
}
function Pill({ children }) {
  return <span className="px-2 py-0.5 rounded-full text-xs border bg-blue-50 border-blue-200 text-blue-800">{children}</span>;
}

// -------- App --------
export default function App() {
  const [users, setUsers] = useState(loadUsers());
  const [cards, setCards] = useState(loadCards());
  const [sets, setSets] = useState(loadSets());
  const [tab, setTab] = useState("review");
  const [query, setQuery] = useState("");
  const [reveal, setReveal] = useState(false);
  const [seed, setSeed] = useState(0);
  const [activeSetId, setActiveSetId] = useState(sets[0]?.id || null);

  const me = users.find((u) => u.id === currentUserId()) || null;

  // persist
  useEffect(() => saveUsers(users), [users]);
  useEffect(() => saveCards(cards), [cards]);
  useEffect(() => saveSets(sets), [sets]);

  // derived
  const now = Date.now();
  const visibleCards = cards.filter((c) => !activeSetId || c.setId === activeSetId);
  const dueToday = visibleCards.filter((c) => c.nextReview <= now).length;
  const mastered = visibleCards.filter((c) => c.box >= 5).length;

  // ------- Auth UI -------
  if (!me) {
    return <AuthScreen users={users} setUsers={setUsers} onAuthed={(u)=>{ setSession(u.id); setUsers((s)=>[...s]); }} />
  }

  // ------- Study time tracker (coins) -------
  useEffect(() => {
    let start = Date.now();
    const iv = setInterval(() => {
      setUsers((arr) => arr.map((u) => u.id === me.id ? { ...u, timeMs: (u.timeMs || 0) + 1000 } : u));
    }, 1000);
    return () => {
      clearInterval(iv);
      const dt = Date.now() - start;
      setUsers((arr) => arr.map((u) => u.id === me.id ? { ...u, timeMs: (u.timeMs || 0) + dt } : u));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, tab, activeSetId]);

  // ------- Review queue -------
  const reviewQueue = useMemo(() => {
    const due = visibleCards.filter((c) => c.nextReview <= now);
    const rng = mulberry32(seed);
    return due.sort(() => rng() - 0.5);
  }, [visibleCards, seed, now]);
  const current = reviewQueue[0];

  function gradeCard(card, isEasy) {
    const idx = cards.findIndex((c) => c.id === card.id);
    if (idx === -1) return;
    const old = cards[idx];
    const newBox = Math.max(1, Math.min(5, isEasy ? old.box + 1 : 1));
    const next = addDays(Date.now(), BOX_INTERVALS_DAYS[newBox - 1]);
    const updated = { ...old, box: newBox, nextReview: next };
    const newList = [...cards];
    newList[idx] = updated;
    setCards(newList);
    setReveal(false);
    if (isEasy) award(me.id, 10); // +10 coins per correct/easy
  }

  // ------- Quiz -------
  const quizItems = useMemo(() => {
    const pool = visibleCards;
    const rng = mulberry32(seed + 999);
    return pool.slice(0, Math.min(15, pool.length)).map((c) => {
      const wrongs = pickN(pool.filter((x) => x.id !== c.id), Math.min(3, Math.max(1, pool.length-1)), rng).map((w) => w.definition);
      const options = shuffle([c.definition, ...wrongs], rng);
      return { id: c.id, question: c.term, answer: c.definition, options };
    });
  }, [visibleCards, seed]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const quizDone = quizIndex >= quizItems.length && quizItems.length > 0;

  function answerQuiz(choice) {
    const item = quizItems[quizIndex];
    if (!item) return;
    if (choice === item.answer) {
      setQuizScore((s) => s + 1);
      award(me.id, 10); // +10 coins per correct
      setUsers((arr)=>arr.map(u=>u.id===me.id?{...u, correct:(u.correct||0)+1}:u));
    }
    setQuizIndex((i) => i + 1);
  }
  function resetQuiz() { setSeed(Math.floor(Math.random()*1e9)); setQuizIndex(0); setQuizScore(0); }

  function award(userId, coins) {
    setUsers((arr) => arr.map((u) => u.id === userId ? { ...u, coins: (u.coins || 0) + coins } : u));
  }

  // ------- Admin actions -------
  const isAdmin = !!me.isAdmin;
  function addSet(book, unit) {
    const title = `${book} • Unit ${unit}`;
    const newSet = { id: uid(), book, unit: Number(unit), title, createdAt: Date.now() };
    setSets((s) => [newSet, ...s]);
    setActiveSetId(newSet.id);
  }
  function addCard(form) {
    const fd = new FormData(form);
    const term = String(fd.get("term")).trim();
    const definition = String(fd.get("definition")).trim();
    const example = String(fd.get("example")||"");
    const language = String(fd.get("language") || "EN").slice(0,5).toUpperCase();
    const setId = String(fd.get("setId"));
    if (!term || !definition || !setId) return;
    const newCard = { id: uid(), term, definition, example, language, box: 1, nextReview: Date.now(), setId };
    setCards((s) => [newCard, ...s]);
    form.reset();
  }

  // ------- Leaderboard -------
  const leaderboard = [...users].sort((a,b)=> (b.coins||0) - (a.coins||0));

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
          <Button variant="ghost" onClick={()=>{ setSession(null); }}>Logout</Button>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-16">
        {/* Top stats & set selector */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Stat label="Due now" value={dueToday} />
          <Stat label="Words in set" value={visibleCards.length} />
          <Stat label="Mastered" value={mastered} />
          <Stat label="Coins" value={me.coins || 0} />
          <Stat label="Study time (min)" value={Math.floor((me.timeMs||0)/60000)} />
        </section>

        <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <SetPicker sets={sets} activeSetId={activeSetId} onChange={setActiveSetId} />
          <div className="text-sm opacity-70">Signed in as <b>{me.name}</b> {isAdmin && <span className="ml-1">(<span className="text-blue-700">Admin</span>)</span>}</div>
        </div>

        {tab === "review" && (
          <section className="grid gap-4">
            {!current ? (
              <Card className="text-center py-16">
                <div className="text-2xl font-semibold">🎉 Nothing due in this set</div>
                <p className="opacity-70 mt-2">Try Quiz mode or switch to another set.</p>
                <div className="mt-4 flex gap-2 justify-center">
                  <Button onClick={() => setTab("quiz")} variant="ghost">Go to Quiz</Button>
                  <Button onClick={() => setSeed((s) => s + 1)} variant="soft">Shuffle</Button>
                </div>
              </Card>
            ) : (
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Pill>Box {current.box}</Pill>
                  <Pill>{sets.find(s=>s.id===current.setId)?.title || "—"}</Pill>
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
                        <div className="text-xs opacity-70">Correct: {u.correct||0} • Study: {Math.floor((u.timeMs||0)/60000)}m</div>
                      </div>
                    </div>
                    <div className="font-bold text-blue-700">{u.coins||0}🪙</div>
                  </li>
                ))}
              </ol>
            </Card>
            <Card>
              <h2 className="text-lg font-semibold mb-3 text-black">📚 Sets</h2>
              <SetList sets={sets} cards={cards} activeSetId={activeSetId} onSelect={setActiveSetId} />
            </Card>
          </section>
        )}

        {tab === "manage" && isAdmin && (
          <section className="grid md:grid-cols-3 gap-4 items-start">
            <Card className="md:col-span-1">
              <h2 className="text-lg font-semibold mb-3 text-black">Create Set</h2>
              <form onSubmit={(e)=>{e.preventDefault(); const fd=new FormData(e.currentTarget); addSet(String(fd.get("book")||"Book A"), String(fd.get("unit")||"1")); e.currentTarget.reset();}} className="grid gap-2">
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
              <form onSubmit={(e)=>{e.preventDefault(); addCard(e.currentTarget);}} className="grid md:grid-cols-2 gap-2">
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
                  <select name="setId" className="border rounded-xl px-3 py-2" defaultValue={activeSetId||""} required>
                    <option value="" disabled>Select a set</option>
                    {sets.map((s)=> <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </label>
                <div className="md:col-span-2">
                  <Button type="submit" className="w-full">Add Word</Button>
                </div>
              </form>

              <div className="mt-6">
                <h3 className="font-semibold mb-2 text-black">Search & Manage</h3>
                <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search…" className="border rounded-xl px-3 py-2 w-full md:w-80" />
                <div className="grid gap-2 mt-3">
                  {cards.filter(c=>(!query||c.term.toLowerCase().includes(query.toLowerCase())||c.definition.toLowerCase().includes(query.toLowerCase())) && (!activeSetId || c.setId===activeSetId)).map((c)=> (
                    <div key={c.id} className="flex items-start justify-between gap-3 border rounded-xl p-3">
                      <div>
                        <div className="font-semibold text-black">{c.term}</div>
                        <div className="text-sm opacity-80">{c.definition}</div>
                        {c.example && <div className="text-sm mt-1 italic opacity-80">“{c.example}”</div>}
                        <div className="mt-1 flex gap-2">
                          <Pill>Box {c.box}</Pill>
                          <Pill>Next {new Date(c.nextReview).toLocaleDateString()}</Pill>
                          <Pill>{sets.find(s=>s.id===c.setId)?.title||"—"}</Pill>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button variant="ghost" onClick={()=> promote(c)}>Promote</Button>
                        <Button variant="ghost" onClick={()=> dueNow(c)}>Due now</Button>
                        <Button variant="danger" onClick={()=> removeCard(c.id)}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </section>
        )}

        {tab === "settings" && isAdmin && (
          <section className="grid md:grid-cols-2 gap-4 items-start">
            <Card>
              <h2 className="text-lg font-semibold mb-2 text-black">Users</h2>
              <div className="text-sm opacity-70 mb-2">Share the admin invite code with trusted staff only: <code className="bg-blue-50 px-1 py-0.5 rounded">{ADMIN_INVITE_CODE}</code></div>
              <ol className="grid gap-2">
                {users.map((u)=> (
                  <li key={u.id} className="flex items-center justify-between border rounded-xl p-3">
                    <div>
                      <div className="font-semibold text-black">{u.name} {u.isAdmin && <span className="ml-1 text-xs text-blue-700">(Admin)</span>}</div>
                      <div className="text-xs opacity-70">{u.email}</div>
                    </div>
                    <div className="flex gap-2">
                      {!u.isAdmin && <Button variant="ghost" onClick={()=> toggleAdmin(u.id, true)}>Make admin</Button>}
                      {u.isAdmin && u.id!==me.id && <Button variant="ghost" onClick={()=> toggleAdmin(u.id, false)}>Remove admin</Button>}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
            <Card>
              <h2 className="text-lg font-semibold mb-2 text-black">Backup</h2>
              <div className="flex flex-col gap-2">
                <Button onClick={()=> downloadJSON({ sets, cards })}>Export words & sets</Button>
                <label className="text-sm">Import JSON
                  <input type="file" accept="application/json" onChange={(e)=> importJSON(e, setCards, setSets)} className="block mt-1" />
                </label>
              </div>
            </Card>
          </section>
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-4 pb-8 text-center text-xs text-blue-700">
        Built for Supernova classes • Demo auth uses localStorage (replace with real backend for production)
      </footer>
    </div>
  );

  // --- small admin helpers ---
  function promote(c){
    const newBox = Math.min(5, c.box + 1);
    updateCard(c.id, { box: newBox, nextReview: addDays(Date.now(), BOX_INTERVALS_DAYS[newBox - 1]) });
  }
  function dueNow(c){ updateCard(c.id, { nextReview: Date.now() }); }
  function removeCard(id){ setCards((s)=> s.filter(x=> x.id!==id)); }
  function updateCard(id, patch){ setCards((s)=> s.map(c=> c.id===id? { ...c, ...patch } : c)); }
  function toggleAdmin(id, val){ setUsers((arr)=> arr.map(u=> u.id===id? { ...u, isAdmin: val } : u)); }
}

// -------- Components --------
function AuthScreen({ users, setUsers, onAuthed }) {
  const [mode, setMode] = useState("login"); // login | register
  const [err, setErr] = useState("");

  function onLogin(e){
    e.preventDefault(); setErr("");
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email")).toLowerCase();
    const password = String(fd.get("password"));
    const u = users.find((x)=> x.email.toLowerCase()===email && x.password===password);
    if (!u) { setErr("Invalid email or password"); return; }
    onAuthed(u);
  }

  function onRegister(e){
    e.preventDefault(); setErr("");
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name")).trim();
    const email = String(fd.get("email")).toLowerCase();
    const password = String(fd.get("password"));
    const invite = String(fd.get("invite")||"");
    if (!name || !email || !password) { setErr("Fill all required fields"); return; }
    if (users.some((x)=> x.email.toLowerCase()===email)) { setErr("Email already registered"); return; }
    const isAdmin = invite === ADMIN_INVITE_CODE;
    const nu = { id: uid(), name, email, password, isAdmin, coins: 0, timeMs: 0, correct: 0, createdAt: Date.now() };
    setUsers((arr)=> [nu, ...arr]);
    onAuthed(nu);
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-b from-white to-blue-50 text-gray-900">
      <Card className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-black text-white grid place-items-center font-bold">VT</div>
          <div>
            <h1 className="text-xl font-bold text-black">Vocab Trainer — Class Login</h1>
            <div className="text-xs text-blue-700">For Supernova students</div>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <Button variant={mode==='login'? 'primary':'ghost'} onClick={()=>setMode('login')}>Login</Button>
          <Button variant={mode==='register'? 'primary':'ghost'} onClick={()=>setMode('register')}>Register</Button>
        </div>

        {mode==='login' ? (
          <form onSubmit={onLogin} className="grid gap-2">
            <label className="grid gap-1">
              <span className="text-sm">Email</span>
              <input name="email" type="email" className="border rounded-xl px-3 py-2" required />
            </label>
            <label className="grid gap-1">
              <span className="text-sm">Password</span>
              <input name="password" type="password" className="border rounded-xl px-3 py-2" required />
            </label>
            {err && <div className="text-red-600 text-sm">{err}</div>}
            <Button type="submit" className="w-full">Login</Button>
          </form>
        ) : (
          <form onSubmit={onRegister} className="grid gap-2">
            <label className="grid gap-1">
              <span className="text-sm">Full name</span>
              <input name="name" className="border rounded-xl px-3 py-2" required />
            </label>
            <label className="grid gap-1">
              <span className="text-sm">Email</span>
              <input name="email" type="email" className="border rounded-xl px-3 py-2" required />
            </label>
            <label className="grid gap-1">
              <span className="text-sm">Password</span>
              <input name="password" type="password" className="border rounded-xl px-3 py-2" required />
            </label>
            <label className="grid gap-1">
              <span className="text-sm">Admin invite code (optional)</span>
              <input name="invite" className="border rounded-xl px-3 py-2" placeholder="Only for staff" />
            </label>
            {err && <div className="text-red-600 text-sm">{err}</div>}
            <Button type="submit" className="w-full">Create account</Button>
          </form>
        )}
      </Card>
    </div>
  );
}

function SetPicker({ sets, activeSetId, onChange }){
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm opacity-70">Current set</span>
      <select value={activeSetId||""} onChange={(e)=> onChange(e.target.value || null)} className="border rounded-xl px-3 py-2">
        {sets.map((s)=> <option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
    </div>
  );
}

function SetList({ sets, cards, activeSetId, onSelect }){
  return (
    <div className="grid gap-2">
      {sets.map((s)=>{
        const count = cards.filter(c=> c.setId===s.id).length;
        return (
          <div key={s.id} className={`flex items-center justify-between border rounded-xl p-3 ${activeSetId===s.id? 'bg-blue-50':''}`}>
            <div>
              <div className="font-semibold text-black">{s.title}</div>
              <div className="text-xs opacity-70">Added {new Date(s.createdAt).toLocaleDateString()} • {count} words</div>
            </div>
            <Button variant="ghost" onClick={()=> onSelect(s.id)}>Open</Button>
          </div>
        );
      })}
    </div>
  );
}

// -------- Import/Export helpers --------
function downloadJSON(obj){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vocab_export_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
function importJSON(e, setCards, setSets){
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (data.cards && data.sets) {
        setCards(Array.isArray(data.cards)? data.cards : []);
        setSets(Array.isArray(data.sets)? data.sets : []);
      }
    } catch {
      alert("Invalid JSON file");
    }
  };
  reader.readAsText(file);
}
