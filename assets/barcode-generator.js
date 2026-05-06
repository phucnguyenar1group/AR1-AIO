(function initBarcodeGeneratorModule() {
  if (window.__BARCODE_GENERATOR_INIT__) return;
  window.__BARCODE_GENERATOR_INIT__ = true;

  const refs = {
    addForm: document.getElementById("bgAddForm"),
    newItemId: document.getElementById("bgNewItemId"),
    itemError: document.getElementById("bgItemError"),
    prefix: document.getElementById("bgPrefix"),
    cartonPrefix: document.getElementById("bgCartonPrefix"),
    search: document.getElementById("bgSearch"),
    cards: document.getElementById("bgCards"),
    emptyState: document.getElementById("bgEmptyState"),
    previewModal: document.getElementById("bgPreviewModal"),
    previewImage: document.getElementById("bgPreviewImage"),
    previewTitle: document.getElementById("bgPreviewTitle"),
    previewCloseBtn: document.getElementById("bgPreviewCloseBtn")
  };

  if (!refs.addForm || !refs.cards) return;

  if (!document.getElementById("bg-module-style")) {
    const style = document.createElement("style");
    style.id = "bg-module-style";
    style.textContent = `
      .bg-action-btn {
        border: 0 !important;
        box-shadow: none !important;
        background: #e0e7ff;
        color: #3730a3;
        transition: background-color .15s ease, color .15s ease;
      }
      .bg-action-btn:hover {
        background: #c7d2fe;
        color: #312e81;
      }
      .bg-delete-btn {
        border: 0 !important;
        box-shadow: none !important;
        background: #e2e8f0;
        color: #334155;
        transition: background-color .15s ease, color .15s ease;
      }
      .bg-delete-btn:hover {
        background: #fee2e2;
        color: #b91c1c;
      }
    `;
    document.head.appendChild(style);
  }

  const COPY_ICON_SVG = '<i class="far fa-copy text-sm"></i>';
  const CHECK_ICON_SVG = '<i class="fas fa-check text-sm"></i>';

  const state = {
    items: [{ id: "71432" }, { id: "73164" }]
  };

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getBarcodeUrl(text, type) {
    const bcid = type === "label" ? "upca" : "itf14";
    const params = type === "label"
      ? "&includetext&scale=10&height=15&textsize=12&backgroundcolor=ffffff&paddingwidth=2&paddingheight=2"
      : "&includetext&scale=10&rotate=N";
    return "https://bwipjs-api.metafloor.com/?bcid=" + bcid + "&text=" + encodeURIComponent(text) + params;
  }

  function computeModulo10CheckDigit(baseDigits) {
    const raw = String(baseDigits || "").replace(/\D/g, "");
    let sum = 0;
    let weight3 = true;
    for (let i = raw.length - 1; i >= 0; i -= 1) {
      const d = Number(raw[i]);
      sum += weight3 ? d * 3 : d;
      weight3 = !weight3;
    }
    return String((10 - (sum % 10)) % 10);
  }

  function generateCodes(id) {
    const itemId = String(id || "").replace(/\D/g, "").slice(0, 5);
    const labelPrefix = String(refs.prefix.value || "").trim();
    const cartonPrefix = String(refs.cartonPrefix.value || "").trim();

    const labelBase = labelPrefix + itemId;
    const labelCode = labelBase + computeModulo10CheckDigit(labelBase);

    const cartonBase = cartonPrefix + labelBase;
    const cartonCode = cartonBase + computeModulo10CheckDigit(cartonBase);

    return { labelCode, cartonCode };
  }

  async function downloadBarcode(url, filename) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename + ".png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error(error);
    }
  }

  function openPreview(src, title) {
    refs.previewImage.src = src || "";
    refs.previewTitle.textContent = title || "Xem trước barcode";
    refs.previewModal.hidden = false;
  }

  function closePreview() {
    refs.previewModal.hidden = true;
    refs.previewImage.src = "";
  }

  function render() {
    const q = String(refs.search.value || "").trim().toLowerCase();
    const filtered = state.items.filter((it) => {
      if (!q) return true;
      return it.id.toLowerCase().includes(q) || it.labelCode.includes(q) || it.cartonCode.includes(q);
    });

    refs.emptyState.hidden = filtered.length !== 0;
    refs.cards.innerHTML = filtered.map((item) => {
      const labelCode = escapeHtml(item.labelCode);
      const cartonCode = escapeHtml(item.cartonCode);
      const itemId = escapeHtml(item.id);
      const labelUrl = getBarcodeUrl(item.labelCode, "label");
      const cartonUrl = getBarcodeUrl(item.cartonCode, "carton");
      return (
        '<article class="file-item group bg-white rounded-[1.25rem] p-4 shadow-sm border border-slate-100 hover:border-blue-200 transition-all relative">' +
        '<div class="flex justify-between items-center mb-3">' +
        '<div><span class="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded mr-2">ITEM</span><span class="font-mono font-bold text-lg">' + itemId + "</span></div>" +
        '<div class="flex items-center gap-2">' +
        '<button data-dl-both="' + itemId + '" class="mini-btn bg-action-btn" type="button">Tải cả 2</button>' +
        '<button data-remove-id="' + itemId + '" class="mini-btn bg-delete-btn" type="button">Xóa</button>' +
        "</div></div>" +
        '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;">' +
        '<div class="rounded-2xl p-2 bg-white">' +
        '<div class="flex items-center justify-between gap-3 mb-2">' +
        '<p class="text-[11px] font-bold text-slate-400 uppercase">barcode nhãn (UPC-A)</p>' +
        '<div class="flex items-center gap-2 min-w-0">' +
        '<p class="text-xs font-mono text-slate-600 truncate" title="' + labelCode + '">' + labelCode + '</p>' +
        '<button data-copy-text="' + labelCode + '" class="text-slate-500 hover:text-indigo-600 inline-flex items-center justify-center" style="border:0 !important; background:transparent !important; box-shadow:none !important; padding:0.125rem 0.25rem;" title="Copy chuỗi barcode" aria-label="Copy chuỗi barcode">' + COPY_ICON_SVG + "</button>" +
        "</div></div>" +
        '<div class="bg-white p-2 rounded mb-3 w-full h-36 flex items-center justify-center">' +
        '<img src="' + labelUrl + '" alt="barcode nhãn" class="max-h-full cursor-zoom-in" data-preview-src="' + labelUrl + '" data-preview-title="Barcode nhãn - Item ' + itemId + '">' +
        "</div>" +
        '<button data-dl-label="' + itemId + '" class="w-full py-2 bg-slate-100 text-slate-600 rounded-full text-sm hover:bg-slate-200" style="border:0 !important; box-shadow:none !important;" type="button">Tải barcode nhãn</button>' +
        "</div>" +
        '<div class="rounded-2xl p-2 bg-white">' +
        '<div class="flex items-center justify-between gap-3 mb-2">' +
        '<p class="text-[11px] font-bold text-slate-400 uppercase">Barcode thùng (ITF-14)</p>' +
        '<div class="flex items-center gap-2 min-w-0">' +
        '<p class="text-xs font-mono text-slate-600 truncate" title="' + cartonCode + '">' + cartonCode + '</p>' +
        '<button data-copy-text="' + cartonCode + '" class="text-slate-500 hover:text-indigo-600 inline-flex items-center justify-center" style="border:0 !important; background:transparent !important; box-shadow:none !important; padding:0.125rem 0.25rem;" title="Copy chuỗi barcode" aria-label="Copy chuỗi barcode">' + COPY_ICON_SVG + "</button>" +
        "</div></div>" +
        '<div class="bg-white p-2 rounded mb-3 w-full h-36 flex items-center justify-center">' +
        '<img src="' + cartonUrl + '" alt="barcode thùng" class="max-h-full cursor-zoom-in" data-preview-src="' + cartonUrl + '" data-preview-title="Barcode thùng - Item ' + itemId + '">' +
        "</div>" +
        '<button data-dl-carton="' + itemId + '" class="w-full py-2 bg-slate-100 text-slate-600 rounded-full text-sm hover:bg-slate-200" style="border:0 !important; box-shadow:none !important;" type="button">Tải barcode thùng</button>' +
        "</div>" +
        "</div></article>"
      );
    }).join("");
  }

  function refreshItemCodes() {
    state.items = state.items.map((it) => {
      const next = generateCodes(it.id);
      return { id: it.id, labelCode: next.labelCode, cartonCode: next.cartonCode };
    });
  }

  refs.addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const id = String(refs.newItemId.value || "").trim().replace(/\D/g, "").slice(0, 5);
    refs.newItemId.value = id;
    if (id.length !== 5) {
      refs.itemError.textContent = "Item phải đúng 5 chữ số.";
      refs.itemError.hidden = false;
      return;
    }
    refs.itemError.hidden = true;
    const next = generateCodes(id);
    state.items.unshift({ id, labelCode: next.labelCode, cartonCode: next.cartonCode });
    refs.newItemId.value = "";
    render();
  });

  refs.newItemId.addEventListener("input", () => {
    const raw = refs.newItemId.value;
    const hasNonDigit = /\D/.test(raw);
    const digitsOnly = raw.replace(/\D/g, "");
    const overLimit = digitsOnly.length > 5;

    if (hasNonDigit) {
      refs.itemError.textContent = "Chỉ được nhập số.";
      refs.itemError.hidden = false;
    } else if (overLimit) {
      refs.itemError.textContent = "Chỉ được tối đa 5 chữ số.";
      refs.itemError.hidden = false;
    } else {
      refs.itemError.hidden = true;
    }
    refs.newItemId.value = digitsOnly.slice(0, 5);
  });

  refs.prefix.addEventListener("change", () => {
    refreshItemCodes();
    render();
  });

  refs.search.addEventListener("input", render);

  refs.cards.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const copyBtn = target.closest("[data-copy-text]");
    if (copyBtn instanceof HTMLElement) {
      const text = copyBtn.getAttribute("data-copy-text") || "";
      navigator.clipboard.writeText(text).then(() => {
        const original = copyBtn.innerHTML;
        copyBtn.innerHTML = CHECK_ICON_SVG;
        setTimeout(() => {
          copyBtn.innerHTML = original;
        }, 900);
      }).catch(() => {});
      return;
    }

    const previewNode = target.closest("[data-preview-src]");
    if (previewNode instanceof HTMLElement) {
      openPreview(previewNode.getAttribute("data-preview-src"), previewNode.getAttribute("data-preview-title"));
      return;
    }

    const removeId = target.getAttribute("data-remove-id");
    if (removeId) {
      state.items = state.items.filter((it) => it.id !== removeId);
      render();
      return;
    }

    const dlLabel = target.getAttribute("data-dl-label");
    if (dlLabel) {
      const it = state.items.find((x) => x.id === dlLabel);
      if (it) downloadBarcode(getBarcodeUrl(it.labelCode, "label"), "label_" + it.id);
      return;
    }

    const dlCarton = target.getAttribute("data-dl-carton");
    if (dlCarton) {
      const it = state.items.find((x) => x.id === dlCarton);
      if (it) downloadBarcode(getBarcodeUrl(it.cartonCode, "carton"), "carton_" + it.id);
      return;
    }

    const dlBoth = target.getAttribute("data-dl-both");
    if (dlBoth) {
      const it = state.items.find((x) => x.id === dlBoth);
      if (it) {
        downloadBarcode(getBarcodeUrl(it.labelCode, "label"), "label_" + it.id);
        setTimeout(() => {
          downloadBarcode(getBarcodeUrl(it.cartonCode, "carton"), "carton_" + it.id);
        }, 180);
      }
    }
  });

  refs.previewCloseBtn.addEventListener("click", closePreview);
  refs.previewModal.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("[data-bg-close-modal]")) closePreview();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !refs.previewModal.hidden) {
      closePreview();
    }
  });

  refreshItemCodes();
  render();
})();
