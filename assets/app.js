import * as THREE from "https://esm.sh/three@0.164.1";
import { OrbitControls } from "https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls";

const PALLET_PRESETS = {
    us48x40: { l: 121.9, w: 101.6, label: "US Standard" },
    std120x100: { l: 120, w: 100, label: "Standard 120 x 100" },
    euro120x80: { l: 120, w: 80, label: "Euro Pallet" }
};

const CONTAINER_PRESETS = {
    "20dc": { l: 588, w: 234, h: 237, label: "20' Dry Container" },
    "40dc": { l: 1198, w: 234, h: 237, label: "40' Dry Container" },
    "40hc": { l: 1198, w: 234, h: 267, label: "40' High Cube" },
    "40rf": { l: 1154, w: 228, h: 223, label: "40' Reefer (RF)" }
};

const CONTAINER_GROUP_PRESETS = {
    g1: {
        label: "WHSU / TEMU / ONEU",
        dims: {
            "20dc": { l: 588, w: 234, h: 237 },
            "40dc": { l: 1198, w: 234, h: 237 },
            "40hc": { l: 1198, w: 234, h: 267 },
            "40rf": { l: 1154, w: 228, h: 223 }
        }
    },
    g2: {
        label: "SZLU / TCLU / HDMU",
        dims: {
            "20dc": { l: 588, w: 234, h: 237 },
            "40dc": { l: 1198, w: 234, h: 237 },
            "40hc": { l: 1198, w: 234, h: 267 },
            "40rf": { l: 1154, w: 228, h: 223 }
        }
    },
    g3: {
        label: "TTNU / EMCU / EITU",
        dims: {
            "20dc": { l: 588, w: 234, h: 237 },
            "40dc": { l: 1198, w: 234, h: 237 },
            "40hc": { l: 1198, w: 234, h: 267 },
            "40rf": { l: 1154, w: 228, h: 223 }
        }
    }
};

const SCENARIOS = {
    baseline: {
        box: { l: 12.5, w: 10.2, h: 8, target: 24 },
        palletPreset: "us48x40",
        pallet: { maxH: 160, base: 15 },
        containerPreset: "40rf"
    },
    dense: {
        box: { l: 16.8, w: 11.4, h: 7.6, target: 30 },
        palletPreset: "std120x100",
        pallet: { maxH: 180, base: 14 },
        containerPreset: "40dc"
    },
    export: {
        box: { l: 20.2, w: 14.5, h: 9.2, target: 36 },
        palletPreset: "euro120x80",
        pallet: { maxH: 175, base: 15 },
        containerPreset: "40hc"
    }
};

const state = {
    step: 1,
    activePreset: "baseline",
    results: null,
    cartonManual: false,
    multiSkuRows: [],
    multiSkuNextId: 1,
    skuCatalog: [],
    viewer: {
        yaw: -0.64,
        pitch: 0.44,
        zoom: 1.04,
        dragging: false,
        pointerId: null,
        lastX: 0,
        lastY: 0
    },
    three: {
        renderer: null,
        scene: null,
        camera: null,
        controls: null,
        stageGroup: null,
        resizeObserver: null,
        userAdjustedView: false
    }
};

const refs = {
    boxL: document.getElementById("box-l"),
    boxW: document.getElementById("box-w"),
    boxH: document.getElementById("box-h"),
    targetQty: document.getElementById("target-qty"),
    cartonL: document.getElementById("carton-l"),
    cartonW: document.getElementById("carton-w"),
    cartonH: document.getElementById("carton-h"),
    palletType: document.getElementById("pal-type"),
    palletL: document.getElementById("pal-l"),
    palletW: document.getElementById("pal-w"),
    palletMaxH: document.getElementById("pal-max-h"),
    palletBase: document.getElementById("pal-base"),
    safetyNetG: document.getElementById("safety-net-g"),
    safetyTareKg: document.getElementById("safety-tare-kg"),
    safetyGrossLimit: document.getElementById("safety-gross-limit"),
    safetyEct: document.getElementById("safety-ect"),
    safetyCaliperMm: document.getElementById("safety-caliper-mm"),
    safetyStackLayers: document.getElementById("safety-stack-layers"),
    safetyFactor: document.getElementById("safety-factor"),
    safetyPattern: document.getElementById("safety-pattern"),
    safetyHumidity: document.getElementById("safety-humidity"),
    safetyWinner: document.getElementById("safety-winner"),
    safetySummary: document.getElementById("safety-summary"),
    safetyOptions: document.getElementById("safety-options"),
    containerGroup: document.getElementById("cont-group"),
    containerType: document.getElementById("cont-type"),
    containerL: document.getElementById("cont-l"),
    containerW: document.getElementById("cont-w"),
    containerH: document.getElementById("cont-h"),
    multiContainerType: document.getElementById("multi-cont-type"),
    multiContainerL: document.getElementById("multi-cont-l"),
    multiContainerW: document.getElementById("multi-cont-w"),
    multiContainerH: document.getElementById("multi-cont-h"),
    suggestedCarton: document.getElementById("suggested-ctn"),
    cartonQuickSpec: document.getElementById("carton-quick-spec"),
    palletQuickSpec: document.getElementById("pallet-quick-spec"),
    palletLayerSpec: document.getElementById("pallet-layer-spec"),
    palletOverhangSafe: document.getElementById("pallet-overhang-safe"),
    palletOverhangKeep: document.getElementById("pallet-overhang-keep"),
    containerQuickSpec: document.getElementById("container-quick-spec"),
    multiSkuList: document.getElementById("multi-sku-list"),
    multiSkuAddBtn: document.getElementById("multi-sku-add-btn"),
    multiSkuCatalogInput: document.getElementById("multi-sku-catalog-input"),
    multiSkuCatalogImportBtn: document.getElementById("multi-sku-catalog-import-btn"),
    multiSkuCatalogClearBtn: document.getElementById("multi-sku-catalog-clear-btn"),
    multiSkuCatalogStatus: document.getElementById("multi-sku-catalog-status"),
    multiSkuSummary: document.getElementById("multi-sku-summary"),
    multiLoadedCbm: document.getElementById("multi-loaded-cbm"),
    multiLoadedBoxes: document.getElementById("multi-loaded-boxes"),
    multiPackMode: document.getElementById("multi-pack-mode"),
    multiRelaxTail: document.getElementById("multi-relax-tail"),
    multiShowShell: document.getElementById("multi-show-shell"),
    multiXrayShell: document.getElementById("multi-xray-shell"),
    multiDirectionHint: document.getElementById("multi-direction-hint"),
    dashEff: document.getElementById("dash-total-eff"),
    dashPalletCoverage: document.getElementById("dash-pallet-coverage"),
    dashCartonSuggest: document.getElementById("dash-carton-suggest"),
    stageTitle: document.getElementById("stage-title"),
    viewBadge: document.getElementById("view-badge"),
    visualQty: document.getElementById("visual-qty"),
    visualUnit: document.getElementById("visual-unit"),
    layoutNote: document.getElementById("layout-note"),
    effRing: document.getElementById("eff-ring"),
    effRingValue: document.getElementById("eff-ring-value"),
    cartonBreakdownTitle: document.getElementById("carton-breakdown-title"),
    cartonBreakdownBody: document.getElementById("carton-breakdown-body"),
    palletBreakdownTitle: document.getElementById("pallet-breakdown-title"),
    palletBreakdownBody: document.getElementById("pallet-breakdown-body"),
    containerBreakdownTitle: document.getElementById("container-breakdown-title"),
    containerBreakdownBody: document.getElementById("container-breakdown-body"),
    recommendations: document.getElementById("recommendations-list"),
    chainTableBody: document.getElementById("chain-table-body"),
    recalculateBtn: document.getElementById("recalculate-btn"),
    copyReportBtn: document.getElementById("copy-report-btn"),
    sceneCanvas: document.getElementById("scene-canvas"),
    visualStage: document.querySelector(".visual-stage")
};

const percentFormatter = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const numberFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const integerFormatter = new Intl.NumberFormat("vi-VN");

function round(value, digits = 1) {
    return Number(value.toFixed(digits));
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function resetViewer() {
    state.viewer.yaw = -0.64;
    state.viewer.pitch = 0.44;
    state.viewer.zoom = 1.04;
    state.three.userAdjustedView = false;
    if (state.three && state.three.controls && state.three.camera && state.three.stageGroup) {
        fitCameraToObject(state.three.stageGroup, true);
    }
}

function volumeOf(dim) {
    return dim.l * dim.w * dim.h;
}

function formatCm(value) {
    return `${numberFormatter.format(round(value))} cm`;
}

function formatDims(dim) {
    return `${numberFormatter.format(round(dim.l))} x ${numberFormatter.format(round(dim.w))} x ${numberFormatter.format(round(dim.h))} cm`;
}

function formatPercent(value) {
    return `${percentFormatter.format(clamp(value, 0, 100))}%`;
}

function formatCbm(value) {
    return `${percentFormatter.format(Math.max(0, value))} m3`;
}

function createDefaultMultiSkuRow(seed = {}) {
    const row = {
        id: `sku-${state.multiSkuNextId}`,
        preset: seed.preset || "",
        sku: seed.sku || "",
        l: seed.l || "",
        w: seed.w || "",
        h: seed.h || "",
        qty: seed.qty || "",
        color: seed.color || colorFromText(seed.sku || `SKU-${state.multiSkuNextId}`)
    };
    state.multiSkuNextId += 1;
    return row;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}

function normalizeKey(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

function parseLooseNumber(raw) {
    const base = String(raw || "").trim();
    if (!base) {
        return NaN;
    }
    let cleaned = base.replace(/\s+/g, "").replace(/[^\d,.\-]/g, "");
    if (!cleaned) {
        return NaN;
    }
    const hasDot = cleaned.includes(".");
    const hasComma = cleaned.includes(",");
    if (hasComma && hasDot) {
        cleaned = cleaned.replace(/,/g, "");
    } else if (hasComma && !hasDot) {
        const commaCount = (cleaned.match(/,/g) || []).length;
        if (commaCount === 1) {
            cleaned = cleaned.replace(",", ".");
        } else {
            cleaned = cleaned.replace(/,/g, "");
        }
    }
    const value = parseFloat(cleaned);
    return Number.isFinite(value) ? value : NaN;
}

function detectDelimiter(line) {
    if (line.includes("\t")) {
        return "\t";
    }
    const candidates = [",", ";", "|"];
    let best = ",";
    let bestCount = -1;
    candidates.forEach((delimiter) => {
        const count = line.split(delimiter).length - 1;
        if (count > bestCount) {
            bestCount = count;
            best = delimiter;
        }
    });
    return best;
}

function splitDelimitedLine(line, delimiter) {
    const cells = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === "\"") {
            if (inQuotes && line[i + 1] === "\"") {
                current += "\"";
                i += 1;
                continue;
            }
            inQuotes = !inQuotes;
            continue;
        }
        if (!inQuotes && ch === delimiter) {
            cells.push(current.trim());
            current = "";
            continue;
        }
        current += ch;
    }
    cells.push(current.trim());
    return cells;
}

