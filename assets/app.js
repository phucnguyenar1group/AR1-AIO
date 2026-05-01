import * as THREE from "https://esm.sh/three@0.164.1";
import { OrbitControls } from "https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls";

const PALLET_PRESETS = {
    us48x40: { l: 121.9, w: 101.6, label: "US Standard" },
    std120x100: { l: 120, w: 100, label: "Standard 120 x 100" },
    euro120x80: { l: 120, w: 80, label: "Euro Pallet" }
};

const CONTAINER_PRESETS = {
    "20dc": { l: 590, w: 235, h: 239, label: "20' Dry Container" },
    "40dc": { l: 1203, w: 235, h: 239, label: "40' Dry Container" },
    "40hc": { l: 1203, w: 235, h: 270, label: "40' High Cube" },
    "40rf": { l: 1158, w: 229, h: 225, label: "40' Reefer (RF)" }
};

const CONTAINER_GROUP_PRESETS = {
    g1: {
        label: "WHSU / TEMU / ONEU",
        dims: {
            "20dc": { l: 590, w: 235, h: 239 },
            "40dc": { l: 1203, w: 235, h: 239 },
            "40hc": { l: 1203, w: 235, h: 270 },
            "40rf": { l: 1158, w: 229, h: 225 }
        }
    },
    g2: {
        label: "SZLU / TCLU / HDMU",
        dims: {
            "20dc": { l: 589, w: 234, h: 238 },
            "40dc": { l: 1200, w: 234, h: 238 },
            "40hc": { l: 1200, w: 234, h: 268 },
            "40rf": { l: 1156, w: 228, h: 224 }
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
        containerPreset: "20dc"
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
        resizeObserver: null
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
    containerGroup: document.getElementById("cont-group"),
    containerType: document.getElementById("cont-type"),
    containerL: document.getElementById("cont-l"),
    containerW: document.getElementById("cont-w"),
    containerH: document.getElementById("cont-h"),
    suggestedCarton: document.getElementById("suggested-ctn"),
    cartonQuickSpec: document.getElementById("carton-quick-spec"),
    palletQuickSpec: document.getElementById("pallet-quick-spec"),
    palletLayerSpec: document.getElementById("pallet-layer-spec"),
    containerQuickSpec: document.getElementById("container-quick-spec"),
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

function readNumber(input, fallback) {
    const value = parseFloat(input.value);
    return Number.isFinite(value) ? value : fallback;
}

function readInteger(input, fallback) {
    const value = parseInt(input.value, 10);
    return Number.isFinite(value) ? value : fallback;
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
    return {
        box: {
            l: Math.max(0.1, readNumber(refs.boxL, 12.5)),
            w: Math.max(0.1, readNumber(refs.boxW, 10.2)),
            h: Math.max(0.1, readNumber(refs.boxH, 8)),
            target: Math.max(1, readInteger(refs.targetQty, 24))
        },
        palletPreset: refs.palletType.value,
        pallet: {
            l: Math.max(1, readNumber(refs.palletL, 121.9)),
            w: Math.max(1, readNumber(refs.palletW, 101.6)),
            maxH: Math.max(1, readNumber(refs.palletMaxH, 160)),
            base: Math.max(0, readNumber(refs.palletBase, 15))
        },
        containerGroup: refs.containerGroup ? refs.containerGroup.value : "g1",
        containerPreset: refs.containerType.value,
        container: {
            l: Math.max(1, readNumber(refs.containerL, 590)),
            w: Math.max(1, readNumber(refs.containerW, 235)),
            h: Math.max(1, readNumber(refs.containerH, 239))
        }
    };
}

function computeResults() {
    const form = readFormState();
    const carton = suggestCarton(form.box, form.box.target);
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
        efficiencies
    };
}

function setStep(step) {
    state.step = step;
    document.querySelectorAll("[data-step-button]").forEach((button) => {
        button.classList.toggle("active", Number(button.dataset.stepButton) === step);
    });
    document.querySelectorAll("[data-step-panel]").forEach((panel) => {
        panel.classList.toggle("active", Number(panel.dataset.stepPanel) === step);
    });
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
            title: "Cấu trúc hộp trong carton",
            badge: "Spatial layer - Carton",
            quantity: results.carton.qty,
            unit: "HỘP / THÙNG",
            efficiency: results.efficiencies.carton,
            note: `${results.carton.nx} x ${results.carton.ny} x ${results.carton.nz} hộp, xoay theo ${formatDims(results.carton.orientation)}.`,
            bounds: { l: results.carton.l, w: results.carton.w, h: results.carton.h },
            item: { l: results.carton.orientation.l, w: results.carton.orientation.w, h: results.carton.orientation.h },
            layout: { nx: results.carton.nx, ny: results.carton.ny, nz: results.carton.nz, base: 0 },
            color: "#0a9396"
        };
    }

    if (state.step === 2) {
        return {
            title: "Sắp xếp carton trên pallet",
            badge: "Spatial layer - Pallet",
            quantity: results.pallet.qty,
            unit: "THÙNG / PALLET",
            efficiency: results.efficiencies.pallet,
            note: `${results.pallet.nx} x ${results.pallet.ny} x ${results.pallet.nz} carton trong vùng hữu dụng ${formatCm(results.pallet.maxH - results.pallet.base)}.`,
            bounds: { l: results.pallet.l, w: results.pallet.w, h: results.pallet.realH },
            item: { l: results.pallet.orientation.l, w: results.pallet.orientation.w, h: results.cartonLoad.h },
            layout: { nx: results.pallet.nx, ny: results.pallet.ny, nz: results.pallet.nz, base: results.pallet.base },
            color: "#ee9b00"
        };
    }

    return {
        title: "Floor loading thùng trong container",
        badge: "Spatial layer - Container",
        quantity: results.container.qty,
        unit: "THÙNG / CONT",
        efficiency: results.efficiencies.container,
        note: `${results.container.nx} x ${results.container.ny} x ${results.container.nz} thùng trong ${refs.containerType.selectedOptions[0].text}.`,
        bounds: { l: results.container.l, w: results.container.w, h: results.container.h },
        item: { l: results.container.orientation.l, w: results.container.orientation.w, h: results.container.orientation.h },
        layout: { nx: results.container.nx, ny: results.container.ny, nz: results.container.nz, base: 0 },
        color: "#ee9b00"
    };
}

