"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SiteContent, WebsiteCanvas } from "./website-canvas";

export function PublicWebsite({ pageSlug }: { pageSlug?: string }) {
  const params = useParams<{ subdomain: string }>();
  const [site, setSite] = useState<{ name: string; subdomain: string; content: SiteContent } | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    fetch("/api/public/sites/" + params.subdomain)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        setSite(result.website);
      })
      .catch(() => setMissing(true));
  }, [params.subdomain]);

  if (missing) return <main className="public-missing"><b>ยังไม่พบเว็บไซต์นี้</b><p>เว็บไซต์อาจยังไม่เผยแพร่ หรือไม่มีชื่อนี้ในระบบ</p></main>;
  if (!site) return <main className="public-missing">กำลังโหลดเว็บไซต์…</main>;
  const pages = site.content.pages ?? [];
  if (pageSlug && pages.length && !pages.some((page) => page.slug === pageSlug)) {
    return <main className="public-missing"><b>ไม่พบหน้านี้</b><p>ตรวจสอบลิงก์ หรือกลับไปหน้าแรกของเว็บไซต์</p><a href={"/s/" + site.subdomain}>กลับหน้าแรก</a></main>;
  }
  return <main className="public-site"><WebsiteCanvas name={site.name} content={site.content} pageSlug={pageSlug} subdomain={site.subdomain} /></main>;
}