function uniqueSkuCatalogEntries(entries) {
    const seen = new Set();
    const output = [];
    entries.forEach((entry) => {
        const skuKey = normalizeKey(entry.sku);
        const signature = `${skuKey}|${round(entry.l, 3)}|${round(entry.w, 3)}|${round(entry.h, 3)}|${entry.unitsCarton || ""}`;
        if (seen.has(signature)) {
            return;
        }
        seen.add(signature);
        output.push(entry);
    });
    return output;
}

function importSkuCatalogFromText(rawText) {
    const text = String(rawText || "").trim();
    if (!text) {
        return { entries: [], message: "Chua co du lieu import." };
    }
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length === 0) {
        return { entries: [], message: "Chua co du lieu import." };
    }

    const delimiter = detectDelimiter(lines[0]);
    const rows = lines.map((line) => splitDelimitedLine(line, delimiter));
    const headerKeys = rows[0].map((cell) => normalizeKey(cell));
    const hasHeader = headerKeys.some((key) => key.includes("sku"));
    const startIndex = hasHeader ? 1 : 0;

    const findIdx = (predicates) => {
        for (let i = 0; i < headerKeys.length; i += 1) {
            const key = headerKeys[i];
            if (predicates.some((predicate) => predicate(key))) {
                return i;
            }
        }
        return -1;
    };

    let idxSku = 0;
    let idxL = 1;
    let idxW = 2;
    let idxH = 3;
    let idxUnits = -1;
    if (hasHeader) {
        idxSku = findIdx([(k) => k === "sku" || k.endsWith("sku") || k.includes("skucode")]);
        idxL = findIdx([(k) => k === "l" || k.startsWith("lcm") || k.includes("length") || k.includes("dai")]);
        idxW = findIdx([(k) => k === "w" || k.startsWith("wcm") || k.includes("width") || k.includes("rong")]);
        idxH = findIdx([(k) => k === "h" || k.startsWith("hcm") || k.includes("height") || k.includes("cao")]);
        idxUnits = findIdx([(k) => k.includes("unitscarton") || (k.includes("units") && k.includes("carton")) || k.includes("sohopthung")]);
    }

    const entries = [];
    for (let i = startIndex; i < rows.length; i += 1) {
        const row = rows[i];
        const skuRaw = row[idxSku] || row[0] || "";
        const sku = String(skuRaw).trim();
        const l = parseLooseNumber(row[idxL]);
        const w = parseLooseNumber(row[idxW]);
        const h = parseLooseNumber(row[idxH]);
        const unitsCarton = idxUnits >= 0 ? Math.max(0, parseInt(row[idxUnits], 10) || 0) : 0;

        if (!sku || !Number.isFinite(l) || !Number.isFinite(w) || !Number.isFinite(h)) {
            continue;
        }
        entries.push({
            id: `catalog-${normalizeKey(sku)}-${entries.length + 1}`,
            sku,
            l: Math.max(0.1, l),
            w: Math.max(0.1, w),
            h: Math.max(0.1, h),
            unitsCarton
        });
    }

    const uniqueEntries = uniqueSkuCatalogEntries(entries);
    return {
        entries: uniqueEntries,
        message: `Da import ${integerFormatter.format(uniqueEntries.length)} SKU tu bang du lieu.`
    };
}

function getSkuCatalogById(id) {
    return state.skuCatalog.find((item) => item.id === id) || null;
}

function renderSkuCatalogStatus(message) {
    if (!refs.multiSkuCatalogStatus) {
        return;
    }
    if (!message) {
        refs.multiSkuCatalogStatus.textContent = state.skuCatalog.length > 0
            ? `Thu vien SKU: ${integerFormatter.format(state.skuCatalog.length)} ma.`
            : "Chua import thu vien SKU.";
        return;
    }
    refs.multiSkuCatalogStatus.textContent = message;
}

function ensureMultiSkuRows() {
    if (state.multiSkuRows.length > 0) {
        return;
    }
    state.multiSkuRows = [
        createDefaultMultiSkuRow({ qty: 120 }),
        createDefaultMultiSkuRow({ qty: 90 })
    ];
}

function renderMultiSkuRows() {
    if (!refs.multiSkuList) {
        return;
    }
    ensureMultiSkuRows();
    const catalogOptions = state.skuCatalog
        .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.sku)} (${numberFormatter.format(item.l)} x ${numberFormatter.format(item.w)} x ${numberFormatter.format(item.h)})</option>`)
        .join("");
    refs.multiSkuList.innerHTML = state.multiSkuRows.map((row) => `
        <article class="multi-sku-row" data-multi-row-id="${escapeHtml(row.id)}">
            <div class="multi-sku-row-grid">
                <label>
                    <span>SKU mau</span>
                    <select data-multi-field="preset">
                        <option value="">Chon tu thu vien</option>
                        ${catalogOptions}
                    </select>
                </label>
                <label>
                    <span>So thung</span>
                    <input type="number" step="1" min="1" data-multi-field="qty" value="${escapeHtml(row.qty)}" placeholder="qty">
                </label>
                <label>
                    <span>Dai</span>
                    <input type="number" step="0.1" min="0.1" data-multi-field="l" value="${escapeHtml(row.l)}" placeholder="cm">
                </label>
                <label>
                    <span>Rong</span>
                    <input type="number" step="0.1" min="0.1" data-multi-field="w" value="${escapeHtml(row.w)}" placeholder="cm">
                </label>
                <label>
                    <span>Cao</span>
                    <input type="number" step="0.1" min="0.1" data-multi-field="h" value="${escapeHtml(row.h)}" placeholder="cm">
                </label>
                <div class="multi-sku-row-actions">
                    <label class="multi-sku-color">
                        <span>Mau SKU</span>
                        <input type="color" data-multi-field="color" value="${escapeHtml(row.color || "#2e6de4")}">
                    </label>
                    <div class="multi-sku-row-buttons">
                        <button type="button" data-multi-action="up" title="Len">&uarr;</button>
                        <button type="button" data-multi-action="down" title="Xuong">&darr;</button>
                        <button type="button" data-multi-action="remove" title="Xoa">&times;</button>
                    </div>
                </div>
            </div>
        </article>
    `).join("");
    refs.multiSkuList.querySelectorAll("[data-multi-row-id]").forEach((node) => {
        const id = node.getAttribute("data-multi-row-id") || "";
        const row = state.multiSkuRows.find((item) => item.id === id);
        if (!row) {
            return;
        }
        const presetSelect = node.querySelector("[data-multi-field=\"preset\"]");
        if (presetSelect instanceof HTMLSelectElement) {
            presetSelect.value = row.preset || "";
        }
    });
}

function normalizeHexColor(value, fallback = "#2e6de4") {
    const raw = String(value || "").trim();
    const match = raw.match(/^#([0-9a-fA-F]{6})$/);
    return match ? `#${match[1].toLowerCase()}` : fallback;
}
function parseMultiSkuRows() {
    if (!refs.multiSkuList) {
        return [];
    }
    const parsed = [];
    refs.multiSkuList.querySelectorAll("[data-multi-row-id]").forEach((node) => {
        const id = node.getAttribute("data-multi-row-id") || "";
        const read = (field) => node.querySelector(`[data-multi-field="${field}"]`);
        const preset = read("preset") ? String(read("preset").value || "").trim() : "";
        const presetItem = getSkuCatalogById(preset);
        const sku = presetItem ? presetItem.sku : "SKU";
        const l = read("l") ? parseFloat(read("l").value) : NaN;
        const w = read("w") ? parseFloat(read("w").value) : NaN;
        const h = read("h") ? parseFloat(read("h").value) : NaN;
        const qty = read("qty") ? parseInt(read("qty").value, 10) : NaN;
        const color = read("color") ? normalizeHexColor(read("color").value, colorFromText(sku || id)) : colorFromText(sku || id);
        if (!Number.isFinite(l) || !Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(qty) || qty < 1) {
            return;
        }
        parsed.push({
            id,
            sku: sku || "SKU",
            l: Math.max(0.1, l),
            w: Math.max(0.1, w),
            h: Math.max(0.1, h),
            qty: Math.max(1, qty),
            preset,
            color
        });
    });
    return parsed;
}
function syncMultiSkuStateFromDom() {
    state.multiSkuRows = parseMultiSkuRows();
}

function moveMultiSkuRow(rowId, delta) {
    const index = state.multiSkuRows.findIndex((row) => row.id === rowId);
    if (index < 0) {
        return;
    }
    const nextIndex = clamp(index + delta, 0, state.multiSkuRows.length - 1);
    if (nextIndex === index) {
        return;
    }
    const temp = state.multiSkuRows[index];
    state.multiSkuRows[index] = state.multiSkuRows[nextIndex];
    state.multiSkuRows[nextIndex] = temp;
}

function applyCatalogPresetToRowNode(rowNode, presetId) {
    if (!rowNode) {
        return;
    }
    const preset = getSkuCatalogById(presetId);
    if (!preset) {
        return;
    }
    const read = (field) => rowNode.querySelector(`[data-multi-field="${field}"]`);
    const lInput = read("l");
    const wInput = read("w");
    const hInput = read("h");
    const qtyInput = read("qty");
    if (lInput instanceof HTMLInputElement) {
        lInput.value = String(preset.l);
    }
    if (wInput instanceof HTMLInputElement) {
        wInput.value = String(preset.w);
    }
    if (hInput instanceof HTMLInputElement) {
        hInput.value = String(preset.h);
    }
    if (qtyInput instanceof HTMLInputElement && !qtyInput.value.trim() && preset.unitsCarton > 0) {
        qtyInput.value = String(preset.unitsCarton);
    }
}

