const PALLET_PRESETS = {
    us48x40: { l: 121.9, w: 101.6, label: "US Standard" },
    std120x100: { l: 120, w: 100, label: "Standard 120 x 100" },
    euro120x80: { l: 120, w: 80, label: "Euro Pallet" }
};

const CONTAINER_PRESETS = {
    "20dc": { l: 590, w: 235, h: 239, label: "20' Dry Container" },
    "40dc": { l: 1203, w: 235, h: 239, label: "40' Dry Container" },
    "40hc": { l: 1203, w: 235, h: 270, label: "40' High Cube" }
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
    viewer: {
        yaw: -0.72,
        pitch: 0.52,
        zoom: 1,
        dragging: false,
        pointerId: null,
        lastX: 0,
        lastY: 0
    }
};

const refs = {
    boxL: document.getElementById("box-l"),
    boxW: document.getElementById("box-w"),
    boxH: document.getElementById("box-h"),
    targetQty: document.getElementById("target-qty"),
    palletType: document.getElementById("pal-type"),
    palletL: document.getElementById("pal-l"),
    palletW: document.getElementById("pal-w"),
    palletMaxH: document.getElementById("pal-max-h"),
    palletBase: document.getElementById("pal-base"),
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
    state.viewer.yaw = -0.72;
    state.viewer.pitch = 0.52;
    state.viewer.zoom = 1;
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
    const palletSpace = {
        l: form.pallet.l,
        w: form.pallet.w,
        h: Math.max(1, form.pallet.maxH - form.pallet.base)
    };
    const palletFit = getBestFit(
        { l: carton.l, w: carton.w, h: carton.h },
        palletSpace
    );

    const palletRealH = round((palletFit.nz * carton.h) + form.pallet.base);
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

    const containerFit = pallet.qty > 0
        ? getBestFit(
            { l: pallet.l, w: pallet.w, h: pallet.realH },
            form.container
        )
        : {
            total: 0,
            nx: 0,
            ny: 0,
            nz: 0,
            item: { l: pallet.l, w: pallet.w, h: pallet.realH },
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
    const palletUsableVolume = form.pallet.l * form.pallet.w * Math.max(1, form.pallet.maxH - form.pallet.base);
    const containerVolume = volumeOf(form.container);
    const totalUnits = carton.qty * pallet.qty * container.qty;

    const efficiencies = {
        carton: (carton.qty * unitVolume / cartonVolume) * 100,
        pallet: (pallet.qty * cartonVolume / palletUsableVolume) * 100,
        container: (container.qty * form.pallet.l * form.pallet.w * pallet.realH / containerVolume) * 100,
        total: (totalUnits * unitVolume / containerVolume) * 100
    };

    return {
        form,
        carton,
        pallet,
        container,
        metrics: {
            unitVolume,
            cartonVolume,
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

function applyContainerPreset(key) {
    const preset = CONTAINER_PRESETS[key];
    if (!preset) {
        return;
    }
    refs.containerL.value = preset.l;
    refs.containerW.value = preset.w;
    refs.containerH.value = preset.h;
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
    refs.containerType.value = scenario.containerPreset;
    applyContainerPreset(scenario.containerPreset);

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
            item: { l: results.pallet.orientation.l, w: results.pallet.orientation.w, h: results.carton.h },
            layout: { nx: results.pallet.nx, ny: results.pallet.ny, nz: results.pallet.nz, base: results.pallet.base },
            color: "#ee9b00"
        };
    }

    return {
        title: "Bố trí pallet trong container",
        badge: "Spatial layer - Container",
        quantity: results.container.qty,
        unit: "PALLET / CONT",
        efficiency: results.efficiencies.container,
        note: `${results.container.nx} x ${results.container.ny} x ${results.container.nz} pallet trong container ${refs.containerType.selectedOptions[0].text}.`,
        bounds: { l: results.container.l, w: results.container.w, h: results.container.h },
        item: { l: results.container.orientation.l, w: results.container.orientation.w, h: results.pallet.realH },
        layout: { nx: results.container.nx, ny: results.container.ny, nz: results.container.nz, base: 0 },
        color: "#bb3e03"
    };
}

function renderMetrics(results) {
    const cartonDims = `${numberFormatter.format(results.carton.l)} x ${numberFormatter.format(results.carton.w)} x ${numberFormatter.format(results.carton.h)} cm`;
    const cartonNote = `${results.carton.qty} hộp / thùng, hiệu suất ${formatPercent(results.efficiencies.carton)}${results.carton.overshoot ? `, dư ${results.carton.overshoot} hộp so với mục tiêu.` : "."}`;

    if (refs.suggestedCarton) {
        refs.suggestedCarton.textContent = cartonDims;
    }
    if (refs.cartonQuickSpec) {
        refs.cartonQuickSpec.textContent = cartonNote;
    }
    refs.palletQuickSpec.textContent = `${results.pallet.qty} thùng / pallet, ${results.pallet.nx} x ${results.pallet.ny} x ${results.pallet.nz}, cao thực tế ${formatCm(results.pallet.realH)}.`;
    refs.palletLayerSpec.textContent = `1 layer pallet: ${results.pallet.layerQty} thùng, độ phủ ${formatPercent(results.pallet.layerCoverage)}.`;
    refs.containerQuickSpec.textContent = `${results.container.qty} pallet / container, ${results.container.nx} x ${results.container.ny} x ${results.container.nz}, lọt lòng ${formatDims(results.container)}.`;

    refs.dashEff.textContent = integerFormatter.format(results.pallet.layerQty);
    refs.dashPalletCoverage.textContent = formatPercent(results.pallet.layerCoverage);
    refs.dashCartonSuggest.textContent = cartonDims;
}

function renderBreakdowns(results) {
    refs.cartonBreakdownTitle.textContent = `${results.carton.qty} hộp / thùng`;
    refs.cartonBreakdownBody.textContent = `Carton đề xuất ${formatDims(results.carton)}. Bố trí ${results.carton.nx} x ${results.carton.ny} x ${results.carton.nz} theo chiều đặt ${formatDims(results.carton.orientation)}.`;

    refs.palletBreakdownTitle.textContent = `${results.pallet.qty} thùng / pallet`;
    refs.palletBreakdownBody.textContent = `Pallet ${results.pallet.nx} x ${results.pallet.ny} x ${results.pallet.nz} với chiều cao thực tế ${formatCm(results.pallet.realH)} trên mặt chuẩn ${numberFormatter.format(results.pallet.l)} x ${numberFormatter.format(results.pallet.w)} cm. Mỗi layer chứa ${results.pallet.layerQty} thùng, phủ ${formatPercent(results.pallet.layerCoverage)} mặt pallet.`;

    refs.containerBreakdownTitle.textContent = `${results.container.qty} pallet / cont`;
    refs.containerBreakdownBody.textContent = `Container nhận được ${results.container.nx} x ${results.container.ny} x ${results.container.nz} pallet. Tổng cộng ${integerFormatter.format(results.metrics.totalUnits)} đơn vị sản phẩm trong một chuyến.`;
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
        items.push("Cấu hình hiện tại không thể đặt pallet vào container. Hãy giảm chiều cao pallet hoặc chọn loại container lớn hơn.");
    } else if (results.efficiencies.total < 55) {
        items.push("Hiệu suất tổng vẫn còn dư địa lớn. Tác động mạnh nhất lúc này thường nằm ở việc tối ưu carton trước, vì hiệu ứng sẽ nhân lên ở pallet và container.");
    } else {
        items.push("Hiệu suất tổng đã ở mức tốt cho một mô hình xếp hình học cơ bản. Bước tiếp theo nếu cần là bổ sung thêm ràng buộc tải trọng hoặc chừa khe thao tác thực tế.");
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
            capacity: `${results.container.qty} pallet`,
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
function hexToRgb(hex) {
    const normalized = hex.replace("#", "");
    const value = normalized.length === 3
        ? normalized.split("").map((char) => char + char).join("")
        : normalized;
    return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16)
    };
}

function shade(hex, amount) {
    const rgb = hexToRgb(hex);
    const next = {
        r: clamp(Math.round(amount >= 0 ? rgb.r + (255 - rgb.r) * amount : rgb.r * (1 + amount)), 0, 255),
        g: clamp(Math.round(amount >= 0 ? rgb.g + (255 - rgb.g) * amount : rgb.g * (1 + amount)), 0, 255),
        b: clamp(Math.round(amount >= 0 ? rgb.b + (255 - rgb.b) * amount : rgb.b * (1 + amount)), 0, 255)
    };
    return `rgb(${next.r}, ${next.g}, ${next.b})`;
}

function multiplyColor(hex, factor) {
    const rgb = hexToRgb(hex);
    return `rgb(${clamp(Math.round(rgb.r * factor), 0, 255)}, ${clamp(Math.round(rgb.g * factor), 0, 255)}, ${clamp(Math.round(rgb.b * factor), 0, 255)})`;
}

function rotatePoint(point, yaw, pitch) {
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);

    const xzX = point.x * cosYaw - point.z * sinYaw;
    const xzZ = point.x * sinYaw + point.z * cosYaw;
    const yzY = point.y * cosPitch - xzZ * sinPitch;
    const yzZ = point.y * sinPitch + xzZ * cosPitch;

    return { x: xzX, y: yzY, z: yzZ };
}

