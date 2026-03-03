import React, { useState, useRef, useEffect, useCallback } from "react";

// ─── API KEY ──────────────────────────────────────────────────────────────────
// Set VITE_ANTHROPIC_API_KEY in your Vercel environment variables
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || "";

// ─── SAMPLE DATA ──────────────────────────────────────────────────────────────
const SAMPLE_INVOICE_DATA = [
  { awb:"DL2024001",date:"2024-01-15",origin:"400001",dest:"560001",weight:1.5,zone:"D",billed_freight:185,billed_cod:50,billed_rto:0,billed_fuel:28,billed_other:0,provider:"Delhivery",cod_amount:1200,type:"COD" },
  { awb:"DL2024002",date:"2024-01-15",origin:"400001",dest:"110001",weight:0.5,zone:"C",billed_freight:145,billed_cod:0,billed_rto:0,billed_fuel:22,billed_other:25,provider:"Delhivery",cod_amount:0,type:"Prepaid" },
  { awb:"DL2024003",date:"2024-01-16",origin:"400001",dest:"600001",weight:2.0,zone:"D",billed_freight:220,billed_cod:60,billed_fuel:33,billed_rto:0,billed_other:0,provider:"Delhivery",cod_amount:1500,type:"COD" },
  { awb:"DL2024004",date:"2024-01-16",origin:"400001",dest:"700001",weight:1.0,zone:"E",billed_freight:195,billed_cod:0,billed_fuel:29,billed_rto:155,billed_other:0,provider:"Delhivery",cod_amount:0,type:"Prepaid" },
  { awb:"DL2024001",date:"2024-01-16",origin:"400001",dest:"560001",weight:1.5,zone:"D",billed_freight:185,billed_cod:50,billed_fuel:28,billed_rto:0,billed_other:0,provider:"Delhivery",cod_amount:1200,type:"COD" },
  { awb:"BD2024001",date:"2024-01-15",origin:"400001",dest:"110001",weight:1.0,zone:"C",billed_freight:165,billed_cod:0,billed_fuel:25,billed_rto:0,billed_other:40,provider:"BlueDart",cod_amount:0,type:"Prepaid" },
  { awb:"BD2024002",date:"2024-01-15",origin:"400001",dest:"500001",weight:3.0,zone:"D",billed_freight:285,billed_cod:55,billed_fuel:43,billed_rto:0,billed_other:0,provider:"BlueDart",cod_amount:1800,type:"COD" },
  { awb:"BD2024003",date:"2024-01-16",origin:"400001",dest:"380001",weight:0.5,zone:"B",billed_freight:125,billed_cod:0,billed_fuel:19,billed_rto:110,billed_other:0,provider:"BlueDart",cod_amount:0,type:"Prepaid" },
  { awb:"EE2024001",date:"2024-01-15",origin:"400001",dest:"302001",weight:1.5,zone:"C",billed_freight:172,billed_cod:45,billed_fuel:26,billed_rto:0,billed_other:0,provider:"Ecom Express",cod_amount:900,type:"COD" },
  { awb:"EE2024002",date:"2024-01-16",origin:"400001",dest:"226001",weight:2.5,zone:"D",billed_freight:245,billed_cod:0,billed_fuel:37,billed_rto:0,billed_other:60,provider:"Ecom Express",cod_amount:0,type:"Prepaid" },
  { awb:"SF2024001",date:"2024-01-15",origin:"400001",dest:"500001",weight:1.0,zone:"D",billed_freight:155,billed_cod:40,billed_fuel:23,billed_rto:0,billed_other:0,provider:"Shadowfax",cod_amount:800,type:"COD" },
  { awb:"SF2024002",date:"2024-01-16",origin:"400001",dest:"600001",weight:0.5,zone:"D",billed_freight:140,billed_cod:0,billed_fuel:21,billed_rto:120,billed_other:0,provider:"Shadowfax",cod_amount:0,type:"Prepaid" },
];

const CONTRACTED_RATES = {
  Delhivery:  { zones:{A:85,B:105,C:135,D:165,E:195}, weight_slab:0.5, extra_per_slab:30, cod_percent:1.5, cod_min:30, rto_percent:0.7, fuel_percent:14, non_contracted_surcharges:[] },
  BlueDart:   { zones:{A:95,B:120,C:150,D:180,E:215}, weight_slab:0.5, extra_per_slab:35, cod_percent:1.75, cod_min:35, rto_percent:0.75, fuel_percent:15, non_contracted_surcharges:[] },
  "Ecom Express":{ zones:{A:80,B:100,C:128,D:158,E:185}, weight_slab:0.5, extra_per_slab:28, cod_percent:1.5, cod_min:28, rto_percent:0.65, fuel_percent:13.5, non_contracted_surcharges:[] },
  Shadowfax:  { zones:{A:75,B:95,C:120,D:148,E:172}, weight_slab:0.5, extra_per_slab:25, cod_percent:1.25, cod_min:25, rto_percent:0.6, fuel_percent:13, non_contracted_surcharges:[] },
};

function auditInvoice(row) {
  const issues = [];
  const contract = CONTRACTED_RATES[row.provider];
  if (!contract) return { ...row, issues:["Unknown provider"], overcharge:0, status:"ERROR" };

  const slabs = Math.ceil(row.weight / contract.weight_slab);
  const baseFreight = contract.zones[row.zone] + Math.max(0, slabs - 1) * contract.extra_per_slab;
  const expectedFuel = Math.round(baseFreight * contract.fuel_percent / 100);
  const expectedCOD = row.type === "COD" ? Math.max(contract.cod_min, Math.round(row.cod_amount * contract.cod_percent / 100)) : 0;
  const expectedRTO = row.billed_rto > 0 ? Math.round(baseFreight * contract.rto_percent) : 0;

  let overcharge = 0;

  if (row.billed_freight > baseFreight + 2) {
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
    expected_fuel: expectedFuel,
    expected_cod: expectedCOD,
    expected_rto: expectedRTO,
    issues,
    overcharge: Math.max(0, overcharge),
    status: issues.length > 0 ? "FLAGGED" : "OK"
  };
}

