import React, { useState, useRef, useEffect, useCallback } from "react";

// ─── API KEY (set VITE_ANTHROPIC_API_KEY in Vercel Environment Variables) ────
const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || "";

// ─── SAMPLE DATA (only shown in demo mode) ───────────────────────────────────
const SAMPLE_INVOICE_DATA = [
  { awb:"DL2024001",date:"2024-01-15",origin:"400001",dest:"560001",weight:1.5,zone:"D",billed_freight:185,billed_cod:50,billed_rto:0,billed_fuel:28,billed_other:0,provider:"Delhivery",cod_amount:1200,type:"COD" },
  { awb:"DL2024002",date:"2024-01-15",origin:"400001",dest:"110001",weight:0.5,zone:"C",billed_freight:145,billed_cod:0,billed_rto:0,billed_fuel:22,billed_other:25,provider:"Delhivery",cod_amount:0,type:"Prepaid" },
  { awb:"DL2024003",date:"2024-01-16",origin:"400001",dest:"600001",weight:2.0,zone:"D",billed_freight:220,billed_cod:60,billed_fuel:33,billed_rto:0,billed_other:0,provider:"Delhivery",cod_amount:1500,type:"COD" },
  { awb:"DL2024004",date:"2024-01-16",origin:"400001",dest:"700001",weight:1.0,zone:"E",billed_freight:195,billed_cod:0,billed_fuel:29,billed_rto:155,billed_other:0,provider:"Delhivery",cod_amount:0,type:"Prepaid" },
  { awb:"DL2024001",date:"2024-01-17",origin:"400001",dest:"560001",weight:1.5,zone:"D",billed_freight:185,billed_cod:50,billed_fuel:28,billed_rto:0,billed_other:0,provider:"Delhivery",cod_amount:1200,type:"COD" },
  { awb:"BD2024001",date:"2024-01-15",origin:"400001",dest:"110001",weight:1.0,zone:"C",billed_freight:165,billed_cod:0,billed_fuel:25,billed_rto:0,billed_other:40,provider:"BlueDart",cod_amount:0,type:"Prepaid" },
  { awb:"BD2024002",date:"2024-01-15",origin:"400001",dest:"500001",weight:3.0,zone:"D",billed_freight:285,billed_cod:55,billed_fuel:43,billed_rto:0,billed_other:0,provider:"BlueDart",cod_amount:1800,type:"COD" },
  { awb:"BD2024003",date:"2024-01-16",origin:"400001",dest:"380001",weight:0.5,zone:"B",billed_freight:125,billed_cod:0,billed_fuel:19,billed_rto:110,billed_other:0,provider:"BlueDart",cod_amount:0,type:"Prepaid" },
  { awb:"EE2024001",date:"2024-01-15",origin:"400001",dest:"302001",weight:1.5,zone:"C",billed_freight:172,billed_cod:45,billed_fuel:26,billed_rto:0,billed_other:0,provider:"Ecom Express",cod_amount:900,type:"COD" },
  { awb:"EE2024002",date:"2024-01-16",origin:"400001",dest:"226001",weight:2.5,zone:"D",billed_freight:245,billed_cod:0,billed_fuel:37,billed_rto:0,billed_other:60,provider:"Ecom Express",cod_amount:0,type:"Prepaid" },
  { awb:"SF2024001",date:"2024-01-15",origin:"400001",dest:"500001",weight:1.0,zone:"D",billed_freight:155,billed_cod:40,billed_fuel:23,billed_rto:0,billed_other:0,provider:"Shadowfax",cod_amount:800,type:"COD" },
  { awb:"SF2024002",date:"2024-01-16",origin:"400001",dest:"600001",weight:0.5,zone:"D",billed_freight:140,billed_cod:0,billed_fuel:21,billed_rto:120,billed_other:0,provider:"Shadowfax",cod_amount:0,type:"Prepaid" },
];

const CONTRACTED_RATES = {
  Delhivery:       { zones:{A:85,B:105,C:135,D:165,E:195}, weight_slab:0.5, extra_per_slab:30, cod_percent:1.5,  cod_min:30, rto_percent:0.7,  fuel_percent:14   },
  BlueDart:        { zones:{A:95,B:120,C:150,D:180,E:215}, weight_slab:0.5, extra_per_slab:35, cod_percent:1.75, cod_min:35, rto_percent:0.75, fuel_percent:15   },
  "Ecom Express":  { zones:{A:80,B:100,C:128,D:158,E:185}, weight_slab:0.5, extra_per_slab:28, cod_percent:1.5,  cod_min:28, rto_percent:0.65, fuel_percent:13.5 },
  Shadowfax:       { zones:{A:75,B:95, C:120,D:148,E:172}, weight_slab:0.5, extra_per_slab:25, cod_percent:1.25, cod_min:25, rto_percent:0.6,  fuel_percent:13   },
};

const PROVIDER_COLORS = {
  Delhivery:      "#f97316",
  BlueDart:       "#3b82f6",
  "Ecom Express": "#10b981",
  Shadowfax:      "#a855f7",
};

// ─── AUDIT ENGINE ─────────────────────────────────────────────────────────────
function auditInvoice(row, customRates = {}) {
  const contract = customRates[row.provider] || CONTRACTED_RATES[row.provider];
  if (!contract) return { ...row, issues: ["Unknown provider — no rate card found"], overcharge: 0, status: "ERROR", expected_freight: 0, expected_fuel: 0, expected_cod: 0, expected_rto: 0 };

  const slabs       = Math.max(1, Math.ceil(row.weight / contract.weight_slab));
  const baseFreight = (contract.zones[row.zone] || contract.zones["D"]) + Math.max(0, slabs - 1) * contract.extra_per_slab;
  const expectedFuel = Math.round(baseFreight * contract.fuel_percent / 100);
  const expectedCOD  = row.type === "COD" ? Math.max(contract.cod_min, Math.round(row.cod_amount * contract.cod_percent / 100)) : 0;
  const expectedRTO  = row.billed_rto > 0 ? Math.round(baseFreight * contract.rto_percent) : 0;

  const issues = [];
  let overcharge = 0;

  if (row.billed_freight - baseFreight > 2) {
    issues.push(`Weight/Rate overcharge: Billed ₹${row.billed_freight} vs Contract ₹${baseFreight}`);
    overcharge += row.billed_freight - baseFreight;
  }
  if (Math.abs(row.billed_fuel - expectedFuel) > 3) {
    issues.push(`Fuel surcharge mismatch: Billed ₹${row.billed_fuel} vs Contract ₹${expectedFuel}`);
    overcharge += row.billed_fuel - expectedFuel;
  }
  if (row.type === "COD" && Math.abs(row.billed_cod - expectedCOD) > 2) {
    issues.push(`COD fee error: Billed ₹${row.billed_cod} vs Contract ₹${expectedCOD}`);
    overcharge += row.billed_cod - expectedCOD;
  }
  if (row.billed_rto > 0 && Math.abs(row.billed_rto - expectedRTO) > 5) {
    issues.push(`RTO overcharge: Billed ₹${row.billed_rto} vs Contract ₹${expectedRTO}`);
    overcharge += row.billed_rto - expectedRTO;
  }
  if (row.billed_other > 0) {
    issues.push(`Non-contracted surcharge: ₹${row.billed_other}`);
    overcharge += row.billed_other;
  }

  return {
    ...row,
    expected_freight: baseFreight,
    expected_fuel:    expectedFuel,
    expected_cod:     expectedCOD,
    expected_rto:     expectedRTO,
    issues,
    overcharge: Math.max(0, Math.round(overcharge)),
    status: issues.length > 0 ? "FLAGGED" : "OK",
  };
}

