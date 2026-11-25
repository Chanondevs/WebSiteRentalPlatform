const templates = [
  {
    number: "01",
    category: "ร้านค้าออนไลน์",
    title: "ร้านค้าพร้อมขาย",
    description: "จัดการสินค้า โปรโมชัน และช่องทางติดต่อในหน้าเดียว",
    price: "฿490",
    tone: "shop",
    badge: "ขายสินค้า"
  },
  {
    number: "02",
    category: "เว็บไซต์บริษัท",
    title: "ภาพลักษณ์มืออาชีพ",
    description: "นำเสนอบริษัท บริการ ผลงาน และข้อมูลติดต่อ",
    price: "฿390",
    tone: "company",
    badge: "แนะนำธุรกิจ"
  },
  {
    number: "03",
    category: "ระบบ POS",
    title: "หน้าร้านจัดการง่าย",
    description: "เริ่มจากหน้าแนะนำร้าน พร้อมต่อยอดระบบจัดการหน้าร้าน",
    price: "฿790",
    tone: "pos",
    badge: "สำหรับร้านค้า"
  }
];

const steps = [
  ["เลือกต้นแบบ", "เลือกเว็บไซต์ให้ตรงกับประเภทธุรกิจ"],
  ["ปรับแต่งเว็บไซต์", "ใส่ข้อมูล สี รูปภาพ และรายละเอียดของคุณ"],
  ["เปิดใช้งาน", "เลือกแพ็กเกจรายเดือนหรือรายปี แล้วเผยแพร่เว็บไซต์"]
];

export default function HomePage() {
  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="#" aria-label="WebRental หน้าแรก"><span className="brand-mark">W</span> web<span>rent</span></a>
        <div className="nav-links"><a href="#templates">เทมเพลต</a><a href="#how-it-works">วิธีใช้งาน</a><a href="#plans">แพ็กเกจ</a></div>
        <a className="login-link" href="/login">เข้าสู่ระบบ <span aria-hidden="true">↗</span></a>
      </nav>

      <section className="hero shell">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> WEBSITE RENTAL PLATFORM</p>
          <h1>เว็บไซต์ธุรกิจ<br />พร้อมใช้ <em>ในแบบคุณ</em></h1>
          <p className="hero-intro">เลือกเว็บต้นแบบ ปรับแต่งให้เป็นแบรนด์ของคุณ แล้วเช่าใช้งานได้ในแพ็กเกจรายเดือนหรือรายปี ไม่ต้องเริ่มสร้างจากศูนย์</p>
          <div className="hero-actions"><a className="button button-dark" href="#templates">เลือกเว็บไซต์ต้นแบบ <span>↓</span></a><a className="text-link" href="#how-it-works">ดูวิธีใช้งาน <span>→</span></a></div>
          <div className="hero-note"><span className="check">✓</span> ปรับแต่งได้เอง &nbsp;·&nbsp; ไม่มีค่าเริ่มต้นสูง</div>
        </div>
        <div className="hero-art" aria-label="ตัวอย่างหน้าตาเว็บไซต์ที่ปรับแต่งได้">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="mini-window">
            <div className="window-bar"><span /><span /><span /><i>my-business.webrent.site</i></div>
            <div className="preview-content"><div className="preview-nav"><b>mori.</b><span>หน้าแรก　 สินค้า　 ติดต่อเรา</span><strong>ตะกร้า 0</strong></div><div className="preview-hero"><small>COLLECTION 2026</small><h3>สิ่งดี ๆ<br />สำหรับทุกวัน</h3><div className="preview-cta">เลือกชมสินค้า　→</div></div><div className="preview-products"><i /><i /><i /></div></div>
          </div>
          <div className="float-card"><span className="float-icon">✦</span><div><b>เว็บไซต์ของคุณ</b><small>พร้อมปรับแต่งได้ทุกเมื่อ</small></div></div>
          <div className="art-stamp">เริ่มต้น<br /><b>฿390</b><small> / เดือน</small></div>
        </div>
      </section>

      <section className="trust shell"><span>เหมาะกับธุรกิจที่อยากเริ่มออนไลน์</span><div><b>ร้านค้าออนไลน์</b><i /> <b>ธุรกิจบริการ</b><i /> <b>ร้านอาหารและ POS</b></div></section>

      <section className="templates-section" id="templates">
        <div className="shell">
          <div className="section-heading"><div><p className="eyebrow">TEMPLATE MARKETPLACE</p><h2>เริ่มต้นจากแบบที่ใช่</h2><p>เลือกโครงเว็บไซต์ที่เหมาะกับธุรกิจ แล้วเติมความเป็นคุณลงไป</p></div><a className="text-link" href="#plans">ดูแพ็กเกจทั้งหมด <span>→</span></a></div>
          <div className="template-grid">{templates.map((template) => (
            <article className="template-card" key={template.number}>
              <div className={`template-preview ${template.tone}`}><span className="template-badge">{template.badge}</span><div className="mock-site"><div className="mock-nav"><b>{template.tone === "shop" ? "Mellow" : template.tone === "company" ? "NORTH" : "daily."}</b><span>เกี่ยวกับ　 บริการ　 ติดต่อ</span><i /></div><div className="mock-main"><small>{template.category}</small><strong>{template.tone === "shop" ? "ช้อปสิ่งที่ใช่\nในทุกวัน" : template.tone === "company" ? "เติบโตไป\nด้วยกัน" : "จัดการร้าน\nได้ทุกวัน"}</strong><button>ดูเพิ่มเติม　→</button></div><div className="mock-shape" /></div></div>
              <div className="template-info"><div className="template-meta"><span>{template.category}</span><span>แก้ไขได้เอง</span></div><h3>{template.title}</h3><p>{template.description}</p><div className="template-bottom"><div><b>{template.price}</b><small> / เดือน</small></div><a href="#plans" aria-label={`ดูแพ็กเกจ ${template.title}`}>เลือกแบบนี้ <span>→</span></a></div></div>
            </article>
          ))}</div>
          <p className="catalog-note">แพ็กเกจและตัวอย่างเทมเพลตอยู่ระหว่างจัดทำ รายละเอียดราคาอาจเปลี่ยนแปลงก่อนเปิดให้บริการ</p>
        </div>
      </section>

      <section className="how-section shell" id="how-it-works">
        <div className="how-title"><p className="eyebrow">เริ่มต้นได้ง่าย ๆ</p><h2>จากไอเดีย<br />สู่เว็บไซต์จริง</h2></div>
        <div className="steps">{steps.map(([title, description], index) => <article className="step" key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>

      <section className="plans-band" id="plans"><div className="shell plans-inner"><div><p className="eyebrow">ยืดหยุ่นตามธุรกิจ</p><h2>เช่าใช้แบบรายเดือน<br />หรือประหยัดกว่าด้วยรายปี</h2></div><p>เลือกระยะเวลาใช้งาน 1 เดือนถึง 1 ปี<br />จัดการเว็บไซต์และแพ็กเกจได้จากบัญชีของคุณ</p><a className="button button-light" href="#templates">ดูเว็บไซต์ต้นแบบ <span>→</span></a></div></section>
      <footer className="shell footer"><a className="brand" href="#"><span className="brand-mark">W</span> web<span>rent</span></a><span>© 2026 WebRent · แพลตฟอร์มเช่าเว็บไซต์</span><a href="mailto:hello@webrent.example">ติดต่อเรา</a></footer>
    </main>
  );
}
