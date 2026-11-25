"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const registering = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      ...(registering ? { displayName: String(form.get("displayName") ?? "") } : {})
    };
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error === "EMAIL_ALREADY_REGISTERED" ? "อีเมลนี้ถูกใช้แล้ว" : "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
        return;
      }
      window.localStorage.setItem("webrent_token", result.token);
      router.push("/dashboard");
    } catch {
      setError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page"><Link className="brand auth-brand" href="/"><span className="brand-mark">W</span> web<span>rent</span></Link>
    <section className="auth-card"><p className="eyebrow">{registering ? "เริ่มต้นใช้งาน" : "ยินดีต้อนรับกลับ"}</p>
      <h1>{registering ? "สร้างบัญชีของคุณ" : "เข้าสู่ระบบ"}</h1>
      <p className="auth-desc">{registering ? "สมัครสมาชิกเพื่อเริ่มเลือกและจัดการเว็บไซต์" : "เข้าสู่ระบบเพื่อจัดการเว็บไซต์ของคุณ"}</p>
      <form onSubmit={submit}>
        {registering && <label>ชื่อที่ใช้แสดง<input name="displayName" placeholder="ชื่อของคุณ" maxLength={120} /></label>}
        <label>อีเมล<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={255} /></label>
        <label>รหัสผ่าน<input name="password" type="password" autoComplete={registering ? "new-password" : "current-password"} placeholder={registering ? "อย่างน้อย 8 ตัวอักษร" : "รหัสผ่าน"} required minLength={8} maxLength={128} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="button button-dark auth-submit" disabled={busy}>{busy ? "กำลังดำเนินการ…" : registering ? "สมัครสมาชิก" : "เข้าสู่ระบบ"} <span>→</span></button>
      </form>
      <p className="auth-switch">{registering ? "มีบัญชีอยู่แล้ว?" : "ยังไม่มีบัญชี?"} <Link href={registering ? "/login" : "/register"}>{registering ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}</Link></p>
    </section><p className="auth-foot">แพลตฟอร์มเช่าเว็บไซต์สำหรับธุรกิจ</p>
  </main>;
}

type Template = { slug: string; name: string; category: string; monthlyPrice: number };
type Website = { id: string; name: string; subdomain: string; status: string };

export function Dashboard() {
  const [user, setUser] = useState<{ email: string; displayName?: string | null } | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [message, setMessage] = useState("กำลังโหลดบัญชี…");
  const [termMonths, setTermMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = window.localStorage.getItem("webrent_token");
    if (!token) { router.replace("/login"); return; }
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch("/api/auth/me", { headers }),
      fetch("/api/templates"),
      fetch("/api/websites", { headers })
    ]).then(async ([meResponse, templateResponse, websiteResponse]) => {
      if (meResponse.status === 401 || websiteResponse.status === 401) throw new Error("SESSION");
      const [me, templateData, websiteData] = await Promise.all([
        meResponse.json(), templateResponse.json(), websiteResponse.json()
      ]);
      setUser(me.user);
      setTemplates(templateData);
      setWebsites(websiteData);
      setMessage("");
    }).catch(() => {
      window.localStorage.removeItem("webrent_token");
      router.replace("/login");
    });
  }, [router]);

  async function createWebsite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const token = window.localStorage.getItem("webrent_token");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/websites", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          templateSlug: String(form.get("templateSlug")),
          name: String(form.get("name")),
          subdomain: String(form.get("subdomain"))
        })
      });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error === "SUBDOMAIN_TAKEN" ? "ชื่อเว็บไซต์นี้ถูกใช้แล้ว" : "สร้างเว็บไซต์ไม่สำเร็จ"); return; }
      setWebsites((current) => [result.website, ...current]);
      formElement.reset();
      setMessage("โคลนเว็บไซต์ต้นแบบเรียบร้อยแล้ว");
    } finally { setBusy(false); }
  }

  async function logout() {
    const token = window.localStorage.getItem("webrent_token");
    if (token) await fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    window.localStorage.removeItem("webrent_token");
    router.replace("/");
  }

  return <main className="dashboard-page">
    <nav className="nav shell"><Link className="brand" href="/"><span className="brand-mark">W</span> web<span>rent</span></Link><button className="logout-button" onClick={logout}>ออกจากระบบ</button></nav>
    <section className="shell dashboard-content"><p className="eyebrow">พื้นที่จัดการของคุณ</p><h1>สวัสดี{user?.displayName ? `, ${user.displayName}` : ""}</h1><p className="dashboard-email">{message || user?.email}</p>
      <div className="dashboard-columns">
        <form className="create-site-card" onSubmit={createWebsite}><p className="eyebrow">เริ่มต้นจากเทมเพลต</p><h2>สร้างเว็บไซต์ของคุณ</h2>
          <label>เว็บไซต์ต้นแบบ<select name="templateSlug" required>{templates.map((template) => <option key={template.slug} value={template.slug}>{template.name} · ฿{(template.monthlyPrice / 100).toLocaleString("th-TH")}/เดือน</option>)}</select></label>
          <label>ชื่อเว็บไซต์<input name="name" placeholder="เช่น ร้านกาแฟของฉัน" required minLength={2} maxLength={160} /></label>
          <label>ชื่อ URL<input name="subdomain" placeholder="my-business" required minLength={3} maxLength={80} pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?" /><small>ใช้ตัวอักษรอังกฤษพิมพ์เล็ก ตัวเลข และขีดกลาง</small></label>
          <button className="button button-dark auth-submit" disabled={busy}>{busy ? "กำลังสร้าง…" : "โคลนเว็บไซต์ต้นแบบ"} <span>→</span></button>
        </form>
        <section className="my-sites"><div className="sites-heading"><div><p className="eyebrow">WEBSITES</p><h2>เว็บไซต์ของฉัน</h2></div><label>ระยะเวลา<select value={termMonths} onChange={(event) => setTermMonths(Number(event.target.value))}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1} เดือน</option>)}</select></label></div>
          {websites.length === 0 ? <div className="sites-empty">เว็บไซต์ที่สร้างจะปรากฏในส่วนนี้</div> : <div className="site-list">{websites.map((website) => <article className="site-row" key={website.id}><div><b>{website.name}</b><small>{website.subdomain}.webrent.site · {website.status === "DRAFT" ? "ฉบับร่าง" : website.status}</small><Link href={`/dashboard/sites/${website.id}`}>ปรับแต่งเว็บไซต์ →</Link></div><button onClick={() => router.push(`/dashboard/sites/${website.id}/billing?termMonths=${termMonths}`)}>แพ็กเกจ / ชำระเงิน</button></article>)}</div>}
        </section>
      </div>
    </section>
  </main>;
}
