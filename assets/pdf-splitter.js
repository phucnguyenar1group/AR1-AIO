pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js";

const OCR_OPTIONS = {
  workerPath: "https://unpkg.com/tesseract.js@5/dist/worker.min.js",
  corePath: "https://unpkg.com/tesseract.js-core@5.0.0/tesseract-core.wasm.js",
  langPath: "https://tessdata.projectnaptha.com/4.0.0"
};

// ĐÃ SỬA: Trỏ thẳng đến máy chủ Hugging Face của bạn
const BACKEND_ANALYZER_DEFAULT_URL = "https://phucnguyenar1-ocrpdf.hf.space/analyze";
const BACKEND_ANALYZER_STORAGE_KEY = "pdf_splitter_backend_analyzer_url";
const BACKEND_ANALYZER_TIMEOUT_MS = 240000;
const AI_HEADER_RENDER_SCALE = 1.15;
const AI_MIN_CONFIDENCE = 0.74;
const AI_ANALYZER_TIMEOUT_MS = 9000;

const OCR_HEADER_SCALE = 1.55;
const OCR_RENDER_SCALE = 1.85;
const OCR_RETRY_SCALE = 2.35;
const OCR_TITLE_SCALE = 2.05;
const OCR_TITLE_HEIGHT_RATIO = 0.24;
const OCR_HEADER_HEIGHT_RATIO = 0.52;
const THUMB_SCALE = 0.34;
const MIN_TEXT_CHARS = 25;

