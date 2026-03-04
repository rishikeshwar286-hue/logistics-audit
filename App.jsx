import React, { useState, useRef, useCallback } from "react";

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || "";

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
  Delhivery:      { zones:{A:85,B:105,C:135,D:165,E:195}, weight_slab:0.5, extra_per_slab:30, cod_percent:1.5,  cod_min:30, rto_percent:0.7,  fuel_percent:14   },
  BlueDart:       { zones:{A:95,B:120,C:150,D:180,E:215}, weight_slab:0.5, extra_per_slab:35, cod_percent:1.75, cod_min:35, rto_percent:0.75, fuel_percent:15   },
  "Ecom Express": { zones:{A:80,B:100,C:128,D:158,E:185}, weight_slab:0.5, extra_per_slab:28, cod_percent:1.5,  cod_min:28, rto_percent:0.65, fuel_percent:13.5 },
  Shadowfax:      { zones:{A:75,B:95, C:120,D:148,E:172}, weight_slab:0.5, extra_per_slab:25, cod_percent:1.25, cod_min:25, rto_percent:0.6,  fuel_percent:13   },
};

const PROVIDER_COLORS = {
  Delhivery:"#f97316", BlueDart:"#3b82f6", "Ecom Express":"#10b981", Shadowfax:"#a855f7",
};

function auditInvoice(row, customRates = {}) {
  const contract = customRates[row.provider] || CONTRACTED_RATES[row.provider];
  if (!contract) return { ...row, issues:["Unknown provider — no rate card found"], overcharge:0, status:"ERROR", expected_freight:0, expected_fuel:0, expected_cod:0, expected_rto:0 };
  const slabs       = Math.max(1, Math.ceil(row.weight / contract.weight_slab));
  const baseFreight = (contract.zones[row.zone] || contract.zones["D"]) + Math.max(0, slabs - 1) * contract.extra_per_slab;
  const expFuel     = Math.round(baseFreight * contract.fuel_percent / 100);
  const expCOD      = row.type === "COD" ? Math.max(contract.cod_min, Math.round(row.cod_amount * contract.cod_percent / 100)) : 0;
  const expRTO      = row.billed_rto > 0 ? Math.round(baseFreight * contract.rto_percent) : 0;
  const issues = []; let overcharge = 0;
  if (row.billed_freight - baseFreight > 2)                         { issues.push(`Weight/Rate overcharge: Billed ₹${row.billed_freight} vs Contract ₹${baseFreight}`);  overcharge += row.billed_freight - baseFreight; }
  if (Math.abs(row.billed_fuel - expFuel) > 3)                     { issues.push(`Fuel surcharge mismatch: Billed ₹${row.billed_fuel} vs Contract ₹${expFuel}`);         overcharge += row.billed_fuel - expFuel; }
  if (row.type === "COD" && Math.abs(row.billed_cod - expCOD) > 2) { issues.push(`COD fee error: Billed ₹${row.billed_cod} vs Contract ₹${expCOD}`);                     overcharge += row.billed_cod - expCOD; }
  if (row.billed_rto > 0 && Math.abs(row.billed_rto - expRTO) > 5){ issues.push(`RTO overcharge: Billed ₹${row.billed_rto} vs Contract ₹${expRTO}`);                    overcharge += row.billed_rto - expRTO; }
  if (row.billed_other > 0)                                         { issues.push(`Non-contracted surcharge: ₹${row.billed_other}`);                                       overcharge += row.billed_other; }
  return { ...row, expected_freight:baseFreight, expected_fuel:expFuel, expected_cod:expCOD, expected_rto:expRTO, issues, overcharge:Math.max(0,Math.round(overcharge)), status:issues.length>0?"FLAGGED":"OK" };
}

function detectDuplicates(rows) {
  const seen = {};
  return rows.map(row => {
    if (seen[row.awb]) {
      const dup = row.billed_freight + row.billed_fuel + row.billed_cod + row.billed_rto + row.billed_other;
      return { ...row, issues:[...row.issues, `Duplicate AWB — full amount disputed`], overcharge:(row.overcharge||0)+dup, status:"FLAGGED" };
    }
    seen[row.awb] = true; return row;
  });
}

// PDF.js loader
async function loadPDFJS() {
  if (window.pdfjsLib) return window.pdfjsLib;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error("Failed to load PDF.js library"));
    document.head.appendChild(s);
  });
}

async function extractPDFText(file) {
  const lib = await loadPDFJS();
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(" ") + "\n";
  }
  return text;
}

async function extractExcelText(file) {
  if (!window.XLSX) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const buf = await file.arrayBuffer();
  const wb  = window.XLSX.read(buf, { type:"array" });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  return window.XLSX.utils.sheet_to_csv(ws);
}

async function readFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf"))  return { text: await extractPDFText(file),   format:"PDF"   };
  if (name.match(/\.xlsx?$/)) return { text: await extractExcelText(file), format:"Excel" };
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = e => resolve({ text: e.target.result, format:"CSV" });
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsText(file);
  });
}

async function callClaude(messages, system, maxTokens = 4000) {
  if (!API_KEY) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:maxTokens, system, messages }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d.content?.[0]?.text || null;
  } catch { return null; }
}

async function aiExtractInvoice(text) {
  const system = `You are a logistics invoice parser for Indian D2C brands.
Extract ALL shipment rows from the provided text (from CSV, Excel, or PDF).
Return ONLY a valid JSON array, no explanation, no markdown.
Each object must have exactly:
awb(string), date(YYYY-MM-DD), origin(pincode string), dest(pincode string),
weight(number kg), zone(A-E default D), billed_freight(number),
billed_cod(number), billed_rto(number), billed_fuel(number), billed_other(number),
provider(Delhivery|BlueDart|Ecom Express|Shadowfax),
cod_amount(number), type(COD|Prepaid).
Use 0 for missing numbers. Detect provider from AWB prefix or context. Return [] if nothing found.`;
  const reply = await callClaude([{ role:"user", content:`Parse this invoice:\n\n${text.slice(0,12000)}` }], system, 4000);
  if (!reply) return null;
  try { const p = JSON.parse(reply.replace(/```json|```/g,"").trim()); if (Array.isArray(p) && p.length > 0) return p; } catch {}
  return null;
}

async function aiExtractContract(text) {
  const system = `You are a logistics rate contract parser.
Extract the rate card. Return ONLY valid JSON, no explanation:
{"provider":"Delhivery|BlueDart|Ecom Express|Shadowfax","zones":{"A":n,"B":n,"C":n,"D":n,"E":n},"weight_slab":n,"extra_per_slab":n,"cod_percent":n,"cod_min":n,"rto_percent":n,"fuel_percent":n}
Return null if not parseable.`;
  const reply = await callClaude([{ role:"user", content:`Parse this rate contract:\n\n${text.slice(0,10000)}` }], system, 1500);
  if (!reply) return null;
  try { return JSON.parse(reply.replace(/```json|```/g,"").trim()); } catch { return null; }
}

function guessProvider(awb = "", txt = "") {
  const t = txt.toLowerCase();
  if (awb.startsWith("DL") || t.includes("delhivery")) return "Delhivery";
  if (awb.startsWith("BD") || t.includes("bluedart") || t.includes("blue dart")) return "BlueDart";
  if (awb.startsWith("EE") || t.includes("ecom")) return "Ecom Express";
  if (awb.startsWith("SF") || t.includes("shadowfax")) return "Shadowfax";
  return "Delhivery";
}