function makeBox(x, y, z, w, h, d, color, alpha = 1, stroke = "rgba(15, 23, 42, 0.16)") {
    const vertices = [
        { x, y, z },
        { x: x + w, y, z },
        { x: x + w, y: y + h, z },
        { x, y: y + h, z },
        { x, y, z: z + d },
        { x: x + w, y, z: z + d },
        { x: x + w, y: y + h, z: z + d },
        { x, y: y + h, z: z + d }
    ];

    const faceColors = {
        top: shade(color, 0.24),
        left: shade(color, 0.12),
        right: shade(color, -0.06),
        front: shade(color, 0.06),
        back: shade(color, -0.14),
        bottom: shade(color, -0.2)
    };

    return {
        vertices,
        faces: [
            { indices: [3, 2, 6, 7], fill: faceColors.top, alpha, stroke },
            { indices: [0, 3, 7, 4], fill: faceColors.left, alpha, stroke },
            { indices: [1, 2, 6, 5], fill: faceColors.right, alpha, stroke },
            { indices: [0, 1, 2, 3], fill: faceColors.front, alpha, stroke },
            { indices: [4, 5, 6, 7], fill: faceColors.back, alpha, stroke },
            { indices: [0, 1, 5, 4], fill: faceColors.bottom, alpha, stroke }
        ]
    };
}