function renderMetrics(results) {
    const cartonDims = `${numberFormatter.format(results.carton.l)} x ${numberFormatter.format(results.carton.w)} x ${numberFormatter.format(results.carton.h)} cm`;
    const cartonNote = `${results.carton.qty} hộp / thùng, hiệu suất ${formatPercent(results.efficiencies.carton)}${results.carton.overshoot ? `, dư ${results.carton.overshoot} hộp so với mục tiêu.` : "."}`;
    const loadedCbm = (results.container.qty * results.metrics.cartonLoadVolume) / 1000000;
    const capacityCbm = results.metrics.containerVolume / 1000000;
    const remainingCbm = Math.max(0, capacityCbm - loadedCbm);
    const groupLabel = CONTAINER_GROUP_PRESETS[results.form.containerGroup]?.label || "Nhóm mặc định";

    if (refs.suggestedCarton) {
        refs.suggestedCarton.textContent = cartonDims;
    }
    if (refs.cartonQuickSpec) {
        refs.cartonQuickSpec.textContent = cartonNote;
    }
    refs.palletQuickSpec.textContent = `${results.pallet.qty} thùng / pallet, ${results.pallet.nx} x ${results.pallet.ny} x ${results.pallet.nz}, cao thực tế ${formatCm(results.pallet.realH)}. Dim thùng đang dùng: ${formatDims(results.cartonLoad)}.`;
    refs.palletLayerSpec.textContent = `1 layer pallet: ${results.pallet.layerQty} thùng, độ phủ ${formatPercent(results.pallet.layerCoverage)}.`;
    refs.containerQuickSpec.textContent = `${results.container.qty} thùng / container, ${results.container.nx} x ${results.container.ny} x ${results.container.nz}, lọt lòng ${formatDims(results.container)}. Preset: ${groupLabel}. CBM hàng ${formatCbm(loadedCbm)} / sức chứa ${formatCbm(capacityCbm)} (còn trống ${formatCbm(remainingCbm)}).`;

    refs.dashEff.textContent = integerFormatter.format(results.pallet.layerQty);
    refs.dashPalletCoverage.textContent = formatPercent(results.pallet.layerCoverage);
    refs.dashCartonSuggest.textContent = cartonDims;
}

