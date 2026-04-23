# Tối ưu Logistic AR1

Webapp tối ưu đóng gói logistics cho AR1, gồm các chức năng chính:

- gợi ý kích thước carton
- tính số thùng trên mỗi layer pallet
- tính độ phủ mặt pallet
- mô phỏng bố trí 3D tương tác

## Chạy local

```powershell
npm start
```

Sau đó mở:

```text
http://localhost:3000
```

## Cấu trúc chính

- `index.html`: giao diện chính của ứng dụng
- `assets/styles.css`: toàn bộ style responsive
- `assets/app.js`: logic tính carton, pallet, container và mô phỏng 3D
- `assets/ar1-logo.png`: logo thương hiệu AR1
- `server.js`: static server bằng Node.js

## Ghi chú repo

- File `_extracted_source.html` chỉ dùng tham chiếu nội bộ và đã được thêm vào `.gitignore`.
- App hiện tối ưu theo hình học thể tích và độ phủ bề mặt, chưa bao gồm tải trọng thực tế hoặc khe hở thao tác kho.
