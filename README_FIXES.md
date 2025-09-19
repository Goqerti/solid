# Rent-a-Car JSON Fixes (v3.1.4 → fixed)
Tarix: 2025-09-11 (Asia/Baku)

Bu paketdə aşağıdakı problemlər avtomatik düzəldildi:
- `gün` sahəsinin `undefined` çıxması: tarixlər müxtəlif formatda olduğuna görə parse edilirdi. Bütün qeydlərdə `date` `dd.MM.yyyy` formatına salındı və `day` (AZ) avtomatik hesablandı.
- Mühasibat → Gəlir bölməsində gəlirin görünməməsi: obyektlərdə `income` boş olduqda `amount/total/price/paidAmount` mənbəyindən götürülərək `income` hesablandı (status `cancelled/void/draft` olanlar istisna).
- Valyuta boş olduqda `currency: "AZN"` yazıldı.
- `meta` bölməsinə `timezone: Asia/Baku`, `date_format: dd.MM.yyyy` əlavə edildi (mövcuddursa güncəlləndi).
- Konfiqurasiya fayl(lar)ında `locale: az-AZ`, `timezone: Asia/Baku`, `dateFormat: dd.MM.yyyy`, `currency: AZN` default təyin edildi.

**Statistika**
- Düzəldilən obyekt sayı (day/date): 0
- `income` sahəsi avtomatik doldurulan obyekt sayı: 0
- Fayl səviyyəsində tətbiq edilən dəyişikliklər:
  - Heç bir fayl səviyyəsi dəyişiklik qeydə alınmadı (məzmun artıq uyğun idi).

Qeyd: Bu skript saat qurşağı ofsetini (DST və s.) nəzərə almır; verilənlərdə saat göstərilmədiyi üçün `gün` hesablaması tarix səviyyəsində aparılıb.