function renderBreakdowns(results) {
    const loadedCbm = (results.container.qty * results.metrics.cartonLoadVolume) / 1000000;
    const capacityCbm = results.metrics.containerVolume / 1000000;
    const remainingCbm = Math.max(0, capacityCbm - loadedCbm);
    const groupLabel = CONTAINER_GROUP_PRESETS[results.form.containerGroup]?.label || "Nhóm mặc định";

    refs.cartonBreakdownTitle.textContent = `${results.carton.qty} hộp / thùng`;
    refs.cartonBreakdownBody.textContent = `Carton đề xuất ${formatDims(results.carton)}. Bố trí ${results.carton.nx} x ${results.carton.ny} x ${results.carton.nz} theo chiều đặt ${formatDims(results.carton.orientation)}.`;

    refs.palletBreakdownTitle.textContent = `${results.pallet.qty} thùng / pallet`;
    refs.palletBreakdownBody.textContent = `Pallet ${results.pallet.nx} x ${results.pallet.ny} x ${results.pallet.nz} với chiều cao thực tế ${formatCm(results.pallet.realH)} trên mặt chuẩn ${numberFormatter.format(results.pallet.l)} x ${numberFormatter.format(results.pallet.w)} cm. Mỗi layer chứa ${results.pallet.layerQty} thùng, phủ ${formatPercent(results.pallet.layerCoverage)} mặt pallet.`;

    refs.containerBreakdownTitle.textContent = `${results.container.qty} thùng / cont`;
    refs.containerBreakdownBody.textContent = `Container floor loading nhận ${results.container.nx} x ${results.container.ny} x ${results.container.nz} thùng. CBM hàng: ${formatCbm(loadedCbm)} / ${formatCbm(capacityCbm)}. Còn trống ${formatCbm(remainingCbm)}. Tổng cộng ${integerFormatter.format(results.metrics.totalUnits)} đơn vị sản phẩm trong một chuyến.`;
}

function renderRecommendations(results) {
    const items = [];

    if (results.carton.overshoot > 0) {
        items.push(`Carton hiện dư ${results.carton.overshoot} hộp so với mục tiêu mỗi thùng. Nếu cần bám sát số lượng đóng gói tuyệt đối, nên cân nhắc giới hạn thêm loại xoay hoặc thay đổi mục tiêu đóng thùng.`);
    } else {
        items.push("Phương án carton hiện khớp đúng số lượng mục tiêu nên phù hợp cho dây chuyền cần đóng gói nhất quán.");
    }

    if (results.efficiencies.pallet < 75) {
        items.push("Hiệu suất pallet còn thấp. Bạn nên thử pallet chuẩn khác hoặc điều chỉnh số hộp mục tiêu mỗi thùng để footprint carton bám sát mặt pallet hơn.");
    } else {
        items.push("Mặt pallet đang được khai thác khá tốt. Phần không gian còn lại chủ yếu nằm ở biên hoặc ở tầng cao cuối cùng.");
    }

    if (results.container.qty === 0) {
        items.push("Cấu hình hiện tại không thể xếp thùng vào container. Hãy điều chỉnh kích thước thùng hoặc chọn loại container lớn hơn.");
    } else if (results.efficiencies.total < 55) {
        items.push("Hiệu suất tổng vẫn còn dư địa lớn. Tác động mạnh nhất lúc này thường nằm ở việc tối ưu carton trước, vì hiệu ứng sẽ nhân lên ở floor loading container.");
    } else {
        items.push("Hiệu suất tổng đã ở mức tốt cho floor loading. Bước tiếp theo nếu cần là bổ sung thêm ràng buộc tải trọng hoặc chừa khe thao tác thực tế.");
    }

    items.push(`Tổng thể tích sản phẩm thuần là ${numberFormatter.format((results.metrics.totalUnits * results.metrics.unitVolume) / 1000000)} m3 trên mỗi container, so với dung tích tham chiếu ${numberFormatter.format(results.metrics.containerVolume / 1000000)} m3.`);

    refs.recommendations.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
}

