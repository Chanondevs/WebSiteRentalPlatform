"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { useParams, useRouter } from "next/navigation";

type Website = { id: string; name: string; subdomain: string; templateId: string };
type PaymentClient = { provider: string; mode: "test"; publicKey?: string; supportsAutoRenew: boolean };
type OmiseAlternativePaymentMethod = "promptpay" | "truemoney_wallet";
type PaymentDetails = {
  submitted: boolean;
  authorizationUrl: string | null;
  qrImageUrl: string | null;
  paymentMethod: OmiseAlternativePaymentMethod | null;
};
declare global {
  interface Window {
    Omise?: {
      setPublicKey(key: string): void;
      createToken(
        type: "card",
        card: { name: string; number: string; expiration_month: number; expiration_year: number; security_code: string },
        callback: (statusCode: number, response: { id?: string; message?: string }) => void
      ): void;
    };
  }
}
type Template = { id: string; name: string; monthlyPrice: number; yearlyPrice: number };
type Rental = {
  id: string;
  status: "PENDING" | "ACTIVE" | "EXPIRED" | "CANCELLED";
  termMonths: number;
  amount: number;
  currency: string | null;
  autoRenew: boolean;
  startsAt: string | null;
  endsAt: string | null;
  nextBillingAt: string | null;
  createdAt: string;
  paymentId: string | null;
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | null;
};