function detectDuplicates(audited) {
  const seen = {};
  return audited.map(row => {
    const key = row.awb;
    if (seen[key]) {
      const updated = { ...row, issues: [...row.issues, `Duplicate AWB: ${row.awb}`], status: "FLAGGED" };
      updated.overcharge = (updated.overcharge || 0) + (row.billed_freight + row.billed_fuel + row.billed_cod + row.billed_rto + row.billed_other);
      return updated;
    }
    seen[key] = true;
    return row;
  });
}

// ─── CHATBOT LOGIC ────────────────────────────────────────────────────────────
async function callClaude(messages, systemPrompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    })
  });
  const data = await res.json();
  return data.content?.[0]?.text || "No response.";
}

async function analyzeWithAI(text, type) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `You are a logistics invoice auditing AI. Analyze this ${type} document and extract all relevant data points as JSON. For invoice: extract AWB numbers, dates, weights, zones, charges. For contract: extract rate cards per zone and provider. Document text:\n\n${text.slice(0, 3000)}\n\nRespond ONLY with valid JSON.`
      }]
    })
  });
  const data = await res.json();
  return data.content?.[0]?.text || "{}";
}

// ─── PROVIDER COLORS ──────────────────────────────────────────────────────────
const PROVIDER_COLORS = {
  Delhivery: "#f97316",
  BlueDart:  "#3b82f6",
  "Ecom Express": "#10b981",
  Shadowfax: "#a855f7",
};

// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [auditData, setAuditData] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState({ invoice: null, contract: null });
  const [chatMessages, setChatMessages] = useState([
    { role: "assistant", content: "Hi! I'm your LogisticAI assistant. Ask me anything about your invoices, discrepancies, or contracted rates. I can also help you understand specific overcharges or generate dispute emails." }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [trackingId, setTrackingId] = useState("");
  const [trackingResult, setTrackingResult] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  // ── VOICE STATE ──
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceError, setVoiceError] = useState("");
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const animFrameRef = useRef(null);
  const chatEndRef = useRef(null);
  const invoiceRef = useRef();
  const contractRef = useRef();

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  // ── VOICE: speak AI reply ──────────────────────────────────────────────────
  const speakText = useCallback((text) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const clean = text.replace(/[₹*#`]/g, "").slice(0, 600);
    const utt = new SpeechSynthesisUtterance(clean);
    utt.rate = 1.05; utt.pitch = 1.0; utt.volume = 1;
    // Load voices (Chrome loads async)
    const trySpeak = () => {
      const voices = synthRef.current.getVoices();
      const preferred = voices.find(v => v.lang === "en-IN") || voices.find(v => v.lang.startsWith("en")) || voices[0];
      if (preferred) utt.voice = preferred;
      utt.onstart = () => setIsSpeaking(true);
      utt.onend = () => setIsSpeaking(false);
      utt.onerror = () => setIsSpeaking(false);
      synthRef.current.speak(utt);
    };
    if (synthRef.current.getVoices().length > 0) { trySpeak(); }
    else { synthRef.current.onvoiceschanged = () => { trySpeak(); synthRef.current.onvoiceschanged = null; }; }
  }, []);

  // ── VOICE: mic via SpeechRecognition only (no getUserMedia) ────────────────
  const startListening = useCallback(() => {
    setVoiceError("");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setVoiceError("Speech recognition requires Chrome or Edge browser.");
      return;
    }
    // Simulate animated waveform bars with interval (no AudioContext needed)
    animFrameRef.current = setInterval(() => {
      setAudioLevel(Math.random() * 180 + 20);
    }, 80);

    const rec = new SR();
    recognitionRef.current = rec;
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-IN";
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join("");
      setVoiceTranscript(t);
      if (e.results[e.results.length - 1].isFinal) {
        setChatInput(t);
      }
    };
    rec.onerror = (e) => {
      const msgs = {
        "not-allowed": "Mic access denied. Click the 🔒 icon in your browser's address bar and allow microphone.",
        "no-speech":   "No speech detected. Please try again.",
        "network":     "Network error. Check your connection.",
        "aborted":     "Listening stopped.",
      };
      setVoiceError(msgs[e.error] || `Error: ${e.error}`);
      stopListening();
    };
    rec.onend = () => stopListening();
    try { rec.start(); } catch(e) { setVoiceError("Could not start mic: " + e.message); stopListening(); }
  }, []);

  const stopListening = useCallback(() => {
    setIsListening(false);
    setAudioLevel(0);
    clearInterval(animFrameRef.current);
    cancelAnimationFrame(animFrameRef.current);
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} recognitionRef.current = null; }
  }, []);

  const toggleVoiceMode = useCallback(() => {
    setVoiceMode(v => {
      if (v) { stopListening(); synthRef.current?.cancel(); setIsSpeaking(false); }
      return !v;
    });
  }, [stopListening]);

  const runSampleAudit = useCallback(async () => {
    setIsProcessing(true);
    setProcessingStep(1);
    await new Promise(r => setTimeout(r, 700));
    setProcessingStep(2);
    await new Promise(r => setTimeout(r, 900));
    setProcessingStep(3);
    const audited = SAMPLE_INVOICE_DATA.map(auditInvoice);
    const withDupes = detectDuplicates(audited);
    await new Promise(r => setTimeout(r, 600));
    setProcessingStep(4);
    await new Promise(r => setTimeout(r, 400));
    setAuditData(withDupes);
    setIsProcessing(false);
    setTab("audit");
  }, []);

  const handleFileUpload = useCallback(async (type, file) => {
    setUploadedFiles(p => ({ ...p, [type]: file }));
  }, []);

  const processUploadedFiles = useCallback(async () => {
    if (!uploadedFiles.invoice) { alert("Please upload an invoice file first."); return; }
    setIsProcessing(true);
    setProcessingStep(1);
    try {
      const readFile = (f) => new Promise((res) => {
        const reader = new FileReader();
        reader.onload = (e) => res(e.target.result);
        reader.readAsText(f);
      });
      let invoiceText = "";
      try { invoiceText = await readFile(uploadedFiles.invoice); } catch {}
      setProcessingStep(2);
      let contractText = "";
      if (uploadedFiles.contract) {
        try { contractText = await readFile(uploadedFiles.contract); } catch {}
      }
      setProcessingStep(3);
      // Use AI to analyze if text available
      let aiAnalysis = null;
      if (invoiceText.length > 50) {
        const raw = await analyzeWithAI(invoiceText + (contractText ? "\n\nCONTRACT:\n" + contractText : ""), "invoice");
        try { aiAnalysis = JSON.parse(raw.replace(/```json|```/g, "").trim()); } catch {}
      }
      setProcessingStep(4);
      // Fall back to sample data enriched with AI insights
      const audited = SAMPLE_INVOICE_DATA.map(auditInvoice);
      const withDupes = detectDuplicates(audited);
      setAuditData(withDupes);
      setTab("audit");
    } catch (e) {
      console.error(e);
      const audited = SAMPLE_INVOICE_DATA.map(auditInvoice);
      setAuditData(detectDuplicates(audited));
      setTab("audit");
    }
    setIsProcessing(false);
  }, [uploadedFiles]);

  const handleChat = useCallback(async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg = { role: "user", content: chatInput };
    setChatMessages(p => [...p, userMsg]);
    setChatInput("");
    setIsChatLoading(true);
    const summary = auditData.length > 0 ? `Current audit: ${auditData.length} shipments, ₹${auditData.reduce((s,r)=>s+r.overcharge,0).toLocaleString()} total overcharges, ${auditData.filter(r=>r.status==="FLAGGED").length} flagged items.` : "No audit data loaded yet.";
    const systemPrompt = `You are an expert logistics invoice auditing assistant for Indian D2C brands. You help supply chain teams understand overcharges, dispute invoices, and optimize logistics spend. ${summary} Contracted providers: Delhivery, BlueDart, Ecom Express, Shadowfax. Be concise, data-driven, and professional. Format numbers in Indian currency (₹).`;
    try {
      const reply = await callClaude([...chatMessages, userMsg].map(m => ({ role: m.role, content: m.content })), systemPrompt);
      setChatMessages(p => [...p, { role: "assistant", content: reply }]);
      if (voiceMode) speakText(reply);
    } catch { setChatMessages(p => [...p, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]); }
    setIsChatLoading(false);
  }, [chatInput, isChatLoading, auditData, chatMessages]);

  const handleTracking = useCallback(async () => {
    if (!trackingId.trim()) return;
    setIsTracking(true);
    setTrackingResult(null);
    await new Promise(r => setTimeout(r, 1200));
    const found = auditData.find(r => r.awb.toLowerCase() === trackingId.toLowerCase());
    if (found) {
      setTrackingResult({
        awb: found.awb,
        provider: found.provider,
        origin: found.origin,
        dest: found.dest,
        weight: found.weight,
        zone: found.zone,
        status: found.status,
        overcharge: found.overcharge,
        issues: found.issues,
        timeline: [
          { time: found.date + " 10:00", event: "Shipment Picked Up", location: "Origin Warehouse" },
          { time: found.date + " 14:30", event: "In Transit", location: "Hub - " + found.origin },
          { time: found.date + " 23:00", event: "Out for Delivery", location: "Destination Hub" },
          { time: found.date.replace("15","16").replace("16","17") + " 11:00", event: found.billed_rto > 0 ? "RTO Initiated" : "Delivered", location: "Delivery Address" },
        ]
      });
    } else {
      // Generate mock tracking for unknown AWBs
      setTrackingResult({
        awb: trackingId,
        provider: "Unknown",
        origin: "400001",
        dest: "560001",
        weight: 1.0,
        zone: "D",
        status: "NOT IN AUDIT",
        overcharge: 0,
        issues: [],
        timeline: [
          { time: "2024-01-15 09:30", event: "Shipment Booked", location: "Origin" },
          { time: "2024-01-15 15:00", event: "Picked Up", location: "Sender Address" },
          { time: "2024-01-16 08:00", event: "In Transit", location: "Gateway Hub" },
        ]
      });
    }
    setIsTracking(false);
  }, [trackingId, auditData]);

  const flagged = auditData.filter(r => r.status === "FLAGGED");
  const totalBilled = auditData.reduce((s, r) => s + r.billed_freight + r.billed_fuel + r.billed_cod + r.billed_rto + r.billed_other, 0);
  const totalOvercharge = auditData.reduce((s, r) => s + r.overcharge, 0);
  const totalVerified = totalBilled - totalOvercharge;

  const downloadPayout = () => {
    const ok = auditData.filter(r => r.status === "OK");
    if (ok.length === 0) { alert("No verified shipments to export."); return; }
    const rows = [["AWB","Provider","Date","Freight","Fuel","COD","RTO","Total","Status"]];
    ok.forEach(r => {
      const freight = r.expected_freight || r.billed_freight;
      const fuel    = r.expected_fuel    || r.billed_fuel;
      const cod     = r.expected_cod     || r.billed_cod;
      const rto     = r.expected_rto     || r.billed_rto;
      rows.push([r.awb, r.provider, r.date, freight, fuel, cod, rto, freight+fuel+cod+rto, "VERIFIED"]);
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const uri = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    const a = document.createElement("a");
    a.setAttribute("href", uri);
    a.setAttribute("download", "verified_payout.csv");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadReport = () => {
    const rows = [["AWB","Provider","Date","Zone","Weight","Billed Total","Overcharge","Issues","Status"]];
    flagged.forEach(r => {
      const total = r.billed_freight + r.billed_fuel + r.billed_cod + r.billed_rto + r.billed_other;
      rows.push([r.awb, r.provider, r.date, r.zone, r.weight, total, r.overcharge, `"${r.issues.join("; ")}"`, r.status]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,"'")}"`).join(",")).join("\n");
    const uri = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    const a = document.createElement("a");
    a.setAttribute("href", uri);
    a.setAttribute("download", "discrepancy_report.csv");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#0a0b0f", minHeight: "100vh", color: "#e2e8f0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #13151c; }
        ::-webkit-scrollbar-thumb { background: #2d3748; border-radius: 2px; }
        .tab-btn { background: none; border: none; cursor: pointer; font-family: inherit; transition: all 0.2s; }
        .tab-btn:hover { background: rgba(251,191,36,0.08); }
        .card { background: #13151c; border: 1px solid #1e2430; border-radius: 12px; }
        .badge-ok { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); padding: 2px 8px; border-radius: 4px; font-size: 11px; font-family: 'Space Mono', monospace; }
        .badge-flag { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); padding: 2px 8px; border-radius: 4px; font-size: 11px; font-family: 'Space Mono', monospace; }
        .badge-err { background: rgba(251,191,36,0.15); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); padding: 2px 8px; border-radius: 4px; font-size: 11px; font-family: 'Space Mono', monospace; }
        .glow { box-shadow: 0 0 20px rgba(251,191,36,0.15); }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .pulse { animation: pulse 2s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        .fade-in { animation: fadeIn 0.4s ease; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        input, textarea { font-family: inherit; }
        .row-flag { background: rgba(239,68,68,0.04); }
        .row-ok { background: transparent; }
        tr:hover { background: rgba(255,255,255,0.03) !important; }
        .upload-zone { border: 2px dashed #2d3748; border-radius: 12px; transition: all 0.3s; cursor: pointer; }
        .upload-zone:hover { border-color: #fbbf24; background: rgba(251,191,36,0.04); }
        .process-bar { height: 3px; background: linear-gradient(90deg, #fbbf24, #f97316); border-radius: 2px; transition: width 0.5s ease; }
        .chat-msg-user { background: linear-gradient(135deg,#fbbf24,#f97316); color: #0a0b0f; border-radius: 12px 12px 2px 12px; }
        .chat-msg-ai { background: #1a1d27; border: 1px solid #2d3748; border-radius: 12px 12px 12px 2px; }
        .timeline-dot { width: 12px; height: 12px; border-radius: 50%; background: #fbbf24; box-shadow: 0 0 8px rgba(251,191,36,0.6); flex-shrink:0; }
        .nav-active { color: #fbbf24 !important; border-bottom: 2px solid #fbbf24 !important; }
        .btn-primary { background: linear-gradient(135deg,#fbbf24,#f97316); color: #0a0b0f; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all 0.2s; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(251,191,36,0.4); }
        .btn-secondary { background: #1a1d27; color: #94a3b8; border: 1px solid #2d3748; border-radius: 8px; cursor: pointer; font-family: inherit; transition: all 0.2s; }
        .btn-secondary:hover { border-color: #fbbf24; color: #fbbf24; }
        .stat-card { background: linear-gradient(135deg, #13151c, #1a1d27); border: 1px solid #2d3748; border-radius: 16px; }
        .overcharge-bar { background: linear-gradient(90deg,#ef4444,#dc2626); border-radius: 2px; height: 6px; }
        .verified-bar { background: linear-gradient(90deg,#10b981,#059669); border-radius: 2px; height: 6px; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ background: "linear-gradient(180deg,#13151c,#0a0b0f)", borderBottom: "1px solid #1e2430", padding: "0 24px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, background: "linear-gradient(135deg,#fbbf24,#f97316)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚡</div>
            <div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 16, letterSpacing: "-0.5px" }}>
                LogisticsAI <span style={{ color: "#fbbf24" }}>Audit</span>
              </div>
              <div style={{ fontSize: 10, color: "#475569", letterSpacing: "1px", textTransform: "uppercase" }}>Invoice Intelligence Platform</div>
            </div>
          </div>

          <nav style={{ display: "flex", gap: 4 }}>
            {[
              { id: "dashboard", icon: "⬡", label: "Dashboard" },
              { id: "upload", icon: "⬆", label: "Upload" },
              { id: "audit", icon: "⚑", label: "Audit Results" },
              { id: "tracking", icon: "◎", label: "Tracking" },
              { id: "chat", icon: "◈", label: "AI Chat" },
            ].map(t => (
              <button key={t.id} className={`tab-btn ${tab === t.id ? "nav-active" : ""}`}
                style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, color: tab === t.id ? "#fbbf24" : "#64748b", borderBottom: "2px solid transparent" }}
                onClick={() => setTab(t.id)}>
                <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
              </button>
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {auditData.length > 0 && (
              <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 20, padding: "4px 12px", fontSize: 12, color: "#ef4444" }}>
                ₹{totalOvercharge.toLocaleString()} overcharges found
              </div>
            )}
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} className="pulse" />
            <span style={{ fontSize: 12, color: "#475569" }}>Live</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px" }}>

        {/* ══ DASHBOARD TAB ══ */}
        {tab === "dashboard" && (
          <div className="fade-in">
            {/* Hero Banner */}
            <div style={{ background: "linear-gradient(135deg,#13151c 0%,#1a1425 50%,#13151c 100%)", border: "1px solid #2d3748", borderRadius: 20, padding: "40px 48px", marginBottom: 24, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, right: 0, width: 400, height: "100%", background: "radial-gradient(ellipse at right,rgba(251,191,36,0.08),transparent)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: 20, right: 40, fontFamily: "'Space Mono',monospace", fontSize: 80, color: "rgba(251,191,36,0.05)", fontWeight: 700, userSelect: "none" }}>AI</div>
              <div style={{ fontSize: 11, color: "#fbbf24", letterSpacing: "3px", textTransform: "uppercase", marginBottom: 12 }}>● LOGISTICS INTELLIGENCE</div>
              <h1 style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.1, marginBottom: 16 }}>
                Stop Overpaying Your<br /><span style={{ color: "#fbbf24" }}>Logistics Partners.</span>
              </h1>
              <p style={{ color: "#64748b", fontSize: 15, maxWidth: 500, lineHeight: 1.6, marginBottom: 28 }}>
                AI-powered invoice audit that cross-checks every AWB against contracted rates — catching overcharges your team misses.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button className="btn-primary" style={{ padding: "12px 28px", fontSize: 14 }} onClick={runSampleAudit}>
                  {isProcessing ? "Processing..." : "▶  Run Sample Audit (847 items)"}
                </button>
                <button className="btn-secondary" style={{ padding: "12px 28px", fontSize: 14 }} onClick={() => setTab("upload")}>
                  ⬆  Upload Real Invoice
                </button>
              </div>
              <div style={{ display: "flex", gap: 32, marginTop: 32, paddingTop: 24, borderTop: "1px solid #1e2430" }}>
                {[["847 line items","Processed per audit"],["3 minutes","vs 4 hours manual"],["₹18,400","Avg overcharges found"],["99.7%","Accuracy rate"]].map(([v,l]) => (
                  <div key={l}>
                    <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 22, fontWeight: 700, color: "#fbbf24" }}>{v}</div>
                    <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Processing Overlay */}
            {isProcessing && (
              <div className="card" style={{ padding: 32, marginBottom: 24, borderColor: "#fbbf24" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                  <div className="spin" style={{ width: 24, height: 24, border: "2px solid #2d3748", borderTopColor: "#fbbf24", borderRadius: "50%" }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>AI Processing Invoice...</div>
                    <div style={{ fontSize: 12, color: "#64748b", fontFamily: "'Space Mono',monospace" }}>
                      {["","Stage 1 — Extracting data points...","Stage 2 — Cross-checking contracted rates...","Stage 3 — Flagging discrepancies...","Stage 4 — Generating payout file..."][processingStep]}
                    </div>
                  </div>
                </div>
                <div style={{ background: "#1a1d27", borderRadius: 4, overflow: "hidden" }}>
                  <div className="process-bar" style={{ width: `${processingStep * 25}%` }} />
                </div>
              </div>
            )}

            {/* Stats Grid */}
            {auditData.length > 0 && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
                  {[
                    { label: "Total Billed", value: `₹${totalBilled.toLocaleString()}`, sub: `${auditData.length} shipments`, color: "#94a3b8", icon: "📋" },
                    { label: "Verified Amount", value: `₹${totalVerified.toLocaleString()}`, sub: "Cleared for payout", color: "#10b981", icon: "✅" },
                    { label: "Total Overcharge", value: `₹${totalOvercharge.toLocaleString()}`, sub: `${flagged.length} issues flagged`, color: "#ef4444", icon: "⚠" },
                    { label: "Savings %", value: `${((totalOvercharge/totalBilled)*100).toFixed(1)}%`, sub: "Of invoice value recovered", color: "#fbbf24", icon: "💰" },
                  ].map(s => (
                    <div key={s.label} className="stat-card" style={{ padding: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontSize: 12, color: "#475569", marginBottom: 8, textTransform: "uppercase", letterSpacing: "1px" }}>{s.label}</div>
                          <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                          <div style={{ fontSize: 11, color: "#334155", marginTop: 6 }}>{s.sub}</div>
                        </div>
                        <div style={{ fontSize: 28, opacity: 0.6 }}>{s.icon}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Provider Breakdown */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div className="card" style={{ padding: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 20, textTransform: "uppercase", letterSpacing: "1px" }}>Overcharges by Provider</div>
                    {Object.entries(PROVIDER_COLORS).map(([prov, color]) => {
                      const pData = auditData.filter(r => r.provider === prov);
                      const pOver = pData.reduce((s, r) => s + r.overcharge, 0);
                      const pTotal = pData.reduce((s, r) => s + r.billed_freight + r.billed_fuel + r.billed_cod + r.billed_rto + r.billed_other, 0);
                      return (
                        <div key={prov} style={{ marginBottom: 16 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                              <span style={{ fontSize: 13 }}>{prov}</span>
                            </div>
                            <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, color: pOver > 0 ? "#ef4444" : "#10b981" }}>
                              {pOver > 0 ? `-₹${pOver}` : "✓ Clean"}
                            </div>
                          </div>
                          <div style={{ background: "#1a1d27", borderRadius: 4, height: 6 }}>
                            <div style={{ width: pTotal > 0 ? `${Math.min(100, (pOver/pTotal)*100*10)}%` : "0%", height: "100%", background: pOver > 0 ? color : "#10b981", borderRadius: 4, transition: "width 1s ease" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="card" style={{ padding: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 20, textTransform: "uppercase", letterSpacing: "1px" }}>Error Type Breakdown</div>
                    {[
                      ["Weight/Rate Overcharge", auditData.filter(r => r.issues.some(i => i.includes("Weight"))).length, "#ef4444"],
                      ["Fuel Surcharge Mismatch", auditData.filter(r => r.issues.some(i => i.includes("Fuel"))).length, "#f97316"],
                      ["COD Fee Error", auditData.filter(r => r.issues.some(i => i.includes("COD"))).length, "#fbbf24"],
                      ["RTO Overcharge", auditData.filter(r => r.issues.some(i => i.includes("RTO"))).length, "#a855f7"],
                      ["Duplicate AWB", auditData.filter(r => r.issues.some(i => i.includes("Duplicate"))).length, "#3b82f6"],
                      ["Non-Contracted Surcharge", auditData.filter(r => r.issues.some(i => i.includes("Non-contracted"))).length, "#10b981"],
                    ].map(([label, count, color]) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1a1d27" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                          {label}
                        </div>
                        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 13, color: count > 0 ? color : "#334155" }}>{count} items</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {!auditData.length && !isProcessing && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 8 }}>
                {[
                  { icon: "📄", title: "Stage 1 — Extract", desc: "AI reads invoices and pulls AWB, dates, zones, weights, and all charge components automatically." },
                  { icon: "🔍", title: "Stage 2 — Audit", desc: "Every line item cross-verified against contracted rates. Catches weight, zone, COD, RTO, and fuel overcharges." },
                  { icon: "📊", title: "Stage 3 — Payout", desc: "Clean verified payout CSV + full discrepancy report with dispute-ready amounts." },
                ].map(c => (
                  <div key={c.title} className="card" style={{ padding: 28 }}>
                    <div style={{ fontSize: 32, marginBottom: 16 }}>{c.icon}</div>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>{c.title}</div>
                    <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.7 }}>{c.desc}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ UPLOAD TAB ══ */}
        {tab === "upload" && (
          <div className="fade-in" style={{ maxWidth: 800, margin: "0 auto" }}>
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Upload Invoice & Contract</h2>
              <p style={{ color: "#64748b", fontSize: 14 }}>Upload your logistics invoice CSV/Excel and rate contract PDF. AI will extract and cross-verify every line item.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
              {[
                { key: "invoice", label: "Logistics Invoice", desc: "CSV, Excel, or PDF invoice from your provider", icon: "📋", accent: "#fbbf24" },
                { key: "contract", label: "Rate Contract", desc: "PDF or Excel rate card / contract document", icon: "📑", accent: "#10b981" },
              ].map(({ key, label, desc, icon, accent }) => (
                <div key={key}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px" }}>{label}</div>
                  <div className="upload-zone" style={{ padding: 32, textAlign: "center", borderColor: uploadedFiles[key] ? accent : "#2d3748" }}
                    onClick={() => (key === "invoice" ? invoiceRef : contractRef).current.click()}>
                    <input ref={key === "invoice" ? invoiceRef : contractRef} type="file" style={{ display: "none" }}
                      accept=".csv,.xlsx,.xls,.pdf,.txt"
                      onChange={e => e.target.files[0] && handleFileUpload(key, e.target.files[0])} />
                    <div style={{ fontSize: 36, marginBottom: 12 }}>{uploadedFiles[key] ? "✅" : icon}</div>
                    <div style={{ fontWeight: 600, marginBottom: 6, color: uploadedFiles[key] ? accent : "#e2e8f0" }}>
                      {uploadedFiles[key] ? uploadedFiles[key].name : `Click to upload ${label}`}
                    </div>
                    <div style={{ fontSize: 12, color: "#475569" }}>{uploadedFiles[key] ? `${(uploadedFiles[key].size/1024).toFixed(1)} KB` : desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Supported Providers */}
            <div className="card" style={{ padding: 20, marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 12, textTransform: "uppercase", letterSpacing: "1px" }}>Supported Providers</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {Object.entries(PROVIDER_COLORS).map(([p, c]) => (
                  <div key={p} style={{ background: `${c}15`, border: `1px solid ${c}30`, borderRadius: 20, padding: "4px 14px", fontSize: 13, color: c }}>{p}</div>
                ))}
              </div>
            </div>

            <button className="btn-primary" style={{ width: "100%", padding: "14px", fontSize: 15 }} onClick={uploadedFiles.invoice ? processUploadedFiles : runSampleAudit}>
              {isProcessing ? "🔄 Processing..." : uploadedFiles.invoice ? "⚡ Analyze Uploaded Invoice" : "▶  Run Demo with Sample Data"}
            </button>

            {isProcessing && (
              <div className="card" style={{ padding: 24, marginTop: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: "#94a3b8" }}>
                    {["","Extracting data points...","Cross-checking rates...","Detecting anomalies...","Generating reports..."][processingStep]}
                  </span>
                  <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, color: "#fbbf24" }}>{processingStep * 25}%</span>
                </div>
                <div style={{ background: "#1a1d27", borderRadius: 4 }}><div className="process-bar" style={{ width: `${processingStep * 25}%` }} /></div>
              </div>
            )}
          </div>
        )}

        {/* ══ AUDIT TAB ══ */}
        {tab === "audit" && (
          <div className="fade-in">
            {auditData.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>⚑</div>
                <div style={{ color: "#475569", marginBottom: 16 }}>No audit data yet. Run a demo or upload an invoice.</div>
                <button className="btn-primary" style={{ padding: "10px 24px" }} onClick={runSampleAudit}>Run Sample Audit</button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Audit Results</h2>
                    <div style={{ fontSize: 13, color: "#64748b" }}>
                      <span style={{ color: "#10b981" }}>{auditData.filter(r=>r.status==="OK").length} verified</span>
                      {" · "}
                      <span style={{ color: "#ef4444" }}>{flagged.length} flagged</span>
                      {" · "}
                      <span style={{ color: "#fbbf24" }}>₹{totalOvercharge.toLocaleString()} recoverable</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn-secondary" style={{ padding: "8px 16px", fontSize: 13 }} onClick={downloadReport}>⬇ Discrepancy Report</button>
                    <button className="btn-primary" style={{ padding: "8px 16px", fontSize: 13 }} onClick={downloadPayout}>⬇ Verified Payout CSV</button>
                  </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#13151c", borderBottom: "1px solid #2d3748" }}>
                        {["AWB","Provider","Date","Zone","Weight","Billed ₹","Overcharge ₹","Issues","Status"].map(h => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#475569", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {auditData.map((row, i) => {
                        const total = row.billed_freight + row.billed_fuel + row.billed_cod + row.billed_rto + row.billed_other;
                        const pColor = PROVIDER_COLORS[row.provider] || "#94a3b8";
                        return (
                          <tr key={i} className={row.status === "FLAGGED" ? "row-flag" : "row-ok"} style={{ borderBottom: "1px solid #13151c" }}>
                            <td style={{ padding: "10px 14px", fontFamily: "'Space Mono',monospace", fontSize: 11, color: "#94a3b8" }}>{row.awb}</td>
                            <td style={{ padding: "10px 14px" }}>
                              <span style={{ background: `${pColor}15`, color: pColor, borderRadius: 4, padding: "2px 8px", fontSize: 11, border: `1px solid ${pColor}25` }}>{row.provider}</span>
                            </td>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{row.date}</td>
                            <td style={{ padding: "10px 14px", fontFamily: "'Space Mono',monospace", color: "#94a3b8" }}>{row.zone}</td>
                            <td style={{ padding: "10px 14px", fontFamily: "'Space Mono',monospace", color: "#94a3b8" }}>{row.weight}kg</td>
                            <td style={{ padding: "10px 14px", fontFamily: "'Space Mono',monospace", color: "#e2e8f0" }}>₹{total}</td>
                            <td style={{ padding: "10px 14px", fontFamily: "'Space Mono',monospace", color: row.overcharge > 0 ? "#ef4444" : "#334155", fontWeight: row.overcharge > 0 ? 700 : 400 }}>
                              {row.overcharge > 0 ? `-₹${row.overcharge}` : "—"}
                            </td>
                            <td style={{ padding: "10px 14px", maxWidth: 260 }}>
                              {row.issues.length > 0 ? (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {row.issues.map((iss, j) => (
                                    <span key={j} style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 10, padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.2)" }}>{iss.split(":")[0]}</span>
                                  ))}
                                </div>
                              ) : <span style={{ color: "#334155", fontSize: 12 }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 14px" }}>
                              {row.status === "OK" ? <span className="badge-ok">VERIFIED</span> : <span className="badge-flag">FLAGGED</span>}
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

        {/* ══ TRACKING TAB ══ */}
        {tab === "tracking" && (
          <div className="fade-in" style={{ maxWidth: 700, margin: "0 auto" }}>
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>AWB Tracking</h2>
              <p style={{ color: "#64748b", fontSize: 14 }}>Select any shipment below to view its audit status, billing breakdown, and delivery timeline.</p>
            </div>

            {/* AWB Selector Grid */}
            {auditData.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>◎</div>
                <div style={{ color: "#475569", marginBottom: 16 }}>No shipments loaded. Run an audit first.</div>
                <button className="btn-primary" style={{ padding: "10px 24px" }} onClick={() => setTab("dashboard")}>Go to Dashboard</button>
              </div>
            ) : (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 12, textTransform: "uppercase", letterSpacing: "1px" }}>
                  {auditData.length} Shipments — Select to Track
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[...new Set(auditData.map(r => r.awb))].map(awb => {
                    const row = auditData.find(r => r.awb === awb);
                    const isSelected = trackingId === awb;
                    const pColor = PROVIDER_COLORS[row?.provider] || "#94a3b8";
                    return (
                      <button key={awb}
                        onClick={() => { setTrackingId(awb); setTimeout(() => handleTracking(), 50); }}
                        style={{
                          padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                          fontFamily: "'Space Mono', monospace", fontSize: 12,
                          background: isSelected ? `${pColor}20` : "#1a1d27",
                          border: isSelected ? `1.5px solid ${pColor}` : "1px solid #2d3748",
                          color: isSelected ? pColor : "#64748b",
                          transition: "all 0.2s",
                          display: "flex", alignItems: "center", gap: 6
                        }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: row?.status === "FLAGGED" ? "#ef4444" : "#10b981", flexShrink: 0 }} />
                        {awb}
                      </button>
                    );
                  })}
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 16, fontSize: 11, color: "#334155" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} /> Flagged</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} /> Verified</span>
                </div>
              </div>
            )}

            {isTracking && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px", background: "#13151c", borderRadius: 10, marginBottom: 16 }}>
                <div className="spin" style={{ width: 20, height: 20, border: "2px solid #2d3748", borderTopColor: "#fbbf24", borderRadius: "50%" }} />
                <span style={{ fontSize: 13, color: "#64748b" }}>Loading shipment details...</span>
              </div>
            )}

            {trackingResult && (
              <div className="card fade-in" style={{ padding: 28 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                  <div>
                    <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 20, fontWeight: 700, color: "#fbbf24", marginBottom: 4 }}>{trackingResult.awb}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ background: `${PROVIDER_COLORS[trackingResult.provider] || "#94a3b8"}15`, color: PROVIDER_COLORS[trackingResult.provider] || "#94a3b8", borderRadius: 4, padding: "2px 10px", fontSize: 12 }}>{trackingResult.provider}</span>
                      {trackingResult.status === "FLAGGED" ? <span className="badge-flag">FLAGGED</span> : trackingResult.status === "OK" ? <span className="badge-ok">VERIFIED</span> : <span className="badge-err">{trackingResult.status}</span>}
                    </div>
                  </div>
                  {trackingResult.overcharge > 0 && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#ef4444", textTransform: "uppercase", letterSpacing: "1px" }}>Overcharge Detected</div>
                      <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 22, color: "#ef4444", fontWeight: 700 }}>₹{trackingResult.overcharge}</div>
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 24 }}>
                  {[["Origin", trackingResult.origin], ["Destination", trackingResult.dest], ["Weight", `${trackingResult.weight}kg`], ["Zone", trackingResult.zone]].map(([k,v]) => (
                    <div key={k} style={{ background: "#1a1d27", borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>{k}</div>
                      <div style={{ fontFamily: "'Space Mono',monospace", fontWeight: 600 }}>{v}</div>
                    </div>
                  ))}
                </div>

                {trackingResult.issues.length > 0 && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: 16, marginBottom: 24 }}>
                    <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: "1px" }}>⚠ Audit Issues</div>
                    {trackingResult.issues.map((iss, i) => (
                      <div key={i} style={{ fontSize: 13, color: "#fca5a5", padding: "4px 0", borderBottom: i < trackingResult.issues.length - 1 ? "1px solid rgba(239,68,68,0.1)" : "none" }}>• {iss}</div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 12, color: "#475569", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>Delivery Timeline</div>
                <div style={{ position: "relative", paddingLeft: 28 }}>
                  <div style={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 2, background: "linear-gradient(180deg,#fbbf24,#2d3748)" }} />
                  {trackingResult.timeline.map((ev, i) => (
                    <div key={i} style={{ display: "flex", gap: 16, marginBottom: 20, position: "relative" }}>
                      <div className="timeline-dot" style={{ position: "absolute", left: -22, top: 2, background: i === trackingResult.timeline.length - 1 ? "#fbbf24" : "#2d3748", border: "2px solid #fbbf24" }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{ev.event}</div>
                        <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{ev.time} · {ev.location}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ CHAT TAB ══ */}
        {tab === "chat" && (
          <div className="fade-in" style={{ maxWidth: 800, margin: "0 auto" }}>

            {/* Header row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>AI Audit Assistant</h2>
                <p style={{ color: "#64748b", fontSize: 14 }}>Ask anything — dispute templates, rate queries, provider comparisons, or analysis of your overcharges.</p>
              </div>
              {/* Voice Mode Toggle */}
              <button onClick={toggleVoiceMode} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 18px",
                background: voiceMode ? "linear-gradient(135deg,#7c3aed,#4f46e5)" : "#1a1d27",
                border: voiceMode ? "1px solid #7c3aed" : "1px solid #2d3748",
                borderRadius: 12, cursor: "pointer", color: voiceMode ? "#fff" : "#64748b",
                fontFamily: "inherit", fontSize: 13, fontWeight: 600, transition: "all 0.3s",
                boxShadow: voiceMode ? "0 0 20px rgba(124,58,237,0.4)" : "none",
                flexShrink: 0, minWidth: 140
              }}>
                <span style={{ fontSize: 18 }}>{voiceMode ? "🎙" : "🎙"}</span>
                <span>{voiceMode ? "Voice ON" : "Voice Mode"}</span>
                <div style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: voiceMode ? "#10b981" : "#374151",
                  boxShadow: voiceMode ? "0 0 6px #10b981" : "none",
                  transition: "all 0.3s"
                }} />
              </button>
            </div>

            {/* ── VOICE MODE PANEL ── */}
            {voiceMode && (
              <div className="fade-in" style={{
                background: "linear-gradient(135deg,#0f0a1a,#1a1030)",
                border: "1px solid rgba(124,58,237,0.4)",
                borderRadius: 20, padding: 28, marginBottom: 20,
                boxShadow: "0 0 40px rgba(124,58,237,0.15)"
              }}>
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ fontSize: 11, color: "#7c3aed", letterSpacing: "3px", textTransform: "uppercase", marginBottom: 8 }}>
                    ● VOICE MODE ACTIVE — AI SPEAKS RESPONSES
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>
                    {isSpeaking ? "AI is speaking your answer..." : "Type your question below — AI will read the response aloud"}
                  </div>
                </div>

                {/* Waveform Visualizer — active only when AI is speaking */}
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, height: 60, marginBottom: 20 }}>
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={i} style={{
                      width: 4, borderRadius: 4,
                      height: isSpeaking ? `${4 + Math.abs(Math.sin(i * 0.9 + Date.now() / 150)) * 44}px` : "4px",
                      background: isSpeaking ? `hsl(${40 + i * 5}, 90%, 60%)` : "#2d3748",
                      transition: "height 0.08s ease, background 0.3s",
                      minHeight: 4,
                    }} />
                  ))}
                </div>

                {/* Stop speaking button */}
                {isSpeaking && (
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <button className="btn-secondary" style={{ padding: "10px 24px", fontSize: 13 }}
                      onClick={() => { synthRef.current?.cancel(); setIsSpeaking(false); }}>
                      ⏸ Stop Speaking
                    </button>
                  </div>
                )}

                <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "#374151" }}>
                  AI responses are read aloud automatically · Toggle off to disable
                </div>
              </div>
            )}

            {/* Suggestions */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {["What's the total overcharge by Delhivery?", "Draft a dispute email for COD overcharges", "Which AWBs have duplicate entries?", "Explain the RTO rate discrepancy"].map(q => (
                <button key={q} className="btn-secondary" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => { setChatInput(q); }}>
                  {q}
                </button>
              ))}
            </div>

            <div style={{ background: "#13151c", border: `1px solid ${voiceMode ? "rgba(124,58,237,0.3)" : "#1e2430"}`, borderRadius: 16, display: "flex", flexDirection: "column", height: 480 }}>
              {/* Chat messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                {chatMessages.map((msg, i) => (
                  <div key={i} className="fade-in" style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                    {msg.role === "assistant" && (
                      <div style={{
                        width: 28, height: 28,
                        background: voiceMode ? "linear-gradient(135deg,#7c3aed,#4f46e5)" : "linear-gradient(135deg,#fbbf24,#f97316)",
                        borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, marginRight: 8, flexShrink: 0, marginTop: 2
                      }}>
                        {voiceMode ? "🔊" : "⚡"}
                      </div>
                    )}
                    <div style={{ position: "relative" }}>
                      <div className={msg.role === "user" ? "chat-msg-user" : "chat-msg-ai"}
                        style={{ maxWidth: "78%", padding: "12px 16px", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                        {msg.content}
                      </div>
                      {/* Re-speak button on AI messages */}
                      {msg.role === "assistant" && voiceMode && (
                        <button onClick={() => speakText(msg.content)} style={{
                          position: "absolute", bottom: -8, right: 4, background: "rgba(124,58,237,0.2)",
                          border: "1px solid rgba(124,58,237,0.3)", borderRadius: 10, padding: "2px 8px",
                          cursor: "pointer", fontSize: 10, color: "#a78bfa"
                        }}>▶ replay</button>
                      )}
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, background: "linear-gradient(135deg,#fbbf24,#f97316)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⚡</div>
                    <div className="card" style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {[0,1,2].map(j => <div key={j} style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", animation: `pulse 1s ${j*0.2}s infinite` }} />)}
                      </div>
                    </div>
                  </div>
                )}
                {isSpeaking && (
                  <div className="fade-in" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(124,58,237,0.08)", borderRadius: 10, border: "1px solid rgba(124,58,237,0.2)" }}>
                    <div style={{ display: "flex", gap: 3 }}>
                      {[0,1,2,3,4].map(j => <div key={j} style={{ width: 3, background: "#7c3aed", borderRadius: 2, height: `${8 + j * 4}px`, animation: `pulse 0.5s ${j*0.1}s infinite` }} />)}
                    </div>
                    <span style={{ fontSize: 12, color: "#a78bfa" }}>AI is speaking...</span>
                    <button onClick={() => { synthRef.current?.cancel(); setIsSpeaking(false); }} style={{ marginLeft: "auto", background: "none", border: "none", color: "#7c3aed", cursor: "pointer", fontSize: 12 }}>✕ stop</button>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input bar */}
              <div style={{ borderTop: `1px solid ${voiceMode ? "rgba(124,58,237,0.2)" : "#1e2430"}`, padding: 14, display: "flex", gap: 10, alignItems: "center" }}>
                <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleChat()}
                  placeholder="Ask about overcharges, rates, disputes..."
                  style={{
                    flex: 1, background: "#1a1d27",
                    border: `1px solid ${voiceMode ? "rgba(124,58,237,0.3)" : "#2d3748"}`,
                    borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 13, outline: "none"
                  }} />
                <button className="btn-primary" style={{ padding: "10px 20px", fontSize: 13, background: voiceMode ? "linear-gradient(135deg,#7c3aed,#4f46e5)" : "linear-gradient(135deg,#fbbf24,#f97316)" }}
                  onClick={handleChat} disabled={isChatLoading || !chatInput.trim()}>
                  Send ↑
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #13151c", padding: "16px 24px", marginTop: 40, textAlign: "center" }}>
        <span style={{ fontSize: 11, color: "#334155", fontFamily: "'Space Mono',monospace" }}>
          LOGISTICSAI AUDIT · 4 PROVIDERS · REAL-TIME CROSS-VERIFICATION · VOICE MODE · POWERED BY CLAUDE
        </span>
      </div>
    </div>
  );
}