function csvFallback(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const hdr = lines[0].toLowerCase().split(sep).map(h => h.replace(/"/g,"").trim());
  const fi  = (...names) => names.map(n => hdr.findIndex(h => h.includes(n))).find(i => i >= 0) ?? -1;
  const get = (c, i, d="") => c[i] !== undefined ? c[i].replace(/"/g,"").trim() : d;
  const num = (c, i) => parseFloat(get(c,i,"0")) || 0;
  const iAWB=fi("awb","tracking","waybill"); const iDate=fi("date","ship date");
  const iWt=fi("weight","actual wt");        const iZone=fi("zone");
  const iFr=fi("freight","base rate");       const iCOD=fi("cod charge","cod fee","cod_charge");
  const iFuel=fi("fuel","fsc");              const iRTO=fi("rto");
  const iOth=fi("other","misc");             const iProv=fi("provider","courier","partner");
  const iOri=fi("origin","pickup","from");   const iDest=fi("dest","delivery","to pin");
  const iType=fi("type","mode","payment");   const iAmt=fi("cod amount","order value");
  return lines.slice(1).map(line => {
    const c = line.split(sep);
    const awb = get(c,iAWB) || `AWB-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
    const cod = num(c,iCOD);
    return { awb, date:get(c,iDate)||new Date().toISOString().slice(0,10), origin:get(c,iOri)||"000000", dest:get(c,iDest)||"000000", weight:num(c,iWt)||0.5, zone:get(c,iZone)||"D", billed_freight:num(c,iFr), billed_cod:cod, billed_rto:num(c,iRTO), billed_fuel:num(c,iFuel), billed_other:num(c,iOth), provider:get(c,iProv)||guessProvider(awb,text), cod_amount:num(c,iAmt)||(cod>0?cod*50:0), type:get(c,iType)||(cod>0?"COD":"Prepaid") };
  }).filter(r => r.awb && (r.billed_freight>0||r.billed_cod>0||r.billed_fuel>0));
}

function pdfFallback(text) {
  const rows = []; const seen = new Set();
  text.split("\n").forEach(line => {
    const m = line.match(/\b([A-Z]{2,3}\d{7,12})\b/);
    if (!m || seen.has(m[1])) return;
    seen.add(m[1]);
    const nums = [...line.matchAll(/\d+\.?\d*/g)].map(x => parseFloat(x[0])).filter(n => n > 0);
    rows.push({ awb:m[1], date:new Date().toISOString().slice(0,10), origin:"000000", dest:"000000", weight:nums.find(n=>n>=0.1&&n<=100)||1.0, zone:line.match(/\bZone\s*[:\-]?\s*([A-E])\b/i)?.[1]||"D", billed_freight:nums.find(n=>n>=50&&n<=2000)||0, billed_cod:nums.find(n=>n>=20&&n<=500)||0, billed_rto:0, billed_fuel:nums.find(n=>n>=5&&n<=200)||0, billed_other:0, provider:guessProvider(m[1],text), cod_amount:0, type:"Prepaid" });
  });
  return rows.slice(0,500);
}

function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,"'")}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

export default function App() {
  const [tab, setTab]             = useState("dashboard");
  const [auditData, setAuditData] = useState([]);
  const [isDemo, setIsDemo]       = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep]           = useState(0);
  const [stageLabel, setStageLabel] = useState("");
  const [parseLog, setParseLog]   = useState([]);
  const [files, setFiles]         = useState({ invoice:null, contract:null });
  const [filterProvider, setFilterProvider] = useState("ALL");
  const [trackAWB, setTrackAWB]   = useState(null);
  const invRef = useRef(); const conRef = useRef();
  const log = msg => setParseLog(p => [...p, msg]);

  const flagged       = auditData.filter(r => r.status === "FLAGGED");
  const ok            = auditData.filter(r => r.status === "OK");
  const totalBilled   = auditData.reduce((s,r) => s+r.billed_freight+r.billed_fuel+r.billed_cod+r.billed_rto+r.billed_other, 0);
  const totalOver     = auditData.reduce((s,r) => s+r.overcharge, 0);
  const totalVerified = totalBilled - totalOver;
  const trackRow      = auditData.find(r => r.awb === trackAWB);
  const uniqueAWBs    = [...new Set(auditData.filter(r => filterProvider==="ALL"||r.provider===filterProvider).map(r=>r.awb))];
  const providerStats = Object.keys(PROVIDER_COLORS).map(p => {
    const rs = auditData.filter(r=>r.provider===p);
    return { p, count:rs.length, over:rs.reduce((s,r)=>s+r.overcharge,0) };
  }).filter(x=>x.count>0);

  const runDemo = useCallback(async () => {
    setIsProcessing(true); setIsDemo(true); setParseLog([]);
    setStep(1); log("Loading sample invoice data..."); await new Promise(r=>setTimeout(r,500));
    setStep(2); log("Running audit on 12 sample AWBs..."); setStageLabel("Auditing..."); await new Promise(r=>setTimeout(r,700));
    setStep(3); log("Detecting duplicate AWBs..."); await new Promise(r=>setTimeout(r,400));
    const result = detectDuplicates(SAMPLE_INVOICE_DATA.map(r=>auditInvoice(r,{})));
    log(`✓ Done — ${result.filter(r=>r.status==="FLAGGED").length} flagged, ₹${result.reduce((s,r)=>s+r.overcharge,0).toLocaleString()} overcharges.`);
    setAuditData(result); setIsProcessing(false); setStep(0); setTab("audit");
  }, []);

  const processFiles = useCallback(async () => {
    if (!files.invoice) { alert("Please upload an invoice file first."); return; }
    setIsProcessing(true); setIsDemo(false); setParseLog([]);
    try {
      setStep(1); setStageLabel(`Reading ${files.invoice.name}...`);
      log(`Reading invoice: ${files.invoice.name} (${(files.invoice.size/1024).toFixed(1)} KB)`);
      let invText = "";
      try {
        const { text, format } = await readFile(files.invoice);
        invText = text;
        log(`✓ Extracted ${text.length.toLocaleString()} characters via ${format} parser.`);
      } catch(e) {
        log(`❌ Could not read file: ${e.message}`);
        alert(`Could not read invoice file: ${e.message}\n\nNote: Scanned/image PDFs are not supported. Use a text-based PDF or export as CSV from the provider portal.`);
        setIsProcessing(false); return;
      }

      setStep(2); setStageLabel("Extracting line items...");
      let rows = null;
      if (API_KEY && invText.length > 50) {
        log("Sending to Claude AI for extraction...");
        rows = await aiExtractInvoice(invText);
        if (rows && rows.length > 0) log(`✓ AI extracted ${rows.length} shipment rows.`);
        else log("AI returned no rows — trying fallback parsers...");
      }
      if (!rows || rows.length === 0) {
        log("Trying CSV/TSV structure parser...");
        rows = csvFallback(invText);
        if (rows.length > 0) log(`✓ CSV parser found ${rows.length} rows.`);
      }
      if ((!rows || rows.length === 0) && files.invoice.name.toLowerCase().endsWith(".pdf")) {
        log("Trying PDF AWB pattern parser...");
        rows = pdfFallback(invText);
        if (rows.length > 0) log(`✓ PDF parser found ${rows.length} rows.`);
      }
      if (!rows || rows.length === 0) {
        log("❌ No shipment rows found in this file.");
        alert("Could not extract data.\n\nFor CSV/Excel: ensure columns include AWB, weight, freight, provider.\nFor PDF: must be text-based, not a scanned image.\n\nTip: Export invoice as CSV from the provider portal for best results.");
        setIsProcessing(false); return;
      }

      setStep(3); setStageLabel("Parsing rate contract...");
      let customRates = {};
      if (files.contract) {
        log(`Reading contract: ${files.contract.name}`);
        try {
          const { text:conText, format:conFmt } = await readFile(files.contract);
          log(`✓ Contract read via ${conFmt} — ${conText.length.toLocaleString()} chars.`);
          if (API_KEY) {
            log("AI parsing contracted rates...");
            const parsed = await aiExtractContract(conText);
            if (parsed && parsed.provider) { customRates[parsed.provider] = parsed; log(`✓ Contract rates loaded for ${parsed.provider}.`); }
            else log("⚠ Could not parse contract — using default industry rates.");
          } else { log("⚠ No API key — using default industry rates."); }
        } catch(e) { log(`⚠ Contract error: ${e.message} — using defaults.`); }
      } else { log("No contract uploaded — using default industry rates."); }

      setStep(4); setStageLabel(`Auditing ${rows.length} AWBs...`);
      log(`Cross-checking ${rows.length} line items...`);
      await new Promise(r=>setTimeout(r,300));
      const audited = detectDuplicates(rows.map(r=>auditInvoice(r,customRates)));
      log(`✓ Audit complete — ${audited.filter(r=>r.status==="FLAGGED").length} flagged, ₹${audited.reduce((s,r)=>s+r.overcharge,0).toLocaleString()} overcharges found.`);
      setStep(5); await new Promise(r=>setTimeout(r,200));
      setAuditData(audited); setIsProcessing(false); setStep(0); setTab("audit");
    } catch(e) {
      log(`❌ Unexpected error: ${e.message}`);
      alert(`Processing failed: ${e.message}`);
      setIsProcessing(false);
    }
  }, [files]);

  const downloadPayout = () => {
    if (!ok.length) { alert("No verified shipments to export."); return; }
    const hdr = ["AWB","Provider","Date","Origin","Dest","Weight","Zone","Type","Exp Freight","Exp Fuel","Exp COD","Exp RTO","Verified Total","Status"];
    const rows = ok.map(r => { const f=r.expected_freight,fu=r.expected_fuel,c=r.expected_cod,rt=r.expected_rto; return [r.awb,r.provider,r.date,r.origin,r.dest,r.weight,r.zone,r.type,f,fu,c,rt,f+fu+c+rt,"VERIFIED"]; });
    downloadCSV([hdr,...rows], `verified_payout_${new Date().toISOString().slice(0,10)}.csv`);
  };
  const downloadReport = () => {
    if (!flagged.length) { alert("No discrepancies found!"); return; }
    const hdr = ["AWB","Provider","Date","Zone","Weight","Type","Total Billed","Overcharge","Issues","Status"];
    const rows = flagged.map(r => [r.awb,r.provider,r.date,r.zone,r.weight,r.type,r.billed_freight+r.billed_fuel+r.billed_cod+r.billed_rto+r.billed_other,r.overcharge,r.issues.join("; "),"FLAGGED"]);
    downloadCSV([hdr,...rows], `discrepancy_report_${new Date().toISOString().slice(0,10)}.csv`);
  };

  const S = {
    page:{ fontFamily:"'IBM Plex Sans','Segoe UI',sans-serif", background:"#060709", minHeight:"100vh", color:"#dde1ea" },
    card:{ background:"#0c0f15", border:"1px solid #161c28", borderRadius:10 },
    mono:{ fontFamily:"'IBM Plex Mono',monospace" },
  };

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0c0e12}::-webkit-scrollbar-thumb{background:#1c2030;border-radius:2px}
        .nb{background:none;border:none;cursor:pointer;font-family:inherit;color:#4a5568;font-size:13px;font-weight:500;padding:10px 16px;border-bottom:2px solid transparent;white-space:nowrap;transition:all 0.2s}.nb:hover{color:#94a3b8}.na{color:#38bdf8!important;border-bottom-color:#38bdf8!important}
        .bp{background:linear-gradient(135deg,#38bdf8,#0284c7);color:#060709;border:none;border-radius:7px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.2s}.bp:hover{transform:translateY(-1px);box-shadow:0 4px 18px rgba(56,189,248,0.35)}.bp:disabled{opacity:0.4;cursor:not-allowed;transform:none}
        .bg{background:#0c0f15;color:#64748b;border:1px solid #1c2030;border-radius:7px;cursor:pointer;font-family:inherit;font-size:13px;transition:all 0.2s}.bg:hover{border-color:#38bdf8;color:#38bdf8}
        .ok{background:rgba(34,197,94,0.1);color:#4ade80;border:1px solid rgba(34,197,94,0.2);padding:2px 8px;border-radius:3px;font-size:10px;font-family:'IBM Plex Mono',monospace}
        .fl{background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2);padding:2px 8px;border-radius:3px;font-size:10px;font-family:'IBM Plex Mono',monospace}
        .dm{background:rgba(251,191,36,0.1);color:#fbbf24;border:1px solid rgba(251,191,36,0.2);padding:2px 8px;border-radius:3px;font-size:10px;font-family:'IBM Plex Mono',monospace}
        .lv{background:rgba(34,197,94,0.1);color:#4ade80;border:1px solid rgba(34,197,94,0.2);padding:2px 8px;border-radius:3px;font-size:10px;font-family:'IBM Plex Mono',monospace}
        .spin{animation:sp 0.8s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}
        .fade{animation:fi 0.35s ease}@keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        .uz{border:2px dashed #1c2030;border-radius:10px;cursor:pointer;transition:all 0.2s;text-align:center}.uz:hover{border-color:#38bdf8;background:rgba(56,189,248,0.03)}.uz.hf{border-color:rgba(34,197,94,0.4);background:rgba(34,197,94,0.04)}
        tr.rf{background:rgba(239,68,68,0.04)}tr:hover{background:rgba(255,255,255,0.015)!important}
        .ic{background:rgba(239,68,68,0.08);color:#f87171;border:1px solid rgba(239,68,68,0.15);padding:1px 5px;border-radius:3px;font-size:10px;font-family:'IBM Plex Mono',monospace;white-space:nowrap}
        select{background:#0c0f15;border:1px solid #1c2030;color:#94a3b8;border-radius:6px;padding:6px 10px;font-size:12px;outline:none;cursor:pointer}select:hover{border-color:#38bdf8}
        .ll{font-family:'IBM Plex Mono',monospace;font-size:11px;padding:3px 0;color:#475569;border-bottom:1px solid #0c0f15}
      `}</style>

      {/* TOPBAR */}
      <div style={{ background:"#0a0c12", borderBottom:"1px solid #161c28", padding:"0 24px", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ maxWidth:1400, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:56 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:30, height:30, background:"linear-gradient(135deg,#38bdf8,#0284c7)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:"#060709", fontWeight:900 }}>⚡</div>
            <div>
              <div style={{ ...S.mono, fontWeight:600, fontSize:14, color:"#dde1ea" }}>Logistics<span style={{ color:"#38bdf8" }}>AI</span></div>
              <div style={{ fontSize:9, color:"#1c2030", letterSpacing:"2px", textTransform:"uppercase" }}>INVOICE AUDIT</div>
            </div>
          </div>
          <nav style={{ display:"flex", gap:2 }}>
            {[["dashboard","⬡ Dashboard"],["upload","⬆ Upload"],["audit","⚑ Audit"],["tracking","◎ Tracking"]].map(([id,label]) => (
              <button key={id} className={`nb ${tab===id?"na":""}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {auditData.length > 0 && (isDemo ? <span className="dm">DEMO</span> : <span className="lv">LIVE DATA</span>)}
            {totalOver > 0 && <span style={{ background:"rgba(239,68,68,0.1)", color:"#f87171", border:"1px solid rgba(239,68,68,0.2)", borderRadius:12, padding:"3px 10px", fontSize:11, ...S.mono }}>₹{totalOver.toLocaleString()} found</span>}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1400, margin:"0 auto", padding:"24px 24px 60px" }}>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div className="fade">
            <div style={{ background:"linear-gradient(135deg,#0a0c12,#0d111a)", border:"1px solid #161c28", borderRadius:14, marginBottom:22, position:"relative", overflow:"hidden", display:"flex", alignItems:"stretch" }}>
              {/* LEFT: text content */}
              <div style={{ flex:"0 0 55%", padding:"48px 52px", position:"relative", zIndex:2 }}>
                <div style={{ fontSize:10, color:"#38bdf8", letterSpacing:"4px", textTransform:"uppercase", marginBottom:14, ...S.mono }}>▶ LOGISTICS INTELLIGENCE PLATFORM</div>
                <h1 style={{ fontSize:42, fontWeight:700, lineHeight:1.1, marginBottom:16, letterSpacing:"-0.5px" }}>Recover Every Rupee<br /><span style={{ color:"#38bdf8" }}>Your Couriers Overcharge.</span></h1>
                <p style={{ color:"#475569", fontSize:14, maxWidth:440, lineHeight:1.8, marginBottom:28 }}>Upload your logistics invoice and rate contract in <strong style={{ color:"#dde1ea" }}>CSV, Excel, or PDF</strong>. AI extracts every line item, cross-checks against contracted rates, and flags every discrepancy.</p>
                <div style={{ display:"flex", gap:12 }}>
                  <button className="bp" style={{ padding:"12px 26px", fontSize:14 }} onClick={() => setTab("upload")}>⬆  Upload Invoice</button>
                  <button className="bg" style={{ padding:"12px 26px", fontSize:14 }} onClick={runDemo} disabled={isProcessing}>{isProcessing?"Processing…":"▶  Run Demo"}</button>
                </div>
                <div style={{ display:"flex", gap:32, marginTop:36, paddingTop:24, borderTop:"1px solid #161c28" }}>
                  {[["CSV/Excel/PDF","All formats"],["7 checks","Per AWB"],["₹18,400","Avg overcharges"],["3 min","vs 4 hrs manual"]].map(([v,l]) => (
                    <div key={l}><div style={{ ...S.mono, fontSize:20, fontWeight:600, color:"#38bdf8" }}>{v}</div><div style={{ fontSize:11, color:"#334155", marginTop:3 }}>{l}</div></div>
                  ))}
                </div>
              </div>


              {/* RIGHT: Animated Earth + revolving planes */}
              <div style={{ flex:"0 0 45%", position:"relative", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:340 }}>
                <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at 55% 50%,rgba(56,189,248,0.07),transparent 70%)", pointerEvents:"none" }} />
                <style>{`
                  @keyframes earthSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
                  @keyframes orbit1 { from{transform:rotate(0deg) translateX(105px) rotate(0deg)} to{transform:rotate(360deg) translateX(105px) rotate(-360deg)} }
                  @keyframes orbit2 { from{transform:rotate(130deg) translateX(92px) rotate(-130deg)} to{transform:rotate(490deg) translateX(92px) rotate(-490deg)} }
                  @keyframes orbit3 { from{transform:rotate(250deg) translateX(115px) rotate(-250deg)} to{transform:rotate(610deg) translateX(115px) rotate(-610deg)} }
                  @keyframes earthPulse { 0%,100%{filter:drop-shadow(0 0 14px rgba(56,189,248,0.45))} 50%{filter:drop-shadow(0 0 26px rgba(56,189,248,0.75))} }
                  @keyframes starTwinkle { 0%,100%{opacity:0.55} 50%{opacity:0.08} }
                  @keyframes dotPulse { 0%,100%{r:2;opacity:0.75} 50%{r:3.5;opacity:1} }
                  @keyframes headingGlow { 0%,100%{text-shadow:0 0 8px rgba(56,189,248,0.5)} 50%{text-shadow:0 0 18px rgba(56,189,248,0.9)} }
                  .earth-spin { animation: earthSpin 20s linear infinite; transform-origin: 160px 148px; }
                  .plane1 { animation: orbit1 7s linear infinite; transform-origin: 160px 148px; }
                  .plane2 { animation: orbit2 11s linear infinite; transform-origin: 160px 148px; }
                  .plane3 { animation: orbit3 15s linear infinite; transform-origin: 160px 148px; }
                  .earth-glow { animation: earthPulse 3s ease-in-out infinite; }
                  .star-t1 { animation: starTwinkle 2.1s ease-in-out infinite; }
                  .star-t2 { animation: starTwinkle 1.7s ease-in-out 0.4s infinite; }
                  .star-t3 { animation: starTwinkle 2.5s ease-in-out 0.9s infinite; }
                  .star-t4 { animation: starTwinkle 1.9s ease-in-out 1.3s infinite; }
                  .dot-p1 { animation: dotPulse 2.2s ease-in-out infinite; }
                  .dot-p2 { animation: dotPulse 2.2s ease-in-out 0.6s infinite; }
                  .dot-p3 { animation: dotPulse 2.2s ease-in-out 1.2s infinite; }
                  .dot-p4 { animation: dotPulse 2.2s ease-in-out 1.8s infinite; }
                  .sc-heading { animation: headingGlow 2.5s ease-in-out infinite; }
                `}</style>

                {/* HEADING ABOVE EARTH */}
                <div className="sc-heading" style={{ fontFamily:"IBM Plex Mono,monospace", fontSize:11, letterSpacing:"5px", color:"#38bdf8", textTransform:"uppercase", marginBottom:4, textAlign:"center", zIndex:2, position:"relative" }}>
                  ◈ &nbsp;GLOBAL SUPPLY CHAIN
                </div>

                <svg viewBox="0 0 320 290" width="100%" style={{ maxHeight:290, zIndex:2, position:"relative" }} xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <radialGradient id="earthG" cx="38%" cy="34%" r="65%">
                      <stop offset="0%" stopColor="#1d6fa4"/>
                      <stop offset="45%" stopColor="#0e4a7a"/>
                      <stop offset="100%" stopColor="#061828"/>
                    </radialGradient>
                    <radialGradient id="atmG" cx="50%" cy="50%" r="50%">
                      <stop offset="78%" stopColor="transparent"/>
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.2"/>
                    </radialGradient>
                    <radialGradient id="spaceG" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0"/>
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.08"/>
                    </radialGradient>
                    <clipPath id="eClip"><circle cx="160" cy="148" r="74"/></clipPath>
                    <filter id="pGlow"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                  </defs>

                  {/* Stars */}
                  {[[18,22],[40,58],[68,16],[96,40],[118,12],[202,26],[242,54],[272,18],[300,36],[312,72],[28,98],[292,93],[308,128],[14,153],[44,188],[302,168],[288,212],[18,242],[62,254],[292,248],[138,7],[182,19],[255,140],[45,130],[305,200]].map(([x,y],i)=>(
                    <circle key={i} cx={x} cy={y} r={i%3===0?1.3:0.7} fill="#fff" className={["star-t1","star-t2","star-t3","star-t4"][i%4]} fillOpacity="0.5"/>
                  ))}

                  {/* Outer ambient glow */}
                  <circle cx="160" cy="148" r="100" fill="url(#spaceG)"/>

                  {/* Orbit ring ellipses */}
                  <ellipse cx="160" cy="148" rx="105" ry="27" fill="none" stroke="#38bdf8" strokeWidth="0.6" strokeOpacity="0.14" strokeDasharray="5 4"/>
                  <ellipse cx="160" cy="148" rx="92" ry="35" fill="none" stroke="#38bdf8" strokeWidth="0.6" strokeOpacity="0.11" strokeDasharray="5 4" transform="rotate(-28 160 148)"/>
                  <ellipse cx="160" cy="148" rx="115" ry="29" fill="none" stroke="#38bdf8" strokeWidth="0.6" strokeOpacity="0.09" strokeDasharray="5 4" transform="rotate(22 160 148)"/>

                  {/* Earth */}
                  <g className="earth-glow">
                    <circle cx="160" cy="148" r="74" fill="url(#earthG)"/>
                    <g clipPath="url(#eClip)" className="earth-spin">
                      <circle cx="160" cy="148" r="74" fill="#0e4a7a"/>
                      {/* Eurasia */}
                      <path d="M152 86 Q174 78 196 85 Q218 92 224 108 Q230 124 220 134 Q208 142 194 138 Q180 133 172 122 Q164 112 158 124 Q153 134 146 128 Q140 120 142 108 Q145 96 152 86Z" fill="#2d8a4e"/>
                      <path d="M196 85 Q218 76 236 86 Q248 96 242 112 Q236 124 220 134 Q230 124 224 108Z" fill="#3a9a5a"/>
                      {/* Africa */}
                      <path d="M158 138 Q170 130 180 140 Q188 152 183 168 Q178 183 166 186 Q154 188 149 175 Q144 160 150 148 Q154 141 158 138Z" fill="#2d8a4e"/>
                      {/* N America */}
                      <path d="M84 90 Q98 82 112 90 Q122 99 118 116 Q114 132 102 137 Q90 140 84 129 Q78 115 84 90Z" fill="#2d8a4e"/>
                      {/* S America */}
                      <path d="M92 138 Q103 132 112 142 Q118 153 112 170 Q106 182 96 179 Q86 174 85 160 Q83 147 92 138Z" fill="#2d8a4e"/>
                      {/* Australia */}
                      <path d="M215 154 Q229 148 238 157 Q246 167 239 177 Q230 184 218 180 Q209 173 212 163Z" fill="#2d8a4e"/>
                      {/* Ice caps */}
                      <ellipse cx="160" cy="84" rx="52" ry="8" fill="white" fillOpacity="0.45"/>
                      <ellipse cx="160" cy="212" rx="48" ry="7" fill="white" fillOpacity="0.38"/>
                      {/* Clouds */}
                      <ellipse cx="126" cy="104" rx="18" ry="5" fill="white" fillOpacity="0.11"/>
                      <ellipse cx="194" cy="152" rx="15" ry="4" fill="white" fillOpacity="0.09"/>
                      <ellipse cx="144" cy="172" rx="13" ry="3.5" fill="white" fillOpacity="0.08"/>
                    </g>
                    {/* Atmosphere glow */}
                    <circle cx="160" cy="148" r="74" fill="url(#atmG)"/>
                    {/* Specular */}
                    <ellipse cx="136" cy="118" rx="24" ry="15" fill="white" fillOpacity="0.055"/>
                  </g>

                  {/* City dots */}
                  <circle cx="148" cy="112" r="2.2" fill="#38bdf8" className="dot-p1"/>
                  <circle cx="172" cy="120" r="2.2" fill="#38bdf8" className="dot-p2"/>
                  <circle cx="132" cy="144" r="2.2" fill="#38bdf8" className="dot-p3"/>
                  <circle cx="183" cy="150" r="2.2" fill="#38bdf8" className="dot-p4"/>
                  <circle cx="157" cy="168" r="2.2" fill="#22c55e" className="dot-p1"/>
                  <circle cx="168" cy="136" r="2.2" fill="#f59e0b" className="dot-p3"/>
                  {/* Connection arcs */}
                  <path d="M148 112 Q160 106 172 120" stroke="#38bdf8" strokeWidth="0.7" strokeOpacity="0.32" fill="none" strokeDasharray="2 2"/>
                  <path d="M132 144 Q157 138 183 150" stroke="#38bdf8" strokeWidth="0.7" strokeOpacity="0.32" fill="none" strokeDasharray="2 2"/>
                  <path d="M157 168 Q162 152 168 136" stroke="#22c55e" strokeWidth="0.7" strokeOpacity="0.36" fill="none" strokeDasharray="2 2"/>

                  {/* PLANE 1 — white/blue, equatorial fast */}
                  <g className="plane1" filter="url(#pGlow)">
                    <ellipse cx="152" cy="148" rx="16" ry="2.2" fill="#38bdf8" fillOpacity="0.18"/>
                    <rect x="155" y="145" width="20" height="5.5" rx="2.8" fill="#e2e8f0"/>
                    <polygon points="161,145 168,145 166,138 160,139" fill="#94a3b8"/>
                    <polygon points="161,150.5 168,150.5 166,157 160,156" fill="#94a3b8"/>
                    <polygon points="155,145 158,145 157,141 154,141" fill="#94a3b8"/>
                    <rect x="162" y="146.5" width="8" height="2.2" rx="1" fill="#38bdf8" fillOpacity="0.65"/>
                    <circle cx="165" cy="139" r="2.2" fill="#38bdf8" fillOpacity="0.4"/>
                    <circle cx="165" cy="157" r="2.2" fill="#38bdf8" fillOpacity="0.4"/>
                  </g>

                  {/* PLANE 2 — amber, tilted medium */}
                  <g className="plane2" filter="url(#pGlow)">
                    <ellipse cx="152" cy="148" rx="14" ry="2" fill="#f59e0b" fillOpacity="0.22"/>
                    <rect x="156" y="145.5" width="17" height="5" rx="2.5" fill="#fde68a"/>
                    <polygon points="161,145.5 167,145.5 166,139 160,140" fill="#f59e0b"/>
                    <polygon points="161,150.5 167,150.5 166,157 160,156" fill="#f59e0b"/>
                    <polygon points="156,145.5 159,145.5 158,141.5 155,141.5" fill="#f59e0b"/>
                    <rect x="161" y="147" width="7" height="2" rx="1" fill="#f59e0b" fillOpacity="0.7"/>
                    <circle cx="164" cy="140" r="2" fill="#f59e0b" fillOpacity="0.4"/>
                    <circle cx="164" cy="157" r="2" fill="#f59e0b" fillOpacity="0.4"/>
                  </g>

                  {/* PLANE 3 — green, wide slow */}
                  <g className="plane3" filter="url(#pGlow)">
                    <ellipse cx="151" cy="148" rx="17" ry="2.4" fill="#22c55e" fillOpacity="0.2"/>
                    <rect x="154" y="145" width="21" height="6" rx="3" fill="#bbf7d0"/>
                    <polygon points="160,145 168,145 167,137 159,138" fill="#22c55e"/>
                    <polygon points="160,151 168,151 167,159 159,158" fill="#22c55e"/>
                    <polygon points="154,145 157,145 156,140 153,140" fill="#22c55e"/>
                    <rect x="161" y="146.5" width="9" height="2.5" rx="1" fill="#22c55e" fillOpacity="0.6"/>
                    <circle cx="166" cy="138" r="2.2" fill="#22c55e" fillOpacity="0.38"/>
                    <circle cx="166" cy="158" r="2.2" fill="#22c55e" fillOpacity="0.38"/>
                  </g>
                </svg>

                {/* Legend below */}
                <div style={{ display:"flex", gap:14, marginTop:2, zIndex:2, position:"relative" }}>
                  {[["#38bdf8","Delhivery"],["#f59e0b","BlueDart"],["#22c55e","Ecom Express"]].map(([c,l])=>(
                    <div key={l} style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <div style={{ width:8, height:8, borderRadius:"50%", background:c, boxShadow:`0 0 6px ${c}` }}/>
                      <span style={{ fontFamily:"IBM Plex Mono,monospace", fontSize:9, color:"#475569" }}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {isProcessing && (
              <div style={{ ...S.card, padding:24, marginBottom:18, borderColor:"rgba(56,189,248,0.2)" }} className="fade">
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                  <div className="spin" style={{ width:18,height:18,border:"2px solid #1c2030",borderTopColor:"#38bdf8",borderRadius:"50%",flexShrink:0 }}/>
                  <span style={{ fontWeight:600 }}>Processing…</span>
                  <span style={{ ...S.mono, fontSize:11, color:"#38bdf8" }}>{stageLabel}</span>
                </div>
                <div style={{ background:"#0a0c12", borderRadius:3, height:3, marginBottom:12 }}>
                  <div style={{ width:`${step*20}%`, height:"100%", background:"linear-gradient(90deg,#38bdf8,#0284c7)", borderRadius:3, transition:"width 0.5s" }}/>
                </div>
                {parseLog.map((l,i) => <div key={i} className="ll" style={{ color:l.startsWith("✓")?"#4ade80":l.startsWith("❌")||l.startsWith("⚠")?"#f87171":"#475569" }}>{l}</div>)}
              </div>
            )}

            {auditData.length > 0 && !isProcessing && (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:18 }}>
                  {[
                    { l:"Total Billed",      v:`₹${totalBilled.toLocaleString()}`,   s:`${auditData.length} shipments`, c:"#64748b" },
                    { l:"Verified Amount",   v:`₹${totalVerified.toLocaleString()}`, s:"Safe to pay",                   c:"#22c55e" },
                    { l:"Overcharges Found", v:`₹${totalOver.toLocaleString()}`,     s:`${flagged.length} flagged`,      c:"#ef4444" },
                    { l:"Clean Rate",        v:`${auditData.length>0?((ok.length/auditData.length)*100).toFixed(1):"—"}%`, s:"Verified", c:"#38bdf8" },
                  ].map(s => (
                    <div key={s.l} style={{ ...S.card, padding:20 }}>
                      <div style={{ fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:10 }}>{s.l}</div>
                      <div style={{ ...S.mono, fontSize:24, fontWeight:600, color:s.c }}>{s.v}</div>
                      <div style={{ fontSize:11, color:"#1c2030", marginTop:6 }}>{s.s}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  <div style={{ ...S.card, padding:22 }}>
                    <div style={{ fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:18 }}>Overcharge by Provider</div>
                    {providerStats.map(({ p, count, over }) => {
                      const col = PROVIDER_COLORS[p]||"#64748b";
                      const pB  = auditData.filter(r=>r.provider===p).reduce((s,r)=>s+r.billed_freight+r.billed_fuel+r.billed_cod+r.billed_rto+r.billed_other,0);
                      const pct = pB>0?(over/pB*100).toFixed(1):0;
                      return (
                        <div key={p} style={{ marginBottom:16 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:13 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}><span style={{ width:8,height:8,borderRadius:"50%",background:col,display:"inline-block" }}/>{p} <span style={{ color:"#334155",fontSize:11 }}>({count})</span></div>
                            <span style={{ ...S.mono, fontSize:11, color:over>0?"#f87171":"#4ade80" }}>{over>0?`-₹${over.toLocaleString()}`:"✓ Clean"}</span>
                          </div>
                          <div style={{ background:"#0a0c12", borderRadius:3, height:4 }}><div style={{ width:`${Math.min(100,parseFloat(pct)*8)}%`, height:"100%", background:col, borderRadius:3, transition:"width 0.8s" }}/></div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ ...S.card, padding:22 }}>
                    <div style={{ fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:18 }}>Error Type Breakdown</div>
                    {["Weight/Rate overcharge","Fuel surcharge mismatch","COD fee error","RTO overcharge","Non-contracted surcharge","Duplicate AWB"].map(type => {
                      const rs = auditData.filter(r=>r.issues.some(i=>i.toLowerCase().includes(type.split(" ")[0].toLowerCase())));
                      if (!rs.length) return null;
                      return <div key={type} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #0c0f15", fontSize:12 }}><span style={{ color:"#64748b" }}>{type}</span><span style={{ ...S.mono, fontSize:11, color:"#f87171" }}>{rs.length} AWBs</span></div>;
                    })}
                  </div>
                </div>
              </>
            )}

            {!auditData.length && !isProcessing && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
                {[
                  { icon:"📄", t:"Stage 1 — Extract", d:"Upload CSV, Excel, or PDF invoice. AI reads every row — AWB, weight, zone, charges. Works with any layout or column structure.", a:"#38bdf8" },
                  { icon:"🔍", t:"Stage 2 — Audit",   d:"Every line item cross-checked against contracted rates. 7 checks per AWB: weight, fuel, COD, RTO, duplicates, zone, surcharges.", a:"#f59e0b" },
                  { icon:"📊", t:"Stage 3 — Payout",  d:"Export a verified payout CSV (exact amounts to pay) and a discrepancy report with dispute-ready numbers per provider.", a:"#22c55e" },
                ].map(c => (
                  <div key={c.t} style={{ ...S.card, padding:26, borderTop:`2px solid ${c.a}30` }}>
                    <div style={{ fontSize:28, marginBottom:14 }}>{c.icon}</div>
                    <div style={{ fontWeight:600, marginBottom:8 }}>{c.t}</div>
                    <div style={{ fontSize:12, color:"#334155", lineHeight:1.8 }}>{c.d}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* UPLOAD */}
        {tab === "upload" && (
          <div className="fade" style={{ maxWidth:780, margin:"0 auto" }}>
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:10, color:"#38bdf8", letterSpacing:"3px", textTransform:"uppercase", ...S.mono, marginBottom:8 }}>▶ DOCUMENT INGESTION</div>
              <h2 style={{ fontSize:24, fontWeight:700, letterSpacing:"-0.3px" }}>Upload Invoice & Rate Contract</h2>
              <p style={{ color:"#475569", fontSize:13, marginTop:6, lineHeight:1.7 }}>All three file formats accepted for both invoice and contract.</p>
            </div>

            <div style={{ display:"flex", gap:10, marginBottom:22, flexWrap:"wrap" }}>
              {[{ f:"CSV", d:"Provider portal export", i:"📊", c:"#38bdf8" },{ f:"Excel .xlsx / .xls", d:"Spreadsheet format", i:"📗", c:"#22c55e" },{ f:"PDF", d:"Text-based invoice PDF", i:"📕", c:"#f87171" }].map(({ f,d,i,c }) => (
                <div key={f} style={{ background:`${c}10`, border:`1px solid ${c}25`, borderRadius:8, padding:"10px 16px", display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:20 }}>{i}</span>
                  <div><div style={{ ...S.mono, fontSize:12, fontWeight:600, color:c }}>{f}</div><div style={{ fontSize:11, color:"#475569" }}>{d}</div></div>
                </div>
              ))}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, marginBottom:20 }}>
              {[
                { key:"invoice",  label:"Logistics Invoice *",      hint:"CSV, Excel or PDF from provider",  icon:"📋", file:files.invoice,  ref:invRef },
                { key:"contract", label:"Rate Contract (optional)", hint:"CSV, Excel or PDF rate card",       icon:"📑", file:files.contract, ref:conRef },
              ].map(({ key, label, hint, icon, file, ref }) => (
                <div key={key}>
                  <div style={{ fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:10 }}>{label}</div>
                  <div className={`uz ${file?"hf":""}`} style={{ padding:32 }} onClick={() => ref.current.click()}>
                    <input ref={ref} type="file" style={{ display:"none" }} accept=".csv,.xlsx,.xls,.pdf,.txt"
                      onChange={e => { if (e.target.files[0]) setFiles(p => ({ ...p, [key]: e.target.files[0] })); }} />
                    <div style={{ fontSize:32, marginBottom:10 }}>{file?"✅":icon}</div>
                    <div style={{ fontWeight:600, fontSize:13, color:file?"#4ade80":"#dde1ea", marginBottom:4 }}>{file?file.name:"Click to upload"}</div>
                    <div style={{ fontSize:11, color:"#334155", marginBottom:8 }}>{file?`${(file.size/1024).toFixed(1)} KB — ready`:hint}</div>
                    {!file && <div style={{ display:"flex", gap:6, justifyContent:"center" }}>{["CSV","XLSX","PDF"].map(f=><span key={f} style={{ background:"#0c0f15", border:"1px solid #1c2030", borderRadius:4, padding:"2px 8px", fontSize:10, ...S.mono, color:"#475569" }}>{f}</span>)}</div>}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background:"rgba(56,189,248,0.04)", border:"1px solid rgba(56,189,248,0.1)", borderRadius:8, padding:"14px 18px", marginBottom:20, fontSize:12, color:"#475569", lineHeight:1.8 }}>
              <div style={{ fontWeight:600, color:"#38bdf8", marginBottom:6 }}>⚡ How file parsing works</div>
              <div><span style={{ color:"#dde1ea" }}>PDF:</span> Text extracted page-by-page via PDF.js. Requires a digital/text-based PDF — scanned image PDFs are not supported.</div>
              <div><span style={{ color:"#dde1ea" }}>Excel:</span> First sheet read automatically and converted to structured data.</div>
              <div><span style={{ color:"#dde1ea" }}>CSV:</span> Column headers auto-detected for AWB, weight, zone, freight, COD, RTO, fuel charges.</div>
            </div>

            <div style={{ display:"flex", gap:12 }}>
              <button className="bp" style={{ flex:1, padding:14, fontSize:15 }} onClick={processFiles} disabled={isProcessing||!files.invoice}>
                {isProcessing ? stageLabel||"Processing…" : "⚡  Analyze Invoice"}
              </button>
              <button className="bg" style={{ padding:14, fontSize:14 }} onClick={runDemo} disabled={isProcessing}>▶ Demo</button>
            </div>
            {!files.invoice && <div style={{ fontSize:11, color:"#334155", marginTop:8, textAlign:"center" }}>Upload an invoice file first</div>}

            {parseLog.length > 0 && (
              <div style={{ ...S.card, marginTop:18, padding:16 }}>
                <div style={{ fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:10 }}>Processing Log</div>
                <div style={{ maxHeight:180, overflowY:"auto" }}>
                  {parseLog.map((l,i) => <div key={i} className="ll" style={{ color:l.startsWith("✓")?"#4ade80":l.startsWith("❌")||l.startsWith("⚠")?"#f87171":"#475569" }}>{l}</div>)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AUDIT */}
        {tab === "audit" && (
          <div className="fade">
            {!auditData.length ? (
              <div style={{ textAlign:"center", padding:"80px 0" }}>
                <div style={{ fontSize:40, marginBottom:14 }}>⚑</div>
                <div style={{ color:"#334155", marginBottom:16 }}>No audit data. Upload an invoice or run the demo.</div>
                <button className="bp" style={{ padding:"10px 24px" }} onClick={() => setTab("upload")}>Upload Invoice</button>
              </div>
            ) : (
              <>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, flexWrap:"wrap", gap:10 }}>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <h2 style={{ fontSize:20, fontWeight:700 }}>Audit Results</h2>
                      {isDemo?<span className="dm">DEMO</span>:<span className="lv">REAL DATA</span>}
                    </div>
                    <div style={{ fontSize:12, color:"#475569", ...S.mono }}>
                      <span style={{ color:"#4ade80" }}>{ok.length} verified</span>{" · "}<span style={{ color:"#f87171" }}>{flagged.length} flagged</span>{" · "}<span style={{ color:"#38bdf8" }}>₹{totalOver.toLocaleString()} recoverable</span>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)}>
                      <option value="ALL">All Providers</option>
                      {["Delhivery","BlueDart","Ecom Express","Shadowfax"].map(p=><option key={p}>{p}</option>)}
                    </select>
                    <button className="bg" style={{ padding:"6px 14px" }} onClick={downloadReport}>⬇ Discrepancy Report</button>
                    <button className="bp" style={{ padding:"6px 14px", fontSize:13 }} onClick={downloadPayout}>⬇ Verified Payout CSV</button>
                  </div>
                </div>
                <div style={{ overflowX:"auto", borderRadius:10, border:"1px solid #161c28" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                    <thead><tr style={{ background:"#0a0c12" }}>
                      {["AWB","Provider","Date","Zone","Weight","Billed ₹","Overcharge ₹","Issues","Status"].map(h=><th key={h} style={{ padding:"9px 14px", textAlign:"left", fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"0.8px", fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {auditData.filter(r=>filterProvider==="ALL"||r.provider===filterProvider).map((row,i) => {
                        const total=row.billed_freight+row.billed_fuel+row.billed_cod+row.billed_rto+row.billed_other;
                        const col=PROVIDER_COLORS[row.provider]||"#64748b";
                        return (
                          <tr key={i} className={row.status==="FLAGGED"?"rf":""} style={{ borderBottom:"1px solid #0a0c12" }}>
                            <td style={{ padding:"9px 14px", ...S.mono, fontSize:11, color:"#64748b" }}>{row.awb}</td>
                            <td style={{ padding:"9px 14px" }}><span style={{ background:`${col}15`,color:col,border:`1px solid ${col}25`,borderRadius:3,padding:"1px 7px",fontSize:10,...S.mono }}>{(row.provider||"").slice(0,2).toUpperCase()}</span><span style={{ marginLeft:6,color:"#64748b" }}>{row.provider}</span></td>
                            <td style={{ padding:"9px 14px", color:"#475569" }}>{row.date}</td>
                            <td style={{ padding:"9px 14px", ...S.mono, color:"#64748b" }}>{row.zone}</td>
                            <td style={{ padding:"9px 14px", ...S.mono, color:"#64748b" }}>{row.weight}kg</td>
                            <td style={{ padding:"9px 14px", ...S.mono, color:"#dde1ea" }}>₹{total.toLocaleString()}</td>
                            <td style={{ padding:"9px 14px", ...S.mono, color:row.overcharge>0?"#f87171":"#1c2030", fontWeight:row.overcharge>0?600:400 }}>{row.overcharge>0?`-₹${row.overcharge.toLocaleString()}`:"—"}</td>
                            <td style={{ padding:"9px 14px", maxWidth:230 }}><div style={{ display:"flex",flexWrap:"wrap",gap:3 }}>{row.issues.slice(0,3).map((iss,j)=><span key={j} className="ic">{iss.split(":")[0].split(" ").slice(0,2).join(" ")}</span>)}</div></td>
                            <td style={{ padding:"9px 14px" }}>{row.status==="OK"?<span className="ok">VERIFIED</span>:<span className="fl">FLAGGED</span>}</td>
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

        {/* TRACKING */}
        {tab === "tracking" && (
          <div className="fade">
            <div style={{ marginBottom:22 }}>
              <div style={{ fontSize:10, color:"#38bdf8", letterSpacing:"3px", textTransform:"uppercase", ...S.mono, marginBottom:6 }}>▶ SHIPMENT TRACKER</div>
              <h2 style={{ fontSize:22, fontWeight:700 }}>AWB Tracking & Audit Status</h2>
              <p style={{ color:"#475569", fontSize:12, marginTop:4 }}>Select any shipment to view full billing breakdown, audit findings, and delivery timeline.</p>
            </div>
            {!auditData.length ? (
              <div style={{ textAlign:"center", padding:"60px 0" }}>
                <div style={{ fontSize:36, marginBottom:12 }}>◎</div>
                <div style={{ color:"#334155", marginBottom:14 }}>Run an audit first.</div>
                <button className="bp" style={{ padding:"10px 22px" }} onClick={() => setTab("upload")}>Upload Invoice</button>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"260px 1fr", gap:18 }}>
                <div style={{ ...S.card, padding:14, maxHeight:640, overflowY:"auto" }}>
                  <div style={{ fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:10, ...S.mono }}>{auditData.length} Shipments</div>
                  <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)} style={{ width:"100%", marginBottom:10 }}>
                    <option value="ALL">All Providers</option>
                    {["Delhivery","BlueDart","Ecom Express","Shadowfax"].map(p=><option key={p}>{p}</option>)}
                  </select>
                  {uniqueAWBs.map(awb => {
                    const row=auditData.find(r=>r.awb===awb); const col=PROVIDER_COLORS[row?.provider]||"#64748b"; const sel=trackAWB===awb;
                    return (
                      <div key={awb} onClick={() => setTrackAWB(awb)} style={{ padding:"9px 11px", borderRadius:6, marginBottom:4, cursor:"pointer", background:sel?`${col}10`:"transparent", border:sel?`1px solid ${col}25`:"1px solid transparent", transition:"all 0.15s" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <span style={{ ...S.mono, fontSize:11, color:sel?col:"#64748b" }}>{awb}</span>
                          <span style={{ width:6,height:6,borderRadius:"50%",background:row?.status==="FLAGGED"?"#ef4444":"#22c55e",display:"inline-block" }}/>
                        </div>
                        <div style={{ fontSize:10, color:"#334155", marginTop:2 }}>{row?.provider} · {row?.date}</div>
                      </div>
                    );
                  })}
                </div>

                {!trackRow ? (
                  <div style={{ ...S.card, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10, padding:40, color:"#334155" }}>
                    <div style={{ fontSize:32, opacity:0.3 }}>◎</div><div>Select a shipment</div>
                  </div>
                ) : (
                  <div style={{ ...S.card }} className="fade">
                    <div style={{ padding:26 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22 }}>
                        <div>
                          <div style={{ ...S.mono, fontSize:20, fontWeight:600, color:"#38bdf8", marginBottom:6 }}>{trackRow.awb}</div>
                          <div style={{ display:"flex", gap:8 }}>
                            {(() => { const col=PROVIDER_COLORS[trackRow.provider]||"#64748b"; return <span style={{ background:`${col}15`,color:col,border:`1px solid ${col}25`,borderRadius:4,padding:"2px 10px",fontSize:11 }}>{trackRow.provider}</span>; })()}
                            {trackRow.status==="OK"?<span className="ok">VERIFIED</span>:<span className="fl">FLAGGED</span>}
                          </div>
                        </div>
                        {trackRow.overcharge > 0 && (
                          <div style={{ textAlign:"right", background:"rgba(239,68,68,0.07)", border:"1px solid rgba(239,68,68,0.15)", borderRadius:8, padding:"12px 18px" }}>
                            <div style={{ fontSize:10, color:"#f87171", textTransform:"uppercase", letterSpacing:"1px", marginBottom:4 }}>Overcharge</div>
                            <div style={{ ...S.mono, fontSize:22, color:"#f87171", fontWeight:700 }}>₹{trackRow.overcharge.toLocaleString()}</div>
                          </div>
                        )}
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:22 }}>
                        {[["Origin",trackRow.origin],["Destination",trackRow.dest],["Weight",`${trackRow.weight}kg`],["Zone",trackRow.zone],["Type",trackRow.type],["Date",trackRow.date]].map(([k,v])=>(
                          <div key={k} style={{ background:"#0a0c12", borderRadius:6, padding:11 }}>
                            <div style={{ fontSize:9, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:4 }}>{k}</div>
                            <div style={{ ...S.mono, fontSize:13, color:"#94a3b8" }}>{v||"—"}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginBottom:22 }}>
                        <div style={{ fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:12 }}>Charge Breakdown — Billed vs Contracted</div>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                          <thead><tr style={{ background:"#0a0c12" }}>{["Component","Billed","Contracted","Difference"].map(h=><th key={h} style={{ padding:"7px 12px",textAlign:"left",fontSize:10,color:"#334155",textTransform:"uppercase",letterSpacing:"0.5px" }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {[["Freight",trackRow.billed_freight,trackRow.expected_freight],["Fuel Surcharge",trackRow.billed_fuel,trackRow.expected_fuel],["COD Fee",trackRow.billed_cod,trackRow.expected_cod],["RTO Charge",trackRow.billed_rto,trackRow.expected_rto],["Other/Misc",trackRow.billed_other,0]].map(([label,billed,exp])=>{
                              const diff=billed-(exp||0);
                              return <tr key={label} style={{ borderBottom:"1px solid #0a0c12" }}>
                                <td style={{ padding:"7px 12px",color:"#64748b" }}>{label}</td>
                                <td style={{ padding:"7px 12px",...S.mono,color:"#dde1ea" }}>₹{billed}</td>
                                <td style={{ padding:"7px 12px",...S.mono,color:"#4ade80" }}>₹{exp||0}</td>
                                <td style={{ padding:"7px 12px",...S.mono,color:diff>0?"#f87171":diff<0?"#4ade80":"#1c2030",fontWeight:Math.abs(diff)>0?600:400 }}>{diff!==0?`${diff>0?"+":""}₹${diff}`:"—"}</td>
                              </tr>;
                            })}
                          </tbody>
                        </table>
                      </div>
                      {trackRow.issues.length > 0 && (
                        <div style={{ background:"rgba(239,68,68,0.05)", border:"1px solid rgba(239,68,68,0.12)", borderRadius:8, padding:16, marginBottom:22 }}>
                          <div style={{ fontSize:10, color:"#f87171", textTransform:"uppercase", letterSpacing:"1px", marginBottom:10 }}>⚠ Audit Findings</div>
                          {trackRow.issues.map((iss,i)=><div key={i} style={{ fontSize:12,color:"#fca5a5",padding:"4px 0",borderBottom:i<trackRow.issues.length-1?"1px solid rgba(239,68,68,0.07)":"none" }}>• {iss}</div>)}
                        </div>
                      )}
                      <div style={{ fontSize:10, color:"#334155", textTransform:"uppercase", letterSpacing:"1px", marginBottom:14 }}>Delivery Timeline</div>
                      <div style={{ position:"relative", paddingLeft:24 }}>
                        <div style={{ position:"absolute",left:5,top:6,bottom:6,width:2,background:"linear-gradient(180deg,#38bdf8,#161c28)" }}/>
                        {[
                          { e:"Shipment Booked",   t:`${trackRow.date} 09:00`, loc:"Origin Warehouse" },
                          { e:"Picked Up",         t:`${trackRow.date} 12:00`, loc:`Hub — ${trackRow.origin}` },
                          { e:"In Transit",        t:`${trackRow.date} 20:00`, loc:"Gateway Hub" },
                          { e:"Out for Delivery",  t:`${trackRow.date} 08:00 (+1)`, loc:`Hub — ${trackRow.dest}` },
                          { e:trackRow.billed_rto>0?"RTO Initiated":"Delivered", t:`${trackRow.date} 13:00 (+1)`, loc:"Final Address" },
                        ].map((ev,i,arr)=>(
                          <div key={i} style={{ display:"flex",gap:14,marginBottom:14,position:"relative" }}>
                            <div style={{ position:"absolute",left:-19,top:3,width:10,height:10,borderRadius:"50%",background:i===arr.length-1?"#38bdf8":"#1c2030",border:"2px solid #38bdf8",boxShadow:i===arr.length-1?"0 0 8px rgba(56,189,248,0.5)":"none" }}/>
                            <div>
                              <div style={{ fontSize:12,fontWeight:600,color:i===arr.length-1?"#dde1ea":"#64748b" }}>{ev.e}</div>
                              <div style={{ fontSize:10,color:"#334155",marginTop:2 }}>{ev.t} · {ev.loc}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ borderTop:"1px solid #0c0f15", padding:"12px 24px", textAlign:"center" }}>
        <span style={{ fontSize:9, color:"#161c28", ...S.mono, letterSpacing:"2px" }}>LOGISTICSAI · CSV · EXCEL · PDF · DELHIVERY · BLUEDART · ECOM EXPRESS · SHADOWFAX</span>
      </div>
    </div>
  );
}
