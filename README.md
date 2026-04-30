# AR1 Internal Tools (Unified Web)

Du an nay da duoc gom tu 2 web rieng thanh 1 web dung chung shell:

- Module 1: Logistics Optimizer
- Module 2: PDF Splitter

Muc tieu la de mo rong them module moi ma khong pha vo cac module cu.

## Chay local

```powershell
cd "D:\AR1 AIO\logistics"
npm run start
```

Mo trinh duyet:

```text
http://localhost:3000
```

## Kien truc hien tai

- `index.html`
  - Chua app shell dung chung (sidebar + viewport module).
  - Moi item sidebar khai bao metadata module qua data-attribute:
    - `data-module-id`
    - `data-module-script`
    - `data-module-script-type`
  - View cua module map bang `data-module-view`.

- `assets/shell.js`
  - Quan ly chuyen module trong sidebar.
  - Lazy-load script cua module khi mo lan dau.
  - Dam bao moi module chi load 1 lan.

- `assets/app.js`
  - Logic rieng cua Logistics (carton -> pallet -> container + canvas 3D).

- `assets/pdf-splitter.js`
  - Logic rieng cua PDF Splitter (OCR/classify/split/download).

- `assets/styles.src.css`
  - File nguon build Tailwind CLI.

- `assets/styles.custom.css`
  - CSS tuy chinh hien tai cua du an.

- `assets/styles.css`
  - File output sau khi build Tailwind.

## Luong CSS (Tailwind CLI)

```powershell
npm run build:css
npm run watch:css
```

`npm run start` da tu dong build CSS truoc khi chay server.

## Cach them module moi (goi y)

1. Them 1 button trong sidebar voi `data-module-id`, `data-module-script`, `data-view-target`.
2. Them 1 section view co `data-module-view` trung voi `data-module-id`.
3. Tao file script module moi trong `assets/`.
4. Khong can sua `shell.js` neu van theo dung data-attribute.

## Luu y

- `node_modules/` va log tam da duoc ignore qua `.gitignore`.
- `_extracted_source.html` chi de tham chieu noi bo.