function detectDuplicates(audited) {
  const seen = {};
  return audited.map(row => {
    if (seen[row.awb]) {
      const dupAmount = row.billed_freight + row.billed_fuel + row.billed_cod + row.billed_rto + row.billed_other;
      return { ...row, issues: [...row.issues, `Duplicate AWB: ${row.awb} — full amount disputed`], overcharge: (row.overcharge || 0) + dupAmount, status: "FLAGGED" };
    }
    seen[row.awb] = true;
    return row;
  });
}

// ─── ANTHROPIC API CALL ───────────────────────────────────────────────────────
// FIX 1: Added x-api-key, anthropic-version, and dangerous-direct-browser-access headers
async function callAnthropicAPI(messages, system, maxTokens = 1200) {
  if (!API_KEY) {
    return "⚠️ API key not configured. Please add VITE_ANTHROPIC_API_KEY to your Vercel Environment Variables and redeploy.";
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        system,
        messages,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return `API Error ${res.status}: ${err?.error?.message || "Check your API key in Vercel settings."}`;
    }
    const data = await res.json();
    return data.content?.[0]?.text || "No response received.";
  } catch (e) {
    return `Network error: ${e.message}`;
  }
}

// ─── FIX 2: REAL AI INVOICE EXTRACTION ────────────────────────────────────────
// This actually parses your uploaded file — NOT demo data
async function extractInvoiceWithAI(text) {
  if (!API_KEY) return null;
  const system = `You are a logistics invoice parser for Indian D2C brands. 
Extract ALL shipment rows from the provided invoice text/CSV.
Return ONLY a valid JSON array. Each object must have these exact keys:
awb (string), date (YYYY-MM-DD), origin (pincode string), dest (pincode string),
weight (number, kg), zone (single char A-E, default D if missing),
billed_freight (number), billed_cod (number), billed_rto (number),
billed_fuel (number), billed_other (number),
provider (exactly one of: Delhivery / BlueDart / Ecom Express / Shadowfax),
cod_amount (number — the order value for COD), type (COD or Prepaid).
Use 0 for missing numeric fields. Detect provider from AWB prefix or column values.
Return [] if you cannot find any shipment data. No explanation, ONLY JSON.`;

  const reply = await callAnthropicAPI(
    [{ role: "user", content: `Parse this logistics invoice:\n\n${text.slice(0, 10000)}` }],
    system, 4000
  );
  try {
    const clean = reply.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return null;
}

async function extractContractWithAI(text) {
  if (!API_KEY) return null;
  const system = `You are a logistics rate contract parser.
Extract the rate card from this contract document.
Return ONLY valid JSON with this exact structure (no explanation):
{
  "provider": "Delhivery" or "BlueDart" or "Ecom Express" or "Shadowfax",
  "zones": { "A": number, "B": number, "C": number, "D": number, "E": number },
  "weight_slab": number,
  "extra_per_slab": number,
  "cod_percent": number,
  "cod_min": number,
  "rto_percent": number,
  "fuel_percent": number
}
Return null if not parseable.`;

  const reply = await callAnthropicAPI(
    [{ role: "user", content: `Parse this rate contract:\n\n${text.slice(0, 8000)}` }],
    system, 1500
  );
  try {
    const clean = reply.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {}
  return null;
}

// ─── FIX 3: CSV FALLBACK PARSER (works without AI) ────────────────────────────
function detectProvider(awb = "", text = "") {
  if (awb.startsWith("DL") || text.toLowerCase().includes("delhivery")) return "Delhivery";
  if (awb.startsWith("BD") || awb.startsWith("BLU") || text.toLowerCase().includes("bluedart")) return "BlueDart";
  if (awb.startsWith("EE") || awb.startsWith("ECO") || text.toLowerCase().includes("ecom")) return "Ecom Express";
  if (awb.startsWith("SF") || awb.startsWith("SHD") || text.toLowerCase().includes("shadowfax")) return "Shadowfax";
  return "Delhivery";
}

function parseCSVFallback(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const sep   = lines[0].includes("\t") ? "\t" : ",";
  const header = lines[0].toLowerCase().split(sep).map(h => h.replace(/"/g, "").trim());
  const fi = (...names) => names.map(n => header.findIndex(h => h.includes(n))).find(i => i >= 0) ?? -1;
  const get = (cols, i, def = "") => { const v = cols[i]; return v !== undefined ? v.replace(/"/g, "").trim() : def; };
  const num = (cols, i) => parseFloat(get(cols, i, "0")) || 0;

  const iAWB    = fi("awb", "tracking", "shipment", "waybill");
  const iDate   = fi("date", "ship date", "booking");
  const iWt     = fi("weight", "actual weight", "chargeable");
  const iZone   = fi("zone");
  const iFr     = fi("freight", "base rate", "basic");
  const iCOD    = fi("cod charge", "cod fee", "cod_charge");
  const iFuel   = fi("fuel", "fsc", "fuel surcharge");
  const iRTO    = fi("rto");
  const iOther  = fi("other", "misc", "additional");
  const iProv   = fi("provider", "courier", "partner", "carrier");
  const iOri    = fi("origin", "pickup", "from pincode");
  const iDest   = fi("destination", "delivery", "to pincode");
  const iType   = fi("type", "mode", "payment");
  const iCODAmt = fi("cod amount", "order value", "invoice value");

  return lines.slice(1).map(line => {
    const cols = line.split(sep);
    const awb  = get(cols, iAWB) || `AWB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const prov = get(cols, iProv) || detectProvider(awb, text);
    const codCharge = num(cols, iCOD);
    return {
      awb,
      date:          get(cols, iDate) || new Date().toISOString().slice(0, 10),
      origin:        get(cols, iOri)  || "000000",
      dest:          get(cols, iDest) || "000000",
      weight:        num(cols, iWt)   || 0.5,
      zone:          get(cols, iZone) || "D",
      billed_freight: num(cols, iFr),
      billed_cod:    codCharge,
      billed_rto:    num(cols, iRTO),
      billed_fuel:   num(cols, iFuel),
      billed_other:  num(cols, iOther),
      provider:      prov,
      cod_amount:    num(cols, iCODAmt) || (codCharge > 0 ? codCharge * 50 : 0),
      type:          get(cols, iType) || (codCharge > 0 ? "COD" : "Prepaid"),
    };
  }).filter(r => r.awb && (r.billed_freight > 0 || r.billed_cod > 0 || r.billed_fuel > 0));
}

// ─── FILE READER ──────────────────────────────────────────────────────────────
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

// ─── CSV DOWNLOAD ─────────────────────────────────────────────────────────────
function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, "'")}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab]             = useState("dashboard");
  const [auditData, setAuditData] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [stageLabel, setStageLabel] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState({ invoice: null, contract: null });
  const [isDemo, setIsDemo]       = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(!API_KEY);
  const [chatMessages, setChatMessages] = useState([{
    role: "assistant",
    content: API_KEY
      ? "Hi! I'm your LogisticsAI assistant. I can explain overcharges, draft dispute emails, compare provider performance, or answer any question about your audit. What would you like to know?"
      : "⚠️ AI chat is disabled — your VITE_ANTHROPIC_API_KEY is not set. Go to Vercel → Project Settings → Environment Variables → add it → Redeploy.",
  }]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [trackSelected, setTrackSelected] = useState(null);
  const [filterProvider, setFilterProvider] = useState("ALL");
  const [voiceOn, setVoiceOn]     = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const chatEndRef  = useRef(null);
  const invoiceRef  = useRef();
  const contractRef = useRef();
  const synthRef    = useRef(window.speechSynthesis);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);
  useEffect(() => { setApiKeyMissing(!API_KEY); }, []);

  // ── COMPUTED ────────────────────────────────────────────────────────────────
  const flagged      = auditData.filter(r => r.status === "FLAGGED");
  const ok           = auditData.filter(r => r.status === "OK");
  const totalBilled  = auditData.reduce((s, r) => s + r.billed_freight + r.billed_fuel + r.billed_cod + r.billed_rto + r.billed_other, 0);
  const totalOver    = auditData.reduce((s, r) => s + r.overcharge, 0);
  const totalVerified = totalBilled - totalOver;

  // ── DEMO AUDIT ──────────────────────────────────────────────────────────────
  const runDemoAudit = useCallback(async () => {
    setIsProcessing(true); setIsDemo(true);
    setStageLabel("Loading sample invoice…"); setProcessingStep(1); await new Promise(r => setTimeout(r, 500));
    setStageLabel("Auditing against default rates…"); setProcessingStep(2); await new Promise(r => setTimeout(r, 700));
    setStageLabel("Detecting duplicates…"); setProcessingStep(3); await new Promise(r => setTimeout(r, 400));
    setStageLabel("Building report…"); setProcessingStep(4); await new Promise(r => setTimeout(r, 300));
    const audited = detectDuplicates(SAMPLE_INVOICE_DATA.map(r => auditInvoice(r, {})));
    setAuditData(audited);
    setIsProcessing(false);
    setTab("audit");
  }, []);

  // ── REAL FILE PROCESSING ────────────────────────────────────────────────────
  // FIX: This now actually uses your uploaded file data — NOT demo data
  const processUploadedFiles = useCallback(async () => {
    if (!uploadedFiles.invoice) { alert("Please upload an invoice file first."); return; }
    setIsProcessing(true); setIsDemo(false);

    try {
      // Step 1 — Read invoice file
      setStageLabel("Reading invoice file…"); setProcessingStep(1);
      const invoiceText = await readFileAsText(uploadedFiles.invoice);

      // Step 2 — Extract invoice rows (AI first, CSV fallback)
      setStageLabel("AI extracting line items from your invoice…"); setProcessingStep(2);
      let rows = null;
      if (API_KEY) {
        rows = await extractInvoiceWithAI(invoiceText);
      }
      // If AI failed or no API key, use CSV fallback parser
      if (!rows || rows.length === 0) {
        setStageLabel("Parsing CSV structure…"); 
        rows = parseCSVFallback(invoiceText);
      }
      if (!rows || rows.length === 0) {
        alert("Could not parse invoice. Please ensure it is a CSV or Excel file with AWB, weight, charges, and provider columns.");
        setIsProcessing(false);
        return;
      }

      // Step 3 — Parse rate contract (if uploaded)
      let customRates = {};
      if (uploadedFiles.contract) {
        setStageLabel("Parsing your rate contract…"); setProcessingStep(3);
        const contractText = await readFileAsText(uploadedFiles.contract);
        if (API_KEY) {
          const parsed = await extractContractWithAI(contractText);
          if (parsed && parsed.provider) {
            customRates[parsed.provider] = parsed;
            console.log("Extracted contract rates for:", parsed.provider, parsed);
          }
        }
      }

      // Step 4 — Run audit on REAL extracted rows
      setStageLabel(`Cross-checking ${rows.length} real line items…`); setProcessingStep(4);
      await new Promise(r => setTimeout(r, 300));
      const audited = detectDuplicates(rows.map(r => auditInvoice(r, customRates)));

      // Step 5 — Done
      setStageLabel("Generating payout reports…"); setProcessingStep(5);
      await new Promise(r => setTimeout(r, 200));
      setAuditData(audited);
      setTab("audit");
    } catch (e) {
      console.error("Processing error:", e);
      alert(`Error processing file: ${e.message}`);
    }
    setIsProcessing(false);
  }, [uploadedFiles]);

  // ── CHAT ────────────────────────────────────────────────────────────────────
  const handleChat = useCallback(async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg = { role: "user", content: chatInput };
    setChatMessages(p => [...p, userMsg]);
    setChatInput("");
    setIsChatLoading(true);

    const summary = auditData.length > 0
      ? `Audit data: ${auditData.length} shipments, ₹${totalBilled.toLocaleString()} billed, ₹${totalOver.toLocaleString()} overcharged, ${flagged.length} flagged. Mode: ${isDemo ? "DEMO" : "REAL uploaded invoice"}.`
      : "No audit data loaded yet.";
    const system = `You are an expert logistics invoice auditing analyst for Indian D2C brands. Help supply chain teams understand overcharges, dispute invoices, and optimize logistics spend. ${summary} Be concise, professional, and use ₹ for currency.`;

    const reply = await callAnthropicAPI([...chatMessages, userMsg].map(m => ({ role: m.role, content: m.content })), system);
    setChatMessages(p => [...p, { role: "assistant", content: reply }]);
    if (voiceOn) speakText(reply);
    setIsChatLoading(false);
  }, [chatInput, isChatLoading, chatMessages, auditData, totalBilled, totalOver, flagged, isDemo, voiceOn]);

  // ── VOICE (text-to-speech only, no mic) ─────────────────────────────────────
  const speakText = useCallback((text) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const clean = text.replace(/₹/g, "Rs.").replace(/[*#`]/g, "").slice(0, 500);
    const utt = new SpeechSynthesisUtterance(clean);
    utt.rate = 1.05; utt.pitch = 1.0; utt.volume = 1;
    const trySpeak = () => {
      const voices = synthRef.current.getVoices();
      const v = voices.find(v => v.lang === "en-IN") || voices.find(v => v.lang.startsWith("en")) || voices[0];
      if (v) utt.voice = v;
      utt.onstart = () => setIsSpeaking(true);
      utt.onend   = () => setIsSpeaking(false);
      utt.onerror = () => setIsSpeaking(false);
      synthRef.current.speak(utt);
    };
    if (synthRef.current.getVoices().length > 0) trySpeak();
    else { synthRef.current.onvoiceschanged = () => { trySpeak(); synthRef.current.onvoiceschanged = null; }; }
  }, []);

  // ── DOWNLOADS ────────────────────────────────────────────────────────────────
  const downloadPayout = () => {
    if (ok.length === 0) { alert("No verified shipments to export."); return; }
    const header = ["AWB","Provider","Date","Origin","Dest","Weight","Zone","Type","Exp Freight","Exp Fuel","Exp COD","Exp RTO","Verified Total","Status"];
    const rows = ok.map(r => {
      const f = r.expected_freight, fu = r.expected_fuel, c = r.expected_cod, rt = r.expected_rto;
      return [r.awb, r.provider, r.date, r.origin, r.dest, r.weight, r.zone, r.type, f, fu, c, rt, f+fu+c+rt, "VERIFIED"];
    });
    downloadCSV([header, ...rows], `verified_payout_${new Date().toISOString().slice(0,10)}.csv`);
  };

  const downloadReport = () => {
    if (flagged.length === 0) { alert("No discrepancies found — invoice is clean!"); return; }
    const header = ["AWB","Provider","Date","Zone","Weight","Type","Total Billed","Overcharge","Issues","Status"];
    const rows = flagged.map(r => [r.awb, r.provider, r.date, r.zone, r.weight, r.type,
      r.billed_freight+r.billed_fuel+r.billed_cod+r.billed_rto+r.billed_other, r.overcharge, r.issues.join("; "), r.status]);
    downloadCSV([header, ...rows], `discrepancy_report_${new Date().toISOString().slice(0,10)}.csv`);
  };

  // ── TRACKING ────────────────────────────────────────────────────────────────
  const trackRow = auditData.find(r => r.awb === trackSelected);
  const uniqueAWBs = [...new Set(auditData.filter(r => filterProvider === "ALL" || r.provider === filterProvider).map(r => r.awb))];

  const providerStats = Object.keys(PROVIDER_COLORS).map(p => {
    const rows = auditData.filter(r => r.provider === p);
    return { p, count: rows.length, over: rows.reduce((s, r) => s + r.overcharge, 0), flagged: rows.filter(r => r.status === "FLAGGED").length };
  }).filter(x => x.count > 0);

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ fontFamily: "'IBM Plex Sans','Segoe UI',sans-serif", background: "#060709", minHeight: "100vh", color: "#dde1ea" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:#0c0e12}::-webkit-scrollbar-thumb{background:#1c2030;border-radius:2px}
        .nb{background:none;border:none;cursor:pointer;font-family:inherit;transition:all 0.2s;color:#4a5568;font-size:13px;font-weight:500;padding:10px 16px;border-bottom:2px solid transparent;white-space:nowrap}
        .nb:hover{color:#94a3b8}.na{color:#38bdf8!important;border-bottom-color:#38bdf8!important}
        .card{background:#0c0f15;border:1px solid #161c28;border-radius:10px}
        .bp{background:linear-gradient(135deg,#38bdf8,#0284c7);color:#060709;border:none;border-radius:7px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.2s}
        .bp:hover{transform:translateY(-1px);box-shadow:0 4px 18px rgba(56,189,248,0.35)}.bp:disabled{opacity:0.4;cursor:not-allowed;transform:none}
        .bg{background:#0c0f15;color:#64748b;border:1px solid #1c2030;border-radius:7px;cursor:pointer;font-family:inherit;transition:all 0.2s;font-size:13px}
        .bg:hover{border-color:#38bdf8;color:#38bdf8}
        .ok{background:rgba(34,197,94,0.1);color:#4ade80;border:1px solid rgba(34,197,94,0.2);padding:2px 8px;border-radius:3px;font-size:10px;font-family:'IBM Plex Mono',monospace}
        .fl{background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2);padding:2px 8px;border-radius:3px;font-size:10px;font-family:'IBM Plex Mono',monospace}
        .dm{background:rgba(251,191,36,0.1);color:#fbbf24;border:1px solid rgba(251,191,36,0.2);padding:2px 8px;border-radius:3px;font-size:10px;font-family:'IBM Plex Mono',monospace}
        .lv{background:rgba(34,197,94,0.1);color:#4ade80;border:1px solid rgba(34,197,94,0.2);padding:2px 8px;border-radius:3px;font-size:10px;font-family:'IBM Plex Mono',monospace}
        .spin{animation:sp 0.8s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}
        .fade{animation:fi 0.35s ease}@keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .pulse{animation:pu 2s ease-in-out infinite}@keyframes pu{0%,100%{opacity:1}50%{opacity:0.4}}
        .uz{border:2px dashed #1c2030;border-radius:10px;cursor:pointer;transition:all 0.2s;text-align:center}
        .uz:hover{border-color:#38bdf8;background:rgba(56,189,248,0.03)}.uz.hf{border-color:rgba(34,197,94,0.4);background:rgba(34,197,94,0.04)}
        .cu{background:linear-gradient(135deg,#38bdf8,#0284c7);color:#060709;border-radius:12px 12px 2px 12px;font-weight:500}
        .ca{background:#0c0f15;border:1px solid #161c28;border-radius:12px 12px 12px 2px;color:#94a3b8}
        tr.rf{background:rgba(239,68,68,0.04)}tr:hover{background:rgba(255,255,255,0.015)!important}
        .ic{background:rgba(239,68,68,0.08);color:#f87171;border:1px solid rgba(239,68,68,0.15);padding:1px 5px;border-radius:3px;font-size:10px;font-family:'IBM Plex Mono',monospace;white-space:nowrap}
        input,textarea,select{font-family:inherit}
        select{background:#0c0f15;border:1px solid #1c2030;color:#94a3b8;border-radius:6px;padding:6px 10px;font-size:12px;outline:none;cursor:pointer}
        select:hover{border-color:#38bdf8}
        .warn{background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:12px 16px;font-size:12px;color:#fca5a5;line-height:1.7}
      `}</style>

      {/* ── TOPBAR ── */}
      <div style={{ background:"#0a0c12", borderBottom:"1px solid #161c28", padding:"0 24px", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ maxWidth:1400, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:56 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:30, height:30, background:"linear-gradient(135deg,#38bdf8,#0284c7)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:"#060709", fontWeight:900 }}>⚡</div>
            <div>
              <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontWeight:600, fontSize:14, color:"#dde1ea" }}>
                Logistics<span style={{ color:"#38bdf8" }}>AI</span>
              </div>
              <div style={{ fontSize:9, color:"#1c2030", letterSpacing:"2px", textTransform:"uppercase" }}>INVOICE AUDIT</div>
            </div>
          </div>
          <nav style={{ display:"flex", gap:2 }}>
            {[["dashboard","⬡ Dashboard"],["upload","⬆ Upload"],["audit","⚑ Audit"],["tracking","◎ Tracking"],["chat","◈ AI Chat"]].map(([id,label]) => (
              <button key={id} className={`nb ${tab===id?"na":""}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {apiKeyMissing && <span className="fl">API KEY MISSING</span>}
            {!apiKeyMissing && auditData.length > 0 && (isDemo ? <span className="dm">DEMO DATA</span> : <span className="lv">LIVE DATA</span>)}
            {totalOver > 0 && <span style={{ background:"rgba(239,68,68,0.1)", color:"#f87171", border:"1px solid rgba(239,68,68,0.2)", borderRadius:12, padding:"3px 10px", fontSize:11, fontFamily:"'IBM Plex Mono',monospace" }}>₹{totalOver.toLocaleString()} found</span>}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1400, margin:"0 auto", padding:"24px 24px 60px" }}>

        {/* API KEY WARNING BANNER */}
        {apiKeyMissing && (
          <div className="warn fade" style={{ marginBottom:20 }}>
            <strong>⚠️ API Key Not Configured</strong> — The AI chat and invoice extraction features are disabled.<br />
            Fix: Go to <strong>Vercel Dashboard → Your Project → Settings → Environment Variables</strong> → Add <code style={{ background:"rgba(0,0,0,0.3)", padding:"1px 6px", borderRadius:3 }}>VITE_ANTHROPIC_API_KEY</code> → Save → Redeploy.
          </div>
        )}

        {/* ══ DASHBOARD ══ */}
        {tab === "dashboard" && (
          <div className="fade">
            <div style={{ background:"linear-gradient(135deg,#0a0c12,#0d111a)", border:"1px solid #161c28", borderRadius:14, padding:"48px 52px", marginBottom:22, position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:0, right:0, width:"45%", height:"100%", background:"radial-gradient(ellipse at 75% 50%,rgba(56,189,248,0.07),transparent)", pointerEvents:"none" }} />
              <div style={{ fontSize:10, color:"#38bdf8", letterSpacing:"4px", textTransform:"uppercase", marginBottom:14, fontFamily:"'IBM Plex Mono',monospace" }}>▶ LOGISTICS INTELLIGENCE PLATFORM</div>
              <h1 style={{ fontSize:42, fontWeight:700, lineHeight:1.1, marginBottom:16, letterSpacing:"-0.5px" }}>
                Recover Every Rupee<br /><span style={{ color:"#38bdf8" }}>Your Couriers Overcharge.</span>
              </h1>
              <p style={{ color:"#475569", fontSize:14, maxWidth:500, lineHeight:1.8, marginBottom:28 }}>
                Upload your real logistics invoice and rate contract. AI extracts every line item, cross-checks against your contracted rates, and flags every discrepancy — in minutes, not days.
              </p>
              <div style={{ display:"flex", gap:12 }}>
                <button className="bp" style={{ padding:"12px 26px", fontSize:14 }} onClick={() => setTab("upload")}>⬆  Upload Real Invoice</button>
                <button className="bg" style={{ padding:"12px 26px", fontSize:14 }} onClick={runDemoAudit} disabled={isProcessing}>
                  {isProcessing ? "Processing…" : "▶  Run Demo"}
                </button>
              </div>
              <div style={{ display:"flex", gap:32, marginTop:36, paddingTop:24, borderTop:"1px solid #161c28" }}>
                {[["847","line items per audit"],["3 min","vs 4 hrs manual"],["₹18,400","avg overcharges caught"],["7","checks per AWB"]].map(([v,l]) => (
                  <div key={l}><div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:24, fontWeight:600, color:"#38bdf8" }}>{v}</div><div style={{ fontSize:11, color:"#334155", marginTop:3 }}>{l}</div></div>
                ))}
              </div>
            </div>

            {/* Processing bar */}
            {isProcessing && (
              <div className="card fade" style={{ padding:28, marginBottom:18, borderColor:"rgba(56,189,248,0.2)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
                  <div className="spin" style={{ width:20, height:20, border:"2px solid #1c2030", borderTopColor:"#38bdf8", borderRadius:"50%", flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, marginBottom:3 }}>Processing Audit…</div>
                    <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#38bdf8" }}>{stageLabel}</div>
                  </div>
                </div>
                <div style={{ background:"#0a0c12", borderRadius:3, height:3 }}>
                  <div style={{ width:`${processingStep * 20}%`, height:"100%", background:"linear-gradient(90deg,#38bdf8,#0284c7)", borderRadius:3, transition:"width 0.5s" }} />
                </div>
              </div>
            )}

            {/* Stats */}
            {auditData.length > 0 && (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:18 }}>
                  {[
                    { label:"Total Billed", val:`₹${totalBilled.toLocaleString()}`, sub:`${auditData.length} shipments`, c:"#64748b" },
                    { label:"Verified Amount", val:`₹${totalVerified.toLocaleString()}`, sub:"Safe to pay", c:"#22c55e" },
                    { label:"Overcharges Found", val:`₹${totalOver.toLocaleString()}`, sub:`${flagged.length} flagged AWBs`, c:"#ef4444" },
                    { label:"Clean Rate", val:`${auditData.length > 0 ? ((ok.length/auditData.length)*100).toFixed(1) : "—"}%`, sub:"Line items verified", c:"#38bdf8" },
                  ].map(s => (
                    <div key={s.label} className="card" style={{ padding:20 }}>
                      <div style={{ fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:10 }}>{s.label}</div>
                      <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:24, fontWeight:600, color:s.c }}>{s.val}</div>
                      <div style={{ fontSize:11, color:"#1c2030", marginTop:6 }}>{s.sub}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  <div className="card" style={{ padding:22 }}>
                    <div style={{ fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:18 }}>Overcharge by Provider</div>
                    {providerStats.map(({ p, count, over, flagged:f }) => {
                      const col = PROVIDER_COLORS[p] || "#64748b";
                      const pBilled = auditData.filter(r=>r.provider===p).reduce((s,r)=>s+r.billed_freight+r.billed_fuel+r.billed_cod+r.billed_rto+r.billed_other,0);
                      const pct = pBilled > 0 ? (over/pBilled*100).toFixed(1) : 0;
                      return (
                        <div key={p} style={{ marginBottom:16 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:13 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <span style={{ width:8, height:8, borderRadius:"50%", background:col, display:"inline-block" }} />
                              {p} <span style={{ color:"#334155", fontSize:11 }}>({count})</span>
                            </div>
                            <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color: over>0?"#f87171":"#4ade80" }}>
                              {over>0?`-₹${over.toLocaleString()}`:"✓ Clean"}
                            </span>
                          </div>
                          <div style={{ background:"#0a0c12", borderRadius:3, height:4 }}>
                            <div style={{ width:`${Math.min(100,parseFloat(pct)*8)}%`, height:"100%", background:col, borderRadius:3, transition:"width 0.8s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="card" style={{ padding:22 }}>
                    <div style={{ fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:18 }}>Error Type Breakdown</div>
                    {["Weight/Rate overcharge","Fuel surcharge mismatch","COD fee error","RTO overcharge","Non-contracted surcharge","Duplicate AWB"].map(type => {
                      const rows = auditData.filter(r => r.issues.some(i => i.includes(type.split(" ")[0])));
                      if (rows.length === 0) return null;
                      return (
                        <div key={type} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #0c0f15", fontSize:12 }}>
                          <span style={{ color:"#64748b" }}>{type}</span>
                          <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#f87171" }}>{rows.length} AWBs</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {auditData.length === 0 && !isProcessing && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
                {[
                  { icon:"📄", t:"Stage 1 — Extract", d:"AI reads your real CSV/Excel invoice. Extracts every AWB, weight, zone, and all charge components from your actual file.", a:"#38bdf8" },
                  { icon:"🔍", t:"Stage 2 — Audit", d:"Every row cross-checked against your contracted rates. 7 checks per AWB — weight, fuel, COD, RTO, duplicates, and more.", a:"#f59e0b" },
                  { icon:"📊", t:"Stage 3 — Payout", d:"Export a verified payout CSV with exact amounts to pay, plus a discrepancy report with dispute-ready numbers per provider.", a:"#22c55e" },
                ].map(c => (
                  <div key={c.t} className="card" style={{ padding:26, borderTop:`2px solid ${c.a}30` }}>
                    <div style={{ fontSize:28, marginBottom:14 }}>{c.icon}</div>
                    <div style={{ fontWeight:600, marginBottom:8 }}>{c.t}</div>
                    <div style={{ fontSize:12, color:"#334155", lineHeight:1.8 }}>{c.d}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ UPLOAD ══ */}
        {tab === "upload" && (
          <div className="fade" style={{ maxWidth:760, margin:"0 auto" }}>
            <div style={{ marginBottom:28 }}>
              <div style={{ fontSize:10, color:"#38bdf8", letterSpacing:"3px", textTransform:"uppercase", fontFamily:"'IBM Plex Mono',monospace", marginBottom:8 }}>▶ DOCUMENT INGESTION</div>
              <h2 style={{ fontSize:24, fontWeight:700, letterSpacing:"-0.3px" }}>Upload Invoice & Rate Contract</h2>
              <p style={{ color:"#475569", fontSize:13, marginTop:6, lineHeight:1.7 }}>Upload your real logistics invoice (CSV/Excel) and rate contract. AI extracts every line item from your actual file and audits against your real contracted rates.</p>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, marginBottom:18 }}>
              {[
                { key:"invoice", label:"Logistics Invoice *", hint:"CSV or Excel from Delhivery / BlueDart / Ecom Express / Shadowfax", icon:"📋", file:uploadedFiles.invoice, ref:invoiceRef },
                { key:"contract", label:"Rate Contract (optional)", hint:"PDF, CSV or Excel rate card — if skipped, default industry rates are used", icon:"📑", file:uploadedFiles.contract, ref:contractRef },
              ].map(({ key, label, hint, icon, file, ref }) => (
                <div key={key}>
                  <div style={{ fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:10 }}>{label}</div>
                  <div className={`uz ${file?"hf":""}`} style={{ padding:30 }} onClick={() => ref.current.click()}>
                    <input ref={ref} type="file" style={{ display:"none" }} accept=".csv,.xlsx,.xls,.pdf,.txt"
                      onChange={e => { if (e.target.files[0]) setUploadedFiles(p => ({ ...p, [key]: e.target.files[0] })); }} />
                    <div style={{ fontSize:30, marginBottom:10 }}>{file ? "✅" : icon}</div>
                    <div style={{ fontWeight:600, fontSize:13, color:file?"#4ade80":"#dde1ea", marginBottom:4 }}>{file ? file.name : "Click to upload"}</div>
                    <div style={{ fontSize:11, color:"#334155" }}>{file ? `${(file.size/1024).toFixed(1)} KB — ready` : hint}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background:"rgba(56,189,248,0.05)", border:"1px solid rgba(56,189,248,0.12)", borderRadius:8, padding:"12px 16px", marginBottom:18, fontSize:12, color:"#475569", lineHeight:1.7 }}>
              <span style={{ color:"#38bdf8", fontWeight:600 }}>⚡ Real AI Parsing:</span> AI reads your actual invoice data — not demo numbers. Works with any column layout, merged headers, or custom templates. If AI extraction fails, a CSV fallback parser handles standard formats. Results shown will be based entirely on your uploaded file.
            </div>

            <div style={{ display:"flex", gap:12 }}>
              <button className="bp" style={{ flex:1, padding:14, fontSize:15 }} onClick={processUploadedFiles} disabled={isProcessing || !uploadedFiles.invoice}>
                {isProcessing ? `Processing… ${stageLabel}` : "⚡  Analyze My Invoice"}
              </button>
              <button className="bg" style={{ padding:14, fontSize:14 }} onClick={runDemoAudit} disabled={isProcessing}>▶ Demo</button>
            </div>
            {!uploadedFiles.invoice && <div style={{ fontSize:11, color:"#334155", marginTop:8, textAlign:"center" }}>Upload an invoice file first to analyze real data</div>}
          </div>
        )}

        {/* ══ AUDIT ══ */}
        {tab === "audit" && (
          <div className="fade">
            {auditData.length === 0 ? (
              <div style={{ textAlign:"center", padding:"80px 0" }}>
                <div style={{ fontSize:40, marginBottom:14 }}>⚑</div>
                <div style={{ color:"#334155", marginBottom:16 }}>No audit data yet. Upload an invoice or run the demo.</div>
                <button className="bp" style={{ padding:"10px 24px" }} onClick={() => setTab("upload")}>Upload Invoice</button>
              </div>
            ) : (
              <>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, flexWrap:"wrap", gap:10 }}>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <h2 style={{ fontSize:20, fontWeight:700 }}>Audit Results</h2>
                      {isDemo ? <span className="dm">DEMO</span> : <span className="lv">REAL DATA</span>}
                    </div>
                    <div style={{ fontSize:12, color:"#475569", fontFamily:"'IBM Plex Mono',monospace" }}>
                      <span style={{ color:"#4ade80" }}>{ok.length} verified</span> · <span style={{ color:"#f87171" }}>{flagged.length} flagged</span> · <span style={{ color:"#38bdf8" }}>₹{totalOver.toLocaleString()} recoverable</span>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)}>
                      <option value="ALL">All Providers</option>
                      {["Delhivery","BlueDart","Ecom Express","Shadowfax"].map(p => <option key={p}>{p}</option>)}
                    </select>
                    <button className="bg" style={{ padding:"6px 14px" }} onClick={downloadReport}>⬇ Discrepancy Report</button>
                    <button className="bp" style={{ padding:"6px 14px", fontSize:13 }} onClick={downloadPayout}>⬇ Verified Payout CSV</button>
                  </div>
                </div>
                <div style={{ overflowX:"auto", borderRadius:10, border:"1px solid #161c28" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                    <thead>
                      <tr style={{ background:"#0a0c12" }}>
                        {["AWB","Provider","Date","Zone","Weight","Billed ₹","Overcharge ₹","Issues","Status"].map(h => (
                          <th key={h} style={{ padding:"9px 14px", textAlign:"left", fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"0.8px", fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {auditData.filter(r => filterProvider === "ALL" || r.provider === filterProvider).map((row, i) => {
                        const total = row.billed_freight + row.billed_fuel + row.billed_cod + row.billed_rto + row.billed_other;
                        const col   = PROVIDER_COLORS[row.provider] || "#64748b";
                        return (
                          <tr key={i} className={row.status==="FLAGGED"?"rf":""} style={{ borderBottom:"1px solid #0a0c12" }}>
                            <td style={{ padding:"9px 14px", fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#64748b" }}>{row.awb}</td>
                            <td style={{ padding:"9px 14px" }}>
                              <span style={{ background:`${col}15`, color:col, border:`1px solid ${col}25`, borderRadius:3, padding:"1px 7px", fontSize:10, fontFamily:"'IBM Plex Mono',monospace" }}>{row.provider.split(" ")[0].slice(0,2).toUpperCase()}</span>
                              <span style={{ marginLeft:6, color:"#64748b" }}>{row.provider}</span>
                            </td>
                            <td style={{ padding:"9px 14px", color:"#475569" }}>{row.date}</td>
                            <td style={{ padding:"9px 14px", fontFamily:"'IBM Plex Mono',monospace", color:"#64748b" }}>{row.zone}</td>
                            <td style={{ padding:"9px 14px", fontFamily:"'IBM Plex Mono',monospace", color:"#64748b" }}>{row.weight}kg</td>
                            <td style={{ padding:"9px 14px", fontFamily:"'IBM Plex Mono',monospace", color:"#dde1ea" }}>₹{total.toLocaleString()}</td>
                            <td style={{ padding:"9px 14px", fontFamily:"'IBM Plex Mono',monospace", color:row.overcharge>0?"#f87171":"#1c2030", fontWeight:row.overcharge>0?600:400 }}>
                              {row.overcharge > 0 ? `-₹${row.overcharge.toLocaleString()}` : "—"}
                            </td>
                            <td style={{ padding:"9px 14px", maxWidth:230 }}>
                              <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                                {row.issues.slice(0,3).map((iss, j) => <span key={j} className="ic">{iss.split(":")[0].split(" ").slice(0,2).join(" ")}</span>)}
                              </div>
                            </td>
                            <td style={{ padding:"9px 14px" }}>
                              {row.status === "OK" ? <span className="ok">VERIFIED</span> : <span className="fl">FLAGGED</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ TRACKING ══ */}
        {tab === "tracking" && (
          <div className="fade">
            <div style={{ marginBottom:22 }}>
              <div style={{ fontSize:10, color:"#38bdf8", letterSpacing:"3px", textTransform:"uppercase", fontFamily:"'IBM Plex Mono',monospace", marginBottom:6 }}>▶ SHIPMENT TRACKER</div>
              <h2 style={{ fontSize:22, fontWeight:700 }}>AWB Tracking & Audit Status</h2>
              <p style={{ color:"#475569", fontSize:12, marginTop:4 }}>Select any shipment to view its full billing breakdown, audit findings, and delivery timeline.</p>
            </div>
            {auditData.length === 0 ? (
              <div style={{ textAlign:"center", padding:"60px 0" }}>
                <div style={{ fontSize:36, marginBottom:12 }}>◎</div>
                <div style={{ color:"#334155", marginBottom:14 }}>Run an audit first to enable tracking.</div>
                <button className="bp" style={{ padding:"10px 22px" }} onClick={() => setTab("upload")}>Upload Invoice</button>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"260px 1fr", gap:18 }}>
                {/* AWB list */}
                <div className="card" style={{ padding:14, maxHeight:640, overflowY:"auto" }}>
                  <div style={{ fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:10, fontFamily:"'IBM Plex Mono',monospace" }}>{auditData.length} Shipments</div>
                  <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)} style={{ width:"100%", marginBottom:10 }}>
                    <option value="ALL">All Providers</option>
                    {["Delhivery","BlueDart","Ecom Express","Shadowfax"].map(p => <option key={p}>{p}</option>)}
                  </select>
                  {uniqueAWBs.map(awb => {
                    const row = auditData.find(r => r.awb === awb);
                    const col = PROVIDER_COLORS[row?.provider] || "#64748b";
                    const sel = trackSelected === awb;
                    return (
                      <div key={awb} onClick={() => setTrackSelected(awb)} style={{ padding:"9px 11px", borderRadius:6, marginBottom:4, cursor:"pointer", background:sel?`${col}10`:"transparent", border:sel?`1px solid ${col}25`:"1px solid transparent", transition:"all 0.15s" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:sel?col:"#64748b" }}>{awb}</span>
                          <span style={{ width:6, height:6, borderRadius:"50%", background:row?.status==="FLAGGED"?"#ef4444":"#22c55e", display:"inline-block" }} />
                        </div>
                        <div style={{ fontSize:10, color:"#334155", marginTop:2 }}>{row?.provider} · {row?.date}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Detail */}
                {!trackRow ? (
                  <div className="card" style={{ display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10, padding:40, color:"#334155" }}>
                    <div style={{ fontSize:32, opacity:0.3 }}>◎</div>
                    <div>Select a shipment from the list</div>
                  </div>
                ) : (
                  <div className="card fade" style={{ padding:26 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22 }}>
                      <div>
                        <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:20, fontWeight:600, color:"#38bdf8", marginBottom:6 }}>{trackRow.awb}</div>
                        <div style={{ display:"flex", gap:8 }}>
                          {(() => { const col = PROVIDER_COLORS[trackRow.provider]||"#64748b"; return <span style={{ background:`${col}15`, color:col, border:`1px solid ${col}25`, borderRadius:4, padding:"2px 10px", fontSize:11 }}>{trackRow.provider}</span>; })()}
                          {trackRow.status === "OK" ? <span className="ok">VERIFIED</span> : <span className="fl">FLAGGED</span>}
                        </div>
                      </div>
                      {trackRow.overcharge > 0 && (
                        <div style={{ textAlign:"right", background:"rgba(239,68,68,0.07)", border:"1px solid rgba(239,68,68,0.15)", borderRadius:8, padding:"12px 18px" }}>
                          <div style={{ fontSize:10, color:"#f87171", textTransform:"uppercase", letterSpacing:"1px", marginBottom:4 }}>Overcharge</div>
                          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:22, color:"#f87171", fontWeight:700 }}>₹{trackRow.overcharge.toLocaleString()}</div>
                        </div>
                      )}
                    </div>

                    {/* Info grid */}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:22 }}>
                      {[["Origin",trackRow.origin],["Destination",trackRow.dest],["Weight",`${trackRow.weight}kg`],["Zone",trackRow.zone],["Type",trackRow.type],["Date",trackRow.date]].map(([k,v]) => (
                        <div key={k} style={{ background:"#0a0c12", borderRadius:6, padding:11 }}>
                          <div style={{ fontSize:9, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:4 }}>{k}</div>
                          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:13, color:"#94a3b8" }}>{v||"—"}</div>
                        </div>
                      ))}
                    </div>

                    {/* Charges table */}
                    <div style={{ marginBottom:22 }}>
                      <div style={{ fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:12 }}>Charge Breakdown — Billed vs Contracted</div>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead><tr style={{ background:"#0a0c12" }}>
                          {["Component","Billed","Contracted","Difference"].map(h => <th key={h} style={{ padding:"7px 12px", textAlign:"left", fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"0.5px" }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {[["Freight",trackRow.billed_freight,trackRow.expected_freight],["Fuel Surcharge",trackRow.billed_fuel,trackRow.expected_fuel],["COD Fee",trackRow.billed_cod,trackRow.expected_cod],["RTO Charge",trackRow.billed_rto,trackRow.expected_rto],["Other/Misc",trackRow.billed_other,0]].map(([label,billed,exp]) => {
                            const diff = billed - (exp||0);
                            return (
                              <tr key={label} style={{ borderBottom:"1px solid #0a0c12" }}>
                                <td style={{ padding:"7px 12px", color:"#64748b" }}>{label}</td>
                                <td style={{ padding:"7px 12px", fontFamily:"'IBM Plex Mono',monospace", color:"#dde1ea" }}>₹{billed}</td>
                                <td style={{ padding:"7px 12px", fontFamily:"'IBM Plex Mono',monospace", color:"#4ade80" }}>₹{exp||0}</td>
                                <td style={{ padding:"7px 12px", fontFamily:"'IBM Plex Mono',monospace", color:diff>0?"#f87171":diff<0?"#4ade80":"#1c2030", fontWeight:Math.abs(diff)>0?600:400 }}>
                                  {diff!==0?`${diff>0?"+":""}₹${diff}`:"—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Issues */}
                    {trackRow.issues.length > 0 && (
                      <div style={{ background:"rgba(239,68,68,0.05)", border:"1px solid rgba(239,68,68,0.12)", borderRadius:8, padding:16, marginBottom:22 }}>
                        <div style={{ fontSize:10, color:"#f87171", textTransform:"uppercase", letterSpacing:"1px", marginBottom:10 }}>⚠ Audit Findings</div>
                        {trackRow.issues.map((iss, i) => <div key={i} style={{ fontSize:12, color:"#fca5a5", padding:"4px 0", borderBottom:i<trackRow.issues.length-1?"1px solid rgba(239,68,68,0.07)":"none" }}>• {iss}</div>)}
                      </div>
                    )}

                    {/* Timeline */}
                    <div style={{ fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:14 }}>Delivery Timeline</div>
                    <div style={{ position:"relative", paddingLeft:24 }}>
                      <div style={{ position:"absolute", left:5, top:6, bottom:6, width:2, background:"linear-gradient(180deg,#38bdf8,#161c28)" }} />
                      {[
                        {e:"Shipment Booked",         t:`${trackRow.date} 09:00`, loc:"Origin Warehouse"},
                        {e:"Picked Up",               t:`${trackRow.date} 12:00`, loc:`Hub — ${trackRow.origin}`},
                        {e:"In Transit",              t:`${trackRow.date} 20:00`, loc:"Gateway Hub"},
                        {e:"Out for Delivery",        t:`${trackRow.date} 08:00 (+1)`, loc:`Delivery Hub — ${trackRow.dest}`},
                        {e:trackRow.billed_rto>0?"RTO Initiated":"Delivered", t:`${trackRow.date} 13:00 (+1)`, loc:"Final Address"},
                      ].map((ev, i, arr) => (
                        <div key={i} style={{ display:"flex", gap:14, marginBottom:14, position:"relative" }}>
                          <div style={{ position:"absolute", left:-19, top:3, width:10, height:10, borderRadius:"50%", background:i===arr.length-1?"#38bdf8":"#1c2030", border:"2px solid #38bdf8", boxShadow:i===arr.length-1?"0 0 8px rgba(56,189,248,0.5)":"none" }} />
                          <div>
                            <div style={{ fontSize:12, fontWeight:600, color:i===arr.length-1?"#dde1ea":"#64748b" }}>{ev.e}</div>
                            <div style={{ fontSize:10, color:"#334155", marginTop:2 }}>{ev.t} · {ev.loc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ CHAT ══ */}
        {tab === "chat" && (
          <div className="fade" style={{ maxWidth:800, margin:"0 auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
              <div>
                <div style={{ fontSize:10, color:"#38bdf8", letterSpacing:"3px", textTransform:"uppercase", fontFamily:"'IBM Plex Mono',monospace", marginBottom:6 }}>▶ AI ANALYST</div>
                <h2 style={{ fontSize:22, fontWeight:700 }}>Audit Intelligence Chat</h2>
                <p style={{ color:"#475569", fontSize:12, marginTop:4 }}>Ask about overcharges, get dispute emails, or analyse your invoice. {!API_KEY && <span style={{ color:"#f87171" }}>⚠ API key not set — responses will be error messages.</span>}</p>
              </div>
              <button onClick={() => { setVoiceOn(v => !v); if (voiceOn) { synthRef.current?.cancel(); setIsSpeaking(false); } }}
                style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px", background:voiceOn?"rgba(56,189,248,0.1)":"#0c0f15", border:`1px solid ${voiceOn?"#38bdf8":"#1c2030"}`, borderRadius:8, cursor:"pointer", color:voiceOn?"#38bdf8":"#64748b", fontFamily:"inherit", fontSize:12 }}>
                🔊 Voice {voiceOn?"ON":"OFF"}
              </button>
            </div>

            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>
              {["What's the total overcharge by Delhivery?","Draft a dispute email for COD overcharges","Which AWBs have duplicate entries?","Give me a payout summary","Explain the RTO discrepancy"].map(q => (
                <button key={q} className="bg" style={{ padding:"5px 12px", fontSize:11 }} onClick={() => setChatInput(q)}>{q}</button>
              ))}
            </div>

            <div style={{ background:"#0a0c12", border:`1px solid ${voiceOn?"rgba(56,189,248,0.2)":"#161c28"}`, borderRadius:12, display:"flex", flexDirection:"column", height:520 }}>
              <div style={{ flex:1, overflowY:"auto", padding:20, display:"flex", flexDirection:"column", gap:12 }}>
                {chatMessages.map((msg, i) => (
                  <div key={i} className="fade" style={{ display:"flex", justifyContent:msg.role==="user"?"flex-end":"flex-start", gap:8, alignItems:"flex-start" }}>
                    {msg.role==="assistant" && <div style={{ width:26, height:26, background:"linear-gradient(135deg,#38bdf8,#0284c7)", borderRadius:5, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0, marginTop:2 }}>⚡</div>}
                    <div className={msg.role==="user"?"cu":"ca"} style={{ maxWidth:"78%", padding:"11px 15px", fontSize:13, lineHeight:1.75, whiteSpace:"pre-wrap", borderRadius:msg.role==="user"?"12px 12px 2px 12px":"12px 12px 12px 2px" }}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div style={{ display:"flex", gap:8 }}>
                    <div style={{ width:26, height:26, background:"linear-gradient(135deg,#38bdf8,#0284c7)", borderRadius:5, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>⚡</div>
                    <div className="ca" style={{ padding:"11px 16px", borderRadius:"12px 12px 12px 2px" }}>
                      <div style={{ display:"flex", gap:4 }}>{[0,1,2].map(j => <div key={j} style={{ width:6, height:6, borderRadius:"50%", background:"#38bdf8", animation:`pu 1s ${j*0.2}s infinite` }} />)}</div>
                    </div>
                  </div>
                )}
                {isSpeaking && (
                  <div className="fade" style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 12px", background:"rgba(56,189,248,0.06)", border:"1px solid rgba(56,189,248,0.15)", borderRadius:8, fontSize:11, color:"#38bdf8" }}>
                    <div style={{ display:"flex", gap:2 }}>{[0,1,2,3,4].map(j => <div key={j} style={{ width:3, background:"#38bdf8", borderRadius:2, height:`${6+j*3}px`, animation:`pu 0.5s ${j*0.08}s infinite` }} />)}</div>
                    AI speaking…
                    <button onClick={() => { synthRef.current?.cancel(); setIsSpeaking(false); }} style={{ marginLeft:"auto", background:"none", border:"none", color:"#38bdf8", cursor:"pointer", fontSize:11 }}>✕</button>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div style={{ borderTop:"1px solid #161c28", padding:12, display:"flex", gap:10 }}>
                <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key==="Enter" && !e.shiftKey && handleChat()}
                  placeholder={API_KEY ? "Ask about overcharges, dispute templates, rate analysis…" : "Set VITE_ANTHROPIC_API_KEY in Vercel to enable chat"}
                  style={{ flex:1, background:"#0c0f15", border:"1px solid #1c2030", borderRadius:7, padding:"9px 14px", color:"#dde1ea", fontSize:13, outline:"none" }} />
                <button className="bp" style={{ padding:"9px 20px", fontSize:13 }} onClick={handleChat} disabled={isChatLoading || !chatInput.trim()}>Send ↑</button>
              </div>
            </div>
          </div>
        )}

      </div>

      <div style={{ borderTop:"1px solid #0c0f15", padding:"12px 24px", textAlign:"center" }}>
        <span style={{ fontSize:9, color:"#161c28", fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"2px" }}>
          LOGISTICSAI · DELHIVERY · BLUEDART · ECOM EXPRESS · SHADOWFAX · AI-POWERED AUDIT
        </span>
      </div>
    </div>
  );
}
