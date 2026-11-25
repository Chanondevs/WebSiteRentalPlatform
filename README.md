# Website Rental Platform

โครงสร้างเริ่มต้นสำหรับแพลตฟอร์มเช่าเว็บไซต์ SaaS ใช้ Next.js, Bun, Elysia, PostgreSQL, Redis, Drizzle ORM และ Turborepo โดยยังไม่ใช้ Docker

## สิ่งที่เตรียมไว้

- `apps/web` — Next.js customer-facing app
- `apps/api` — Elysia API พร้อม health checks
- `apps/admin` — โครงตั้งต้นสำหรับ Admin Dashboard
- `packages/database` — Drizzle ORM, PostgreSQL connection และ schema เริ่มต้น
- `packages/shared` — TypeScript types ที่ใช้ร่วมกัน
- `services/worker` — Background worker starter

## สิ่งที่ต้องติดตั้งใน Windows

1. Bun รุ่นปัจจุบัน
2. Node.js รุ่น LTS (Next.js tooling อาจต้องใช้)
3. PostgreSQL และสร้าง database ชื่อ `website_rental`
4. Redis และเปิด service ที่ `localhost:6379`
5. VS Code

ตรวจสอบ:
```powershell
bun --version
node --version
psql --version
redis-cli ping
```

## เริ่มต้นใช้งาน

1. แตก ZIP และเปิดโฟลเดอร์ `website-rental-platform` ใน VS Code
2. คัดลอก `.env.example` เป็น `.env` แล้วแก้ `DATABASE_URL` ให้ตรงกับรหัสผ่าน PostgreSQL ของเครื่อง
3. ติดตั้ง dependencies:
```powershell
bun install
```
4. สร้างตารางเริ่มต้น:
```powershell
bun run db:generate
bun run db:migrate
```
5. เปิดทุกแอป:
```powershell
bun run dev
```

หรือเปิดแยก Terminal:
```powershell
bun run dev:web
bun run dev:api
bun run dev:worker
```

## Local URLs

- Web: http://localhost:3000
- API: http://localhost:3001/health
- API database check: http://localhost:3001/health/database

## หมายเหตุ

- API health check ทั่วไปไม่ต้องพึ่งฐานข้อมูล ส่วน `/health/database` ใช้ตรวจการเชื่อมต่อ PostgreSQL จริง
- Redis URL ถูกเตรียมไว้ แต่ยังไม่ได้เปิดใช้งาน Redis client ใน business logic จนกว่าจะเริ่มทำ cache/queue
- Schema ปัจจุบันเป็นเพียงฐานเริ่มต้น ยังไม่ใช่ schema ทั้งระบบ
- อย่าใช้รหัสผ่านตัวอย่างใน production
