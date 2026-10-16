# SentinelX — Product Requirements Document (PRD)

## 1. Product overview

**Vision:** mengubah log mentah menjadi alert yang dapat ditindaklanjuti, investigasi berbasis bukti, dan respons terkontrol — dalam satu platform monitoring keamanan.

- **Pengguna awal:** tim IT internal, security analyst, developer yang mempelajari workflow SOC.
- **Platform:** web app (React+TS) + backend API (Go) + AI service (Python, tahap 6).
- **Prinsip:** AI adalah asisten investigasi, bukan sumber kebenaran tunggal.

## 2. Personas

- **A — Security Analyst:** butuh event timeline, pencarian log, severity, bukti, ringkasan AI. Tujuan: pahami alert cepat.
- **B — SOC Lead:** butuh overview, assignment, SLA, laporan, audit trail. Tujuan: pastikan prioritas ditangani.
- **C — IT Administrator:** butuh konfigurasi source, API key, status ingestion, diagnostik. Tujuan: sumber log tetap terhubung.

## 3. Functional requirements (MVP slice 1)

### Module 1 — Auth & authorization
| ID | Kebutuhan | Acceptance |
|----|-----------|------------|
| FR-001 | Login/logout | User valid bisa masuk/keluar, sesi kedaluwarsa |
| FR-002 | RBAC | Endpoint cek izin di backend, bukan hanya sembunyikan tombol |
| FR-003 | Organization isolation | User org A tidak bisa baca data org B |
| FR-004 | Session security | Token punya expiry + revokasi |
| FR-005 | Audit auth | Login gagal dan auth penting dicatat |

Role awal: `admin, analyst, responder, viewer`.

### Module 2 — Log ingestion
Tiga jalur (MVP penuh): REST API, file upload JSONL, log generator. **Slice 1:** REST API + generator fixture.

Pipeline: validasi → parsing → normalisasi → enrichment → simpan → deteksi.

Aturan:
- Waktu disimpan UTC, ditampilkan sesuai zona pengguna.
- `event_id` unik untuk idempotency.
- Payload invalid → error/dead-letter, bukan dibuang diam-diam.
- Token/password/secret tidak disimpan mentah (redaksi).
- Catat counter diterima/ditolak/gagal.

### Module 3 — Detection engine (slice 1: DET-001)
Mulai dari rule-based. ML ditunda hingga baseline stabil.

| Rule | Kondisi | Hasil |
|------|---------|-------|
| DET-001 | ≥ N `authentication_failed` dari `src_ip` sama dalam window W | Alert brute-force-like |
| DET-002 | Banyak gagal lalu 1 berhasil (akun sama) | Suspicious auth sequence |
| DET-003 | Aktivitas admin di luar baseline simulasi | Policy anomaly |
| DET-004 | Event high-risk berulang singkat | Repeated high-risk |

**Slice 1 mengimplementasikan DET-001** (default: 5 gagal / 5 menit, konfigurabel). Setiap alert menyimpan: rule id+versi, event pemicu, window evaluasi, kondisi terpenuhi, severity+alasan, waktu dibuat.

### Module 4 — Correlation
Kelompokkan berdasar identitas/atribut (IP, username, host/service, jenis event, jarak waktu) dengan batas waktu dan kriteria eksplisit. Catatan: IP sama ≠ serangan sama (NAT/shared). Bukti harus bisa diperiksa.

### Module 5 — Risk scoring
`Severity` (dari rule) ≠ `risk_score` (prioritas hitung). Model awal transparan:

```
R = min(100, 0.4*S + 0.3*C + 0.2*A + 0.1*B)
S=severity 0-100, C=confidence 0-100, A=asset criticality 0-100, B=behavioral deviation 0-100
```

Bobot adalah nilai awal prototipe, bukan probabilitas kompromi. Mapping: 0–24 Informational, 25–49 Low, 50–74 Medium, 75–89 High, 90–100 Critical.

### Module 6 — AI incident investigation (tahap 6, bukan slice 1)
Input tersanitasi; output terstruktur: ringkasan, timeline, bukti, hipotesis alternatif, unknowns, next steps, `event_id` per klaim faktual. Jika bukti kurang → nyatakan ketidakpastian. Larangan: mengarang log, mengubah severity, mengeksekusi perintah dari isi log. Wajib: structured JSON, validasi schema, batasi ukuran input, redaksi, catat model+prompt version, perlakukan log sebagai data tak tepercaya (anti prompt-injection).

### Module 7 — Incident management
Status: `new → triaged → investigating → contained → resolved → closed` + `false_positive` (wajib alasan). `contained` pada simulasi ≠ containment sungguhan. Fitur: buat dari alert, gabung alert, assign, catatan, timeline, validasi transisi, alasan penutupan, ekspor.

### Module 8 — Response simulation
Hanya simulasi di MVP (tiket, tandai IP, notifikasi, rekomendasi disable akun uji, status containment demo). Alur: pilih → validasi izin → preview → approve/reject → eksekusi di simulator → catat pelaksana/approver/hasil/waktu. Dilarang kirim perintah blokir ke firewall / matikan akun produksi.

### Module 9 — Audit & observability
Catat: perubahan rule/config, status insiden, approval, eksekusi simulasi, ekspor, role, akses admin sensitif. Field: aktor, aksi, objek, waktu, hasil, correlation ID. Pertimbangkan append-only.

### Module 10 — Dashboard
Minimal: total event, alert per severity, insiden aktif, top rules, tren alert, kesehatan source, latency ingestion + failures. Setiap angka bisa drill-down ke event/alert. Filter waktu konsisten.

## 4. Non-functional requirements

| ID | Aspek | Target awal (MVP, belum terbukti) |
|----|-------|-----------------------------------|
| NFR-01 | API latency | P95 < 500ms endpoint baca sederhana |
| NFR-02 | Ingestion | 100 event/detik berkelanjutan (uji) |
| NFR-03 | Detection latency | P95 < 10 dtk event → alert (streaming) |
| NFR-04 | Availability | 99,5% layanan inti (setelah metode ukur jelas) |
| NFR-05 | Security | RBAC, validasi input, TLS, secret mgmt |
| NFR-06 | Integrity | Idempotency + dedup |
| NFR-07 | Observability | Log, metrics, trace/correlation ID, healthz |
| NFR-08 | Testability | Unit, integration, e2e, security |
| NFR-09 | Data lifecycle | Retensi, hapus, ekspor terdefinisi |
| NFR-10 | Recovery | Backup, restore, uji pemulihan |

## 5. Testing (ringkas, detail di repo `tests/`)

TC-01 gagal berulang > threshold → alert. TC-02 di bawah threshold → tidak alert. TC-03 gagal→berhasil → korelasi. TC-04 payload invalid → ditolak tercatat. TC-05 duplikat → tidak ganda. TC-06 lintas org → ditolak. TC-07 AI tanpa bukti → nyatakan keterbatasan. TC-08 approve tanpa izin → ditolak. TC-09 AI timeout → gagal tercatat + retry dibatasi. TC-10 OpenSearch down → bisa re-index. TC-11 tutup insiden → tercatat aktor/waktu/alasan. TC-12 prompt injection di log → diperlakukan sebagai data.

Ukur juga: precision/recall, ingestion→alert latency, % gagal, % duplikat, API latency, isolasi tenant, % klaim AI bereferensi valid.

## 6. Definition of Done (MVP checklist di README)
