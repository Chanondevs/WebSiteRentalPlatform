"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  SiteContent, SiteImageTarget, SitePage, SiteProduct, SiteSection, SiteTextTarget, WebsiteCanvas
} from "./website-canvas";

type Website = { id: string; name: string; subdomain: string; status: string; content: SiteContent };
const starterSections: SiteSection[] = [
  { id: "hero", title: "ภาพปก", body: "", buttonText: "เลือกชม", imageUrl: "" },
  { id: "about", title: "เกี่ยวกับเรา", body: "เล่าเรื่องราวและจุดเด่นของธุรกิจคุณ", imageUrl: "" },
  { id: "products", title: "สินค้าและบริการ", body: "แสดงรายการของคุณ" },
  { id: "contact", title: "ติดต่อเรา", body: "โทร 02-000-0000 · LINE @yourshop" }
];
const makeId = () => Math.random().toString(36).slice(2, 10);
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

function normalizeSections(raw: unknown, fallback: SiteSection[] = []): SiteSection[] {
  if (!Array.isArray(raw)) return fallback.map((section) => ({ ...section }));
  return raw.filter((item) => item && typeof item === "object").map((item, index) => {
    const section = item as Partial<SiteSection>;
    const fallbackSection = starterSections.find((candidate) => candidate.id === section.id);
    return {
      id: text(section.id, "section-" + index),
      title: text(section.title, fallbackSection?.title ?? "ส่วนใหม่"),
      body: text(section.body),
      imageUrl: text(section.imageUrl),
      buttonText: text(section.buttonText)
    };
  });
}
function normalizeProducts(raw: unknown): SiteProduct[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => item && typeof item === "object").map((item, index) => {
    const product = item as Partial<SiteProduct>;
    return {
      id: text(product.id, "product-" + index),
      name: text(product.name, "รายการใหม่"),
      description: text(product.description),
      price: text(product.price),
      imageUrl: text(product.imageUrl)
    };
  });
}
function normalizeContent(raw: unknown): SiteContent {
  const input = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const theme = input.theme && typeof input.theme === "object" ? input.theme as Record<string, unknown> : {};
  const legacySections = normalizeSections(input.sections, starterSections);
  const legacyProducts = normalizeProducts(input.products);
  const rawPages = Array.isArray(input.pages) ? input.pages.filter((item) => item && typeof item === "object") as Record<string, unknown>[] : [];
  const pages: SitePage[] = rawPages.length ? rawPages.map((page, index) => ({
    id: text(page.id, "page-" + index),
    slug: text(page.slug, index === 0 ? "home" : "page-" + (index + 1)),
    title: text(page.title, index === 0 ? "หน้าหลัก" : "หน้าใหม่"),
    heroTitle: text(page.heroTitle, "ยินดีต้อนรับสู่เว็บไซต์ของเรา"),
    heroSubtitle: text(page.heroSubtitle, "แนะนำธุรกิจและสิ่งที่คุณให้บริการ"),
    sections: normalizeSections(page.sections),
    products: normalizeProducts(page.products)
  })) : [{
    id: "home", slug: "home", title: "หน้าหลัก",
    heroTitle: text(input.heroTitle, "ยินดีต้อนรับสู่เว็บไซต์ของเรา"),
    heroSubtitle: text(input.heroSubtitle, "แนะนำธุรกิจและสิ่งที่คุณให้บริการ"),
    sections: legacySections, products: legacyProducts
  }];
  return {
    ...input,
    theme: {
      primaryColor: text(theme.primaryColor, "#23372c"),
      backgroundColor: text(theme.backgroundColor, "#f7f7f1"),
      textColor: text(theme.textColor, "#253129"),
      fontFamily: text(theme.fontFamily, "Arial, sans-serif")
    },
    logoUrl: text(input.logoUrl),
    sections: legacySections,
    products: legacyProducts,
    pages
  };
}
function safeSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function WebsiteEditor() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [website, setWebsite] = useState<Website | null>(null);
  const [content, setContent] = useState<SiteContent>(normalizeContent({}));
  const [selectedPageId, setSelectedPageId] = useState("home");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("กำลังโหลดเว็บไซต์…");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("webrent_token");
    if (!token) { router.replace("/login"); return; }
    fetch("/api/websites/" + params.id, { headers: { Authorization: "Bearer " + token } })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        const normalized = normalizeContent(result.website.content);
        setWebsite(result.website);
        setName(result.website.name);
        setContent(normalized);
        setSelectedPageId(normalized.pages?.[0]?.id ?? "home");
        setMessage("");
      })
      .catch(() => setMessage("ไม่พบเว็บไซต์ หรือคุณไม่มีสิทธิ์เข้าถึง"));
  }, [params.id, router]);

  const pages = content.pages ?? [];
  const activePage = pages.find((page) => page.id === selectedPageId) ?? pages[0];

  function updatePage(pageId: string, changes: Partial<SitePage>) {
    setContent((current) => ({
      ...current,
      pages: (current.pages ?? []).map((page) => page.id === pageId ? { ...page, ...changes } : page)
    }));
  }
  function updatePageText(target: SiteTextTarget, value: string) {
    if (!activePage) return;
    if (target.kind === "page") updatePage(activePage.id, { [target.field]: value });
    if (target.kind === "section") updatePage(activePage.id, {
      sections: activePage.sections.map((section) => section.id === target.id ? { ...section, [target.field]: value } : section)
    });
    if (target.kind === "product") updatePage(activePage.id, {
      products: activePage.products.map((product) => product.id === target.id ? { ...product, [target.field]: value } : product)
    });
  }
  function updateSection(sectionId: string, key: keyof SiteSection, value: string) {
    if (!activePage) return;
    updatePage(activePage.id, { sections: activePage.sections.map((section) => section.id === sectionId ? { ...section, [key]: value } : section) });
  }
  function updateProduct(productId: string, key: keyof SiteProduct, value: string) {
    if (!activePage) return;
    updatePage(activePage.id, { products: activePage.products.map((product) => product.id === productId ? { ...product, [key]: value } : product) });
  }
  function moveSection(index: number, direction: -1 | 1) {
    if (!activePage) return;
    const sections = [...activePage.sections];
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    updatePage(activePage.id, { sections });
  }
  function addPage() {
    const currentPages = content.pages ?? [];
    let number = currentPages.length + 1;
    while (currentPages.some((page) => page.slug === "page-" + number)) number += 1;
    const page: SitePage = {
      id: makeId(), slug: "page-" + number, title: "หน้าใหม่",
      heroTitle: "ยินดีต้อนรับ", heroSubtitle: "เขียนแนะนำหน้านี้",
      sections: [], products: []
    };
    setContent((current) => ({ ...current, pages: [...(current.pages ?? []), page] }));
    setSelectedPageId(page.id);
    setMessage("เพิ่มหน้าแล้ว");
  }
  function removePage() {
    if (!activePage || pages.length < 2 || !window.confirm("ลบหน้า \"" + activePage.title + "\" ใช่หรือไม่?")) return;
    const remaining = pages.filter((page) => page.id !== activePage.id);
    setContent((current) => ({ ...current, pages: remaining }));
    setSelectedPageId(remaining[0].id);
    setMessage("ลบหน้าแล้ว");
  }
  function addSection() {
    if (!activePage) return;
    updatePage(activePage.id, { sections: [...activePage.sections, { id: "section-" + makeId(), title: "ส่วนใหม่", body: "" }] });
  }
  function addProduct() {
    if (!activePage) return;
    const sections = activePage.sections.some((section) => section.id === "products")
      ? activePage.sections
      : [...activePage.sections, { id: "products", title: "สินค้าและบริการ", body: "" }];
    updatePage(activePage.id, {
      sections,
      products: [...activePage.products, { id: makeId(), name: "สินค้าใหม่", description: "", price: "", imageUrl: "" }]
    });
  }
  function setImage(target: SiteImageTarget, url: string) {
    if (target.kind === "logo") {
      setContent((current) => ({ ...current, logoUrl: url }));
      return;
    }
    if (!activePage) return;
    if (target.kind === "section") {
      const exists = activePage.sections.some((section) => section.id === target.id);
      const sections = exists
        ? activePage.sections.map((section) => section.id === target.id ? { ...section, imageUrl: url } : section)
        : [...activePage.sections, { id: target.id, title: "ภาพปก", body: "", imageUrl: url }];
      updatePage(activePage.id, { sections });
    } else updatePage(activePage.id, {
      products: activePage.products.map((product) => product.id === target.id ? { ...product, imageUrl: url } : product)
    });
  }
  async function uploadImage(file: File, target: SiteImageTarget) {
    if (!file.type.startsWith("image/")) { setMessage("เลือกไฟล์รูปภาพเท่านั้น"); return; }
    if (file.size > 5 * 1024 * 1024) { setMessage("รูปต้องมีขนาดไม่เกิน 5 MB"); return; }
    const token = window.localStorage.getItem("webrent_token");
    if (!token) { router.replace("/login"); return; }
    setUploading(true);
    setMessage("กำลังอัปโหลดรูป…");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/media", { method: "POST", headers: { Authorization: "Bearer " + token }, body: form });
      if (!response.ok) throw new Error();
      const result = await response.json();
      setImage(target, result.url);
      setMessage("เพิ่มรูปแล้ว กดบันทึกเพื่อเก็บการเปลี่ยนแปลง");
    } catch { setMessage("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setUploading(false); }
  }
  function uploadField(label: string, target: SiteImageTarget) {
    return <label>{label}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) void uploadImage(file, target);
    }} /></label>;
  }

  async function save() {
    if (!website) return;
    const slugs = pages.map((page) => page.slug);
    if (slugs.some((slug) => !slug) || new Set(slugs).size !== slugs.length) {
      setMessage("URL ของแต่ละหน้าต้องไม่ว่างและห้ามซ้ำ");
      return;
    }
    setBusy(true); setMessage("กำลังบันทึก…");
    const token = window.localStorage.getItem("webrent_token");
    try {
      const response = await fetch("/api/websites/" + website.id, {
        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ name, content })
      });
      if (!response.ok) throw new Error();
      setMessage("บันทึกการเปลี่ยนแปลงแล้ว");
    } catch { setMessage("บันทึกไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  }
  async function publish() {
    if (!website) return;
    setBusy(true);
    const token = window.localStorage.getItem("webrent_token");
    try {
      const response = await fetch("/api/websites/" + website.id + "/publish", { method: "POST", headers: { Authorization: "Bearer " + token } });
      if (response.status === 409) { setMessage("ก่อนเผยแพร่ ต้องมีแพ็กเกจเช่าที่ชำระเงินแล้ว"); return; }
      if (!response.ok) throw new Error();
      setWebsite((current) => current ? { ...current, status: "ACTIVE" } : current);
      setMessage("เผยแพร่เว็บไซต์แล้ว");
    } catch { setMessage("เผยแพร่ไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  if (!website || !activePage) return <main className="editor-loading"><p>{message}</p><Link href="/dashboard">กลับ Dashboard</Link></main>;
  const previewPath = activePage.slug === "home" ? "/s/" + website.subdomain : "/s/" + website.subdomain + "/" + activePage.slug;

  return <main className="editor-page">
    <header className="editor-topbar">
      <Link href="/dashboard" className="brand"><span className="brand-mark">W</span> web<span>rent</span></Link>
      <div className="editor-top-actions">
        <span>{uploading ? "กำลังอัปโหลด…" : message}</span>
        <Link className="billing-nav-link" href={"/dashboard/sites/" + website.id + "/billing"}>แพ็กเกจ / ชำระเงิน</Link>
        <a className="editor-preview-link" href={website.status === "ACTIVE" ? previewPath : undefined} target="_blank" rel="noreferrer">{website.status === "ACTIVE" ? "เปิดเว็บไซต์ ↗" : "ฉบับร่าง"}</a>
        <button onClick={save} disabled={busy || uploading}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
        <button className="publish-button" onClick={publish} disabled={busy || uploading}>เผยแพร่</button>
      </div>
    </header>
    <div className="editor-workspace">
      <aside className="editor-panel">
        <p className="eyebrow">ปรับแต่งเว็บไซต์</p>
        <h1>ตัวแก้ไขเว็บไซต์</h1>
        <label>ชื่อเว็บไซต์<input value={name} onChange={(event) => setName(event.target.value)} /></label>

        <details open>
          <summary>หน้าเว็บไซต์ ({pages.length})</summary>
          <div className="page-manager">{pages.map((page) => <button type="button" key={page.id} className={page.id === activePage.id ? "page-chip active" : "page-chip"} onClick={() => setSelectedPageId(page.id)}>{page.title}</button>)}</div>
          <button type="button" className="add-section" onClick={addPage}>＋ เพิ่มหน้าใหม่</button>
          <label>ชื่อหน้านี้<input value={activePage.title} onChange={(event) => updatePage(activePage.id, { title: event.target.value })} /></label>
          <label>ที่อยู่หน้า<input value={activePage.slug} onChange={(event) => updatePage(activePage.id, { slug: safeSlug(event.target.value) })} placeholder="เช่น about-us" /></label>
          <small className="editor-help">หน้าแรกใช้ URL หลัก ส่วนหน้าอื่นใช้ชื่อที่อยู่นี้</small>
          {pages.length > 1 && <button type="button" className="delete-page" onClick={removePage}>ลบหน้านี้</button>}
        </details>

        <details open>
          <summary>สี ฟอนต์ และโลโก้</summary>
          <div className="color-controls">
            {([["สีหลัก", "primaryColor"], ["สีพื้นหลัง", "backgroundColor"], ["สีตัวอักษร", "textColor"]] as const).map(([label, key]) => <label key={key}>{label}<div className="color-field">
              <input type="color" value={content.theme?.[key] || "#23372c"} onChange={(event) => setContent((current) => ({ ...current, theme: { ...current.theme, [key]: event.target.value } }))} />
              <input value={content.theme?.[key] || ""} onChange={(event) => setContent((current) => ({ ...current, theme: { ...current.theme, [key]: event.target.value } }))} />
            </div></label>)}
            <label>แบบอักษร<select value={content.theme?.fontFamily || "Arial, sans-serif"} onChange={(event) => setContent((current) => ({ ...current, theme: { ...current.theme, fontFamily: event.target.value } }))}>
              <option value="Arial, sans-serif">Arial · เรียบง่าย</option>
              <option value="Tahoma, sans-serif">Tahoma · ภาษาไทย</option>
              <option value="Georgia, serif">Georgia · คลาสสิก</option>
              <option value="'Noto Sans Thai', sans-serif">Noto Sans Thai</option>
              <option value="'Sarabun', 'Noto Sans Thai', sans-serif">Sarabun</option>
              <option value="'Kanit', 'Noto Sans Thai', sans-serif">Kanit</option>
              <option value="'Prompt', 'Noto Sans Thai', sans-serif">Prompt</option>
            </select></label>
            <label>รูปโลโก้ (URL)<input value={content.logoUrl || ""} placeholder="https://..." onChange={(event) => setContent((current) => ({ ...current, logoUrl: event.target.value }))} /></label>
            {uploadField("หรือเลือกรูปโลโก้จากเครื่อง", { kind: "logo" })}
          </div>
        </details>

        <details open>
          <summary>ข้อความหน้าปก</summary>
          <label>หัวข้อหลัก<input value={activePage.heroTitle} onChange={(event) => updatePage(activePage.id, { heroTitle: event.target.value })} /></label>
          <label>คำอธิบาย<textarea rows={3} value={activePage.heroSubtitle} onChange={(event) => updatePage(activePage.id, { heroSubtitle: event.target.value })} /></label>
        </details>

        <details open>
          <summary>ส่วนต่าง ๆ ของหน้านี้ ({activePage.sections.length})</summary>
          <div className="editable-sections">{activePage.sections.map((section, index) => <article className="editable-section" key={section.id}>
            <div className="section-tools"><b>{section.title || "ส่วนใหม่"}</b><div>
              <button type="button" onClick={() => moveSection(index, -1)} disabled={index === 0} aria-label="เลื่อนขึ้น">↑</button>
              <button type="button" onClick={() => moveSection(index, 1)} disabled={index === activePage.sections.length - 1} aria-label="เลื่อนลง">↓</button>
              <button type="button" onClick={() => updatePage(activePage.id, { sections: activePage.sections.filter((_, i) => i !== index) })} disabled={section.id === "hero"} aria-label="ลบส่วน">×</button>
            </div></div>
            <label>ชื่อส่วน<input value={section.title} onChange={(event) => updateSection(section.id, "title", event.target.value)} /></label>
            <label>ข้อความ<textarea rows={3} value={section.body} onChange={(event) => updateSection(section.id, "body", event.target.value)} /></label>
            <label>รูปภาพ (URL)<input value={section.imageUrl || ""} placeholder="https://..." onChange={(event) => updateSection(section.id, "imageUrl", event.target.value)} /></label>
            {uploadField("หรือเลือกรูปจากเครื่อง", { kind: "section", id: section.id })}
            {section.id === "hero" && <label>ข้อความปุ่ม<input value={section.buttonText || ""} onChange={(event) => updateSection(section.id, "buttonText", event.target.value)} /></label>}
          </article>)}</div>
          <button type="button" className="add-section" onClick={addSection}>＋ เพิ่มส่วนเนื้อหา</button>
        </details>

        <details open>
          <summary>สินค้า / บริการ ({activePage.products.length})</summary>
          <div className="editable-sections">{activePage.products.map((product, index) => <article className="editable-section" key={product.id}>
            <div className="section-tools"><b>รายการ {index + 1}</b><button type="button" onClick={() => updatePage(activePage.id, { products: activePage.products.filter((item) => item.id !== product.id) })}>ลบ</button></div>
            {([["ชื่อรายการ", "name"], ["รายละเอียด", "description"], ["ราคา", "price"], ["รูปภาพ (URL)", "imageUrl"]] as const).map(([label, key]) => <label key={key}>{label}<input value={product[key] || ""} onChange={(event) => updateProduct(product.id, key, event.target.value)} /></label>)}
            {uploadField("หรือเลือกรูปสินค้าจากเครื่อง", { kind: "product", id: product.id })}
          </article>)}</div>
          <button type="button" className="add-section" onClick={addProduct}>＋ เพิ่มสินค้า / บริการ</button>
        </details>
      </aside>
      <section className="editor-preview">
        <div className="preview-toolbar"><span>คลิกข้อความเพื่อแก้ไข · ลากรูปมาวางในกรอบภาพ</span><span>{website.subdomain}.webrent.site · {activePage.title}</span></div>
        <WebsiteCanvas name={name} content={content} pageSlug={activePage.slug} subdomain={website.subdomain} editable onTextChange={updatePageText} onImageDrop={(file, target) => { void uploadImage(file, target); }} />
      </section>
    </div>
  </main>;
}