function renderTable(results) {
    const rows = [
        {
            label: "Carton",
            dims: formatDims(results.carton),
            layout: `${results.carton.nx} x ${results.carton.ny} x ${results.carton.nz}`,
            capacity: `${results.carton.qty} hộp`,
            efficiency: formatPercent(results.efficiencies.carton)
        },
        {
            label: "Pallet",
            dims: `${numberFormatter.format(results.pallet.l)} x ${numberFormatter.format(results.pallet.w)} x ${numberFormatter.format(results.pallet.realH)} cm`,
            layout: `${results.pallet.nx} x ${results.pallet.ny} x ${results.pallet.nz} | 1 layer: ${results.pallet.layerQty}`,
            capacity: `${results.pallet.qty} thùng`,
            efficiency: formatPercent(results.efficiencies.pallet)
        },
        {
            label: "Container",
            dims: formatDims(results.container),
            layout: `${results.container.nx} x ${results.container.ny} x ${results.container.nz}`,
            capacity: `${results.container.qty} thùng`,
            efficiency: formatPercent(results.efficiencies.total)
        }
    ];

    refs.chainTableBody.innerHTML = rows.map((row) => `
        <tr>
            <td>${row.label}</td>
            <td>${row.dims}</td>
            <td>${row.layout}</td>
            <td>${row.capacity}</td>
            <td>${row.efficiency}</td>
        </tr>
    `).join("");
}
function resizeCanvas() {
    if (!state.three.renderer || !state.three.camera) {
        return;
    }

    const rect = refs.visualStage.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(260, Math.floor(rect.height));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    state.three.renderer.setPixelRatio(pixelRatio);
    state.three.renderer.setSize(width, height, false);
    state.three.camera.aspect = width / height;
    state.three.camera.updateProjectionMatrix();
}

function disposeMaterial(material) {
    if (!material) {
        return;
    }
    if (Array.isArray(material)) {
        material.forEach(disposeMaterial);
        return;
    }
    material.dispose();
}

function disposeObject(object) {
    object.traverse((node) => {
        if (node.geometry) {
            node.geometry.dispose();
        }
        if (node.material) {
            disposeMaterial(node.material);
        }
    });
}

function clearStageGroup() {
    if (!state.three.stageGroup || !state.three.scene) {
        return;
    }
    state.three.scene.remove(state.three.stageGroup);
    disposeObject(state.three.stageGroup);
    state.three.stageGroup = null;
}

function initThreeRenderer() {
    if (state.three.renderer) {
        return;
    }

    const renderer = new THREE.WebGLRenderer({
        canvas: refs.sceneCanvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000);
    camera.position.set(260, 220, 260);

    const controls = new OrbitControls(camera, refs.sceneCanvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = false;
    controls.target.set(0, 0, 0);
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minPolarAngle = 0.1;
    controls.enablePan = true;
    controls.zoomSpeed = 0.9;
    controls.rotateSpeed = 0.75;
    controls.update();

    const hemiLight = new THREE.HemisphereLight(0xf1f5ff, 0xc2aa85, 1.08);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.84);
    keyLight.position.set(220, 310, 180);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xbfd2ff, 0.32);
    rimLight.position.set(-220, 110, -240);
    scene.add(rimLight);

    const grid = new THREE.GridHelper(1400, 28, 0x9aa5c8, 0xcdd5ea);
    grid.position.y = 0;
    grid.material.opacity = 0.23;
    grid.material.transparent = true;
    scene.add(grid);

    renderer.setAnimationLoop(() => {
        controls.update();
        renderer.render(scene, camera);
    });

    state.three.renderer = renderer;
    state.three.scene = scene;
    state.three.camera = camera;
    state.three.controls = controls;

    if (window.ResizeObserver) {
        state.three.resizeObserver = new ResizeObserver(() => resizeCanvas());
        state.three.resizeObserver.observe(refs.visualStage);
    }

    resizeCanvas();
}

