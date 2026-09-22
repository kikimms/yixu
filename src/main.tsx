import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient, type User } from "@supabase/supabase-js";
import { ArrowRight, Bookmark, Check, ImagePlus, Layers, Loader2, LogOut, Plus, Shirt, Trash2 } from "lucide-react";
import "./styles.css";

type Item = { id: string; name: string; category: string; image_path: string; image_url?: string };
type Piece = { id: string; x: number; y: number; w: number };
type Outfit = { id: string; name: string; pieces: Piece[] };

const cats = ["上衣", "下装", "连衣裙", "外套", "鞋履", "包袋", "配饰"];
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const bucket = (import.meta.env.VITE_SUPABASE_BUCKET as string | undefined) || "wardrobe";
const ready = Boolean(url && anon && !url.includes("你的项目编号"));
const supabase = ready ? createClient(url!, anon!) : null;

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState<"closet" | "board" | "outfits">("closet");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) void refresh();
    else {
      setItems([]);
      setOutfits([]);
      setPieces([]);
    }
  }, [user]);

  const activeItems = useMemo(() => items, [items]);
  const picked = pieces.find((piece) => piece.id === selected);

  async function refresh() {
    if (!supabase) return;
    setError("");
    const [garments, saved] = await Promise.all([
      supabase.from("garments").select("id,name,category,image_path").order("created_at", { ascending: false }),
      supabase.from("outfits").select("id,name,pieces").order("created_at", { ascending: false }),
    ]);
    if (garments.error || saved.error) {
      setError(garments.error?.message || saved.error?.message || "读取失败");
      return;
    }
    const withUrls = await Promise.all(
      (garments.data ?? []).map(async (item) => {
        const signed = await supabase.storage.from(bucket).createSignedUrl(item.image_path, 60 * 60);
        return { ...item, image_url: signed.data?.signedUrl };
      }),
    );
    setItems(withUrls);
    setOutfits((saved.data ?? []).map((row) => ({ id: row.id, name: row.name, pieces: row.pieces as Piece[] })));
  }

  function flash(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2400);
  }

  function mark(next: Piece[]) {
    setPieces(next);
  }

  function add(item: Item) {
    if (pieces.some((piece) => piece.id === item.id)) {
      setSelected(item.id);
      setTab("board");
      return;
    }
    const next = [...pieces, { id: item.id, x: 8 + (pieces.length % 2) * 43, y: 8 + (Math.floor(pieces.length / 2) % 3) * 27, w: 38 }];
    mark(next);
    setSelected(item.id);
    setTab("board");
  }

  function movePiece(id: string, x: number, y: number) {
    mark(pieces.map((piece) => (piece.id === id ? { ...piece, x: clamp(x, 0, 100 - piece.w), y: clamp(y, 0, 100 - piece.w * 0.8) } : piece)));
  }

  async function uploadClothing(file: File, name: string, category: string) {
    if (!supabase || !user) return;
    const photo = await preparePhoto(file);
    const id = crypto.randomUUID();
    const path = `${user.id}/${id}.jpg`;
    const upload = await supabase.storage.from(bucket).upload(path, photo, { contentType: photo.type, upsert: false });
    if (upload.error) throw upload.error;
    const insert = await supabase.from("garments").insert({ id, owner: user.id, name, category, image_path: path });
    if (insert.error) {
      await supabase.storage.from(bucket).remove([path]);
      throw insert.error;
    }
    await refresh();
    flash("单品已放入衣橱");
  }

  async function saveOutfit(name: string) {
    if (!supabase || !user || pieces.length === 0) return;
    const result = await supabase.from("outfits").insert({ owner: user.id, name, pieces });
    if (result.error) throw result.error;
    await refresh();
    flash("穿搭已保存");
    setTab("outfits");
  }

  async function deleteItem(item: Item) {
    if (!supabase) return;
    if (outfits.some((outfit) => outfit.pieces.some((piece) => piece.id === item.id))) {
      setError("这件衣服已用于保存的穿搭，请先删除相关穿搭。");
      return;
    }
    const result = await supabase.from("garments").delete().eq("id", item.id);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    await supabase.storage.from(bucket).remove([item.image_path]);
    setPieces((current) => current.filter((piece) => piece.id !== item.id));
    await refresh();
  }

  async function deleteOutfit(outfit: Outfit) {
    if (!supabase) return;
    const result = await supabase.from("outfits").delete().eq("id", outfit.id);
    if (result.error) setError(result.error.message);
    await refresh();
  }

  if (!ready) return <SetupScreen />;
  if (!user) return <AuthScreen />;

  return (
    <main>
      {(message || error) && <div className={error ? "toast error" : "toast"}>{error || message}</div>}
      <header>
        <b>衣序 <small>YIXU ONLINE</small></b>
        <button className="ghost" onClick={() => supabase?.auth.signOut()}><LogOut size={16} />退出</button>
      </header>

      <section className="hero">
        <div>
          <p>YOUR EVERYDAY COLLECTION</p>
          <h1>线上私人衣橱</h1>
          <span>登录后上传衣服、组合穿搭，数据只属于当前账号。</span>
        </div>
        <UploadPanel busy={busy} setBusy={setBusy} onUpload={uploadClothing} />
      </section>

      <nav className="tabs">
        <button data-active={tab === "closet"} onClick={() => setTab("closet")}><Shirt size={18} />我的衣橱 <em>{items.length}</em></button>
        <button data-active={tab === "board"} onClick={() => setTab("board")}><Layers size={18} />搭配板</button>
        <button data-active={tab === "outfits"} onClick={() => setTab("outfits")}><Bookmark size={18} />我的穿搭 <em>{outfits.length}</em></button>
      </nav>

      {tab === "closet" && (
        <section className="closet">
          {items.length === 0 ? (
            <Empty title="先放入第一件衣服" text="手机拍照或从相册选择都可以，大图会自动压缩。" />
          ) : (
            <div className="grid">
              {items.map((item) => (
                <article className="item" key={item.id}>
                  <button className="photo" onClick={() => add(item)}><img src={item.image_url} alt={item.name} /><span><Plus size={16} /></span></button>
                  <div><b>{item.name}</b><small>{item.category}</small></div>
                  <button className="icon" onClick={() => void deleteItem(item)} aria-label={`删除${item.name}`}><Trash2 size={16} /></button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "board" && (
        <section className="editor">
          <aside>
            <h2>选择单品</h2>
            {items.map((item) => (
              <button className="mini" key={item.id} onClick={() => add(item)}>
                <img src={item.image_url} alt={item.name} />
                <span>{item.name}</span>
              </button>
            ))}
          </aside>
          <div>
            <div className="board-head">
              <h2>新的穿搭灵感</h2>
              <button className="secondary" onClick={() => setPieces([])}><Plus size={16} />新搭配</button>
            </div>
            <div className="board" ref={board} onPointerDown={(event) => { if (event.target === event.currentTarget) setSelected(""); }}>
              {pieces.length === 0 && <Empty title="从一件衣服开始" text="点左侧单品加入搭配板。" />}
              {pieces.map((piece) => {
                const item = activeItems.find((candidate) => candidate.id === piece.id);
                if (!item) return null;
                return (
                  <button
                    className={`piece ${selected === piece.id ? "selected" : ""}`}
                    key={piece.id}
                    style={{ left: `${piece.x}%`, top: `${piece.y}%`, width: `${piece.w}%` }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setSelected(piece.id);
                      drag.current = { id: piece.id, px: event.clientX, py: event.clientY, x: piece.x, y: piece.y };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      if (!drag.current || drag.current.id !== piece.id || !board.current) return;
                      const rect = board.current.getBoundingClientRect();
                      movePiece(piece.id, drag.current.x + ((event.clientX - drag.current.px) / rect.width) * 100, drag.current.y + ((event.clientY - drag.current.py) / rect.height) * 100);
                    }}
                    onPointerUp={() => { drag.current = null; }}
                  >
                    <img draggable={false} src={item.image_url} alt={item.name} />
                  </button>
                );
              })}
            </div>
            <div className="board-tools">
              {picked ? <input type="range" min="12" max="65" value={picked.w} onChange={(event) => mark(pieces.map((piece) => piece.id === selected ? { ...piece, w: Number(event.target.value) } : piece))} /> : <span>选中单品后可以拖动和缩放</span>}
              <SaveOutfit disabled={pieces.length === 0} onSave={saveOutfit} />
            </div>
          </div>
        </section>
      )}

      {tab === "outfits" && (
        <section className="outfits">
          {outfits.length === 0 ? <Empty title="还没有保存穿搭" text="在搭配板组合衣服后保存。" /> : (
            <div className="grid">
              {outfits.map((outfit) => (
                <article className="outfit" key={outfit.id}>
                  <button className="look" onClick={() => { setPieces(outfit.pieces); setTab("board"); }}>
                    {outfit.pieces.map((piece) => {
                      const item = items.find((candidate) => candidate.id === piece.id);
                      return item ? <img key={piece.id} src={item.image_url} alt={item.name} style={{ left: `${piece.x}%`, top: `${piece.y}%`, width: `${piece.w}%` }} /> : null;
                    })}
                  </button>
                  <div><b>{outfit.name}</b><small>{outfit.pieces.length} 件单品</small></div>
                  <button className="icon" onClick={() => void deleteOutfit(outfit)}><Trash2 size={16} /></button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(mode: "in" | "up") {
    if (!supabase) return;
    if (!email.trim() || !password) {
      setMsg("请先填写邮箱和密码。");
      return;
    }
    if (password.length < 6) {
      setMsg("密码至少需要 6 位。");
      return;
    }
    setBusy(true);
    setMsg("");
    const result = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (result.error) setMsg(authErrorText(result.error.message));
    else if (mode === "up") setMsg("账号已创建。如果 Supabase 开启了邮箱确认，请先去邮箱点确认链接。");
  }

  return (
    <main className="auth">
      <section>
        <p>YIXU ONLINE</p>
        <h1>登录你的线上衣橱</h1>
        <input placeholder="邮箱" value={email} onChange={(event) => setEmail(event.target.value)} />
        <input placeholder="密码" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <button onClick={() => void submit("in")} disabled={busy}>{busy ? <Loader2 className="spin" /> : <ArrowRight />}登录</button>
        <button className="secondary" onClick={() => void submit("up")} disabled={busy}>注册测试账号</button>
        {msg && <span>{msg}</span>}
      </section>
    </main>
  );
}

function UploadPanel({ busy, setBusy, onUpload }: { busy: boolean; setBusy: (value: boolean) => void; onUpload: (file: File, name: string, category: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState(cats[0]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !name.trim()) return;
    setBusy(true);
    try {
      await onUpload(file, name.trim(), category);
      setFile(null);
      setName("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="upload" onSubmit={submit}>
      <label>
        {preview ? <img src={preview} alt="待上传衣物预览" /> : <><ImagePlus size={26} /><span>拍照或从相册选择</span></>}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>
      <input placeholder="单品名称" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
      <select value={category} onChange={(event) => setCategory(event.target.value)}>{cats.map((cat) => <option key={cat}>{cat}</option>)}</select>
      <button disabled={busy || !file || !name.trim()}>{busy ? <Loader2 className="spin" /> : <Check size={17} />}放入衣橱</button>
    </form>
  );
}

function SaveOutfit({ disabled, onSave }: { disabled: boolean; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave(name.trim());
      setName("");
    } finally {
      setBusy(false);
    }
  }
  return <div className="save"><input placeholder="穿搭名称" value={name} onChange={(event) => setName(event.target.value)} /><button disabled={disabled || busy || !name.trim()} onClick={() => void submit()}>{busy ? "保存中" : "保存穿搭"}</button></div>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><Shirt size={34} /><h3>{title}</h3><p>{text}</p></div>;
}

function SetupScreen() {
  return (
    <main className="auth">
      <section>
        <p>YIXU ONLINE</p>
        <h1>等待 Supabase 配置</h1>
        <span>注册 Supabase 后，把项目 URL 和 anon key 填到 Vercel 环境变量里，线上版就能连接数据库和图片存储。</span>
      </section>
    </main>
  );
}

function authErrorText(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("anonymous sign-ins")) return "请填写邮箱和密码后再注册或登录。";
  if (lower.includes("invalid login credentials")) return "邮箱或密码不正确。";
  if (lower.includes("email not confirmed")) return "邮箱还没有确认，请先去邮箱点击 Supabase 的确认链接。";
  if (lower.includes("password")) return "密码不符合要求，请换一个更长、更难猜的密码。";
  if (lower.includes("email")) return "邮箱格式不正确，或这个邮箱暂时不能注册。";
  return message;
}

async function preparePhoto(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("请选择 JPG、PNG 或 WebP 图片。");
  if (file.size <= 1200 * 1024) return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("照片无法读取"));
      img.src = objectUrl;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器无法处理这张照片");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("照片压缩失败");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

createRoot(document.getElementById("root")!).render(<App />);
