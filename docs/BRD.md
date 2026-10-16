# SentinelX — Business Requirements Document (BRD)

- **Versi:** 1.0 — 16 Oktober 2026
- **Status:** Draft untuk perencanaan
- **Kategori:** Security Operations / Mini-SIEM
- **Target:** MVP → Enterprise-ready

## 1. Latar belakang bisnis

Perusahaan menjalankan banyak layanan IT (web app, API, database, server, cloud) yang masing-masing menghasilkan log keamanan dalam format berbeda. Ketika aktivitas mencurigakan terjadi, tim IT harus mengumpulkan log dari berbagai sumber, mencari pola, menentukan risiko, dan membuat laporan. Proses ini lambat jika monitoring terpisah dan alert tidak punya konteks.

SentinelX menyediakan satu platform terpusat untuk mengumpulkan log, mendeteksi aktivitas berpotensi berbahaya, menghubungkan kejadian terkait, dan membantu analis investigasi berbasis bukti.

**Masalah bisnis:** keterlambatan mendeteksi dan memahami insiden karena data tersebar, alert duplikat, dan investigasi terlalu manual.

## 2. Business objectives

| ID | Tujuan | Indikator pengukuran |
|----|--------|----------------------|
| BO-01 | Memusatkan log keamanan | Sumber log terdaftar dan status ingest terpantau |
| BO-02 | Mempercepat deteksi | Waktu event diterima → alert dibuat |
| BO-03 | Mempermudah investigasi | Waktu alert dibuat → analis dapat konteks |
| BO-04 | Mengurangi alert duplikat | Rasio alert duplikat teridentifikasi |
| BO-05 | Meningkatkan akuntabilitas | Seluruh tindakan penting di audit log |
| BO-06 | Membantu analisis insiden | Ringkasan AI menyertakan referensi bukti |

> Target numerik ditetapkan setelah baseline dan pengujian awal. Jangan klaim peningkatan sebelum diukur.

## 3. Stakeholder

| Stakeholder | Kebutuhan |
|-------------|-----------|
| SOC Analyst | Lihat alert, triage, investigasi event |
| SOC Lead | Prioritas, status insiden, performa tim |
| IT Operations | Kesehatan sumber data dan log |
| Incident Responder | Jalankan prosedur respons yang disetujui |
| System Administrator | Kelola integrasi, akun, konfigurasi |
| Auditor / Compliance | Telusuri riwayat tindakan dan config |

Untuk MVP satu orang boleh memegang beberapa peran di dev, tetapi pemisahan hak akses tetap ditegakkan di level aplikasi.

## 4. Ruang lingkup bisnis

**In scope (MVP):**
- Log ingestion dan normalisasi
- Rule-based detection
- Pengelompokan dan korelasi event
- Risk scoring dan prioritisasi alert
- AI-assisted summary berbasis bukti
- Workflow investigasi dan simulasi respons
- RBAC dan audit trail

**Out of scope (MVP):**
- Menggantikan seluruh SIEM komersial
- Menjamin semua serangan terdeteksi
- Autonomous containment di server produksi
- Threat intel komersial berbayar
- Dukungan semua format log / semua cloud
- Klaim compliance / sertifikasi formal

## 5. Proses bisnis

1. **Data collection** — server, aplikasi, log simulasi
2. **Normalize & enrich** — format standar, timestamp UTC, sumber, metadata
3. **Detect & correlate** — rules, anomali, event terkait
4. **Prioritize** — risk score dan severity
5. **Investigate** — timeline, bukti, ringkasan AI
6. **Respond & audit** — approval, simulasi aksi, pencatatan

## 6. Business requirements

| ID | Requirement | Prioritas |
|----|-------------|-----------|
| BR-01 | Menerima log dari sumber yang didukung | Must |
| BR-02 | Normalisasi log ke format internal konsisten | Must |
| BR-03 | Deteksi pola mencurigakan via aturan terkonfigurasi | Must |
| BR-04 | Kelompokkan event terkait dalam investigasi | Must |
| BR-05 | Severity dan risk score dengan alasan jelas | Must |
| BR-06 | Timeline dan bukti insiden | Must |
| BR-07 | Ringkasan AI dapat ditelusuri ke event sumber | Must |
| BR-08 | Tindakan respons memerlukan otorisasi | Must |
| BR-09 | Mencatat tindakan pengguna dan hasilnya | Must |
| BR-10 | Kesehatan ingestion dan komponen | Should |
| BR-11 | Ekspor laporan investigasi | Should |
| BR-12 | ML anomaly detection setelah baseline stabil | Could |

## 7. Risiko dan mitigasi

- **False positive** → tuning rule, threshold konfigurabel, ukur precision/recall.
- **False negative** → skenario uji, coverage rule, pengujian terkontrol.
- **AI menyimpulkan keliru** → referensi bukti, penanda ketidakpastian, validasi analis.
- **Kebocoran data** (token/email di log) → redaksi, pembatasan akses, enkripsi, retensi.
- **Respons merusak sistem** → simulasi sebagai default, approval sebelum aksi nyata.

## 8. Indikator keberhasilan MVP

1. Log dari sumber uji dapat diterima dan dicari kembali.
2. Skenario deteksi yang ditentukan menghasilkan hasil sesuai ekspektasi.
3. Alert dapat ditelusuri ke event sumber dan rule pemicu.
4. Analis dapat triage, update status insiden, dan ekspor laporan.
5. Ringkasan AI memiliki referensi bukti dan dapat ditinjau.
6. Respons simulasi butuh otorisasi dan masuk audit trail.
7. Pengujian dapat diulang dengan hasil terdokumentasi.
