const publicKey = Bun.env.OMISE_PUBLIC_KEY;
if (!publicKey?.startsWith("pkey_test_")) {
  console.log("Omise test public key is not configured");
} else {
  try {
    const response = await fetch("https://api.omise.co/capability", {
      headers: { authorization: "Basic " + Buffer.from(publicKey + ":").toString("base64") }
    });
    const result = await response.json();
    if (!response.ok) {
      console.log("Capability lookup failed with HTTP " + response.status);
    } else {
      const methods = result.payment_methods ?? result.payment_backends ?? [];
      const names = new Set(methods.map((item: any) => typeof item === "string" ? item : item.name));
      console.log("PromptPay enabled in Omise test account: " + names.has("promptpay"));
      console.log("TrueMoney App Redirection enabled in Omise test account: " + names.has("truemoney_jumpapp"));
    }
  } catch {
    console.log("Capability lookup could not reach Omise");
  }
}