function readStoredAnalyzerUrl() {
  try {
    return localStorage.getItem(BACKEND_ANALYZER_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function getQueryParam(name) {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  } catch {
    return null;
  }
}

function getRuntimeAnalyzerConfig() {
  const appConfig = window.__APP_CONFIG__ || {};
  const queryAnalyzerUrl = getQueryParam("analyzerUrl");
  const queryUseAnalyzer = getQueryParam("useAnalyzer");
  const fromConfig = String(appConfig.backendAnalyzerUrl || "").trim();
  const fromStorage = String(readStoredAnalyzerUrl() || "").trim();

  let analyzerUrl = String(queryAnalyzerUrl || fromConfig || fromStorage).trim();
  
  // ĐÃ SỬA: Luôn dùng URL Hugging Face kể cả khi chạy trên Vercel
  if (!analyzerUrl) {
    analyzerUrl = BACKEND_ANALYZER_DEFAULT_URL;
  }
  analyzerUrl = analyzerUrl.replace(/\/+$/, "");

  const forceOff = queryUseAnalyzer === "0" || queryUseAnalyzer === "false";
  let useAnalyzer = false;

  if (forceOff) {
    useAnalyzer = false;
  } else {
    // Luôn bật AI Analyzer trên production Vercel
    useAnalyzer = Boolean(analyzerUrl);
  }

  return { analyzerUrl, useAnalyzer };
}

const RUNTIME_ANALYZER_CONFIG = getRuntimeAnalyzerConfig();
const BACKEND_ANALYZER_URL = RUNTIME_ANALYZER_CONFIG.analyzerUrl;
const USE_BACKEND_ANALYZER = RUNTIME_ANALYZER_CONFIG.useAnalyzer;

const DOC_RULES = [
  { type: "INV", patterns: [/\binvoice\b/i, /commercial invoice/i, /tax invoice/i, /\binv\b/i] },
  { type: "PKL", patterns: [/packing list/i, /\bpkl\b/i] },
  { type: "BOL", patterns: [/bill of lading/i, /\bb\/l\b/i, /\bb\/l no\b/i, /\bbl no\b/i] },
  { type: "HC", patterns: [/health certificate/i, /\bhc\b/i] },
  { type: "PC", patterns: [/phytosanitary certificate/i, /\bpc\b/i] },
  { type: "COO", patterns: [/certificate of origin/i, /\bcoo\b/i] },
  { type: "COA", patterns: [/certificate of analysis/i, /\bcoa\b/i] },
  { type: "CAD", patterns: [/certificate of admissibility/i, /\bcad\b/i] }
];
const KNOWN_DOC_TYPES = ["INV", "PKL", "BOL", "HC", "PC", "COO", "COA", "CAD"];
const CONTEXT_STATES = [...KNOWN_DOC_TYPES, "UNKNOWN"];

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileNameEl = document.getElementById("fileName");
const vendorCodeInput = document.getElementById("vendorCode");
const poCodeInput = document.getElementById("poCode");
const processBtn = document.getElementById("processBtn");
const logEl = document.getElementById("log");
const resultsSection = document.getElementById("resultsSection");
const resultsGrid = document.getElementById("resultsGrid");
const downloadSelectedBtn = document.getElementById("downloadSelectedBtn");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const previewModal = document.getElementById("previewModal");
const previewFrame = document.getElementById("previewFrame");
const previewTitle = document.getElementById("previewTitle");
const previewCloseBtn = document.getElementById("previewCloseBtn");

let selectedFile = null;
let splitDocs = [];
let lastBatchCode = "";
let ocrWorker = null;
const NORMALIZE_TEXT_CACHE = new Map();
const NORMALIZE_ASCII_CACHE = new Map();
const APPROX_WORD_CACHE = new WeakMap();
const AI_HEADER_DECISION_CACHE = new Map();

function log(message) {
  logEl.textContent += `${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function resetLog() {
  logEl.textContent = "";
}

function setSelectedFile(file) {
  selectedFile = file;
  fileNameEl.textContent = file ? `Selected: ${file.name}` : "";
  processBtn.disabled = !selectedFile;
}

function sanitizeCodePart(value) {
  return value.trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_-]/g, "");
}

function normalizeDocType(type) {
  const normalized = String(type || "").trim().toUpperCase();
  if (KNOWN_DOC_TYPES.includes(normalized)) {
    return normalized;
  }
  return "UNKNOWN";
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

function clampConfidence(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}

function fastHash(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildBackendAnalyzerEndpoints() {
  const base = String(BACKEND_ANALYZER_URL || "").trim().replace(/\/+$/, "");
  if (!base) return [];
  // Gửi thẳng vào link Hugging Face
  return [base];
}

function readBackendType(data) {
  if (!data || typeof data !== "object") return "UNKNOWN";
  const candidate = data.type ?? data.docType ?? data.label ?? data.result?.type ?? data.result?.docType ?? data.prediction?.type ?? "";
  return normalizeDocType(candidate);
}

function readBackendConfidence(data) {
  if (!data || typeof data !== "object") return 0;
  return clampConfidence(data.confidence ?? data.score ?? data.result?.confidence ?? data.prediction?.confidence ?? 0);
}

function hasReliableRuleSupportForType(type, text, headerHint) {
  const normalized = normalizeText(text);
  const normalizedHeader = normalizeText(headerHint || text.slice(0, 1600));
  const normalizedHeaderAscii = normalizeAscii(headerHint || text.slice(0, 1600));
  const words = normalized.split(" ").filter(Boolean);
  const scores = buildTypeScores(normalized, normalizedHeader, normalizedHeaderAscii, words);
  const support = getTypePrimaryScore(type, scores);
  return support >= 4;
}

function detectDocType(text, headerHint = "") {
  const normalizedFull = normalizeText(text);
  const normalizedHeader = normalizeText(headerHint || text.slice(0, 1600));
  const compactHeader = normalizedHeader.replace(/\s+/g, "");
  const normalizedHeaderAscii = normalizeAscii(headerHint || text.slice(0, 1600));
  const headerType = resolveHeaderType(normalizedHeader, compactHeader, normalizedHeaderAscii);
  if (headerType !== "UNKNOWN") {
    return headerType;
  }

  const words = normalizedFull.split(" ").filter(Boolean);
  const scored = buildTypeScores(normalizedFull, normalizedHeader, normalizedHeaderAscii, words);
  const { pklScore, invScore, bolScore, pcScore, hcScore, cooScore } = scored;

  if (invScore >= 6 && invScore >= pklScore && invScore >= bolScore && invScore >= pcScore && invScore >= hcScore && invScore >= cooScore) return "INV";
  if (pklScore >= 6 && pklScore >= invScore + 1 && pklScore >= bolScore && pklScore >= pcScore && pklScore >= hcScore && pklScore >= cooScore) return "PKL";
  if (pcScore >= 5 && pcScore >= pklScore && pcScore >= bolScore && pcScore >= invScore && pcScore >= hcScore && pcScore >= cooScore) return "PC";
  if (hcScore >= 5 && hcScore >= pcScore && hcScore >= cooScore && hcScore >= bolScore) return "HC";
  if (cooScore >= 5 && cooScore >= pcScore && cooScore >= hcScore && cooScore >= bolScore) return "COO";
  if (bolScore >= 8 && bolScore >= pklScore + 2) return "BOL";

  const quick = detectDocTypeByRegex(text);
  if (quick !== "UNKNOWN") {
    if (quick === "BOL") {
      if (pklScore >= 6 && pklScore >= bolScore) return "PKL";
      if (bolScore >= 6) return "BOL";
      return "UNKNOWN";
    }
    return quick;
  }

  const normalized = normalizedFull;
  if (looksLikePackingList(normalized, words)) return "PKL";
  if (looksLikeInvoice(normalized, words)) return "INV";
  if (looksLikeCertificate(normalized, words, "health")) return "HC";
  if (looksLikeCertificate(normalized, words, "phyto")) return "PC";
  if (looksLikeCOO(normalized, words)) return "COO";
  if (looksLikeCOA(normalized, words)) return "COA";
  if (looksLikeCAD(normalized, words)) return "CAD";
  
  if (hasApproxWord(words, "health", 2) && hasApproxWord(words, "certificate", 3) && !normalized.includes("analysis certificate") && !normalized.includes("certificate of quantity and quality")) {
    return "HC";
  }
  if (looksLikeInspectionCertificateUnknown(normalized)) return "UNKNOWN";
  if (looksLikePackingDetailUnknown(normalized)) return "UNKNOWN";
  if (looksLikeBOL(normalized, words)) return "BOL";

  return "UNKNOWN";
}

function buildTypeScores(normalizedFull, normalizedHeader, normalizedHeaderAscii, words) {
  let pklScore = scorePKL(normalizedFull, normalizedHeader, words);
  let invScore = scoreINV(normalizedFull, normalizedHeader, words);
  let bolScore = scoreBOL(normalizedFull, normalizedHeader, words);
  let pcScore = scorePC(normalizedFull, normalizedHeader, words);
  let hcScore = scoreHC(normalizedFull, normalizedHeader, words);
  let cooScore = scoreCOO(normalizedFull, normalizedHeader, words);
  let coaScore = scoreCOA(normalizedFull, normalizedHeader, words);
  let cadScore = scoreCAD(normalizedFull, normalizedHeader, words);

  const profile = scoreHeaderProfiles(normalizedHeader, normalizedHeaderAscii);
  if (profile.government >= 3) {
    pcScore += 2; hcScore += 2; cooScore += 2; coaScore += 1; cadScore += 1; bolScore -= 3; invScore -= 1; pklScore -= 1;
  }
  if (profile.carrier >= 2) {
    bolScore += 3; pklScore -= 2; invScore -= 1;
  }
  if (profile.enterprise >= 2) {
    invScore += 2; pklScore += 2; bolScore -= 2;
  }

  return { invScore, pklScore, bolScore, pcScore, hcScore, cooScore, coaScore, cadScore };
}

function getTypePrimaryScore(type, scores) {
  switch (type) {
    case "INV": return scores.invScore;
    case "PKL": return scores.pklScore;
    case "BOL": return scores.bolScore;
    case "PC": return scores.pcScore;
    case "HC": return scores.hcScore;
    case "COO": return scores.cooScore;
    case "COA": return scores.coaScore;
    case "CAD": return scores.cadScore;
    default: return 0;
  }
}

function resolveHeaderType(normalizedHeader, compactHeader, normalizedHeaderAscii) {
  const strictHeaderType = detectTypeByStrictHeader(normalizedHeader, compactHeader, normalizedHeaderAscii);
  if (strictHeaderType !== "UNKNOWN") return strictHeaderType;
  return detectTypeByHeader(normalizedHeader);
}

function detectTypeByHeader(normalizedHeader) {
  if (!normalizedHeader) return "UNKNOWN";
  if (normalizedHeader.includes("packing list") || (normalizedHeader.includes("packing") && normalizedHeader.includes("list"))) return "PKL";
  if (normalizedHeader.includes("phytosanitary") || (normalizedHeader.includes("phyto") && normalizedHeader.includes("certificate")) || (normalizedHeader.includes("plant") && normalizedHeader.includes("quarantine"))) return "PC";
  if (normalizedHeader.includes("health certificate")) return "HC";
  if (normalizedHeader.includes("certificate of analysis")) return "COA";
  if (normalizedHeader.includes("or multimodal transport document")) return "BOL";
  if (normalizedHeader.includes("bill of lading") && !normalizedHeader.includes("bill of lading no") && !normalizedHeader.includes("shipping details")) return "BOL";
  if (normalizedHeader.includes("certificate of origin")) return "COO";
  if (normalizedHeader.includes("commercial invoice") || normalizedHeader.includes("tax invoice")) return "INV";
  return "UNKNOWN";
}

function detectTypeByStrictHeader(normalizedHeader, compactHeader, normalizedHeaderAscii) {
  if (normalizedHeader.includes("commercial invoice") || normalizedHeader.includes("tax invoice") || compactHeader.includes("commercialinvoice")) return "INV";
  if (normalizedHeader.includes("phytosanitary certificate") || compactHeader.includes("phytosanitarycertificate") || (normalizedHeader.includes("plant") && normalizedHeader.includes("protection")) || normalizedHeaderAscii.includes("giay chung nhan kiem dich thuc vat")) return "PC";
  if (normalizedHeader.includes("packing list") || compactHeader.includes("packinglist")) return "PKL";
  return "UNKNOWN";
}

function detectDocTypeByRegex(text) {
  for (const rule of DOC_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.type;
    }
  }
  return "UNKNOWN";
}

function getCachedNormalized(cache, input, normalizer) {
  const value = String(input || "");
  const cached = cache.get(value);
  if (cached !== undefined) return cached;
  const normalized = normalizer(value);
  cache.set(value, normalized);
  if (cache.size > 500) cache.clear();
  return normalized;
}

function normalizeText(text) {
  return getCachedNormalized(NORMALIZE_TEXT_CACHE, text, (value) =>
    value.toLowerCase().replace(/[\r\n\t]+/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
  );
}

function normalizeAscii(text) {
  return getCachedNormalized(NORMALIZE_ASCII_CACHE, text, (value) =>
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\r\n\t]+/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
  );
}

function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function hasApproxWord(words, target, maxDistance) {
  if (!words.length) return false;
  const normalizedTarget = String(target || "").toLowerCase();
  const cacheKey = `${normalizedTarget}|${maxDistance}`;
  let wordsCache = APPROX_WORD_CACHE.get(words);
  if (!wordsCache) {
    wordsCache = new Map();
    APPROX_WORD_CACHE.set(words, wordsCache);
  }
  if (wordsCache.has(cacheKey)) return wordsCache.get(cacheKey);
  if (words.includes(normalizedTarget)) {
    wordsCache.set(cacheKey, true);
    return true;
  }
  const found = words.some((word) => {
    if (Math.abs(word.length - normalizedTarget.length) > maxDistance) return false;
    return levenshteinDistance(word, normalizedTarget) <= maxDistance;
  });
  wordsCache.set(cacheKey, found);
  return found;
}

function hasNearPhrase(normalized, phrase) {
  return normalized.includes(phrase);
}

function looksLikePackingList(normalized, words) {
  if (hasNearPhrase(normalized, "packing list")) return true;
  const hasPacking = hasApproxWord(words, "packing", 2);
  const hasList = hasApproxWord(words, "list", 1);
  const hasPkl = words.includes("pkl") || words.includes("pk1");
  return (hasPacking && hasList) || hasPkl;
}

function looksLikeInvoice(normalized, words) {
  if (hasNearPhrase(normalized, "commercial invoice") || hasNearPhrase(normalized, "tax invoice")) return true;
  if (normalized.includes("certificate of origin") || normalized.includes("certificate of analysis") || normalized.includes("certificate of quantity and quality") || normalized.includes("analysis certificate") || normalized.includes("bill of lading")) return false;
  return hasApproxWord(words, "invoice", 2) || words.includes("inv");
}

function looksLikeInspectionCertificateUnknown(normalized) {
  const strongInspectionSignals = normalized.includes("certificate of quantity and quality") || normalized.includes("analysis certificate") || normalized.includes("results of inspection");
  const labSignals = normalized.includes("vinacontrol") || normalized.includes("surveyor") || normalized.includes("deputy manager") || normalized.includes("fit for human consumption");
  const explicitKnownDocSignal = normalized.includes("health certificate") || normalized.includes("certificate of origin") || normalized.includes("certificate of analysis") || normalized.includes("commercial invoice") || normalized.includes("packing list") || normalized.includes("bill of lading");
  return (strongInspectionSignals || labSignals) && !explicitKnownDocSignal;
}

function looksLikePackingDetailUnknown(normalized) {
  const signals = (normalized.includes("detail of packing") && normalized.includes("contract") && normalized.includes("dop no")) || (normalized.includes("detail of packing") && normalized.includes("batch number"));
  const explicitKnownDocSignal = normalized.includes("packing list") || normalized.includes("commercial invoice") || normalized.includes("certificate of origin") || normalized.includes("certificate of analysis") || normalized.includes("health certificate") || normalized.includes("bill of lading");
  return signals && !explicitKnownDocSignal;
}

function scoreHeaderProfiles(normalizedHeader, normalizedHeaderAscii) {
  let government = 0, carrier = 0, enterprise = 0;
  const govTokens = ["ministry", "department", "republic", "government", "plant protection", "veterinary", "animal health", "quarantine"];
  const govAsciiTokens = ["bo nong nghiep", "cuc thu y", "kiem dich", "thuc vat", "bao ve thuc vat"];
  const carrierTokens = ["shipping", "logistics", "carrier", "vessel", "voyage", "bill of lading", "multimodal transport", "ocean"];
  const enterpriseTokens = ["company", "co ltd", "limited", "inc", "corporation", "exporter", "seller", "consignee"];

  govTokens.forEach((token) => { if (normalizedHeader.includes(token)) government += 1; });
  govAsciiTokens.forEach((token) => { if (normalizedHeaderAscii.includes(token)) government += 1; });
  carrierTokens.forEach((token) => { if (normalizedHeader.includes(token)) carrier += 1; });
  enterpriseTokens.forEach((token) => { if (normalizedHeader.includes(token)) enterprise += 1; });

  return { government, carrier, enterprise };
}

function scoreINV(normalized, header, words) {
  let score = 0;
  if (header.includes("commercial invoice") || header.includes("tax invoice")) score += 10;
  else if (header.includes("invoice") && !header.includes("invoice no") && !header.includes("bill of lading") && !header.includes("certificate")) score += 4;
  if (normalized.includes("commercial invoice") || normalized.includes("tax invoice")) score += 8;
  if (hasApproxWord(words, "invoice", 2)) score += 2;
  if (words.includes("inv")) score += 2;
  if (normalized.includes("balance amount")) score += 2;
  if (normalized.includes("in words")) score += 1;
  if (normalized.includes("bill of lading") || normalized.includes("certificate of origin") || normalized.includes("certificate of analysis")) score -= 6;
  return score;
}

function looksLikeBOL(normalized, words) {
  const hasCertificateSignals = normalized.includes("health certificate") || normalized.includes("certificate of analysis") || normalized.includes("certificate of origin") || normalized.includes("certificate of admissibility") || normalized.includes("phytosanitary") || normalized.includes("phyto certificate");
  if (hasNearPhrase(normalized, "or multimodal transport document")) return true;
  if (hasNearPhrase(normalized, "bill of lading")) {
    if (normalized.includes("shipping details") || hasCertificateSignals) return false;
    return true;
  }
  const hasBill = hasApproxWord(words, "bill", 1);
  const hasLading = hasApproxWord(words, "lading", 2);
  const hasBol = words.includes("bol") || words.includes("bl");
  if (normalized.includes("shipping details") || hasCertificateSignals) return false;
  return (hasBill && hasLading) || (hasBol && !hasCertificateSignals);
}

function scorePKL(normalized, header, words) {
  let score = 0;
  if (header.includes("packing list")) score += 9;
  if (hasNearPhrase(normalized, "packing list")) score += 5;
  if (hasApproxWord(words, "packing", 2)) score += 2;
  if (hasApproxWord(words, "list", 1)) score += 1;
  if (words.includes("pkl") || words.includes("pk1")) score += 3;
  if (normalized.includes("shipping details")) score += 1;
  if (normalized.includes("shipping details") && (normalized.includes("consignor") || normalized.includes("consignee"))) score += 1;
  if (normalized.includes("vendor fda") || normalized.includes("vendor duns")) score += 1;
  if (normalized.includes("container seal") || normalized.includes("container seal no")) score += 2;
  if (normalized.includes("gross weight") && normalized.includes("net weight")) score += 3;
  if (normalized.includes("marks") && normalized.includes("nos")) score += 2;
  if (normalized.includes("description of goods")) score += 1;
  if (normalized.includes("quantity") && (normalized.includes("carton") || normalized.includes("ctn") || normalized.includes("package"))) score += 2;
  if (normalized.includes("commercial invoice") || normalized.includes("tax invoice") || hasApproxWord(words, "invoice", 2)) score -= 7;
  if (normalized.includes("invoice no")) score -= 2;
  if (normalized.includes("balance amount")) score -= 3;
  if (normalized.includes("in words")) score -= 2;
  if (normalized.includes("certificate of quantity and quality") || normalized.includes("analysis certificate") || normalized.includes("results of inspection") || normalized.includes("vinacontrol")) score -= 8;
  if (looksLikePackingDetailUnknown(normalized)) score -= 7;
  return score;
}

function scoreBOL(normalized, header, words) {
  let score = 0;
  if (header.includes("or multimodal transport document")) score += 11;
  else if (header.includes("bill of lading") && !header.includes("bill of lading no") && !header.includes("shipping details")) score += 6;
  else if (header.includes("bill of lading no")) score += 1;
  if (normalized.includes("or multimodal transport document")) score += 4;
  if (hasNearPhrase(normalized, "bill of lading")) score += 2;
  if (header.includes("packing list")) score -= 6;
  if (hasNearPhrase(normalized, "packing list")) score -= 4;
  if (normalized.includes("bill of lading no") && !header.includes("bill of lading")) score -= 2;
  if (header.includes("bill of lading no") && !header.includes("or multimodal transport document")) score -= 3;
  if (normalized.includes("shipping details") && !header.includes("bill of lading")) score -= 8;
  if (header.includes("invoice")) score -= 5;
  return score;
}

function looksLikeCertificate(normalized, words, mode) {
  const hasCertificate = hasApproxWord(words, "certificate", 2);
  if (!hasCertificate) return false;
  if (mode === "health") return hasApproxWord(words, "health", 2) || words.includes("hc");
  return hasApproxWord(words, "phyto", 2) || hasApproxWord(words, "phytosanitary", 3) || hasApproxWord(words, "quarantine", 2) || words.includes("pc");
}

function scorePC(normalized, header, words) {
  let score = 0;
  if (header.includes("phytosanitary")) score += 8;
  if ((header.includes("phyto") && header.includes("certificate")) || header.includes("phyto certificate")) score += 6;
  if (header.includes("plant") && header.includes("quarantine")) score += 5;
  if (normalized.includes("phytosanitary")) score += 4;
  if (normalized.includes("plant") && normalized.includes("quarantine")) score += 4;
  if (normalized.includes("additional declaration")) score += 2;
  if (hasApproxWord(words, "quarantine", 2)) score += 2;
  if (hasApproxWord(words, "phyto", 2) || hasApproxWord(words, "phytosanitary", 3)) score += 2;
  if (words.includes("pc")) score += 1;
  if (normalized.includes("certificate of origin") || normalized.includes("certificate of analysis") || normalized.includes("certificate of admissibility")) score -= 4;
  return score;
}

function scoreHC(normalized, header, words) {
  let score = 0;
  if (header.includes("health certificate")) score += 8;
  if (normalized.includes("health certificate")) score += 4;
  if (hasApproxWord(words, "health", 2)) score += 2;
  if (hasApproxWord(words, "veterinary", 2)) score += 2;
  if (words.includes("hc")) score += 1;
  if (hasApproxWord(words, "health", 2) && hasApproxWord(words, "certificate", 3)) score += 6;
  if (normalized.includes("fit for human consumption")) score += 3;
  if (normalized.includes("vinacontrol")) score += 1;
  return score;
}

function scoreCOO(normalized, header, words) {
  let score = 0;
  if (header.includes("certificate of origin")) score += 8;
  if (normalized.includes("certificate of origin")) score += 4;
  if (hasApproxWord(words, "origin", 2)) score += 2;
  if (words.includes("coo")) score += 1;
  return score;
}

function scoreCOA(normalized, header, words) {
  let score = 0;
  if (header.includes("certificate of analysis")) score += 8;
  if (normalized.includes("certificate of analysis")) score += 4;
  if (hasApproxWord(words, "analysis", 2)) score += 2;
  if (words.includes("coa")) score += 1;
  return score;
}

function scoreCAD(normalized, header, words) {
  let score = 0;
  if (header.includes("certificate of admissibility")) score += 8;
  if (normalized.includes("certificate of admissibility")) score += 4;
  if (hasApproxWord(words, "admissibility", 3)) score += 2;
  if (words.includes("cad")) score += 1;
  return score;
}

function looksLikeCOA(normalized, words) {
  if (hasNearPhrase(normalized, "certificate of analysis")) return true;
  return hasApproxWord(words, "certificate", 2) && (hasApproxWord(words, "analysis", 2) || words.includes("coa"));
}

function looksLikeCOO(normalized, words) {
  if (hasNearPhrase(normalized, "certificate of origin")) return true;
  return hasApproxWord(words, "certificate", 2) && (hasApproxWord(words, "origin", 2) || words.includes("coo"));
}

function looksLikeCAD(normalized, words) {
  if (hasNearPhrase(normalized, "certificate of admissibility")) return true;
  return hasApproxWord(words, "certificate", 2) && (hasApproxWord(words, "admissibility", 3) || words.includes("cad"));
}

function buildGroups(pageTypes) {
  const raw = [];
  for (const item of pageTypes) {
    const prev = raw.at(-1);
    if (!prev || prev.type !== item.type) {
      raw.push({ type: item.type, pages: [item.pageNumber] });
    } else {
      prev.pages.push(item.pageNumber);
    }
  }

  const groups = [];
  for (let i = 0; i < raw.length; i += 1) {
    const current = raw[i];
    if (current.type !== "UNKNOWN") {
      groups.push({ type: current.type, pages: current.pages.slice() });
      continue;
    }
    const prev = groups.at(-1);
    const next = raw[i + 1];
    if (prev && next && next.type === prev.type) {
      prev.pages.push(...current.pages, ...next.pages);
      i += 1;
      continue;
    }
    groups.push({ type: "UNKNOWN", pages: current.pages.slice() });
  }
  return groups;
}

async function getOcrWorker() {
  if (ocrWorker) return ocrWorker;
  log("Initializing OCR engine...");
  ocrWorker = await Tesseract.createWorker("eng", 1, OCR_OPTIONS);
  return ocrWorker;
}

async function terminateOcrWorker() {
  if (!ocrWorker) return;
  try { await ocrWorker.terminate(); } catch {}
  ocrWorker = null;
}

function applyThreshold(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const value = gray > 165 ? 255 : 0;
    data[i] = value; data[i + 1] = value; data[i + 2] = value;
  }
  context.putImageData(imageData, 0, 0);
}

function buildOcrTargetCanvas(fullCanvas, headerOnly, cropRatio = OCR_HEADER_HEIGHT_RATIO) {
  if (!headerOnly) return fullCanvas;
  const cropHeight = Math.max(1, Math.floor(fullCanvas.height * cropRatio));
  const cropped = document.createElement("canvas");
  cropped.width = fullCanvas.width;
  cropped.height = cropHeight;
  const cctx = cropped.getContext("2d");
  cctx.drawImage(fullCanvas, 0, 0, fullCanvas.width, cropHeight, 0, 0, fullCanvas.width, cropHeight);
  return cropped;
}

async function buildHeaderImageDataUrl(page) {
  const viewport = page.getViewport({ scale: AI_HEADER_RENDER_SCALE });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));

  await page.render({ canvasContext: context, viewport }).promise;
  const headerCanvas = buildOcrTargetCanvas(canvas, true);
  return headerCanvas.toDataURL("image/jpeg", 0.8);
}

async function classifyPageByBackendHeaderAI(page, pageNumber, hint) {
  if (!USE_BACKEND_ANALYZER) return null;
  const endpoints = buildBackendAnalyzerEndpoints();
  if (!endpoints.length) return null;

  let imageDataUrl;
  try { imageDataUrl = await buildHeaderImageDataUrl(page); } catch { return null; }

  const cacheKey = fastHash(imageDataUrl.slice(0, 18000));
  if (AI_HEADER_DECISION_CACHE.has(cacheKey)) return AI_HEADER_DECISION_CACHE.get(cacheKey);

  const payload = {
    task: "pdf-doc-type-header-classification",
    pageNumber,
    knownTypes: KNOWN_DOC_TYPES,
    minConfidence: AI_MIN_CONFIDENCE,
    image: imageDataUrl,
    hint: String(hint || "")
  };

  let best = { type: "UNKNOWN", confidence: 0 };
  for (const endpoint of endpoints) {
    try {
      const response = await withTimeout(
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }),
        Math.min(BACKEND_ANALYZER_TIMEOUT_MS, AI_ANALYZER_TIMEOUT_MS),
        "AI analyzer timeout"
      );
      if (!response.ok) continue;
      const data = await response.json();
      const type = readBackendType(data);
      const confidence = readBackendConfidence(data);
      if (type !== "UNKNOWN" && confidence >= best.confidence) best = { type, confidence };
      if (best.type !== "UNKNOWN" && best.confidence >= AI_MIN_CONFIDENCE) break;
    } catch {
      // Ignore AI endpoint failure and keep fallback path.
    }
  }

  const accepted = best.type !== "UNKNOWN" && best.confidence >= AI_MIN_CONFIDENCE;
  const decision = { type: accepted ? best.type : "UNKNOWN", confidence: best.confidence, accepted };
  AI_HEADER_DECISION_CACHE.set(cacheKey, decision);
  if (AI_HEADER_DECISION_CACHE.size > 300) AI_HEADER_DECISION_CACHE.clear();
  return decision;
}

async function runOcrOnPage(page, pageNumber, options) {
  const { scale, preprocess, headerOnly, stage, cropRatio = OCR_HEADER_HEIGHT_RATIO } = options;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  await page.render({ canvasContext: context, viewport }).promise;
  if (preprocess) applyThreshold(context, canvas.width, canvas.height);

  const targetCanvas = buildOcrTargetCanvas(canvas, headerOnly, cropRatio);
  log(`Page ${pageNumber}: OCR ${stage}...`);
  const worker = await getOcrWorker();
  const result = await worker.recognize(targetCanvas);

  return (result?.data?.text || "").trim();
}

async function makeThumbnailFromPage(page) {
  const viewport = page.getViewport({ scale: THUMB_SCALE });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.82);
}

async function extractPageTypes(pdf) {
  const results = [];

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const nativeText = textContent.items.map((it) => it.str).join(" ").trim();
    let finalText = nativeText;
    let source = "text-layer";
    let headerText = nativeText.slice(0, 1600);
    let aiForcedType = "UNKNOWN";
    let aiConfidence = 0;

    if (nativeText.length < MIN_TEXT_CHARS) {
      source = "ocr-title";
      const titleText = await runOcrOnPage(page, i, { scale: OCR_TITLE_SCALE, preprocess: false, headerOnly: true, cropRatio: OCR_TITLE_HEIGHT_RATIO, stage: "title" });
      headerText = titleText; finalText = titleText;
      let typeFirstPass = detectDocType(finalText, headerText);

      if (typeFirstPass === "UNKNOWN") {
        source = "ocr-header";
        const headerOcr = await runOcrOnPage(page, i, { scale: OCR_HEADER_SCALE, preprocess: true, headerOnly: true, stage: "header" });
        headerText = `${titleText}\n${headerOcr}`.trim(); finalText = headerText;
        typeFirstPass = detectDocType(finalText, headerText);
      }

      if (typeFirstPass === "UNKNOWN") {
        if (USE_BACKEND_ANALYZER) log(`Page ${i}: AI header classify...`);
        const aiDecision = await classifyPageByBackendHeaderAI(page, i, headerText);
        const aiAccepted = aiDecision?.accepted && hasReliableRuleSupportForType(aiDecision.type, finalText, headerText);
        if (aiAccepted) {
          aiForcedType = aiDecision.type; aiConfidence = aiDecision.confidence; source = `ai-header(${aiConfidence.toFixed(2)})`;
        } else {
          if (aiDecision?.accepted) log(`Page ${i}: AI decision rejected by rule support gate.`);
          source = "ocr-full";
          const fullText = await runOcrOnPage(page, i, { scale: OCR_RENDER_SCALE, preprocess: false, headerOnly: false, stage: "full" });
          finalText = `${headerText}\n${fullText}`.trim();
          typeFirstPass = detectDocType(finalText, headerText);
        }
      }

      if (typeFirstPass === "UNKNOWN" && aiForcedType === "UNKNOWN") {
        source = "ocr-retry";
        const retryText = await runOcrOnPage(page, i, { scale: OCR_RETRY_SCALE, preprocess: true, headerOnly: false, stage: "retry" });
        finalText = `${finalText}\n${retryText}`.trim();
      }
    } else {
      let typeFromTextLayer = detectDocType(finalText, headerText);
      if (typeFromTextLayer === "UNKNOWN") {
        source = "text-layer+ocr-title";
        const titleRecover = await runOcrOnPage(page, i, { scale: OCR_TITLE_SCALE, preprocess: false, headerOnly: true, cropRatio: OCR_TITLE_HEIGHT_RATIO, stage: "title-recover" });
        headerText = `${headerText}\n${titleRecover}`.trim(); finalText = `${finalText}\n${titleRecover}`.trim();
        typeFromTextLayer = detectDocType(finalText, headerText);
      }

      if (typeFromTextLayer === "UNKNOWN") {
        if (USE_BACKEND_ANALYZER) log(`Page ${i}: AI header classify...`);
        const aiDecision = await classifyPageByBackendHeaderAI(page, i, headerText);
        const aiAccepted = aiDecision?.accepted && hasReliableRuleSupportForType(aiDecision.type, finalText, headerText);
        if (aiAccepted) {
          aiForcedType = aiDecision.type; aiConfidence = aiDecision.confidence; source = `text-layer+ai-header(${aiConfidence.toFixed(2)})`;
        } else {
          if (aiDecision?.accepted) log(`Page ${i}: AI decision rejected by rule support gate.`);
          source = "text-layer+ocr-header";
          const headerOcr = await runOcrOnPage(page, i, { scale: OCR_HEADER_SCALE, preprocess: true, headerOnly: true, stage: "header-recover" });
          headerText = `${headerText}\n${headerOcr}`.trim(); finalText = `${finalText}\n${headerOcr}`.trim();
          typeFromTextLayer = detectDocType(finalText, headerText);

          if (typeFromTextLayer === "UNKNOWN") {
            source = "text-layer+ocr-full";
            const fullRecover = await runOcrOnPage(page, i, { scale: OCR_RENDER_SCALE, preprocess: false, headerOnly: false, stage: "full-recover" });
            finalText = `${finalText}\n${fullRecover}`.trim();
          }
        }
      }
    }

    const ruleType = detectDocType(finalText, headerText);
    const type = aiForcedType !== "UNKNOWN" ? aiForcedType : ruleType;
    const normalized = normalizeText(finalText);
    const normalizedHeader = normalizeText(headerText);
    const normalizedHeaderAscii = normalizeAscii(headerText);
    const words = normalized.split(" ").filter(Boolean);
    const isInspectionUnknown = looksLikeInspectionCertificateUnknown(normalized);
    const isPackingDetailUnknown = looksLikePackingDetailUnknown(normalized);
    const unknownBoost = (isInspectionUnknown ? 6 : 0) + (isPackingDetailUnknown ? 5 : 0) + (type === "UNKNOWN" ? 1 : 0);
    const scores = buildTypeScores(normalized, normalizedHeader, normalizedHeaderAscii, words);
    const headerType = resolveHeaderType(normalizedHeader, normalizedHeader.replace(/\s+/g, ""), normalizedHeaderAscii);
    const primaryScore = getTypePrimaryScore(type, scores);
    
    results.push({
      pageNumber: i, type, source, aiType: aiForcedType, aiConfidence: aiConfidence || 0, unknownBoost, chars: finalText.length, headerType, primaryScore, ...scores
    });
  }
  return refinePageTypes(results);
}

function transitionPenalty(prevType, nextType) {
  if (prevType === nextType) return 1.6;
  if (prevType === "UNKNOWN" || nextType === "UNKNOWN") return -0.5;
  const pair = `${prevType}->${nextType}`;
  const softPairs = new Set(["INV->PKL", "PKL->INV", "HC->PC", "PC->HC", "HC->COO", "COO->HC", "PC->COO", "COO->PC"]);
  if (softPairs.has(pair)) return -1.2;
  return -2.7;
}

function buildStateScoreMap(item) {
  const map = { INV: item.invScore ?? 0, PKL: item.pklScore ?? 0, BOL: item.bolScore ?? 0, HC: item.hcScore ?? 0, PC: item.pcScore ?? 0, COO: item.cooScore ?? 0, COA: item.coaScore ?? 0, CAD: item.cadScore ?? 0, UNKNOWN: 0 };
  if (item.headerType && item.headerType !== "UNKNOWN") map[item.headerType] += 5;
  if (item.type && item.type !== "UNKNOWN") map[item.type] += 1.5;
  if (item.unknownBoost) {
    map.UNKNOWN += item.unknownBoost;
    if (item.unknownBoost >= 5) { KNOWN_DOC_TYPES.forEach((type) => { map[type] -= 1.5; }); }
  }
  const maxKnown = Math.max(...KNOWN_DOC_TYPES.map((type) => map[type]));
  if (maxKnown <= 2) map.UNKNOWN += 3;
  else if (maxKnown <= 4) map.UNKNOWN += 1.2;
  return map;
}

function refinePageTypes(pageTypes) {
  if (!pageTypes.length) return [];
  const scoreMaps = pageTypes.map(buildStateScoreMap);
  const stateCount = CONTEXT_STATES.length;
  const dp = Array.from({ length: pageTypes.length }, () => Array(stateCount).fill(Number.NEGATIVE_INFINITY));
  const backtrack = Array.from({ length: pageTypes.length }, () => Array(stateCount).fill(-1));

  for (let s = 0; s < stateCount; s += 1) dp[0][s] = scoreMaps[0][CONTEXT_STATES[s]];

  for (let i = 1; i < pageTypes.length; i += 1) {
    for (let s = 0; s < stateCount; s += 1) {
      const currState = CONTEXT_STATES[s];
      const emit = scoreMaps[i][currState];
      for (let p = 0; p < stateCount; p += 1) {
        const prevState = CONTEXT_STATES[p];
        const candidate = dp[i - 1][p] + transitionPenalty(prevState, currState) + emit;
        if (candidate > dp[i][s]) { dp[i][s] = candidate; backtrack[i][s] = p; }
      }
    }
  }

  let bestStateIdx = 0;
  for (let s = 1; s < stateCount; s += 1) {
    if (dp[pageTypes.length - 1][s] > dp[pageTypes.length - 1][bestStateIdx]) bestStateIdx = s;
  }

  const bestPath = Array(pageTypes.length);
  bestPath[pageTypes.length - 1] = bestStateIdx;
  for (let i = pageTypes.length - 1; i > 0; i -= 1) bestPath[i - 1] = backtrack[i][bestPath[i]];

  const refined = pageTypes.map((item, i) => {
    const nextType = CONTEXT_STATES[bestPath[i]] || item.type || "UNKNOWN";
    const next = { ...item, type: nextType };
    next.primaryScore = getTypePrimaryScore(next.type, next);
    return next;
  });

  for (let i = 1; i < refined.length; i += 1) {
    const curr = refined[i]; const prev = refined[i - 1];
    if (curr.type === "UNKNOWN" && prev?.type === "HC" && curr.chars >= 1200 && String(curr.source || "").includes("ocr")) {
      curr.type = "HC"; curr.primaryScore = getTypePrimaryScore(curr.type, curr);
    }
  }
  return refined;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

async function buildZipBlob(docs) {
  const zip = new JSZip();
  docs.forEach((doc) => zip.file(doc.fileName, doc.bytes));
  return zip.generateAsync({ type: "blob" });
}

function closePreview() {
  previewModal.hidden = true;
  previewFrame.removeAttribute("src");
}

function openPreview(docId) {
  const doc = splitDocs.find((item) => item.id === docId);
  if (!doc) return;
  previewTitle.textContent = doc.fileName;
  previewFrame.src = doc.previewUrl;
  previewModal.hidden = false;
}

function revokeDocUrls() {
  splitDocs.forEach((doc) => { if (doc.previewUrl) URL.revokeObjectURL(doc.previewUrl); });
}

function clearResults() {
  closePreview(); revokeDocUrls(); splitDocs = [];
  resultsGrid.innerHTML = ""; resultsSection.hidden = true;
}

function createDocCard(doc) {
  const card = document.createElement("article");
  card.className = "doc-card";
  card.innerHTML = `
    <img class="doc-thumb" src="${doc.thumbnail}" alt="${doc.fileName}" data-preview-id="${doc.id}">
    <div class="doc-body">
      <p class="doc-name">${doc.fileName}</p>
      <p class="doc-meta">Type: ${doc.type} | Pages: ${doc.pages.join(", ")}</p>
      <div class="doc-row">
        <label class="doc-select-wrap">
          <input class="doc-select" type="checkbox" data-doc-id="${doc.id}" checked>
          <span>Select</span>
        </label>
        <button class="mini-btn" type="button" data-download-id="${doc.id}">Download</button>
      </div>
    </div>
  `;
  return card;
}

function appendDocCard(doc) {
  if (resultsSection.hidden) resultsSection.hidden = false;
  resultsGrid.appendChild(createDocCard(doc));
}

function getDocById(docId) { return splitDocs.find((doc) => doc.id === docId); }

function getSelectedDocs() {
  const checked = Array.from(resultsGrid.querySelectorAll(".doc-select:checked"));
  const ids = checked.map((el) => el.getAttribute("data-doc-id"));
  return ids.map(getDocById).filter(Boolean);
}

async function splitGroupsIncremental(arrayBuffer, groups, filePrefix, pdf) {
  const src = await PDFLib.PDFDocument.load(arrayBuffer);
  const typeCount = {};

  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    const out = await PDFLib.PDFDocument.create();
    const indices = group.pages.map((n) => n - 1);
    const copiedPages = await out.copyPages(src, indices);
    copiedPages.forEach((p) => out.addPage(p));

    const bytes = await out.save();
    const count = (typeCount[group.type] || 0) + 1;
    typeCount[group.type] = count;
    const suffix = count > 1 ? `_${String(count).padStart(2, "0")}` : "";
    const fileName = `${filePrefix}_${group.type}${suffix}.pdf`;

    const thumbPage = await pdf.getPage(group.pages[0]);
    const thumbnail = await makeThumbnailFromPage(thumbPage);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const previewUrl = URL.createObjectURL(blob);

    const doc = { id: `doc-${i + 1}`, type: group.type, pages: group.pages.slice(), fileName, bytes, blob, previewUrl, thumbnail };
    splitDocs.push(doc); appendDocCard(doc); log(`Ready: ${fileName}`);
  }
}

async function handleProcess() {
  if (!selectedFile) return;
  resetLog(); clearResults();

  const vendorCode = sanitizeCodePart(vendorCodeInput.value).toUpperCase();
  const poCode = sanitizeCodePart(poCodeInput.value).toUpperCase();
  if (!vendorCode || !poCode) { log("Please input both Vendor code and PO#."); return; }
  const filePrefix = `${vendorCode}${poCode}`;

  processBtn.disabled = true; processBtn.textContent = "Processing...";

  try {
    log(`Reading file: ${selectedFile.name}`);
    const arrayBuffer = await selectedFile.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    log("OCR fallback: ON");
    log(`AI header classifier: ${USE_BACKEND_ANALYZER ? "ON" : "OFF"} (url=${BACKEND_ANALYZER_URL})`);
    log("Detecting doc type per page...");
    
    const pageTypes = await extractPageTypes(pdf);
    pageTypes.forEach((item) => log(`Page ${item.pageNumber}: ${item.type} (source=${item.source}, ai=${item.aiType || "UNKNOWN"}:${(item.aiConfidence || 0).toFixed(2)})`));

    const groups = buildGroups(pageTypes);
    groups.forEach((group, idx) => log(`Group ${idx + 1}: ${group.type}, pages: ${group.pages.join(", ")}`));

    log("Splitting documents and building previews...");
    lastBatchCode = filePrefix;
    await splitGroupsIncremental(arrayBuffer, groups, filePrefix, pdf);
    log(`Done. ${splitDocs.length} split file(s) ready.`);
  } catch (error) {
    log(`Error: ${error.message || error}`);
  } finally {
    processBtn.disabled = false; processBtn.textContent = "Split Documents";
  }
}

async function handleDownloadAll() {
  if (!splitDocs.length) { log("No split files yet."); return; }
  downloadAllBtn.disabled = true;
  try {
    log("Preparing ZIP for all split files...");
    const zipBlob = await buildZipBlob(splitDocs);
    const zipName = `split_docs_${lastBatchCode || "shipment"}.zip`;
    downloadBlob(zipBlob, zipName);
    log(`Downloaded: ${zipName}`);
  } catch (error) {
    log(`ZIP error: ${error.message || error}`);
  } finally {
    downloadAllBtn.disabled = false;
  }
}

function handleDownloadSelected() {
  const selected = getSelectedDocs();
  if (!selected.length) { log("Please select at least one file."); return; }
  selected.forEach((doc, idx) => { setTimeout(() => { downloadBlob(doc.blob, doc.fileName); }, idx * 180); });
  log(`Downloading ${selected.length} selected file(s)...`);
}

dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", () => { dropZone.classList.remove("drag-over"); });
dropZone.addEventListener("drop", (e) => {
  e.preventDefault(); dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files?.[0];
  if (file && file.type === "application/pdf") setSelectedFile(file);
  else { setSelectedFile(null); fileNameEl.textContent = "PDF file only."; }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file && file.type === "application/pdf") setSelectedFile(file);
  else { setSelectedFile(null); fileNameEl.textContent = "PDF file only."; }
});

processBtn.addEventListener("click", handleProcess);
downloadSelectedBtn.addEventListener("click", handleDownloadSelected);
downloadAllBtn.addEventListener("click", handleDownloadAll);

resultsGrid.addEventListener("click", (event) => {
  const previewTarget = event.target.closest("[data-preview-id]");
  if (previewTarget) { openPreview(previewTarget.getAttribute("data-preview-id")); return; }
  const button = event.target.closest("[data-download-id]");
  if (!button) return;
  const doc = getDocById(button.getAttribute("data-download-id"));
  if (doc) { downloadBlob(doc.blob, doc.fileName); log(`Downloaded: ${doc.fileName}`); }
});

previewModal.addEventListener("click", (event) => { if (event.target.closest("[data-close-modal]")) closePreview(); });
previewCloseBtn.addEventListener("click", closePreview);
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !previewModal.hidden) closePreview(); });
window.addEventListener("beforeunload", () => { revokeDocUrls(); terminateOcrWorker(); });