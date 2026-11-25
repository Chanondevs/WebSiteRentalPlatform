import type { DragEvent, FormEvent } from "react";

export type SiteSection = { id: string; title: string; body: string; imageUrl?: string; buttonText?: string };
export type SiteProduct = { id: string; name: string; description: string; price: string; imageUrl?: string };
export type SitePage = {
  id: string;
  slug: string;
  title: string;
  heroTitle: string;
  heroSubtitle: string;
  sections: SiteSection[];
  products: SiteProduct[];
};
export type SiteTextTarget =
  | { kind: "page"; field: "heroTitle" | "heroSubtitle" }
  | { kind: "section"; id: string; field: "title" | "body" }
  | { kind: "product"; id: string; field: "name" | "description" | "price" };
export type SiteImageTarget = { kind: "logo" } | { kind: "section"; id: string } | { kind: "product"; id: string };
export type SiteContent = {
  theme?: { primaryColor?: string; backgroundColor?: string; textColor?: string; fontFamily?: string };
  logoUrl?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  sections?: SiteSection[];
  products?: SiteProduct[];
  pages?: SitePage[];
};

function EditableText({
  as: Tag, value, editable, onChange, className
}: {
  as: "h1" | "h2" | "h3" | "p" | "small" | "b";
  value: string;
  editable?: boolean;
  onChange?: (value: string) => void;
  className?: string;
}) {
  return (
    <Tag
      className={className}
      contentEditable={editable ? "plaintext-only" : undefined}
      suppressContentEditableWarning={Boolean(editable)}
      data-site-editable={editable ? "true" : undefined}
      title={editable ? "คลิกเพื่อแก้ไขข้อความ" : undefined}
      onBlur={editable ? (event: FormEvent<HTMLElement>) => onChange?.(event.currentTarget.textContent ?? "") : undefined}
    >
      {value}
    </Tag>
  );
}

