import { db, client, templates } from "./src/index";

try {
  await db.insert(templates).values([
    {
      slug: "shop-mellow",
      name: "ร้านค้าพร้อมขาย",
      description: "จัดการสินค้า โปรโมชัน และช่องทางติดต่อในหน้าเดียว",
      category: "STORE",
      monthlyPrice: 49000,
      yearlyPrice: 490000,
      defaultContent: { theme: "mellow", heroTitle: "ช้อปสิ่งที่ใช่ในทุกวัน", sections: ["hero", "products", "contact"] }
    },
    {
      slug: "company-north",
      name: "ภาพลักษณ์มืออาชีพ",
      description: "นำเสนอบริษัท บริการ ผลงาน และข้อมูลติดต่อ",
      category: "BUSINESS",
      monthlyPrice: 39000,
      yearlyPrice: 390000,
      defaultContent: { theme: "north", heroTitle: "เติบโตไปด้วยกัน", sections: ["hero", "about", "services", "contact"] }
    },
    {
      slug: "pos-daily",
      name: "หน้าร้านจัดการง่าย",
      description: "เริ่มจากหน้าแนะนำร้าน พร้อมต่อยอดระบบจัดการหน้าร้าน",
      category: "POS",
      monthlyPrice: 79000,
      yearlyPrice: 790000,
      defaultContent: { theme: "daily", heroTitle: "จัดการร้านได้ทุกวัน", sections: ["hero", "menu", "hours", "contact"] }
    }
  ]).onConflictDoNothing({ target: templates.slug });
  console.log("Seeded 3 starter templates.");
} finally {
  await client.end();
}