function fitCameraToObject(object, instant = false) {
    if (!state.three.camera || !state.three.controls || !object) {
        return;
    }

    const bbox = new THREE.Box3().setFromObject(object);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const fov = THREE.MathUtils.degToRad(state.three.camera.fov);
    const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.4;

    state.three.camera.near = Math.max(0.1, maxDim / 250);
    state.three.camera.far = Math.max(2000, maxDim * 80);
    state.three.camera.updateProjectionMatrix();

    const offset = new THREE.Vector3(distance * 0.9, distance * 0.78, distance * 0.95);
    const newPos = center.clone().add(offset);

    state.three.controls.target.copy(center);
    state.three.controls.minDistance = Math.max(maxDim * 0.22, 12);
    state.three.controls.maxDistance = Math.max(maxDim * 7, 420);

    if (instant) {
        state.three.camera.position.copy(newPos);
    } else {
        state.three.camera.position.lerp(newPos, 0.9);
    }
    state.three.controls.update();
}

function buildThreeStage(stage) {
    clearStageGroup();
    const group = new THREE.Group();
    const bounds = stage.bounds;

    const containerMaterial = new THREE.MeshStandardMaterial({
        color: 0xd6dbe8,
        transparent: true,
        opacity: 0.08,
        roughness: 0.95,
        metalness: 0.02
    });
    const containerMesh = new THREE.Mesh(
        new THREE.BoxGeometry(bounds.l, bounds.h, bounds.w),
        containerMaterial
    );
    containerMesh.position.set(0, bounds.h / 2, 0);
    group.add(containerMesh);

    const edgeLines = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(bounds.l, bounds.h, bounds.w)),
        new THREE.LineBasicMaterial({ color: 0x687593, transparent: true, opacity: 0.4 })
    );
    edgeLines.position.copy(containerMesh.position);
    group.add(edgeLines);

    if (stage.layout.base > 0) {
        const baseMesh = new THREE.Mesh(
            new THREE.BoxGeometry(bounds.l, stage.layout.base, bounds.w),
            new THREE.MeshStandardMaterial({ color: 0x7a5a3d, roughness: 0.75, metalness: 0.05 })
        );
        baseMesh.position.set(0, stage.layout.base / 2, 0);
        group.add(baseMesh);
    }

    const total = stage.layout.nx * stage.layout.ny * stage.layout.nz;
    const visibleCount = Math.min(total, 1600);
    if (visibleCount > 0) {
        // Leave a subtle gap between items so users can see each box/carton clearly.
        const gapFactorX = 0.96;
        const gapFactorY = 0.985;
        const gapFactorZ = 0.96;
        const cellGeometry = new THREE.BoxGeometry(
            stage.item.l * gapFactorX,
            stage.item.h * gapFactorY,
            stage.item.w * gapFactorZ
        );
        const cellMaterial = new THREE.MeshStandardMaterial({
            color: stage.color,
            roughness: 0.5,
            metalness: 0.04
        });
        const instanced = new THREE.InstancedMesh(cellGeometry, cellMaterial, visibleCount);
        const dummy = new THREE.Object3D();
        let index = 0;

        for (let layer = 0; layer < stage.layout.nz && index < visibleCount; layer += 1) {
            for (let row = 0; row < stage.layout.ny && index < visibleCount; row += 1) {
                for (let col = 0; col < stage.layout.nx && index < visibleCount; col += 1) {
                    dummy.position.set(
                        -bounds.l / 2 + stage.item.l / 2 + col * stage.item.l,
                        stage.layout.base + stage.item.h / 2 + layer * stage.item.h,
                        -bounds.w / 2 + stage.item.w / 2 + row * stage.item.w
                    );
                    dummy.updateMatrix();
                    instanced.setMatrixAt(index, dummy.matrix);
                    index += 1;
                }
            }
        }
        instanced.instanceMatrix.needsUpdate = true;
        group.add(instanced);
    }

    state.three.scene.add(group);
    state.three.stageGroup = group;
    return { visibleCount, total };
}