export function WebsiteCanvas({
  name, content, pageSlug, subdomain, editable = false, onTextChange, onImageDrop
}: {
  name: string;
  content: SiteContent;
  pageSlug?: string;
  subdomain?: string;
  editable?: boolean;
  onTextChange?: (target: SiteTextTarget, value: string) => void;
  onImageDrop?: (file: File, target: SiteImageTarget) => void;
}) {
  const theme = content.theme ?? {};
  const legacyPage: SitePage = {
    id: "home", slug: "home", title: "หน้าหลัก",
    heroTitle: content.heroTitle ?? "ยินดีต้อนรับสู่เว็บไซต์ของเรา",
    heroSubtitle: content.heroSubtitle ?? "เพิ่มข้อความแนะนำธุรกิจของคุณได้จากหน้าแก้ไข",
    sections: content.sections ?? [], products: content.products ?? []
  };
  const pages = content.pages?.length ? content.pages : [legacyPage];
  const page = (pageSlug ? pages.find((item) => item.slug === pageSlug) : undefined)
    ?? pages.find((item) => item.slug === "home")
    ?? pages[0]
    ?? legacyPage;
  const sections = page.sections ?? content.sections ?? [];
  const products = page.products ?? content.products ?? [];
  const heroSection = sections.find((section) => section.id === "hero");

  function dropProps(target: SiteImageTarget) {
    return {
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        if (!editable || !onImageDrop) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      },
      onDrop: (event: DragEvent<HTMLDivElement>) => {
        if (!editable || !onImageDrop) return;
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file?.type.startsWith("image/")) onImageDrop(file, target);
      }
    };
  }

  const publicHref = (item: SitePage, index: number) => {
    if (!subdomain) return "#";
    return index === 0 || item.slug === "home" ? "/s/" + subdomain : "/s/" + subdomain + "/" + item.slug;
  };

  return <article className="site-canvas" style={{
    ["--site-primary" as string]: theme.primaryColor ?? "#23372c",
    ["--site-background" as string]: theme.backgroundColor ?? "#f7f7f1",
    ["--site-text" as string]: theme.textColor ?? "#253129",
    fontFamily: theme.fontFamily ?? "Arial, sans-serif"
  }}>
    <header className="canvas-nav">
      <div className={"canvas-logo-drop" + (editable ? " is-editable" : "")} {...dropProps({ kind: "logo" })}>
        {content.logoUrl ? <img src={content.logoUrl} alt={name} /> : <b>{name}</b>}
        {editable && <span className="canvas-drop-hint">วางโลโก้</span>}
      </div>
      <nav aria-label="หน้าเว็บไซต์">
        {pages.map((item, index) => <a
          key={item.id}
          href={publicHref(item, index)}
          aria-current={item.id === page.id ? "page" : undefined}
          onClick={(event) => { if (editable || !subdomain) event.preventDefault(); }}
        >{item.title}</a>)}
      </nav>
      <a href="#contact" onClick={(event) => { if (editable) event.preventDefault(); }}>ติดต่อเรา</a>
    </header>
    <section className="canvas-hero">
      <div>
        <small>{name}</small>
        <EditableText as="h1" value={page.heroTitle || "ยินดีต้อนรับสู่เว็บไซต์ของเรา"} editable={editable} onChange={(value) => onTextChange?.({ kind: "page", field: "heroTitle" }, value)} />
        <EditableText as="p" value={page.heroSubtitle || "เพิ่มข้อความแนะนำธุรกิจของคุณได้จากหน้าแก้ไข"} editable={editable} onChange={(value) => onTextChange?.({ kind: "page", field: "heroSubtitle" }, value)} />
        <a href="#contact" onClick={(event) => { if (editable) event.preventDefault(); }}>{heroSection?.buttonText || "เรียนรู้เพิ่มเติม"}　→</a>
      </div>
      <div className="canvas-image-drop canvas-hero-image-drop" {...dropProps({ kind: "section", id: heroSection?.id ?? "hero" })}>
        {heroSection?.imageUrl ? <img src={heroSection.imageUrl} alt="" /> : editable && <span className="canvas-drop-hint">ลากรูปมาวาง</span>}
      </div>
    </section>
    {sections.filter((section) => section.id !== "hero" && section.id !== "products").map((section) => <section className="canvas-section" key={section.id} id={section.id === "contact" ? "contact" : undefined}>
      <div>
        <EditableText as="h2" value={section.title} editable={editable} onChange={(value) => onTextChange?.({ kind: "section", id: section.id, field: "title" }, value)} />
        <EditableText as="p" value={section.body} editable={editable} onChange={(value) => onTextChange?.({ kind: "section", id: section.id, field: "body" }, value)} />
      </div>
      {(section.imageUrl || editable) && <div className="canvas-image-drop canvas-section-image-drop" {...dropProps({ kind: "section", id: section.id })}>
        {section.imageUrl ? <img src={section.imageUrl} alt="" /> : <span className="canvas-drop-hint">ลากรูปมาวาง</span>}
      </div>}
    </section>)}
    {sections.some((section) => section.id === "products") && <section className="canvas-products">
      <EditableText as="h2" value={sections.find((section) => section.id === "products")?.title || "สินค้าและบริการ"} editable={editable} onChange={(value) => {
        const productSection = sections.find((section) => section.id === "products");
        if (productSection) onTextChange?.({ kind: "section", id: productSection.id, field: "title" }, value);
      }} />
      <div>{products.map((product) => <article key={product.id}>
        {(product.imageUrl || editable) && <div className="canvas-image-drop canvas-product-image-drop" {...dropProps({ kind: "product", id: product.id })}>
          {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span className="canvas-drop-hint">ลากรูปมาวาง</span>}
        </div>}
        <EditableText as="h3" value={product.name} editable={editable} onChange={(value) => onTextChange?.({ kind: "product", id: product.id, field: "name" }, value)} />
        <EditableText as="p" value={product.description} editable={editable} onChange={(value) => onTextChange?.({ kind: "product", id: product.id, field: "description" }, value)} />
        <EditableText as="b" value={product.price} editable={editable} onChange={(value) => onTextChange?.({ kind: "product", id: product.id, field: "price" }, value)} />
      </article>)}</div>
    </section>}
    <footer className="canvas-footer" id="contact">
      <EditableText as="p" value={sections.find((section) => section.id === "contact")?.body || "ติดต่อ " + name} editable={editable} onChange={(value) => {
        const contact = sections.find((section) => section.id === "contact");
        if (contact) onTextChange?.({ kind: "section", id: contact.id, field: "body" }, value);
      }} />
      <span>สร้างด้วย WebRent</span>
    </footer>
  </article>;
}