function drawPolygon(ctx, points, fill, stroke, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    points.forEach((point, index) => {
        if (index === 0) {
            ctx.moveTo(point.x, point.y);
        } else {
            ctx.lineTo(point.x, point.y);
        }
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}

function drawWireframe(ctx, projected, scale, offsetX, offsetY, stroke) {
    const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, 1.1 * window.devicePixelRatio);
    edges.forEach(([from, to]) => {
        const start = projected[from];
        const end = projected[to];
        ctx.beginPath();
        ctx.moveTo(offsetX + start.x * scale, offsetY - start.y * scale);
        ctx.lineTo(offsetX + end.x * scale, offsetY - end.y * scale);
        ctx.stroke();
    });
    ctx.restore();
}

function stageToObjects(stage) {
    const bounds = stage.bounds;
    const offset = {
        x: -bounds.l / 2,
        y: -bounds.h / 2,
        z: -bounds.w / 2
    };

    const objects = [
        {
            type: "wireframe",
            color: "rgba(41, 65, 75, 0.34)",
            alpha: 1,
            ...makeBox(offset.x, offset.y, offset.z, bounds.l, bounds.h, bounds.w, "#c7d0d7", 0.08, "rgba(41, 65, 75, 0.06)")
        }
    ];

    if (stage.layout.base > 0) {
        objects.push({
            type: "solid",
            color: "#8c6239",
            alpha: 0.96,
            ...makeBox(offset.x, offset.y, offset.z, bounds.l, stage.layout.base, bounds.w, "#8c6239", 0.96, "rgba(62, 39, 12, 0.22)")
        });
    }

    const total = stage.layout.nx * stage.layout.ny * stage.layout.nz;
    const visibleCount = Math.min(total, 260);
    let count = 0;

    for (let layer = 0; layer < stage.layout.nz; layer += 1) {
        for (let row = 0; row < stage.layout.ny; row += 1) {
            for (let col = 0; col < stage.layout.nx; col += 1) {
                if (count >= visibleCount) {
                    break;
                }

                objects.push({
                    type: "solid",
                    color: stage.color,
                    alpha: 0.98,
                    ...makeBox(
                        offset.x + col * stage.item.l,
                        offset.y + stage.layout.base + layer * stage.item.h,
                        offset.z + row * stage.item.w,
                        stage.item.l,
                        stage.item.h,
                        stage.item.w,
                        stage.color,
                        0.98,
                        "rgba(12, 18, 24, 0.18)"
                    )
                });
                count += 1;
            }
        }
    }

    return { objects, visibleCount, total };
}

function projectScene(objects, width, height) {
    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    const transformedObjects = [];
    let maxAbsZ = 1;

    objects.forEach((object) => {
        const transformed = object.vertices.map((vertex) => rotatePoint(vertex, state.viewer.yaw, state.viewer.pitch));
        transformed.forEach((vertex) => {
            maxAbsZ = Math.max(maxAbsZ, Math.abs(vertex.z));
        });
        transformedObjects.push({ object, transformed });
    });

    const cameraDistance = maxAbsZ * (4.2 / state.viewer.zoom) + 120;

    transformedObjects.forEach((entry) => {
        entry.projected = entry.transformed.map((vertex) => {
            const depth = cameraDistance + vertex.z;
            const perspective = cameraDistance / Math.max(1, depth);
            const point = {
                x: vertex.x * perspective,
                y: vertex.y * perspective,
                z: depth
            };

            bounds.minX = Math.min(bounds.minX, point.x);
            bounds.maxX = Math.max(bounds.maxX, point.x);
            bounds.minY = Math.min(bounds.minY, point.y);
            bounds.maxY = Math.max(bounds.maxY, point.y);
            return point;
        });
    });

    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanY = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min((width * 0.56) / spanX, (height * 0.6) / spanY);
    const offsetX = width * 0.5 - ((bounds.minX + bounds.maxX) * scale) / 2;
    const offsetY = height * 0.6 + ((bounds.minY + bounds.maxY) * scale) / 2;

    return { transformedObjects, scale, offsetX, offsetY };
}

function buildFaceQueue(projectedScene) {
    const queue = [];

    projectedScene.transformedObjects.forEach(({ object, transformed, projected }) => {
        if (object.type === "wireframe") {
            queue.push({ type: "wireframe", projected, color: object.color });
            return;
        }

        object.faces.forEach((face) => {
            const points = face.indices.map((index) => projected[index]);
            const depth = face.indices.reduce((sum, index) => sum + transformed[index].z, 0) / face.indices.length;
            queue.push({
                type: "face",
                points,
                fill: face.fill,
                stroke: face.stroke,
                alpha: face.alpha,
                depth
            });
        });
    });

    queue.sort((a, b) => {
        if (a.type === "wireframe" && b.type !== "wireframe") {
            return 1;
        }
        if (a.type !== "wireframe" && b.type === "wireframe") {
            return -1;
        }
        return a.depth - b.depth;
    });

    return queue;
}

function resizeCanvas() {
    const rect = refs.sceneCanvas.getBoundingClientRect();
    const width = Math.max(600, Math.floor(rect.width * window.devicePixelRatio));
    const height = Math.max(420, Math.floor(rect.height * window.devicePixelRatio));

    if (refs.sceneCanvas.width !== width || refs.sceneCanvas.height !== height) {
        refs.sceneCanvas.width = width;
        refs.sceneCanvas.height = height;
    }
}

function drawScene(stage) {
    resizeCanvas();
    const ctx = refs.sceneCanvas.getContext("2d");
    const canvas = refs.sceneCanvas;
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#f9f4eb");
    gradient.addColorStop(1, "#ece2d0");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(68, 56, 37, 0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i += 1) {
        const y = (height * i) / 10;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    const { objects, visibleCount, total } = stageToObjects(stage);
    const projectedScene = projectScene(objects, width, height);
    const queue = buildFaceQueue(projectedScene);

    queue.forEach((entry) => {
        if (entry.type === "wireframe") {
            drawWireframe(ctx, entry.projected, projectedScene.scale, projectedScene.offsetX, projectedScene.offsetY, entry.color);
            return;
        }

        const points = entry.points.map((point) => ({
            x: projectedScene.offsetX + point.x * projectedScene.scale,
            y: projectedScene.offsetY - point.y * projectedScene.scale
        }));
        drawPolygon(ctx, points, entry.fill, entry.stroke, entry.alpha);
    });

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 2 * window.devicePixelRatio;
    ctx.beginPath();
    ctx.moveTo(width * 0.08, height * 0.84);
    ctx.lineTo(width * 0.92, height * 0.84);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(30, 41, 51, 0.72)";
    ctx.font = `${Math.round(width / 40)}px "Segoe UI Variable Text", "Segoe UI", sans-serif`;
    ctx.fillText(stage.title, width * 0.05, height * 0.1);
    ctx.font = `${Math.round(width / 70)}px "Segoe UI Variable Text", "Segoe UI", sans-serif`;
    ctx.fillStyle = "rgba(96, 112, 126, 0.92)";
    ctx.fillText(stage.note, width * 0.05, height * 0.15);

    if (visibleCount < total) {
        ctx.fillStyle = "rgba(96, 112, 126, 0.92)";
        ctx.fillText(`Đang rút gọn hình vẽ còn ${visibleCount} khối để giữ hiệu năng canvas.`, width * 0.05, height * 0.91);
    }
    ctx.restore();
}

function renderStage(results) {
    const stage = stageConfig(results);
    refs.stageTitle.textContent = stage.title;
    refs.viewBadge.textContent = stage.badge;
    refs.visualQty.textContent = integerFormatter.format(stage.quantity);
    refs.visualUnit.textContent = stage.unit;
    refs.layoutNote.textContent = stage.note;

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
        `Container: ${formatDims(results.container)} | ${results.container.qty} pallet`,
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

function startDrag(event) {
    state.viewer.dragging = true;
    state.viewer.pointerId = event.pointerId;
    state.viewer.lastX = event.clientX;
    state.viewer.lastY = event.clientY;
    refs.visualStage.classList.add("dragging");
    refs.sceneCanvas.setPointerCapture(event.pointerId);
}

function dragScene(event) {
    if (!state.viewer.dragging || state.viewer.pointerId !== event.pointerId) {
        return;
    }

    const deltaX = event.clientX - state.viewer.lastX;
    const deltaY = event.clientY - state.viewer.lastY;
    state.viewer.lastX = event.clientX;
    state.viewer.lastY = event.clientY;
    state.viewer.yaw += deltaX * 0.012;
    state.viewer.pitch = clamp(state.viewer.pitch - deltaY * 0.009, -1.2, 1.2);
    render();
}

function endDrag(event) {
    if (state.viewer.pointerId !== null && refs.sceneCanvas.hasPointerCapture(state.viewer.pointerId)) {
        refs.sceneCanvas.releasePointerCapture(state.viewer.pointerId);
    }
    state.viewer.dragging = false;
    state.viewer.pointerId = null;
    refs.visualStage.classList.remove("dragging");
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
        applyContainerPreset(event.target.value);
        update();
    });

    [
        refs.boxL, refs.boxW, refs.boxH, refs.targetQty,
        refs.palletL, refs.palletW, refs.palletMaxH, refs.palletBase,
        refs.containerL, refs.containerW, refs.containerH
    ].forEach((input) => {
        input.addEventListener("input", () => {
            state.activePreset = "";
            document.querySelectorAll(".preset-btn").forEach((button) => button.classList.remove("active"));
            update();
        });
    });

    refs.recalculateBtn.addEventListener("click", update);
    refs.copyReportBtn.addEventListener("click", copyReport);
    refs.sceneCanvas.addEventListener("pointerdown", startDrag);
    refs.sceneCanvas.addEventListener("pointermove", dragScene);
    refs.sceneCanvas.addEventListener("pointerup", endDrag);
    refs.sceneCanvas.addEventListener("pointercancel", endDrag);
    refs.sceneCanvas.addEventListener("pointerleave", (event) => {
        if (state.viewer.dragging) {
            endDrag(event);
        }
    });
    refs.sceneCanvas.addEventListener("wheel", (event) => {
        event.preventDefault();
        const zoomDelta = event.deltaY > 0 ? -0.08 : 0.08;
        state.viewer.zoom = clamp(state.viewer.zoom + zoomDelta, 0.55, 2.4);
        render();
    }, { passive: false });
    refs.sceneCanvas.addEventListener("dblclick", () => {
        resetViewer();
        render();
    });

    window.addEventListener("resize", render);
}

registerEvents();
applyScenario("baseline");