function colorFromText(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    const color = new THREE.Color();
    color.setHSL(hue / 360, 0.62, 0.50);
    return `#${color.getHexString()}`;
}

function deriveFlipHeightColor(baseHex) {
    const safe = normalizeHexColor(baseHex, "#2e6de4");
    const color = new THREE.Color(safe);
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    const flipped = new THREE.Color();
    flipped.setHSL((hsl.h + 0.09) % 1, Math.min(1, hsl.s * 0.92 + 0.08), Math.min(0.78, hsl.l + 0.12));
    return `#${flipped.getHexString()}`;
}

function computeMultiSkuPlan(container, rows, options = {}) {
    const orderedRows = [...rows];
    const packMode = options.packMode === "balanced" ? "balanced" : "maximize_qty";
    const relaxTail = options.relaxTail !== false;
    const containerVolume = container.l * container.w * container.h;
    const floorArea = container.l * container.w;
    const placements = [];
    const EPS = 0.0001;

    let packedBoxes = 0;
    let packedVolume = 0;
    let usedFloorArea = 0;
    let freeSpaces = [{ x: 0, z: 0, y: 0, l: container.l, w: container.w, h: container.h }];

    const rowStates = orderedRows.map((row, index) => {
        const baseColor = normalizeHexColor(row.color, colorFromText(`${row.sku}-${row.id}`));
        return {
            ...row,
            index,
            remaining: Math.max(0, row.qty),
            packed: 0,
            packedFlippedH: 0,
            color: baseColor,
            flipColor: deriveFlipHeightColor(baseColor)
        };
    });

    function orientationOptions(row) {
        const raw = [
            { len: row.l, wid: row.w, hei: row.h, flippedH: false },
            { len: row.w, wid: row.l, hei: row.h, flippedH: false },
            { len: row.l, wid: row.h, hei: row.w, flippedH: true },
            { len: row.h, wid: row.l, hei: row.w, flippedH: true },
            { len: row.w, wid: row.h, hei: row.l, flippedH: true },
            { len: row.h, wid: row.w, hei: row.l, flippedH: true }
        ];
        const seen = new Set();
        return raw.filter((opt) => {
            const key = `${round(opt.len, 4)}|${round(opt.wid, 4)}|${round(opt.hei, 4)}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    function cleanupSpaces(spaces) {
        const filtered = spaces.filter((space) => space.l > EPS && space.w > EPS && space.h > EPS);
        const deduped = filtered.filter((space, idx) => !filtered.some((other, jdx) => {
            if (idx === jdx) {
                return false;
            }
            const containsX = space.x >= other.x - EPS && (space.x + space.l) <= (other.x + other.l) + EPS;
            const containsZ = space.z >= other.z - EPS && (space.z + space.w) <= (other.z + other.w) + EPS;
            const containsY = space.y >= other.y - EPS && (space.y + space.h) <= (other.y + other.h) + EPS;
            return containsX && containsZ && containsY;
        }));

        function mergePair(a, b) {
            const sameY = Math.abs(a.y - b.y) <= EPS;
            const sameH = Math.abs(a.h - b.h) <= EPS;
            const sameX = Math.abs(a.x - b.x) <= EPS;
            const sameL = Math.abs(a.l - b.l) <= EPS;
            const sameZ = Math.abs(a.z - b.z) <= EPS;
            const sameW = Math.abs(a.w - b.w) <= EPS;

            if (sameY && sameH && sameX && sameL) {
                const touchZ = Math.abs((a.z + a.w) - b.z) <= EPS || Math.abs((b.z + b.w) - a.z) <= EPS;
                if (touchZ) {
                    const z0 = Math.min(a.z, b.z);
                    const z1 = Math.max(a.z + a.w, b.z + b.w);
                    return { x: a.x, z: z0, y: a.y, l: a.l, w: z1 - z0, h: a.h };
                }
            }

            if (sameY && sameH && sameZ && sameW) {
                const touchX = Math.abs((a.x + a.l) - b.x) <= EPS || Math.abs((b.x + b.l) - a.x) <= EPS;
                if (touchX) {
                    const x0 = Math.min(a.x, b.x);
                    const x1 = Math.max(a.x + a.l, b.x + b.l);
                    return { x: x0, z: a.z, y: a.y, l: x1 - x0, w: a.w, h: a.h };
                }
            }

            if (sameX && sameL && sameZ && sameW) {
                const touchY = Math.abs((a.y + a.h) - b.y) <= EPS || Math.abs((b.y + b.h) - a.y) <= EPS;
                if (touchY) {
                    const y0 = Math.min(a.y, b.y);
                    const y1 = Math.max(a.y + a.h, b.y + b.h);
                    return { x: a.x, z: a.z, y: y0, l: a.l, w: a.w, h: y1 - y0 };
                }
            }
            return null;
        }

        const merged = [...deduped];
        let changed = true;
        while (changed) {
            changed = false;
            for (let i = 0; i < merged.length && !changed; i += 1) {
                for (let j = i + 1; j < merged.length; j += 1) {
                    const next = mergePair(merged[i], merged[j]);
                    if (!next) {
                        continue;
                    }
                    merged[i] = next;
                    merged.splice(j, 1);
                    changed = true;
                    break;
                }
            }
        }
        return merged;
    }

    function splitSpace(space, usedLen, usedWid, usedHeight) {
        const right = {
            x: space.x + usedLen,
            z: space.z,
            y: space.y,
            l: space.l - usedLen,
            w: space.w,
            h: space.h
        };
        const top = {
            x: space.x,
            z: space.z + usedWid,
            y: space.y,
            l: usedLen,
            w: space.w - usedWid,
            h: space.h
        };
        const above = {
            x: space.x,
            z: space.z,
            y: space.y + usedHeight,
            l: usedLen,
            w: usedWid,
            h: space.h - usedHeight
        };
        return [right, top, above];
    }

    function currentFreeVolume() {
        return freeSpaces.reduce((acc, space) => acc + (space.l * space.w * space.h), 0);
    }

    function requiredVolumeFromRows(startIndex) {
        let required = 0;
        for (let idx = startIndex; idx < rowStates.length; idx += 1) {
            const row = rowStates[idx];
            if (row.remaining <= 0) {
                continue;
            }
            required += row.remaining * row.l * row.w * row.h;
        }
        return required;
    }

    function reserveVolumeForLaterRows(startIndex) {
        let required = 0;
        for (let idx = startIndex; idx < rowStates.length; idx += 1) {
            const row = rowStates[idx];
            if (row.remaining <= 0) {
                continue;
            }
            required += row.remaining * row.l * row.w * row.h;
        }
        return required;
    }

    function canUseCapacity(rowIndex, placementVolume) {
        if (packMode !== "balanced") {
            return true;
        }
        const freeVol = currentFreeVolume();
        const reserveVol = reserveVolumeForLaterRows(rowIndex + 1);
        const requiredVol = requiredVolumeFromRows(rowIndex);
        const ratio = requiredVol > EPS ? Math.min(1, freeVol / requiredVol) : 1;
        const scaledReserve = reserveVol * ratio;
        return freeVol - placementVolume >= scaledReserve - EPS;
    }

    function chooseBetterCandidate(candidate, best) {
        if (!best) {
            return true;
        }
        if (candidate.y < best.y - EPS) {
            return true;
        }
        if (Math.abs(candidate.y - best.y) <= EPS && candidate.x < best.x - EPS) {
            return true;
        }
        if (Math.abs(candidate.y - best.y) <= EPS && Math.abs(candidate.x - best.x) <= EPS && candidate.widthSlack < best.widthSlack - EPS) {
            return true;
        }
        if (Math.abs(candidate.y - best.y) <= EPS && Math.abs(candidate.x - best.x) <= EPS && Math.abs(candidate.widthSlack - best.widthSlack) <= EPS && candidate.z < best.z - EPS) {
            return true;
        }
        if (Math.abs(candidate.y - best.y) <= EPS && Math.abs(candidate.x - best.x) <= EPS && Math.abs(candidate.z - best.z) <= EPS && candidate.wasteArea < best.wasteArea - EPS) {
            return true;
        }
        if (Math.abs(candidate.y - best.y) <= EPS && Math.abs(candidate.x - best.x) <= EPS && Math.abs(candidate.z - best.z) <= EPS && Math.abs(candidate.wasteArea - best.wasteArea) <= EPS && candidate.levels > best.levels) {
            return true;
        }
        return false;
    }

    function findBestPlacement(row, rowIndex, preferDeepOnly = false) {
        if (!row || row.remaining < 1) {
            return null;
        }
        let best = null;
        const optionsForRow = orientationOptions(row);
        freeSpaces.forEach((space, spaceIndex) => {
            if (preferDeepOnly && space.x > container.l * 0.62) {
                return;
            }
            optionsForRow.forEach((opt) => {
                if (opt.len > space.l + EPS || opt.wid > space.w + EPS || opt.hei > space.h + EPS) {
                    return;
                }
                const maxLevels = Math.min(Math.floor(space.h / opt.hei), row.remaining);
                if (maxLevels < 1) {
                    return;
                }
                const levels = maxLevels;
                const usedHeight = levels * opt.hei;
                const placementVolume = levels * row.l * row.w * row.h;
                if (!canUseCapacity(rowIndex, placementVolume)) {
                    return;
                }
                const wasteArea = (space.l * space.w) - (opt.len * opt.wid);
                const widthSlack = space.w - opt.wid;
                const candidate = {
                    spaceIndex,
                    x: space.x,
                    z: space.z,
                    y: space.y,
                    len: opt.len,
                    wid: opt.wid,
                    hei: opt.hei,
                    flippedH: opt.flippedH,
                    levels,
                    usedHeight,
                    placementVolume,
                    wasteArea,
                    widthSlack
                };
                if (chooseBetterCandidate(candidate, best)) {
                    best = candidate;
                }
            });
        });
        return best;
    }

    function applyPlacement(row, candidate) {
        const space = freeSpaces[candidate.spaceIndex];
        if (!space) {
            return false;
        }
        const nextSpaces = freeSpaces.filter((_, idx) => idx !== candidate.spaceIndex);
        nextSpaces.push(...splitSpace(space, candidate.len, candidate.wid, candidate.usedHeight));
        freeSpaces = cleanupSpaces(nextSpaces);

        usedFloorArea += candidate.y <= EPS ? candidate.len * candidate.wid : 0;
        for (let level = 0; level < candidate.levels; level += 1) {
            const isFlippedH = candidate.flippedH;
            placements.push({
                x: -container.l / 2 + candidate.x + (candidate.len / 2),
                y: candidate.y + (candidate.hei / 2) + (level * candidate.hei),
                z: -container.w / 2 + candidate.z + (candidate.wid / 2),
                l: candidate.len,
                w: candidate.wid,
                h: candidate.hei,
                color: isFlippedH ? row.flipColor : row.color,
                sku: row.sku,
                flippedH: isFlippedH
            });
        }

        row.remaining -= candidate.levels;
        row.packed += candidate.levels;
        if (candidate.flippedH) {
            row.packedFlippedH += candidate.levels;
        }
        packedBoxes += candidate.levels;
        packedVolume += candidate.levels * row.l * row.w * row.h;
        return true;
    }

    function tryBridgeWithFutureRows(currentIndex) {
        let picked = null;
        for (let idx = currentIndex + 1; idx < rowStates.length; idx += 1) {
            const row = rowStates[idx];
            if (!row || row.remaining < 1) {
                continue;
            }
            const candidate = findBestPlacement(row, idx, true);
            if (!candidate) {
                continue;
            }
            if (
                !picked
                || candidate.y < picked.candidate.y - EPS
                || (Math.abs(candidate.y - picked.candidate.y) <= EPS && candidate.x < picked.candidate.x - EPS)
                || (Math.abs(candidate.y - picked.candidate.y) <= EPS && Math.abs(candidate.x - picked.candidate.x) <= EPS && candidate.widthSlack < picked.candidate.widthSlack - EPS)
            ) {
                picked = { idx, candidate };
            }
        }
        if (!picked) {
            return false;
        }
        return applyPlacement(rowStates[picked.idx], picked.candidate);
    }

    function placeRowUntilBlocked(rowIndex, allowBridge, ignoreReserve) {
        const row = rowStates[rowIndex];
        if (!row || row.remaining < 1) {
            return false;
        }
        let moved = false;
        while (row.remaining > 0) {
            const candidate = findBestPlacement(row, rowIndex, false);
            if (candidate) {
                if (!ignoreReserve && !canUseCapacity(rowIndex, candidate.placementVolume)) {
                    break;
                }
                if (applyPlacement(row, candidate)) {
                    moved = true;
                    continue;
                }
            }
            if (!allowBridge || !relaxTail) {
                break;
            }
            const bridged = tryBridgeWithFutureRows(rowIndex);
            if (!bridged) {
                break;
            }
            moved = true;
        }
        return moved;
    }

    for (let rowIndex = 0; rowIndex < rowStates.length; rowIndex += 1) {
        placeRowUntilBlocked(rowIndex, true, false);
    }

    let backfillProgress = true;
    while (backfillProgress) {
        backfillProgress = false;
        for (let rowIndex = 0; rowIndex < rowStates.length; rowIndex += 1) {
            const row = rowStates[rowIndex];
            if (!row || row.remaining < 1) {
                continue;
            }
            const moved = placeRowUntilBlocked(rowIndex, false, true);
            if (moved) {
                backfillProgress = true;
            }
        }
    }

    const summary = rowStates.map((row) => ({
        id: row.id,
        sku: row.sku,
        qty: row.qty,
        l: row.l,
        w: row.w,
        h: row.h,
        packed: row.packed,
        packedFlippedH: row.packedFlippedH,
        unplaced: Math.max(0, row.qty - row.packed),
        color: row.color,
        flipColor: row.flipColor
    }));

    return {
        placements,
        summary,
        packedBoxes,
        unplacedBoxes: Math.max(0, rowStates.reduce((acc, item) => acc + item.qty, 0) - packedBoxes),
        loadedCbm: packedVolume / 1000000,
        volumeUtilization: containerVolume > 0 ? (packedVolume / containerVolume) : 0,
        floorCoverage: floorArea > 0 ? Math.min(1, usedFloorArea / floorArea) : 0,
        packMode,
        relaxTail
    };
}

const DEFAULT_SAFETY = {
    netG: 360,
    tareKg: 0.35,
    grossLimitKg: 15,
    ect: 32,
    caliperMm: 4,
    stackLayers: 5,
    safetyFactor: 3,
    pattern: "column",
    humidity: "50"
};

const SAFETY_PATTERN_FACTORS = {
    column: 0.85,
    interlock: 0.5
};

const SAFETY_HUMIDITY_FACTORS = {
    "50": 1,
    "80": 0.68,
    "90": 0.5
};

function cmToIn(value) {
    return value / 2.54;
}

function mmToIn(value) {
    return value / 25.4;
}

function layoutKey(nx, ny, nz) {
    return `${nx}x${ny}x${nz}`;
}

function generateSafetyLayouts(targetQty) {
    const exactQty = Math.max(1, targetQty);
    const seen = new Set();
    const balanced = [];
    const relaxed = [];

    for (let nx = 1; nx <= exactQty; nx += 1) {
        if (exactQty % nx !== 0) {
            continue;
        }
        const rem = exactQty / nx;
        for (let ny = 1; ny <= rem; ny += 1) {
            if (rem % ny !== 0) {
                continue;
            }
            const nz = rem / ny;
            const normalized = [nx, ny, nz].sort((a, b) => a - b);
            const key = layoutKey(normalized[0], normalized[1], normalized[2]);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);

            const item = {
                key,
                nx: normalized[0],
                ny: normalized[1],
                nz: normalized[2],
                qty: exactQty,
                compactness: Math.abs(normalized[2] - normalized[1]) + Math.abs(normalized[1] - normalized[0])
            };
            relaxed.push(item);

            if (normalized[0] >= 2 && (normalized[2] / normalized[0]) <= 3) {
                balanced.push(item);
            }
        }
    }

    const ranked = (balanced.length > 0 ? balanced : relaxed)
        .sort((a, b) => a.compactness - b.compactness);
    return ranked.slice(0, 12);
}
function uniqueBoxOrientations(box) {
    const permutations = [
        [box.l, box.w, box.h],
        [box.l, box.h, box.w],
        [box.w, box.l, box.h],
        [box.w, box.h, box.l],
        [box.h, box.l, box.w],
        [box.h, box.w, box.l]
    ];

    const seen = new Set();
    return permutations
        .map(([l, w, h]) => ({ l, w, h }))
        .filter((orientation) => {
            const key = `${orientation.l}|${orientation.w}|${orientation.h}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
}

function suggestCarton(box, targetQty) {
    const clearance = 1;
    const tolerance = Math.max(6, Math.ceil(targetQty * 0.15));
    let best = null;
    let minScore = Number.POSITIVE_INFINITY;

    uniqueBoxOrientations(box).forEach((orientation) => {
        for (let nx = 1; nx <= targetQty; nx += 1) {
            for (let ny = 1; ny <= Math.ceil(targetQty / nx); ny += 1) {
                const nz = Math.ceil(targetQty / (nx * ny));
                const qty = nx * ny * nz;
                if (qty < targetQty || qty > targetQty + tolerance) {
                    continue;
                }

                const dims = {
                    l: round(nx * orientation.l + clearance),
                    w: round(ny * orientation.w + clearance),
                    h: round(nz * orientation.h + clearance)
                };
                const surface = 2 * (dims.l * dims.w + dims.l * dims.h + dims.w * dims.h);
                const overshoot = qty - targetQty;
                const compactnessPenalty = Math.abs(dims.l - dims.w) + Math.abs(dims.w - dims.h);
                const score = surface + overshoot * 120 + compactnessPenalty * 3;

                if (score < minScore) {
                    minScore = score;
                    best = { ...dims, qty, nx, ny, nz, orientation, surface };
                }
            }
        }
    });

    const cartonVolume = volumeOf(best);
    const unitVolume = volumeOf(box);
    best.fillRate = (best.qty * unitVolume / cartonVolume) * 100;
    best.overshoot = best.qty - targetQty;
    return best;
}

function getBestFit(item, space) {
    const orientations = [
        { l: item.l, w: item.w, h: item.h },
        { l: item.w, w: item.l, h: item.h }
    ];

    let best = null;

    orientations.forEach((orientation) => {
        const nx = Math.floor(space.l / orientation.l);
        const ny = Math.floor(space.w / orientation.w);
        const nz = Math.floor(space.h / orientation.h);
        const total = nx * ny * nz;
        const usedVolume = total * orientation.l * orientation.w * orientation.h;
        const footprintWaste = (space.l * space.w) - (nx * orientation.l * ny * orientation.w);

        if (!best || total > best.total || (total === best.total && footprintWaste < best.footprintWaste) || (total === best.total && usedVolume > best.usedVolume)) {
            best = {
                total,
                nx,
                ny,
                nz,
                item: orientation,
                usedVolume,
                footprintWaste
            };
        }
    });

    return best;
}

function getLayerOverhangScenario(layerQty, carton, pallet) {
    if (layerQty < 1) {
        return null;
    }

    const orientations = [
        { l: carton.l, w: carton.w },
        { l: carton.w, w: carton.l }
    ];
    let best = null;

    orientations.forEach((orientation) => {
        for (let nx = 1; nx <= layerQty; nx += 1) {
            if (layerQty % nx !== 0) {
                continue;
            }
            const ny = layerQty / nx;
            const usedL = nx * orientation.l;
            const usedW = ny * orientation.w;
            const overhangL = Math.max(0, usedL - pallet.l);
            const overhangW = Math.max(0, usedW - pallet.w);
            const totalOverhang = overhangL + overhangW;
            const score = (totalOverhang * 1000) + Math.abs(nx - ny);

            if (!best || score < best.score) {
                best = {
                    nx,
                    ny,
                    usedL,
                    usedW,
                    overhangL,
                    overhangW,
                    totalOverhang,
                    score
                };
            }
        }
    });

    return best;
}

function readNumber(input, fallback) {
    if (!input) {
        return fallback;
    }
    const value = parseFloat(input.value);
    return Number.isFinite(value) ? value : fallback;
}

function readInteger(input, fallback) {
    if (!input) {
        return fallback;
    }
    const value = parseInt(input.value, 10);
    return Number.isFinite(value) ? value : fallback;
}

function readNumberOrNull(input) {
    if (!input || String(input.value).trim() === "") {
        return null;
    }
    const value = parseFloat(input.value);
    return Number.isFinite(value) ? value : null;
}

function readIntegerOrNull(input) {
    if (!input || String(input.value).trim() === "") {
        return null;
    }
    const value = parseInt(input.value, 10);
    return Number.isFinite(value) ? value : null;
}

function syncCartonLoadInputsFromSuggestion(carton, force = false) {
    if (!refs.cartonL || !refs.cartonW || !refs.cartonH) {
        return;
    }
    if (force || !state.cartonManual) {
        refs.cartonL.value = String(round(carton.l));
        refs.cartonW.value = String(round(carton.w));
        refs.cartonH.value = String(round(carton.h));
    }
}

function readFormState() {
    const boxL = readNumberOrNull(refs.boxL);
    const boxW = readNumberOrNull(refs.boxW);
    const boxH = readNumberOrNull(refs.boxH);
    const targetQty = readIntegerOrNull(refs.targetQty);
    const multiSkuRows = parseMultiSkuRows();
    const hasManualBox = boxL !== null && boxW !== null && boxH !== null && targetQty !== null;

    let effectiveBox = null;
    if (hasManualBox) {
        effectiveBox = {
            l: Math.max(0.1, boxL),
            w: Math.max(0.1, boxW),
            h: Math.max(0.1, boxH),
            target: Math.max(1, targetQty)
        };
    } else if (state.step === 4 && multiSkuRows.length > 0) {
        // Allow Multi-SKU tab to run independently even when tab 1 inputs are blank.
        const seed = multiSkuRows[0];
        effectiveBox = {
            l: Math.max(0.1, seed.l),
            w: Math.max(0.1, seed.w),
            h: Math.max(0.1, seed.h),
            target: Math.max(1, Math.min(24, seed.qty))
        };
    } else {
        return null;
    }

    const useMultiContainer = state.step === 4 && refs.multiContainerType;
    const selectedContainerType = useMultiContainer ? refs.multiContainerType.value : refs.containerType.value;
    const selectedContainerL = useMultiContainer ? refs.multiContainerL : refs.containerL;
    const selectedContainerW = useMultiContainer ? refs.multiContainerW : refs.containerW;
    const selectedContainerH = useMultiContainer ? refs.multiContainerH : refs.containerH;

    return {
        box: effectiveBox,
        palletPreset: refs.palletType.value,
        pallet: {
            l: Math.max(1, readNumber(refs.palletL, 121.9)),
            w: Math.max(1, readNumber(refs.palletW, 101.6)),
            maxH: Math.max(1, readNumber(refs.palletMaxH, 160)),
            base: Math.max(0, readNumber(refs.palletBase, 15))
        },
        containerGroup: refs.containerGroup ? refs.containerGroup.value : "g1",
        containerPreset: selectedContainerType,
        container: {
            l: Math.max(1, readNumber(selectedContainerL, 590)),
            w: Math.max(1, readNumber(selectedContainerW, 235)),
            h: Math.max(1, readNumber(selectedContainerH, 239))
        },
        safety: {
            netG: Math.max(1, readNumber(refs.safetyNetG, DEFAULT_SAFETY.netG)),
            tareKg: Math.max(0, readNumber(refs.safetyTareKg, DEFAULT_SAFETY.tareKg)),
            grossLimitKg: Math.max(1, readNumber(refs.safetyGrossLimit, DEFAULT_SAFETY.grossLimitKg)),
            ect: Math.max(1, readNumber(refs.safetyEct, DEFAULT_SAFETY.ect)),
            caliperMm: Math.max(0.5, readNumber(refs.safetyCaliperMm, DEFAULT_SAFETY.caliperMm)),
            stackLayers: Math.max(2, readInteger(refs.safetyStackLayers, DEFAULT_SAFETY.stackLayers)),
            safetyFactor: Math.max(1, readNumber(refs.safetyFactor, DEFAULT_SAFETY.safetyFactor)),
            pattern: refs.safetyPattern ? refs.safetyPattern.value : DEFAULT_SAFETY.pattern,
            humidity: refs.safetyHumidity ? refs.safetyHumidity.value : DEFAULT_SAFETY.humidity
        },
        multiPacking: {
            packMode: refs.multiPackMode ? refs.multiPackMode.value : "maximize_qty",
            relaxTail: refs.multiRelaxTail ? refs.multiRelaxTail.checked : true
        },
        multiSkuRows
    };
}

function computeResults() {
    const form = readFormState();
    if (!form) {
        return null;
    }
    const safetyScoring = evaluateSafetyScoring(form);
    const fallbackCarton = suggestCarton(form.box, form.box.target);
    const carton = safetyScoring.winner
        ? {
            l: safetyScoring.winner.dims.l,
            w: safetyScoring.winner.dims.w,
            h: safetyScoring.winner.dims.h,
            qty: safetyScoring.winner.qty,
            nx: safetyScoring.winner.layout.nx,
            ny: safetyScoring.winner.layout.ny,
            nz: safetyScoring.winner.layout.nz,
            orientation: safetyScoring.winner.orientation,
            usedVolume: safetyScoring.winner.qty * volumeOf(safetyScoring.winner.orientation),
            footprintWaste: 0,
            overshoot: 0
        }
        : fallbackCarton;
    syncCartonLoadInputsFromSuggestion(carton);
    const cartonLoad = {
        l: Math.max(1, readNumber(refs.cartonL, carton.l)),
        w: Math.max(1, readNumber(refs.cartonW, carton.w)),
        h: Math.max(1, readNumber(refs.cartonH, carton.h)),
        qty: carton.qty
    };
    const palletSpace = {
        l: form.pallet.l,
        w: form.pallet.w,
        h: Math.max(1, form.pallet.maxH - form.pallet.base)
    };
    const palletFit = getBestFit(
        { l: cartonLoad.l, w: cartonLoad.w, h: cartonLoad.h },
        palletSpace
    );
    const suggestedPalletFit = getBestFit(
        { l: carton.l, w: carton.w, h: carton.h },
        palletSpace
    );
    const suggestedLayerQty = suggestedPalletFit.nx * suggestedPalletFit.ny;
    const currentLayerQty = palletFit.nx * palletFit.ny;
    const keepQtyOverhang = getLayerOverhangScenario(
        suggestedLayerQty,
        { l: cartonLoad.l, w: cartonLoad.w },
        { l: form.pallet.l, w: form.pallet.w }
    );
    const palletOverhang = {
        baselineLayerQty: suggestedLayerQty,
        noOverhangLayerQty: currentLayerQty,
        reducedBy: Math.max(0, suggestedLayerQty - currentLayerQty),
        keepQtyScenario: keepQtyOverhang
    };

    const palletRealH = round((palletFit.nz * cartonLoad.h) + form.pallet.base);
    const pallet = {
        ...form.pallet,
        qty: palletFit.total,
        nx: palletFit.nx,
        ny: palletFit.ny,
        nz: palletFit.nz,
        realH: palletRealH,
        orientation: palletFit.item,
        layerQty: palletFit.nx * palletFit.ny,
        layerCoverage: palletFit.total > 0
            ? ((palletFit.nx * palletFit.ny * palletFit.item.l * palletFit.item.w) / (form.pallet.l * form.pallet.w)) * 100
            : 0
    };

    const containerFit = carton.qty > 0
        ? getBestFit(
            { l: cartonLoad.l, w: cartonLoad.w, h: cartonLoad.h },
            form.container
        )
        : {
            total: 0,
            nx: 0,
            ny: 0,
            nz: 0,
            item: { l: cartonLoad.l, w: cartonLoad.w, h: cartonLoad.h },
            usedVolume: 0,
            footprintWaste: form.container.l * form.container.w
        };

    const container = {
        ...form.container,
        qty: containerFit.total,
        nx: containerFit.nx,
        ny: containerFit.ny,
        nz: containerFit.nz,
        orientation: containerFit.item
    };
    const multiSkuPlan = computeMultiSkuPlan(form.container, form.multiSkuRows || [], form.multiPacking || {});

    const unitVolume = volumeOf(form.box);
    const cartonVolume = volumeOf(carton);
    const cartonLoadVolume = volumeOf(cartonLoad);
    const palletUsableVolume = form.pallet.l * form.pallet.w * Math.max(1, form.pallet.maxH - form.pallet.base);
    const containerVolume = volumeOf(form.container);
    const totalUnits = carton.qty * container.qty;

    const efficiencies = {
        carton: (carton.qty * unitVolume / cartonVolume) * 100,
        pallet: (pallet.qty * cartonLoadVolume / palletUsableVolume) * 100,
        container: (container.qty * cartonLoadVolume / containerVolume) * 100,
        total: (totalUnits * unitVolume / containerVolume) * 100
    };

    return {
        form,
        carton,
        cartonLoad,
        pallet,
        container,
        metrics: {
            unitVolume,
            cartonVolume,
            cartonLoadVolume,
            palletUsableVolume,
            containerVolume,
            totalUnits,
            waste: 100 - clamp(efficiencies.total, 0, 100)
        },
        efficiencies,
        safetyScoring,
        palletOverhang,
        multiSkuPlan
    };
}

function computeSingleLayoutSafety(box, safety, layout, orientation) {
    const clearance = 1;
    const dims = {
        l: round(layout.nx * orientation.l + clearance),
        w: round(layout.ny * orientation.w + clearance),
        h: round(layout.nz * orientation.h + clearance)
    };
    const qty = layout.qty;
    const grossKg = (qty * safety.netG / 1000) + safety.tareKg;
    const baseBctLbf = 5.876 * safety.ect * Math.sqrt(Math.max(0.001, cmToIn(2 * (dims.l + dims.w)) * mmToIn(safety.caliperMm)));
    const humidityFactor = SAFETY_HUMIDITY_FACTORS[safety.humidity] || 1;
    const patternFactor = SAFETY_PATTERN_FACTORS[safety.pattern] || 0.85;
    const effectiveBctKg = baseBctLbf * 0.45359237 * humidityFactor * patternFactor;
    const requiredLoadKg = Math.max(0, (safety.stackLayers - 1) * grossKg * safety.safetyFactor);
    const safetyIndex = effectiveBctKg / Math.max(0.001, requiredLoadKg);
    const utilization = requiredLoadKg / Math.max(0.001, effectiveBctKg);
    const stabilityIndex = dims.h / Math.max(1, Math.min(dims.l, dims.w));
    const passGross = grossKg <= safety.grossLimitKg;
    const passCompression = safetyIndex >= 1;

    return {
        key: layout.key,
        layout,
        dims,
        orientation,
        qty,
        grossKg,
        baseBctLbf,
        effectiveBctKg,
        requiredLoadKg,
        safetyIndex,
        utilization,
        stabilityIndex,
        passGross,
        passCompression
    };
}

function evaluateSafetyScoring(form) {
    const layouts = generateSafetyLayouts(form.box.target);
    const options = layouts.map((layout) => {
        const orientations = uniqueBoxOrientations(form.box).map((orientation) => computeSingleLayoutSafety(form.box, form.safety, layout, orientation));
        orientations.sort((a, b) => {
            if (a.passCompression !== b.passCompression) {
                return a.passCompression ? -1 : 1;
            }
            if (a.passGross !== b.passGross) {
                return a.passGross ? -1 : 1;
            }
            if (a.safetyIndex !== b.safetyIndex) {
                return b.safetyIndex - a.safetyIndex;
            }
            return a.stabilityIndex - b.stabilityIndex;
        });
        return orientations[0];
    });

    const ranked = [...options].sort((a, b) => {
        if (a.passCompression !== b.passCompression) {
            return a.passCompression ? -1 : 1;
        }
        if (a.passGross !== b.passGross) {
            return a.passGross ? -1 : 1;
        }
        if (a.safetyIndex !== b.safetyIndex) {
            return b.safetyIndex - a.safetyIndex;
        }
        return a.stabilityIndex - b.stabilityIndex;
    });

    return {
        options: ranked.slice(0, 6),
        winner: ranked[0] || null
    };
}

function setStep(step) {
    const prevStep = state.step;
    state.step = step;
    if (prevStep !== step) {
        state.three.userAdjustedView = false;
    }
    document.querySelectorAll("[data-step-button]").forEach((button) => {
        button.classList.toggle("active", Number(button.dataset.stepButton) === step);
    });
    document.querySelectorAll("[data-step-panel]").forEach((panel) => {
        panel.classList.toggle("active", Number(panel.dataset.stepPanel) === step);
    });
    if (refs.multiDirectionHint) {
        refs.multiDirectionHint.hidden = step !== 4;
    }
    render();
}

function applyPalletPreset(key) {
    const preset = PALLET_PRESETS[key];
    if (!preset) {
        return;
    }
    refs.palletL.value = preset.l;
    refs.palletW.value = preset.w;
}

function getContainerDimsByGroup(groupKey, typeKey) {
    const group = CONTAINER_GROUP_PRESETS[groupKey];
    if (group && group.dims && group.dims[typeKey]) {
        return group.dims[typeKey];
    }
    const fallback = CONTAINER_PRESETS[typeKey];
    return fallback ? { l: fallback.l, w: fallback.w, h: fallback.h } : null;
}

function applyContainerPreset(typeKey, groupKey = (refs.containerGroup ? refs.containerGroup.value : "g1")) {
    const dims = getContainerDimsByGroup(groupKey, typeKey);
    if (!dims) {
        return;
    }
    refs.containerL.value = dims.l;
    refs.containerW.value = dims.w;
    refs.containerH.value = dims.h;
}

function applyContainerPresetToFields(typeKey, inputL, inputW, inputH) {
    const dims = getContainerDimsByGroup("g1", typeKey);
    if (!dims || !inputL || !inputW || !inputH) {
        return;
    }
    inputL.value = dims.l;
    inputW.value = dims.w;
    inputH.value = dims.h;
}

function applyScenario(key) {
    const scenario = SCENARIOS[key];
    if (!scenario) {
        return;
    }

    state.activePreset = key;
    refs.boxL.value = scenario.box.l;
    refs.boxW.value = scenario.box.w;
    refs.boxH.value = scenario.box.h;
    refs.targetQty.value = scenario.box.target;
    refs.palletType.value = scenario.palletPreset;
    applyPalletPreset(scenario.palletPreset);
    refs.palletMaxH.value = scenario.pallet.maxH;
    refs.palletBase.value = scenario.pallet.base;
    if (refs.containerGroup) {
        refs.containerGroup.value = "g1";
    }
    refs.containerType.value = scenario.containerPreset;
    applyContainerPreset(scenario.containerPreset, refs.containerGroup ? refs.containerGroup.value : "g1");
    state.cartonManual = false;

    document.querySelectorAll(".preset-btn").forEach((button) => {
        button.classList.toggle("active", button.dataset.preset === key);
    });

    update();
}

function stageConfig(results) {
    if (state.step === 1) {
        return {
            title: "Cấu trúc hộp trong carton", badge: "Spatial layer - Carton",
            quantity: results.carton.qty, unit: "HỘP / THÙNG", efficiency: results.efficiencies.carton,
            note: `${results.carton.nx} x ${results.carton.ny} x ${results.carton.nz} hộp, xoay theo ${formatDims(results.carton.orientation)}.`,
            bounds: { l: results.carton.l, w: results.carton.w, h: results.carton.h },
            item: { l: results.carton.orientation.l, w: results.carton.orientation.w, h: results.carton.orientation.h },
            layout: { nx: results.carton.nx, ny: results.carton.ny, nz: results.carton.nz, base: 0 }, color: "#0a9396"
        };
    }
    if (state.step === 2) {
        return {
            title: "Sắp xếp carton trên pallet", badge: "Spatial layer - Pallet",
            quantity: results.pallet.qty, unit: "THÙNG / PALLET", efficiency: results.efficiencies.pallet,
            note: `${results.pallet.nx} x ${results.pallet.ny} x ${results.pallet.nz} carton trong vùng hữu dụng ${formatCm(results.pallet.maxH - results.pallet.base)}.`,
            bounds: { l: results.pallet.l, w: results.pallet.w, h: results.pallet.realH },
            item: { l: results.pallet.orientation.l, w: results.pallet.orientation.w, h: results.cartonLoad.h },
            layout: { nx: results.pallet.nx, ny: results.pallet.ny, nz: results.pallet.nz, base: results.pallet.base }, color: "#ee9b00"
        };
    }

    if (state.step === 4) {
        const plan = results.multiSkuPlan || { placements: [], packedBoxes: 0, unplacedBoxes: 0, volumeUtilization: 0, loadedCbm: 0 };
        return {
            mode: "multi-sku", containerType: refs.multiContainerType ? refs.multiContainerType.value : "",
            title: "Multi-SKU floor loading", badge: "Spatial layer - Multi-SKU",
            quantity: plan.packedBoxes, unit: "THÙNG / CONT", efficiency: plan.volumeUtilization * 100,
            note: `Đã xếp ${integerFormatter.format(plan.packedBoxes)} thùng, còn trống ${integerFormatter.format(plan.unplacedBoxes)} thùng. CBM hàng: ${numberFormatter.format(plan.loadedCbm)} m3.`,
            bounds: { l: results.container.l, w: results.container.w, h: results.container.h }, placements: plan.placements,
            showShell: refs.multiShowShell ? refs.multiShowShell.checked : true, xrayShell: refs.multiXrayShell ? refs.multiXrayShell.checked : true
        };
    }

    return {
        title: "Floor loading thùng trong container", badge: "Spatial layer - Container",
        quantity: results.container.qty, unit: "THÙNG / CONT", efficiency: results.efficiencies.container,
        note: `${results.container.nx} x ${results.container.ny} x ${results.container.nz} thùng trong ${refs.containerType.selectedOptions[0].text}.`,
        bounds: { l: results.container.l, w: results.container.w, h: results.container.h },
        item: { l: results.container.orientation.l, w: results.container.orientation.w, h: results.container.orientation.h },
        layout: { nx: results.container.nx, ny: results.container.ny, nz: results.container.nz, base: 0 }, color: "#ee9b00"
    };
}

function renderMetrics(results) {
    const cartonDims = `${numberFormatter.format(results.carton.l)} x ${numberFormatter.format(results.carton.w)} x ${numberFormatter.format(results.carton.h)} cm`;
    const cartonNote = `${results.carton.qty} hộp / thùng, hiệu suất ${formatPercent(results.efficiencies.carton)}${results.carton.overshoot ? `, dư ${results.carton.overshoot} hộp so với mục tiêu.` : "."}`;
    const loadedCbm = (results.container.qty * results.metrics.cartonLoadVolume) / 1000000;
    const capacityCbm = results.metrics.containerVolume / 1000000;
    const remainingCbm = Math.max(0, capacityCbm - loadedCbm);

    if (refs.suggestedCarton) refs.suggestedCarton.textContent = cartonDims;
    if (refs.cartonQuickSpec) refs.cartonQuickSpec.textContent = cartonNote;
    refs.palletQuickSpec.textContent = `${results.pallet.qty} thùng / pallet, ${results.pallet.nx} x ${results.pallet.ny} x ${results.pallet.nz}, cao thực tế ${formatCm(results.pallet.realH)}. Dim thùng đang dùng: ${formatDims(results.cartonLoad)}.`;
    refs.palletLayerSpec.textContent = `1 layer pallet: ${results.pallet.layerQty} thùng, độ phủ ${formatPercent(results.pallet.layerCoverage)}.`;
    refs.containerQuickSpec.textContent = `${results.container.qty} thùng / container, ${results.container.nx} x ${results.container.ny} x ${results.container.nz}, lọt lòng ${formatDims(results.container)}. CBM hàng: ${formatCbm(loadedCbm)} / ${formatCbm(capacityCbm)} (còn trống ${formatCbm(remainingCbm)}).`;

    refs.dashEff.textContent = integerFormatter.format(results.pallet.layerQty);
    refs.dashPalletCoverage.textContent = formatPercent(results.pallet.layerCoverage);
    refs.dashCartonSuggest.textContent = cartonDims;

    renderSafetyScoring(results.form, results.safetyScoring);
    renderPalletOverhang(results);
    renderMultiSkuSummary(results);
}

function renderPalletOverhang(results) {
    if (!refs.palletOverhangSafe || !refs.palletOverhangKeep) return;

    const report = results.palletOverhang;
    if (!report || report.baselineLayerQty < 1) {
        refs.palletOverhangSafe.textContent = "Không overhang: --";
        refs.palletOverhangKeep.textContent = "Giữ số thùng cũ: overhang L --, W --.";
        return;
    }

    if (report.reducedBy > 0) {
        refs.palletOverhangSafe.textContent = `Không overhang: giảm từ ${integerFormatter.format(report.baselineLayerQty)} xuống ${integerFormatter.format(report.noOverhangLayerQty)} thùng/layer (giảm ${integerFormatter.format(report.reducedBy)}).`;
    } else {
        refs.palletOverhangSafe.textContent = `Không overhang: giữ được ${integerFormatter.format(report.noOverhangLayerQty)} thùng/layer, không cần giảm.`;
    }

    const scenario = report.keepQtyScenario;
    if (!scenario) {
        refs.palletOverhangKeep.textContent = "Giữ số thùng cũ: chưa tính được overhang.";
        return;
    }

    const overhangL = numberFormatter.format(round(scenario.overhangL));
    const overhangW = numberFormatter.format(round(scenario.overhangW));
    refs.palletOverhangKeep.textContent = `Giữ ${integerFormatter.format(report.baselineLayerQty)} thùng/layer: overhang L ${overhangL} cm, W ${overhangW} cm (bố trí ${scenario.nx}x${scenario.ny}).`;
}

function renderMultiSkuSummary(results) {
    if (!refs.multiSkuSummary) return;
    const plan = results.multiSkuPlan;
    if (refs.multiLoadedCbm) refs.multiLoadedCbm.textContent = "-- m3";
    if (refs.multiLoadedBoxes) refs.multiLoadedBoxes.textContent = "--";
    if (!plan || !plan.summary || plan.summary.length === 0) {
        refs.multiSkuSummary.textContent = "Nhập danh sách SKU để mô phỏng xếp nhiều loại thùng trong cùng 1 container.";
        return;
    }
    if (refs.multiLoadedCbm) refs.multiLoadedCbm.textContent = `${numberFormatter.format(plan.loadedCbm)} m3`;
    if (refs.multiLoadedBoxes) refs.multiLoadedBoxes.textContent = integerFormatter.format(plan.packedBoxes);
    
    const lines = plan.summary.map((item) => {
        const flippedLabel = item.packedFlippedH > 0 ? `, lậtH ${integerFormatter.format(item.packedFlippedH)}` : "";
        return `${item.sku}: ${integerFormatter.format(item.packed)}/${integerFormatter.format(item.qty)} thùng${flippedLabel}`;
    }).join(" | ");
    
    const modeLabel = plan.packMode === "balanced" ? "cân bằng thứ tự" : "ưu tiên số lượng";
    const relaxLabel = plan.relaxTail ? "có nới thứ tự ở cuối cont" : "giữ nguyên thứ tự chặt";
    refs.multiSkuSummary.textContent = `Đã xếp ${formatPercent(plan.volumeUtilization * 100)} thể tích cont, ${formatPercent(plan.floorCoverage * 100)} phủ sàn (${modeLabel}, ${relaxLabel}). Màu sáng hơn = thùng lật đứng. ${lines}`;
}

function renderSafetyScoring(form, scoring) {
    if (!refs.safetyWinner || !refs.safetySummary || !refs.safetyOptions) return;
    if (!scoring.winner) {
        refs.safetyWinner.textContent = "Safety winner: --";
        refs.safetySummary.textContent = `Không có layout hợp lệ cho đúng target ${integerFormatter.format(form.box.target)} units/carton.`;
        refs.safetyOptions.innerHTML = "";
        return;
    }

    const winner = scoring.winner;
    const passTag = winner.passCompression && winner.passGross ? "PASS" : "RISK";
    refs.safetyWinner.textContent = `Safety winner: ${winner.key} (${passTag})`;

    const patternLabel = form.safety.pattern === "interlock" ? "interlock" : "column";
    refs.safetySummary.textContent = `Chỉ số chung: Safety Index = BCT hiệu dụng / tải yêu cầu. Càng cao càng an toàn. Đạt khi >= 1.0. Chỉ xét layout đúng ${integerFormatter.format(form.box.target)} units/carton, RH ${form.safety.humidity}%, ${patternLabel}.`;

    refs.safetyOptions.innerHTML = scoring.options.map((option) => {
        const statusClass = option.key === winner.key ? "safety-option recommended" : "safety-option";
        const safetyClass = option.safetyIndex >= 1 ? "ok" : "warn";
        return `
            <article class="${statusClass}">
                <div class="safety-option-head">
                    <strong>${option.key}</strong>
                    <span class="safety-score-value ${safetyClass}">${numberFormatter.format(round(option.safetyIndex, 2))}</span>
                </div>
                <p>Bố trí: ${option.layout.nx}x${option.layout.ny}x${option.layout.nz} | Dim: ${formatDims(option.dims)} | Qty: ${integerFormatter.format(option.qty)}</p>
            </article>
        `;
    }).join("");
}

function renderBreakdowns(results) {
    const loadedCbm = (results.container.qty * results.metrics.cartonLoadVolume) / 1000000;
    const capacityCbm = results.metrics.containerVolume / 1000000;
    const remainingCbm = Math.max(0, capacityCbm - loadedCbm);

    refs.cartonBreakdownTitle.textContent = `${results.carton.qty} hộp / thùng`;
    refs.cartonBreakdownBody.textContent = `Carton đề xuất ${formatDims(results.carton)}. Bố trí ${results.carton.nx} x ${results.carton.ny} x ${results.carton.nz} theo chiều đặt ${formatDims(results.carton.orientation)}.`;

    refs.palletBreakdownTitle.textContent = `${results.pallet.qty} thùng / pallet`;
    refs.palletBreakdownBody.textContent = `Pallet ${results.pallet.nx} x ${results.pallet.ny} x ${results.pallet.nz} với chiều cao thực tế ${formatCm(results.pallet.realH)} trên mặt chuẩn ${numberFormatter.format(results.pallet.l)} x ${numberFormatter.format(results.pallet.w)} cm. Mỗi layer chứa ${results.pallet.layerQty} thùng, phủ ${formatPercent(results.pallet.layerCoverage)} mặt pallet.`;

    refs.containerBreakdownTitle.textContent = `${results.container.qty} thùng / cont`;
    refs.containerBreakdownBody.textContent = `Container floor loading nhận ${results.container.nx} x ${results.container.ny} x ${results.container.nz} thùng. CBM hàng: ${formatCbm(loadedCbm)} / ${formatCbm(capacityCbm)}. Còn trống ${formatCbm(remainingCbm)}. Tổng cộng ${integerFormatter.format(results.metrics.totalUnits)} đơn vị sản phẩm trong một chuyến.`;
}

function renderRecommendations(results) {
    const items = [];
    if (results.carton.overshoot > 0) items.push(`Carton hiện dư ${results.carton.overshoot} hộp so với mục tiêu mỗi thùng. Nên cân nhắc giới hạn thêm loại xoay hoặc thay đổi mục tiêu đóng thùng.`);
    else items.push("Phương án carton hiện khớp đúng số lượng mục tiêu nên phù hợp cho dây chuyền cần đóng gói nhất quán.");

    if (results.efficiencies.pallet < 75) items.push("Hiệu suất pallet còn thấp. Bạn nên thử pallet chuẩn khác hoặc điều chỉnh số hộp mục tiêu để footprint bám sát mặt pallet hơn.");
    else items.push("Mặt pallet đang được khai thác khá tốt. Phần không gian còn lại chủ yếu nằm ở biên hoặc ở tầng cao cuối cùng.");

    if (results.container.qty === 0) items.push("Cấu hình hiện tại không thể xếp thùng vào container. Hãy điều chỉnh kích thước thùng hoặc chọn loại container lớn hơn.");
    else if (results.efficiencies.total < 55) items.push("Hiệu suất tổng vẫn còn dư địa lớn. Tác động mạnh nhất lúc này thường nằm ở việc tối ưu carton trước, vì hiệu ứng sẽ nhân lên ở floor loading container.");
    else items.push("Hiệu suất tổng đã ở mức tốt cho floor loading. Bước tiếp theo nếu cần là bổ sung thêm ràng buộc tải trọng hoặc chừa khe thao tác thực tế.");

    items.push(`Tổng thể tích sản phẩm thuần là ${numberFormatter.format((results.metrics.totalUnits * results.metrics.unitVolume) / 1000000)} m3 trên mỗi container, so với dung tích tham chiếu ${numberFormatter.format(results.metrics.containerVolume / 1000000)} m3.`);
    refs.recommendations.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
}

function renderTable(results) {
    const rows = [
        { label: "Carton", dims: formatDims(results.carton), layout: `${results.carton.nx} x ${results.carton.ny} x ${results.carton.nz}`, capacity: `${results.carton.qty} hộp`, efficiency: formatPercent(results.efficiencies.carton) },
        { label: "Pallet", dims: `${numberFormatter.format(results.pallet.l)} x ${numberFormatter.format(results.pallet.w)} x ${numberFormatter.format(results.pallet.realH)} cm`, layout: `${results.pallet.nx} x ${results.pallet.ny} x ${results.pallet.nz} | 1 layer: ${results.pallet.layerQty}`, capacity: `${results.pallet.qty} thùng`, efficiency: formatPercent(results.efficiencies.pallet) },
        { label: "Container", dims: formatDims(results.container), layout: `${results.container.nx} x ${results.container.ny} x ${results.container.nz}`, capacity: `${results.container.qty} thùng`, efficiency: formatPercent(results.efficiencies.total) }
    ];
    refs.chainTableBody.innerHTML = rows.map((row) => `<tr><td>${row.label}</td><td>${row.dims}</td><td>${row.layout}</td><td>${row.capacity}</td><td>${row.efficiency}</td></tr>`).join("");
}

function buildReport(results) {
    return [
        "BÁO CÁO TỐI ƯU ĐÓNG GÓI LOGISTICS",
        "",
        `Đơn vị sản phẩm: ${formatDims(results.form.box)}`,
        `Mục tiêu mỗi carton: ${results.form.box.target} hộp`,
        `Carton đề xuất: ${formatDims(results.carton)} | ${results.carton.qty} hộp | hiệu suất ${formatPercent(results.efficiencies.carton)}`,
        `Pallet: ${numberFormatter.format(results.pallet.l)} x ${numberFormatter.format(results.pallet.w)} x ${results.pallet.realH} cm | ${results.pallet.qty} thùng | hiệu suất ${formatPercent(results.efficiencies.pallet)}`,
        `Container floor loading: ${formatDims(results.container)} | ${results.container.qty} thùng | CBM hàng ${formatCbm((results.container.qty * results.metrics.cartonLoadVolume) / 1000000)} / ${formatCbm(results.metrics.containerVolume / 1000000)}`,
        `CBM còn trống: ${formatCbm((results.metrics.containerVolume / 1000000) - ((results.container.qty * results.metrics.cartonLoadVolume) / 1000000))}`,
        `Tổng đơn vị/container: ${integerFormatter.format(results.metrics.totalUnits)}`,
        `Hiệu suất tổng: ${formatPercent(results.efficiencies.total)} | Lãng phí: ${formatPercent(results.metrics.waste)}`
    ].join("\n");
}

async function copyReport() {
    if (!state.results) return;
    const originalText = refs.copyReportBtn.textContent;
    try {
        await navigator.clipboard.writeText(buildReport(state.results));
        refs.copyReportBtn.textContent = "Đã sao chép";
    } catch (error) {
        refs.copyReportBtn.textContent = "Lỗi sao chép";
    }
    window.setTimeout(() => { refs.copyReportBtn.textContent = originalText; }, 1600);
}

function render() {
    if (!state.results) return;
    renderMetrics(state.results);
    renderBreakdowns(state.results);
    renderRecommendations(state.results);
    renderTable(state.results);
    if(typeof renderStage === 'function') renderStage(state.results);
}

function renderEmptyState() {
    refs.dashEff.textContent = "--";
    refs.dashPalletCoverage.textContent = "--";
    refs.dashCartonSuggest.textContent = "-- x -- x -- cm";

    if (refs.suggestedCarton) refs.suggestedCarton.textContent = "-- x -- x -- cm";
    if (refs.cartonQuickSpec) refs.cartonQuickSpec.textContent = "Nhập L, W, H và units/carton để tính gợi ý carton.";
    
    refs.palletQuickSpec.textContent = "Nhập L, W, H và units/carton để tính pallet.";
    refs.palletLayerSpec.textContent = "1 layer pallet: -- thùng, độ phủ --%.";
    
    if (refs.palletOverhangSafe) refs.palletOverhangSafe.textContent = "Không overhang: --";
    if (refs.palletOverhangKeep) refs.palletOverhangKeep.textContent = "Giữ số thùng cũ: overhang L --, W --.";
    if (refs.multiSkuSummary) refs.multiSkuSummary.textContent = "Nhập danh sách SKU để mô phỏng xếp nhiều loại thùng trong cùng 1 container.";
    if (refs.multiLoadedCbm) refs.multiLoadedCbm.textContent = "-- m3";
    if (refs.multiLoadedBoxes) refs.multiLoadedBoxes.textContent = "--";
    
    refs.containerQuickSpec.textContent = "Nhập dữ liệu đóng gói để tính floor loading container.";
    
    if (refs.safetyWinner) refs.safetyWinner.textContent = "Safety winner: --";
    if (refs.safetySummary) refs.safetySummary.textContent = "Nhập dữ liệu để đề xuất phương án bố trí carton an toàn hơn.";
    if (refs.safetyOptions) refs.safetyOptions.innerHTML = "";

    refs.cartonBreakdownTitle.textContent = "--"; refs.cartonBreakdownBody.textContent = "Chờ dữ liệu đầu vào.";
    refs.palletBreakdownTitle.textContent = "--"; refs.palletBreakdownBody.textContent = "Chờ dữ liệu đầu vào.";
    refs.containerBreakdownTitle.textContent = "--"; refs.containerBreakdownBody.textContent = "Chờ dữ liệu đầu vào.";
    
    refs.recommendations.innerHTML = "";
    refs.chainTableBody.innerHTML = "";

    refs.visualQty.textContent = "--";
    refs.visualUnit.textContent = "CHỜ DỮ LIỆU";
    refs.stageTitle.textContent = "Cấu trúc hộp trong carton";
    refs.viewBadge.textContent = "Spatial layer";
    refs.layoutNote.textContent = "Nhập L, W, H và units/carton để bắt đầu tính toán.";
    refs.effRing.style.setProperty("--progress", "0%");
    refs.effRingValue.textContent = "--";
    
    if (refs.multiDirectionHint) refs.multiDirectionHint.hidden = true;

    if (state.three.renderer && state.three.scene && state.three.camera) {
        clearStageGroup();
        state.three.renderer.render(state.three.scene, state.three.camera);
    }
}

function update() {
    state.results = computeResults();
    if (!state.results) {
        renderEmptyState();
        return;
    }
    render();
}

function registerEvents() {
    document.querySelectorAll(".preset-btn").forEach((button) => {
        button.addEventListener("click", () => applyScenario(button.dataset.preset));
    });

    document.querySelectorAll("[data-step-button]").forEach((button) => {
        button.addEventListener("click", () => setStep(Number(button.dataset.stepButton)));
    });

    refs.palletType.addEventListener("change", (event) => {
        applyPalletPreset(event.target.value);
        update();
    });

    refs.containerType.addEventListener("change", (event) => {
        applyContainerPreset(event.target.value, refs.containerGroup ? refs.containerGroup.value : "g1");
        update();
    });
    if (refs.multiContainerType) {
        refs.multiContainerType.addEventListener("change", (event) => {
            applyContainerPresetToFields(event.target.value, refs.multiContainerL, refs.multiContainerW, refs.multiContainerH);
            update();
        });
    }
    if (refs.containerGroup) {
        refs.containerGroup.addEventListener("change", (event) => {
            applyContainerPreset(refs.containerType.value, event.target.value);
            update();
        });
    }

    [refs.boxL, refs.boxW, refs.boxH, refs.targetQty].forEach((input) => {
        input.addEventListener("input", () => {
            state.cartonManual = false;
            state.activePreset = "";
            document.querySelectorAll(".preset-btn").forEach((button) => button.classList.remove("active"));
            update();
        });
    });

    [
        refs.cartonL, refs.cartonW, refs.cartonH,
        refs.palletL, refs.palletW, refs.palletMaxH, refs.palletBase,
        refs.containerL, refs.containerW, refs.containerH,
        refs.multiContainerL, refs.multiContainerW, refs.multiContainerH,
        refs.safetyNetG, refs.safetyTareKg, refs.safetyGrossLimit,
        refs.safetyEct, refs.safetyCaliperMm, refs.safetyStackLayers, refs.safetyFactor
    ].forEach((input) => {
        if (!input) {
            return;
        }
        input.addEventListener("input", () => {
            if (input === refs.cartonL || input === refs.cartonW || input === refs.cartonH) {
                state.cartonManual = true;
            }
            state.activePreset = "";
            document.querySelectorAll(".preset-btn").forEach((button) => button.classList.remove("active"));
            update();
        });
    });

    [refs.safetyPattern, refs.safetyHumidity].forEach((select) => {
        if (!select) {
            return;
        }
        select.addEventListener("change", update);
    });

    if (refs.multiSkuAddBtn) {
        refs.multiSkuAddBtn.addEventListener("click", () => {
            syncMultiSkuStateFromDom();
            state.multiSkuRows.push(createDefaultMultiSkuRow());
            renderMultiSkuRows();
            update();
        });
    }
    if (refs.multiSkuCatalogImportBtn && refs.multiSkuCatalogInput) {
        refs.multiSkuCatalogImportBtn.addEventListener("click", () => {
            const imported = importSkuCatalogFromText(refs.multiSkuCatalogInput.value);
            state.skuCatalog = imported.entries;
            renderMultiSkuRows();
            renderSkuCatalogStatus(imported.message);
            update();
        });
    }
    if (refs.multiSkuCatalogClearBtn && refs.multiSkuCatalogInput) {
        refs.multiSkuCatalogClearBtn.addEventListener("click", () => {
            refs.multiSkuCatalogInput.value = "";
            state.skuCatalog = [];
            syncMultiSkuStateFromDom();
            state.multiSkuRows = state.multiSkuRows.map((row) => ({ ...row, preset: "" }));
            renderMultiSkuRows();
            renderSkuCatalogStatus("Da xoa thu vien SKU.");
            update();
        });
    }
    if (refs.multiSkuList) {
        refs.multiSkuList.addEventListener("input", () => {
            syncMultiSkuStateFromDom();
            update();
        });
        refs.multiSkuList.addEventListener("change", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }
            if (target.getAttribute("data-multi-field") !== "preset") {
                return;
            }
            const rowNode = target.closest("[data-multi-row-id]");
            if (!rowNode) {
                return;
            }
            applyCatalogPresetToRowNode(rowNode, target.value);
            syncMultiSkuStateFromDom();
            update();
        });
        refs.multiSkuList.addEventListener("click", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }
            const action = target.getAttribute("data-multi-action");
            if (!action) {
                return;
            }
            const rowNode = target.closest("[data-multi-row-id]");
            if (!rowNode) {
                return;
            }
            const rowId = rowNode.getAttribute("data-multi-row-id");
            if (!rowId) {
                return;
            }

            syncMultiSkuStateFromDom();
            if (action === "remove") {
                state.multiSkuRows = state.multiSkuRows.filter((row) => row.id !== rowId);
                if (state.multiSkuRows.length === 0) {
                    state.multiSkuRows.push(createDefaultMultiSkuRow());
                }
            } else if (action === "up") {
                moveMultiSkuRow(rowId, -1);
            } else if (action === "down") {
                moveMultiSkuRow(rowId, 1);
            }
            renderMultiSkuRows();
            update();
        });
    }
    [refs.multiPackMode, refs.multiRelaxTail].forEach((input) => {
        if (!input) {
            return;
        }
        input.addEventListener("change", () => {
            syncMultiSkuStateFromDom();
            update();
        });
    });
    [refs.multiShowShell, refs.multiXrayShell].forEach((input) => {
        if (!input) {
            return;
        }
        input.addEventListener("change", () => {
            if (state.step === 4 && state.results) {
                renderStage(state.results);
                return;
            }
            update();
        });
    });

    refs.recalculateBtn.addEventListener("click", update);
    refs.copyReportBtn.addEventListener("click", copyReport);
    refs.sceneCanvas.addEventListener("dblclick", () => {
        resetViewer();
        if (state.three.renderer && state.three.scene && state.three.camera) {
            state.three.renderer.render(state.three.scene, state.three.camera);
        }
    });

    window.addEventListener("resize", () => resizeCanvas());
}

registerEvents();
if (refs.multiContainerType) {
    applyContainerPresetToFields(refs.multiContainerType.value, refs.multiContainerL, refs.multiContainerW, refs.multiContainerH);
}
renderMultiSkuRows();
renderSkuCatalogStatus();
update();