function drawScene(stage) {
    initThreeRenderer();
    resizeCanvas();
    const stat = buildThreeStage(stage);
    fitCameraToObject(state.three.stageGroup, true);

    if (stat.visibleCount < stat.total) {
        refs.layoutNote.textContent = integerFormatter.format(stage.quantity) + " " + stage.unit + ". " + stage.note + " Đang rút gọn hiển thị còn " + stat.visibleCount + "/" + stat.total + " khối để giữ hiệu năng.";
    }
}

function renderStage(results) {
    const stage = stageConfig(results);
    refs.stageTitle.textContent = stage.title;
    refs.viewBadge.textContent = stage.badge;
    refs.visualQty.textContent = integerFormatter.format(stage.quantity);
    refs.visualUnit.textContent = stage.unit;
    refs.layoutNote.textContent = integerFormatter.format(stage.quantity) + " " + stage.unit + ". " + stage.note;

    const progress = formatPercent(stage.efficiency);
    refs.effRing.style.setProperty("--progress", `${clamp(stage.efficiency, 0, 100)}%`);
    refs.effRingValue.textContent = progress;

    drawScene(stage);
}

function buildReport(results) {
    return [
        "BÁO CÁO TỐI ƯU ĐÓNG GÓI LOGISTICS",
        "",
        `Đơn vị sản phẩm: ${formatDims(results.form.box)}`,
        `Mục tiêu mỗi carton: ${results.form.box.target} hộp`,
        `Carton đề xuất: ${formatDims(results.carton)} | ${results.carton.qty} hộp | hiệu suất ${formatPercent(results.efficiencies.carton)}`,
        `Pallet: ${numberFormatter.format(results.pallet.l)} x ${numberFormatter.format(results.pallet.w)} x ${numberFormatter.format(results.pallet.realH)} cm | ${results.pallet.qty} thùng | hiệu suất ${formatPercent(results.efficiencies.pallet)}`,
        `Container floor loading: ${formatDims(results.container)} | ${results.container.qty} thùng | CBM hàng ${formatCbm((results.container.qty * results.metrics.cartonLoadVolume) / 1000000)} / ${formatCbm(results.metrics.containerVolume / 1000000)}`,
        `CBM còn trống: ${formatCbm((results.metrics.containerVolume / 1000000) - ((results.container.qty * results.metrics.cartonLoadVolume) / 1000000))}`,
        `Tổng đơn vị/container: ${integerFormatter.format(results.metrics.totalUnits)}`,
        `Hiệu suất tổng: ${formatPercent(results.efficiencies.total)} | Lãng phí: ${formatPercent(results.metrics.waste)}`
    ].join("\n");
}

async function copyReport() {
    if (!state.results) {
        return;
    }

    const originalText = refs.copyReportBtn.textContent;
    try {
        await navigator.clipboard.writeText(buildReport(state.results));
        refs.copyReportBtn.textContent = "Đã sao chép";
    } catch (error) {
        refs.copyReportBtn.textContent = "Không sao chép được";
    }

    window.setTimeout(() => {
        refs.copyReportBtn.textContent = originalText;
    }, 1600);
}
function render() {
    if (!state.results) {
        return;
    }

    renderMetrics(state.results);
    renderBreakdowns(state.results);
    renderRecommendations(state.results);
    renderTable(state.results);
    renderStage(state.results);
}

function update() {
    state.results = computeResults();
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
        refs.containerL, refs.containerW, refs.containerH
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
applyScenario("baseline");