const statusLabel: Record<Rental["status"], string> = {
  PENDING: "รอชำระเงิน",
  ACTIVE: "กำลังใช้งาน",
  EXPIRED: "หมดอายุ",
  CANCELLED: "ยกเลิกแล้ว"
};
const formatMoney = (amount: number) => "฿" + (amount / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString("th-TH") : "—";

export function BillingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [website, setWebsite] = useState<Website | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [history, setHistory] = useState<Rental[]>([]);
  const [termMonths, setTermMonths] = useState(1);
  const [autoRenew, setAutoRenew] = useState(false);
  const [checkoutAvailable, setCheckoutAvailable] = useState(false);
  const [paymentClient, setPaymentClient] = useState<PaymentClient | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"card" | OmiseAlternativePaymentMethod>("card");
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardMonth, setCardMonth] = useState("");
  const [cardYear, setCardYear] = useState("");
  const [cardSecurityCode, setCardSecurityCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const token = window.localStorage.getItem("webrent_token");
    if (!token) { router.replace("/login"); return; }
    const headers = { Authorization: "Bearer " + token };
    try {
      const [websiteResponse, templateResponse, historyResponse] = await Promise.all([
        fetch("/api/websites/" + params.id, { headers }),
        fetch("/api/templates"),
        fetch("/api/websites/" + params.id + "/subscriptions", { headers })
      ]);
      if (websiteResponse.status === 401 || historyResponse.status === 401) {
        window.localStorage.removeItem("webrent_token");
        router.replace("/login");
        return;
      }
      if (!websiteResponse.ok || !templateResponse.ok || !historyResponse.ok) throw new Error();
      const [websiteData, templateData, historyData] = await Promise.all([
        websiteResponse.json(), templateResponse.json(), historyResponse.json()
      ]);
      setWebsite(websiteData.website);
      setTemplate(templateData.find((item: Template) => item.id === websiteData.website.templateId) ?? null);
      setHistory(historyData.subscriptions ?? []);
      setCheckoutAvailable(Boolean(historyData.checkoutAvailable));
      setPaymentClient(historyData.paymentClient ?? null);
      if (historyData.paymentClient && !historyData.paymentClient.supportsAutoRenew) setAutoRenew(false);
    } catch {
      setMessage("โหลดข้อมูลแพ็กเกจไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const requestedTerm = Number(search.get("termMonths"));
    if (Number.isInteger(requestedTerm) && requestedTerm >= 1 && requestedTerm <= 12) setTermMonths(requestedTerm);
    void (async () => {
      await load();
      const paymentId = search.get("paymentId");
      const token = window.localStorage.getItem("webrent_token");
      if (!paymentId || !token) return;
      try {
        const response = await fetch("/api/payments/" + encodeURIComponent(paymentId) + "/status", {
          headers: { Authorization: "Bearer " + token }
        });
        const result = await response.json();
        if (!response.ok) throw new Error();
        setMessage(result.status === "PAID"
          ? "ชำระเงินสำเร็จในโหมดทดสอบ"
          : result.status === "FAILED"
            ? "การชำระเงินไม่สำเร็จ กรุณาสร้างรายการใหม่"
            : "กำลังรอผลยืนยันจาก Omise");
        await load();
      } catch {
        setMessage("ยังตรวจสอบสถานะการชำระเงินไม่ได้ กรุณากดรีเฟรชสถานะ");
      }
    })();
  }, [params.id]);

  const amount = template
    ? termMonths === 12 ? template.yearlyPrice : template.monthlyPrice * termMonths
    : 0;
  const pendingRental = history.find((item) => item.status === "PENDING" && item.paymentStatus !== "FAILED");

  useEffect(() => {
    const paymentId = pendingRental?.paymentId;
    const token = window.localStorage.getItem("webrent_token");
    if (!paymentId || paymentClient?.provider !== "omise" || !token) {
      setPaymentDetails(null);
      return;
    }

    let active = true;
    void fetch("/api/payments/" + encodeURIComponent(paymentId) + "/status", {
      headers: { Authorization: "Bearer " + token }
    }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json();
      if (!active) return;
      const method = result.paymentMethod === "promptpay" || result.paymentMethod === "truemoney_wallet"
        ? result.paymentMethod as OmiseAlternativePaymentMethod
        : null;
      setPaymentDetails({
        submitted: Boolean(result.submitted),
        authorizationUrl: typeof result.authorizationUrl === "string" ? result.authorizationUrl : null,
        qrImageUrl: typeof result.qrImageUrl === "string" ? result.qrImageUrl : null,
        paymentMethod: method
      });
      if (method) setSelectedPaymentMethod(method);
    }).catch(() => undefined);

    return () => { active = false; };
  }, [pendingRental?.paymentId, paymentClient?.provider]);

  async function createRental() {
    if (!website || !template || busy || pendingRental) return;
    setBusy(true);
    setMessage("");
    const token = window.localStorage.getItem("webrent_token");
    try {
      const response = await fetch("/api/websites/" + website.id + "/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ termMonths, autoRenew })
      });
      const result = await response.json();
      if (!response.ok) throw new Error();
      await load();
      if (result.checkoutAvailable && result.payment?.id && result.paymentClient?.provider !== "omise") {
        const checkoutResponse = await fetch("/api/payments/" + result.payment.id + "/checkout", {
          method: "POST",
          headers: { Authorization: "Bearer " + token }
        });
        const checkout = await checkoutResponse.json();
        if (checkoutResponse.ok && checkout.checkoutUrl) {
          window.location.assign(checkout.checkoutUrl);
          return;
        }
      }
      setMessage(result.checkoutAvailable && result.paymentClient?.provider === "omise"
        ? "สร้างรายการแล้ว กรุณากรอกบัตรทดสอบเพื่อดำเนินการต่อ"
        : "สร้างรายการแพ็กเกจแล้ว แต่ยังไม่มีผู้ให้บริการชำระเงิน จึงไม่มีการเรียกเก็บเงินจริง");
    } catch {
      setMessage("สร้างรายการแพ็กเกจไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  async function refreshOmiseStatus(paymentId: string) {
    const token = window.localStorage.getItem("webrent_token");
    if (!token) { router.replace("/login"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/payments/" + paymentId + "/status", {
        headers: { Authorization: "Bearer " + token }
      });
      const result = await response.json();
      if (!response.ok) throw new Error();
      const method = result.paymentMethod === "promptpay" || result.paymentMethod === "truemoney_wallet"
        ? result.paymentMethod as OmiseAlternativePaymentMethod
        : null;
      setPaymentDetails({
        submitted: Boolean(result.submitted),
        authorizationUrl: typeof result.authorizationUrl === "string" ? result.authorizationUrl : null,
        qrImageUrl: typeof result.qrImageUrl === "string" ? result.qrImageUrl : null,
        paymentMethod: method
      });
      setMessage(result.status === "PAID"
        ? "ชำระเงินสำเร็จในโหมดทดสอบ"
        : result.status === "FAILED"
          ? "การชำระเงินไม่สำเร็จ กรุณาสร้างรายการใหม่"
          : "ยังรอ Omise ยืนยันการชำระเงิน");
      await load();
    } catch {
      setMessage("ยังตรวจสอบสถานะการชำระเงินไม่ได้ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  async function chargeWithOmise(paymentId: string) {
    if (!checkoutAvailable || paymentClient?.provider !== "omise" || !paymentClient.publicKey || busy) return;
    if (!window.Omise) { setMessage("ยังโหลดระบบรับบัตรของ Omise ไม่สำเร็จ"); return; }
    const sessionToken = window.localStorage.getItem("webrent_token");
    if (!sessionToken) { router.replace("/login"); return; }

    setBusy(true);
    setMessage("");
    try {
      window.Omise.setPublicKey(paymentClient.publicKey);
      const cardToken = await new Promise<string>((resolve, reject) => {
        window.Omise!.createToken("card", {
          name: cardName.trim(),
          number: cardNumber.replaceAll(" ", "").replaceAll("-", ""),
          expiration_month: Number(cardMonth),
          expiration_year: Number(cardYear),
          security_code: cardSecurityCode
        }, (statusCode, response) => {
          if (statusCode === 200 && response.id) resolve(response.id);
          else reject(new Error(response.message || "ตรวจสอบข้อมูลบัตรอีกครั้ง"));
        });
      });
      setCardNumber("");
      setCardSecurityCode("");

      const response = await fetch("/api/payments/" + paymentId + "/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + sessionToken },
        body: JSON.stringify({ token: cardToken })
      });
      const result = await response.json();
      if (!response.ok) throw new Error("เริ่มรายการทดสอบไม่สำเร็จ กรุณาลองใหม่");

      if (result.authorizationUrl) {
        const authorizationUrl = new URL(result.authorizationUrl);
        if (authorizationUrl.protocol !== "https:" || !(authorizationUrl.hostname === "omise.co" || authorizationUrl.hostname.endsWith(".omise.co"))) {
          throw new Error("ลิงก์ยืนยันรายการจาก Omise ไม่ถูกต้อง");
        }
        window.location.assign(authorizationUrl.toString());
        return;
      }

      const statusResponse = await fetch("/api/payments/" + paymentId + "/status", {
        headers: { Authorization: "Bearer " + sessionToken }
      });
      const paymentStatus = statusResponse.ok ? await statusResponse.json() : result;
      setMessage(paymentStatus.status === "PAID"
        ? "ทดสอบชำระเงินสำเร็จ ไม่มีการตัดเงินจริง"
        : paymentStatus.status === "FAILED"
          ? "การชำระเงินทดสอบไม่สำเร็จ"
          : "ส่งรายการทดสอบแล้ว กำลังรอผลยืนยัน");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เริ่มรายการทดสอบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function payWithOmiseAlternative(paymentId: string, method: OmiseAlternativePaymentMethod) {
    if (!checkoutAvailable || paymentClient?.provider !== "omise" || busy) return;
    const token = window.localStorage.getItem("webrent_token");
    if (!token) { router.replace("/login"); return; }

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/payments/" + paymentId + "/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ paymentMethod: method })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(response.status === 502
          ? "เริ่มรายการไม่สำเร็จ ช่องทางนี้อาจยังไม่ได้เปิดใช้ในบัญชี Omise"
          : "เริ่มรายการชำระเงินไม่สำเร็จ กรุณาลองใหม่");
      }

      if (result.authorizationUrl) {
        const authorizationUrl = new URL(result.authorizationUrl);
        if (authorizationUrl.protocol !== "https:" || !(authorizationUrl.hostname === "omise.co" || authorizationUrl.hostname.endsWith(".omise.co"))) {
          throw new Error("ลิงก์ยืนยันรายการจาก Omise ไม่ถูกต้อง");
        }
        setPaymentDetails({
          submitted: true,
          authorizationUrl: authorizationUrl.toString(),
          qrImageUrl: null,
          paymentMethod: method
        });
        window.location.assign(authorizationUrl.toString());
        return;
      }

      const statusResponse = await fetch("/api/payments/" + paymentId + "/status", {
        headers: { Authorization: "Bearer " + token }
      });
      const details = statusResponse.ok ? await statusResponse.json() : result;
      setPaymentDetails({
        submitted: true,
        authorizationUrl: typeof details.authorizationUrl === "string" ? details.authorizationUrl : null,
        qrImageUrl: typeof details.qrImageUrl === "string" ? details.qrImageUrl : null,
        paymentMethod: method
      });
      setMessage(method === "promptpay"
        ? "สแกน QR ด้วยแอปธนาคาร แล้วรอระบบยืนยันการชำระเงิน"
        : "กำลังเปิดหน้าชำระ TrueMoney");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เริ่มรายการชำระเงินไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function openCheckout(paymentId: string) {
    if (!checkoutAvailable || busy) return;
    setBusy(true);
    setMessage("");
    const token = window.localStorage.getItem("webrent_token");
    try {
      const response = await fetch("/api/payments/" + paymentId + "/checkout", {
        method: "POST",
        headers: { Authorization: "Bearer " + token }
      });
      const result = await response.json();
      if (!response.ok) throw new Error();
      window.location.assign(result.checkoutUrl);
    } catch {
      setMessage("ยังเปิดหน้าชำระเงินไม่ได้");
      setBusy(false);
    }
  }

  if (loading) return <main className="billing-loading">กำลังโหลดแพ็กเกจ…</main>;
  if (!website) return <main className="billing-loading"><p>{message || "ไม่พบเว็บไซต์"}</p><Link href="/dashboard">กลับ Dashboard</Link></main>;

  return <main className="billing-page">
    <header className="billing-topbar">
      <Link href="/dashboard" className="brand"><span className="brand-mark">W</span> web<span>rent</span></Link>
      <Link className="billing-back" href={"/dashboard/sites/" + website.id}>กลับไปแก้เว็บไซต์</Link>
    </header>
    <div className="billing-shell">
      <p className="eyebrow">แพ็กเกจเว็บไซต์</p>
      <h1>จัดการแพ็กเกจและการชำระเงิน</h1>
      <p className="billing-intro"><b>{website.name}</b> · {website.subdomain}.webrent.site</p>
      {paymentClient?.provider === "omise" && <Script src="https://cdn.omise.co/omise.js" strategy="afterInteractive" />}

      <div className="billing-layout">
        <section className="billing-card billing-plan-card">
          <p className="eyebrow">เลือกระยะเวลา</p>
          <h2>แพ็กเกจเช่าเว็บไซต์</h2>
          <label>ระยะเวลาเช่า
            <select value={termMonths} onChange={(event) => setTermMonths(Number(event.target.value))}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((months) =>
                <option key={months} value={months}>{months} เดือน{months === 12 ? " · ราคาพิเศษรายปี" : ""}</option>
              )}
            </select>
          </label>
          <label className="billing-renew-option">
            <input type="checkbox" checked={autoRenew} disabled={paymentClient?.supportsAutoRenew === false} onChange={(event) => setAutoRenew(event.target.checked)} />
            <span><b>ต่ออายุอัตโนมัติเมื่อผู้ให้บริการรองรับ</b><small>{paymentClient?.supportsAutoRenew === false ? "ยังไม่รองรับการต่ออายุอัตโนมัติใน Omise test mode" : "ตอนนี้ยังไม่มีการตัดเงินอัตโนมัติ"}</small></span>
          </label>
          <div className="billing-total"><span>ยอดตามระยะเวลาที่เลือก</span><b>{formatMoney(amount)}</b></div>
          <button className="billing-primary" onClick={createRental} disabled={busy || !template || Boolean(pendingRental)}>
            {busy ? "กำลังดำเนินการ…" : pendingRental ? "มีรายการรอชำระอยู่แล้ว" : "สร้างรายการแพ็กเกจ"}
          </button>
          <p className="billing-no-charge">การสร้างรายการนี้ยังไม่เรียกเก็บเงิน และยังไม่เปิดใช้งานเว็บไซต์</p>
          {message && <p className="billing-message" role="status">{message}</p>}
        </section>

        <section className="billing-card billing-status-card">
          <div className="billing-card-heading"><div><p className="eyebrow">การชำระเงิน</p><h2>{paymentClient?.provider === "omise" ? "Omise · โหมดทดสอบ" : checkoutAvailable ? "พร้อมเชื่อมต่อผู้ให้บริการ" : "ยังไม่ได้เชื่อมต่อระบบชำระเงินจริง"}</h2></div><span className={checkoutAvailable ? "billing-indicator ready" : "billing-indicator"} /></div>
          <p className="billing-provider-note">{paymentClient?.provider === "omise"
            ? "เลือกชำระด้วยบัตร PromptPay QR หรือ TrueMoney Wallet ในโหมดทดสอบ"
            : checkoutAvailable
              ? "สร้างรายการแล้วจึงไปยังหน้าชำระเงินของผู้ให้บริการ"
              : "ระบบจะเก็บรายการเป็นสถานะรอชำระ ปุ่มชำระเงินจริงจะเปิดหลังเชื่อมผู้ให้บริการ"}</p>
          {pendingRental && <div className="billing-pending-box">
            <div><span>รายการล่าสุด</span><b>{formatMoney(pendingRental.amount)}</b></div>
            <div><span>ระยะเวลา</span><b>{pendingRental.termMonths} เดือน</b></div>
            <div><span>สถานะ</span><b className="billing-pending-label">รอชำระเงิน</b></div>
            {paymentClient?.provider === "omise" && paymentClient.publicKey && <div className="omise-payment-form">
              <p className="omise-card-title">เลือกช่องทางชำระเงิน · Test mode</p>
              {!paymentDetails?.submitted && <div className="omise-method-switch" role="group" aria-label="ช่องทางชำระเงิน">
                <button type="button" className={selectedPaymentMethod === "card" ? "selected" : ""} onClick={() => setSelectedPaymentMethod("card")}>บัตร</button>
                <button type="button" className={selectedPaymentMethod === "promptpay" ? "selected" : ""} onClick={() => setSelectedPaymentMethod("promptpay")}>PromptPay</button>
                <button type="button" className={selectedPaymentMethod === "truemoney_wallet" ? "selected" : ""} onClick={() => setSelectedPaymentMethod("truemoney_wallet")}>TrueMoney Wallet</button>
              </div>}
              {paymentDetails?.submitted ? <div className="omise-payment-instructions">
                <p>{paymentDetails.paymentMethod === "promptpay"
                  ? "สแกน QR นี้ด้วยแอปธนาคารเพื่อชำระเงิน"
                  : paymentDetails.paymentMethod === "truemoney_wallet"
                    ? "ชำระผ่านหน้า TrueMoney ที่ปลอดภัย"
                    : "มีรายการชำระเงินที่ส่งไปแล้ว"}</p>
                {paymentDetails.qrImageUrl && <img className="omise-payment-qr" src={paymentDetails.qrImageUrl} alt="QR สำหรับชำระเงิน" referrerPolicy="no-referrer" />}
                {paymentDetails.authorizationUrl && <a className="billing-secondary" href={paymentDetails.authorizationUrl}>ดำเนินการชำระเงินต่อ</a>}
                {!paymentDetails.qrImageUrl && !paymentDetails.authorizationUrl && <small>ระบบกำลังรอผลยืนยันจาก Omise</small>}
                {pendingRental.paymentId && <button className="billing-secondary" type="button" disabled={busy} onClick={() => void refreshOmiseStatus(pendingRental.paymentId!)}>ตรวจสอบสถานะ</button>}
              </div> : selectedPaymentMethod === "card" ? <form className="omise-card-form" onSubmit={(event) => {
                event.preventDefault();
                if (pendingRental.paymentId) void chargeWithOmise(pendingRental.paymentId);
              }}>
                <p className="omise-card-title">ชำระด้วยบัตร · Test mode</p>
                <label>ชื่อบนบัตร
                  <input value={cardName} onChange={(event) => setCardName(event.target.value)} autoComplete="cc-name" required />
                </label>
                <label>หมายเลขบัตร
                  <input value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} autoComplete="cc-number" inputMode="numeric" required />
                </label>
                <div className="omise-card-grid">
                  <label>เดือนหมดอายุ
                    <input value={cardMonth} onChange={(event) => setCardMonth(event.target.value)} autoComplete="cc-exp-month" inputMode="numeric" placeholder="MM" required />
                  </label>
                  <label>ปีหมดอายุ
                    <input value={cardYear} onChange={(event) => setCardYear(event.target.value)} autoComplete="cc-exp-year" inputMode="numeric" placeholder="YYYY" required />
                  </label>
                  <label>รหัส CVC
                    <input value={cardSecurityCode} onChange={(event) => setCardSecurityCode(event.target.value)} autoComplete="cc-csc" inputMode="numeric" required />
                  </label>
                </div>
                <button className="billing-primary" type="submit" disabled={!checkoutAvailable || busy}>
                  {busy ? "กำลังส่งรายการทดสอบ…" : "ชำระในโหมดทดสอบ"}
                </button>
                <small>ระบบทดสอบของ Omise ไม่ตัดเงินจริง ใช้เฉพาะบัตรทดสอบ</small>
              </form> : <div className="omise-alternative-payment">
                <p>{selectedPaymentMethod === "promptpay"
                  ? "ระบบจะสร้าง QR PromptPay สำหรับยอดชำระนี้"
                  : "ระบบจะเปิดหน้าชำระ TrueMoney Wallet อย่างปลอดภัย"}</p>
                <button className="billing-primary" type="button" disabled={!checkoutAvailable || busy} onClick={() => {
                  if (pendingRental.paymentId) void payWithOmiseAlternative(pendingRental.paymentId, selectedPaymentMethod);
                }}>
                  {busy ? "กำลังสร้างรายการ…" : selectedPaymentMethod === "promptpay" ? "สร้าง QR PromptPay" : "ไปชำระด้วย TrueMoney Wallet"}
                </button>
              </div>}
            </div>}
            {pendingRental.paymentId && paymentClient?.provider !== "omise" && <button className="billing-secondary" disabled={!checkoutAvailable || busy} onClick={() => void openCheckout(pendingRental.paymentId!)}>
              {checkoutAvailable ? "ไปหน้าชำระเงิน" : "ชำระเงินจริงยังไม่เปิด"}
            </button>}
          </div>}
          {!pendingRental && <div className="billing-empty"><span>฿</span><b>ยังไม่มีรายการแพ็กเกจ</b><small>เลือกระยะเวลาแล้วสร้างรายการทางด้านซ้าย</small></div>}
        </section>
      </div>

      <section className="billing-card billing-history">
        <div className="billing-card-heading"><div><p className="eyebrow">HISTORY</p><h2>ประวัติแพ็กเกจ</h2></div><button className="billing-refresh" onClick={() => void load()}>รีเฟรชสถานะ</button></div>
        {history.length === 0 ? <p className="billing-empty-history">รายการแพ็กเกจที่สร้างจะแสดงที่นี่</p> : <div className="billing-history-list">
          {history.map((rental) => <article className="billing-history-row" key={rental.id}>
            <div><b>{rental.termMonths} เดือน · {formatMoney(rental.amount)}</b><small>สร้างเมื่อ {formatDate(rental.createdAt)}{rental.autoRenew ? " · ต่ออายุอัตโนมัติเมื่อเชื่อม provider" : ""}</small></div>
            <div className="billing-history-status"><span className={"billing-status-pill " + rental.status.toLowerCase()}>{statusLabel[rental.status]}</span><small>ชำระ: {rental.paymentStatus ?? "—"}</small></div>
          </article>)}
        </div>}
      </section>
    </div>
  </main>;
}
