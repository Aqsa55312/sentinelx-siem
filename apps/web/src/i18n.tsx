import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fmtDateTime as formatDateTime, timeAgo as formatTimeAgo, titleCase } from './lib/format';

export type Lang = 'en' | 'id';
type Vars = Record<string, string | number>;
type Message = string | ((vars: Vars) => string);

function countLabel(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

const en = {
  'app.documentTitle': 'SentinelX — Operations Desk',
  'brand.sub': 'Operations desk',
  'language.label': 'Language',

  'nav.workspace': 'Workspace',
  'nav.main': 'Main navigation',
  'nav.overview': 'Overview',
  'nav.events': 'Event Explorer',
  'nav.alerts': 'Alerts',
  'nav.incidents': 'Incidents',
  'nav.rules': 'Detection Rules',
  'nav.sources': 'Log Sources',
  'nav.signOut': 'Sign out',
  'nav.localStatus': 'local / in-memory',
  'nav.build': 'sentinelx / build 0.4.2',
  'nav.railWorkspace': 'workspace: local',
  'nav.railBuild': 'build 0.4.2',

  'meta.overview.eyebrow': 'Security posture',
  'meta.overview.title': 'Overview',
  'meta.overview.sub': 'Live view of ingestion, detections, and source health across your workspace.',
  'meta.events.eyebrow': 'Telemetry',
  'meta.events.title': 'Event Explorer',
  'meta.events.sub': 'Search normalized events, pivot on indicators, and upload log batches for detection.',
  'meta.alerts.eyebrow': 'Detection',
  'meta.alerts.title': 'Alerts',
  'meta.alerts.sub': 'Every detection carries its rule version, risk reasoning, and the events that triggered it.',
  'meta.incidents.eyebrow': 'Response',
  'meta.incidents.title': 'Incidents',
  'meta.incidents.sub': 'Correlated detections, investigation notes, and an audit-logged status workflow from triage to closure.',
  'meta.rules.eyebrow': 'Detection engineering',
  'meta.rules.title': 'Detection Rules',
  'meta.rules.sub': 'Rule registry with thresholds, windows, and verified positive/negative test cases.',
  'meta.sources.eyebrow': 'Ingestion',
  'meta.sources.title': 'Log Sources',
  'meta.sources.sub': 'Track where telemetry comes from and keep ingestion health visible.',

  'common.refresh': 'Refresh',
  'common.live': 'Live',
  'common.viewAll': 'View all',
  'common.risk': 'risk',
  'common.status': 'status',
  'common.severity': 'severity',
  'common.unassigned': 'Unassigned',
  'common.noSrcIp': 'no src_ip',
  'common.unknownUser': 'unknown user',
  'common.readOnly': 'read-only role',
  'common.export': 'Export',
  'common.previous': 'Previous',
  'common.next': 'Next',
  'common.newestFirst': 'newest first',
  'common.reasonRequired': 'A reason is required for this action.',
  'common.alertCount': ({ count }: Vars) => countLabel(Number(count), 'alert', 'alerts'),
  'common.eventCount': ({ count }: Vars) => countLabel(Number(count), 'event', 'events'),
  'common.incidentCount': ({ count }: Vars) => countLabel(Number(count), 'incident', 'incidents'),
  'common.sourceCount': ({ count }: Vars) => countLabel(Number(count), 'source', 'sources'),
  'common.activeAlertCount': ({ count }: Vars) =>
    `${Number(count)} active alert${Number(count) === 1 ? '' : 's'}`,
  'common.healthySources': ({ healthy, total }: Vars) => `${healthy}/${total} healthy`,

  'status.new': 'New',
  'status.triaged': 'Triaged',
  'status.investigating': 'Investigating',
  'status.contained': 'Contained',
  'status.resolved': 'Resolved',
  'status.closed': 'Closed',
  'status.false_positive': 'False positive',

  'severity.critical': 'Critical',
  'severity.high': 'High',
  'severity.medium': 'Medium',
  'severity.low': 'Low',
  'severity.info': 'Info',

  'risk.info': 'Informational',
  'risk.low': 'Low',
  'risk.medium': 'Medium',
  'risk.high': 'High',
  'risk.critical': 'Critical',
  'risk.score': 'Risk score',
  'risk.scaleLow': '0 · info',
  'risk.scaleMid': '50 · medium',
  'risk.scaleHigh': '100 · critical',

  'role.admin': 'Admin',
  'role.analyst': 'Analyst',
  'role.responder': 'Responder',
  'role.viewer': 'Viewer',

  'eventType.authentication_failed': 'Authentication failed',
  'eventType.authentication_success': 'Authentication success',
  'eventType.authorization_denied': 'Authorization denied',
  'eventType.admin_action': 'Admin action',
  'eventType.web_request': 'Web request',
  'eventType.high_risk_event': 'High-risk event',
  'eventType.generic': 'Generic',

  'login.index': 'SX / 001',
  'login.eyebrow': 'Mini-SIEM / rule-based detection',
  'login.tagline1': 'See the signal.',
  'login.tagline2': 'Trace the evidence.',
  'login.copy':
    'Turn raw security logs into explainable alerts, evidence-backed investigations, and controlled response actions.',
  'login.point1': 'Rule-based detection with per-alert evidence',
  'login.point2': 'Tenant isolation and role-based access control',
  'login.point3': 'Auditable actions — every alert traces to source events',
  'login.localBuild': 'local build · v0.4.2',
  'login.tenantIsolated': 'tenant-isolated',
  'login.consoleAccess': 'Console access',
  'login.title': 'Sign in',
  'login.sub': 'Use a seeded demo account to explore the workspace.',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in…',
  'login.demoAccounts': 'demo accounts',
  'login.hintLabel': 'Password for all demo accounts:',
  'login.hintNote': 'Dev seed only — never reuse in a shared deployment.',

  'overview.kpi.events': 'Total events',
  'overview.kpi.alerts': 'Total alerts',
  'overview.kpi.incidents': 'Active incidents',
  'overview.kpi.sources': 'Log sources',
  'overview.kpi.eventsFoot': 'Normalized and searchable',
  'overview.kpi.alertsFoot': 'Rule detections, all severities',
  'overview.alertVolume': 'Alert volume',
  'overview.alertVolumeSub': 'Detections per day, stacked by severity (last {days} days)',
  'overview.alertVolumeEmpty': 'No detections yet. Upload a scenario from Event Explorer.',
  'overview.severitySplit': 'Severity split',
  'overview.severitySplitSub': 'All stored alerts',
  'overview.riskModel': 'Risk model',
  'overview.riskModelText':
    'R = min(100, 0.4S + 0.3C + 0.2A + 0.1B). Asset criticality A comes from the source registry (default 50). Prototype weights — not a probability of compromise.',
  'overview.recent': 'Recent detections',
  'overview.recentSub': 'Newest first — click to open evidence',
  'overview.noAlerts': 'No alerts yet',
  'overview.noAlertsText': 'Run a simulator fixture to generate detections.',
  'overview.topRules': 'Top detection rules',
  'overview.topRulesSub': 'Alerts produced per rule',
  'overview.noRuleActivity': 'No rule activity',
  'overview.noRuleActivityText': 'Rule hits will appear here.',
  'overview.noSources': 'No sources registered.',
  'overview.incidentQueue': 'Incident queue',
  'overview.incidentQueueSub': 'Correlated cases ordered by last activity',
  'overview.totalCount': '{count} total',
  'overview.noIncidents': 'No active incidents',
  'overview.noIncidentsText':
    'Alerts sharing an IP or username inside 24h are grouped automatically after ingestion.',

  'events.searchTitle': 'Search events',
  'events.searchSub': 'Filter by source IP, event type, account, or time range (UTC input, local display)',
  'events.uploadTitle': 'Upload log file',
  'events.uploadSub': '.jsonl / .json · max 10MB',
  'events.uploading': 'Uploading…',
  'events.uploadResult': ({ file, accepted, rejected, alerts }: Vars) => {
    const count = Number(alerts);
    return `${file}: ${accepted} accepted, ${rejected} rejected, ${count} alert${count === 1 ? '' : 's'} fired`;
  },
  'events.uploadFailed': 'Upload failed: {message}',
  'events.sourceIp': 'Source IP',
  'events.eventType': 'Event type',
  'events.allTypes': 'All types',
  'events.username': 'Username',
  'events.from': 'From',
  'events.to': 'To',
  'events.search': 'Search',
  'events.reset': 'Reset',
  'events.stream': 'Event stream',
  'events.streamSub': '{total} matching events · page {page}/{pages}',
  'events.emptyTitle': 'No events match these filters',
  'events.emptyText': 'Clear the filters or upload a JSONL fixture from the toolbar.',
  'events.timestamp': 'Timestamp',
  'events.user': 'User',
  'events.message': 'Message',
  'events.detail': 'Event detail',
  'events.eventId': 'Event ID',
  'events.source': 'Source',
  'events.timestampLocal': 'Timestamp (local)',
  'events.type': 'Type',
  'events.attributes': 'Attributes',
  'events.showing': 'Showing {from}–{to} of {total}',

  'alerts.detections': 'Detections',
  'alerts.detectionsSub': '{alerts} · click to inspect',
  'alerts.noAlerts': 'No alerts yet',
  'alerts.noAlertsText': 'Upload a scenario from Event Explorer to trigger detection.',
  'alerts.select': 'Select an alert',
  'alerts.selectText': 'The evidence trail, risk reasoning, and rule metadata appear here.',
  'alerts.incident': 'Incident',
  'alerts.triage': 'Triage',
  'alerts.acknowledge': 'Acknowledge',
  'alerts.investigate': 'Investigate',
  'alerts.markResolved': 'Mark resolved',
  'alerts.close': 'Close',
  'alerts.falsePositive': 'False positive',
  'alerts.falsePositivePrompt': 'Why is this alert a false positive? (required, audit-logged)',
  'alerts.closePrompt': 'Reason for closing this alert? (required, audit-logged)',
  'alerts.detectedAt': 'detected {time}',
  'alerts.statusReason': '{status} reason:',
  'alerts.rule': 'Rule',
  'alerts.ruleVersion': 'Rule version',
  'alerts.windowStart': 'Window start',
  'alerts.windowEnd': 'Window end',
  'alerts.evidenceTimeline': 'Evidence timeline · {events}',
  'alerts.viewRelated': 'View related events',
  'alerts.noEvidence': 'No linked evidence events.',

  'incidents.queue': 'Incident queue',
  'incidents.queueSub': '{total} total · {active} active · correlation groups shared indicators',
  'incidents.noIncidents': 'No incidents yet',
  'incidents.noIncidentsText':
    'Alerts sharing an IP or username inside 24h are grouped automatically. Upload a scenario to seed the queue.',
  'incidents.select': 'Select an incident',
  'incidents.selectText':
    'Risk, linked alerts, evidence, investigation notes, and the activity trail appear here.',
  'incidents.updatedAt': 'updated {time}',
  'incidents.autoCorrelated': 'auto-correlated',
  'incidents.status': 'Status',
  'incidents.severity': 'Severity',
  'incidents.assignee': 'Assignee',
  'incidents.linkedAlerts': 'Linked alerts',
  'incidents.closedReason': 'Closure reason',
  'incidents.indicators': 'Indicators',
  'incidents.noIndicators': 'No indicators recorded.',
  'incidents.linkedAlertsCount': 'Linked alerts · {count}',
  'incidents.noAlertsLinked': 'No alerts linked.',
  'incidents.notes': 'Investigation notes',
  'incidents.noNotes': 'No notes yet. Document what you checked and what you ruled out.',
  'incidents.notePlaceholder': 'Add an investigation note — what did you verify, and what did you rule out?',
  'incidents.addNote': 'Add note',
  'incidents.adding': 'Adding…',
  'incidents.activity': 'Activity timeline',
  'incidents.evidence': 'Evidence · {events}',
  'incidents.viewSourceEvents': 'View source events',
  'incidents.updatedNotice': 'Incident updated and audit-logged.',
  'incidents.noteNotice': 'Note added to the incident timeline.',
  'incidents.exportedNotice': 'Markdown report exported.',
  'incidents.prompt.falsePositive': 'Why is this incident a false positive? (required, audit-logged)',
  'incidents.prompt.closure': 'Closure summary (required, audit-logged)',
  'incidents.action.triage': 'Triage',
  'incidents.action.investigate': 'Investigate',
  'incidents.action.contain': 'Contain',
  'incidents.action.resolve': 'Resolve',
  'incidents.action.close': 'Close',
  'incidents.action.reopen': 'Reopen investigation',
  'incidents.action.falsePositive': 'False positive',
  'incidents.timeline.created': 'Incident created',
  'incidents.timeline.alertsLinked': 'Alerts linked',
  'incidents.timeline.statusChanged': 'Status changed',
  'incidents.timeline.assignmentChanged': 'Assignment changed',
  'incidents.timeline.noteAdded': 'Investigation note',
  'incidents.timeline.titleChanged': 'Title updated',
  'incidents.timeline.severityChanged': 'Severity changed',

  'incidents.ai.title': 'AI Investigation',
  'incidents.ai.generate': 'Generate AI summary',
  'incidents.ai.generating': 'Generating…',
  'incidents.ai.summary': 'AI summary',
  'incidents.ai.nextSteps': 'Next steps',
  'incidents.ai.limitations': 'Limitations',
  'incidents.ai.evidence': 'Evidence references',
  'incidents.ai.timeline': 'Timeline',
  'incidents.ai.unknowns': 'Unknowns',
  'incidents.ai.altHypotheses': 'Alternative hypotheses',
  'incidents.ai.confidence': 'Confidence',
  'incidents.ai.unavailable': 'AI service unavailable',
  'incidents.ai.disclaimer': 'AI assistant only — not proof of compromise.',
  'incidents.ai.noIncident': 'Select an incident first.',
  'incidents.ai.model': 'Model',
  'incidents.ai.prompt': 'Prompt version',

  'rules.title': 'Detection rule registry',
  'rules.sub':
    'Read-only in this slice · every rule ships with positive & negative test cases in the API test suite',
  'rules.count': '{count} rules',
  'rules.enabledCount': '{count} enabled',
  'rules.emptyTitle': 'No rules loaded',
  'rules.emptyText': 'The registry is served from the API at /api/v1/rules.',
  'rules.testCases': 'Test cases ({count})',
  'rules.enabled': 'enabled',
  'rules.disabled': 'disabled',

  'sources.title': 'Registered log sources',
  'sources.sub': '{sources} · {healthy} healthy',
  'sources.emptyTitle': 'No sources registered',
  'sources.emptyText': 'Add a source to group incoming events and track ingestion health.',
  'sources.source': 'Source',
  'sources.id': 'ID',
  'sources.type': 'Type',
  'sources.status': 'Status',
  'sources.criticality': 'Criticality',
  'sources.created': 'Created',
  'sources.register': 'Register a source',
  'sources.registerSub': 'Requires analyst or admin role',
  'sources.name': 'Name',
  'sources.namePlaceholder': 'e.g. Auth Gateway (staging)',
  'sources.criticalityLabel': 'Asset criticality ({value}/100)',
  'sources.criticalityHelp':
    'Feeds the asset component of risk scoring. Higher = more business impact when this source is involved.',
  'sources.add': 'Add source',
  'sources.adding': 'Registering…',
  'sources.notes': 'Notes',
  'sources.notesTextA':
    'Sources group events for filtering and health reporting. Criticality is used by the detection engine when it scores asset impact. The demo simulator posts to',
  'sources.notesTextB': '(criticality 70).',
  'sources.registered': 'Source "{name}" registered.',
  'sources.health.healthy': 'healthy',
  'sources.health.degraded': 'degraded',
  'sources.health.offline': 'offline',
  'sources.health.unknown': 'unknown',
} as const;

export type TranslationKey = keyof typeof en;
const id: Record<TranslationKey, Message> = {
  'app.documentTitle': 'SentinelX — Pusat Operasi',
  'brand.sub': 'Pusat operasi',
  'language.label': 'Bahasa',

  'nav.workspace': 'Ruang kerja',
  'nav.main': 'Navigasi utama',
  'nav.overview': 'Ringkasan',
  'nav.events': 'Penjelajah Event',
  'nav.alerts': 'Alert',
  'nav.incidents': 'Insiden',
  'nav.rules': 'Aturan Deteksi',
  'nav.sources': 'Sumber Log',
  'nav.signOut': 'Keluar',
  'nav.localStatus': 'lokal / in-memory',
  'nav.build': 'sentinelx / build 0.4.2',
  'nav.railWorkspace': 'ruang kerja: lokal',
  'nav.railBuild': 'build 0.4.2',

  'meta.overview.eyebrow': 'Postur keamanan',
  'meta.overview.title': 'Ringkasan',
  'meta.overview.sub': 'Tampilan langsung ingesti, deteksi, dan kesehatan sumber di ruang kerja Anda.',
  'meta.events.eyebrow': 'Telemetri',
  'meta.events.title': 'Penjelajah Event',
  'meta.events.sub': 'Cari event ternormalisasi, pivot pada indikator, dan unggah batch log untuk deteksi.',
  'meta.alerts.eyebrow': 'Deteksi',
  'meta.alerts.title': 'Alert',
  'meta.alerts.sub': 'Setiap deteksi membawa versi aturan, alasan risiko, dan event yang memicunya.',
  'meta.incidents.eyebrow': 'Respons',
  'meta.incidents.title': 'Insiden',
  'meta.incidents.sub':
    'Deteksi terkorelasi, catatan investigasi, dan alur status tercatat audit dari triase hingga penutupan.',
  'meta.rules.eyebrow': 'Rekayasa deteksi',
  'meta.rules.title': 'Aturan Deteksi',
  'meta.rules.sub': 'Registri aturan dengan ambang, jendela waktu, dan kasus uji positif/negatif yang terverifikasi.',
  'meta.sources.eyebrow': 'Ingesti',
  'meta.sources.title': 'Sumber Log',
  'meta.sources.sub': 'Lacak asal telemetri dan pantau kesehatan ingesti.',

  'common.refresh': 'Segarkan',
  'common.live': 'Live',
  'common.viewAll': 'Lihat semua',
  'common.risk': 'risiko',
  'common.status': 'status',
  'common.severity': 'tingkat',
  'common.unassigned': 'Belum ditugaskan',
  'common.noSrcIp': 'tanpa src_ip',
  'common.unknownUser': 'pengguna tidak dikenal',
  'common.readOnly': 'peran hanya-baca',
  'common.export': 'Ekspor',
  'common.previous': 'Sebelumnya',
  'common.next': 'Berikutnya',
  'common.newestFirst': 'terbaru dulu',
  'common.reasonRequired': 'Alasan wajib diisi untuk tindakan ini.',
  'common.alertCount': ({ count }) => `${Number(count)} alert`,
  'common.eventCount': ({ count }) => `${Number(count)} event`,
  'common.incidentCount': ({ count }) => `${Number(count)} insiden`,
  'common.sourceCount': ({ count }) => `${Number(count)} sumber`,
  'common.activeAlertCount': ({ count }) => `${Number(count)} alert aktif`,
  'common.healthySources': ({ healthy, total }) => `${healthy}/${total} sehat`,

  'status.new': 'Baru',
  'status.triaged': 'Triase',
  'status.investigating': 'Investigasi',
  'status.contained': 'Terkendali',
  'status.resolved': 'Selesai',
  'status.closed': 'Ditutup',
  'status.false_positive': 'Positif palsu',

  'severity.critical': 'Kritis',
  'severity.high': 'Tinggi',
  'severity.medium': 'Sedang',
  'severity.low': 'Rendah',
  'severity.info': 'Info',

  'risk.info': 'Informatif',
  'risk.low': 'Rendah',
  'risk.medium': 'Sedang',
  'risk.high': 'Tinggi',
  'risk.critical': 'Kritis',
  'risk.score': 'Skor risiko',
  'risk.scaleLow': '0 · info',
  'risk.scaleMid': '50 · sedang',
  'risk.scaleHigh': '100 · kritis',

  'role.admin': 'Admin',
  'role.analyst': 'Analis',
  'role.responder': 'Responder',
  'role.viewer': 'Pengamat',

  'eventType.authentication_failed': 'Autentikasi gagal',
  'eventType.authentication_success': 'Autentikasi berhasil',
  'eventType.authorization_denied': 'Otorisasi ditolak',
  'eventType.admin_action': 'Tindakan admin',
  'eventType.web_request': 'Permintaan web',
  'eventType.high_risk_event': 'Event berisiko tinggi',
  'eventType.generic': 'Umum',

  'login.index': 'SX / 001',
  'login.eyebrow': 'Mini-SIEM / deteksi berbasis aturan',
  'login.tagline1': 'Tangkap sinyalnya.',
  'login.tagline2': 'Telusuri buktinya.',
  'login.copy':
    'Ubah log keamanan mentah menjadi alert yang dapat dijelaskan, investigasi berbasis bukti, dan tindakan respons yang terkendali.',
  'login.point1': 'Deteksi berbasis aturan dengan bukti untuk setiap alert',
  'login.point2': 'Isolasi tenant dan kontrol akses berbasis peran',
  'login.point3': 'Tindakan dapat diaudit — setiap alert terlacak ke event sumber',
  'login.localBuild': 'build lokal · v0.4.2',
  'login.tenantIsolated': 'terisolasi per tenant',
  'login.consoleAccess': 'Akses konsol',
  'login.title': 'Masuk',
  'login.sub': 'Gunakan akun demo untuk menjelajahi ruang kerja.',
  'login.email': 'Email',
  'login.password': 'Kata sandi',
  'login.submit': 'Masuk',
  'login.submitting': 'Memproses…',
  'login.demoAccounts': 'akun demo',
  'login.hintLabel': 'Kata sandi semua akun demo:',
  'login.hintNote': 'Hanya untuk seed pengembangan — jangan dipakai ulang di deployment bersama.',

  'overview.kpi.events': 'Total event',
  'overview.kpi.alerts': 'Total alert',
  'overview.kpi.incidents': 'Insiden aktif',
  'overview.kpi.sources': 'Sumber log',
  'overview.kpi.eventsFoot': 'Ternormalisasi dan bisa dicari',
  'overview.kpi.alertsFoot': 'Deteksi aturan, semua tingkat',
  'overview.alertVolume': 'Volume alert',
  'overview.alertVolumeSub': 'Deteksi per hari, ditumpuk berdasarkan tingkat ({days} hari terakhir)',
  'overview.alertVolumeEmpty': 'Belum ada deteksi. Unggah skenario dari Penjelajah Event.',
  'overview.severitySplit': 'Sebaran tingkat',
  'overview.severitySplitSub': 'Semua alert tersimpan',
  'overview.riskModel': 'Model risiko',
  'overview.riskModelText':
    'R = min(100, 0.4S + 0.3C + 0.2A + 0.1B). Kritikalitas aset A berasal dari registri sumber (default 50). Bobot prototipe — bukan probabilitas kompromi.',
  'overview.recent': 'Deteksi terbaru',
  'overview.recentSub': 'Terbaru dulu — klik untuk membuka bukti',
  'overview.noAlerts': 'Belum ada alert',
  'overview.noAlertsText': 'Jalankan fixture simulator untuk menghasilkan deteksi.',
  'overview.topRules': 'Aturan deteksi teratas',
  'overview.topRulesSub': 'Jumlah alert per aturan',
  'overview.noRuleActivity': 'Belum ada aktivitas aturan',
  'overview.noRuleActivityText': 'Hit aturan akan muncul di sini.',
  'overview.noSources': 'Belum ada sumber terdaftar.',
  'overview.incidentQueue': 'Antrean insiden',
  'overview.incidentQueueSub': 'Kasus terkorelasi diurutkan berdasarkan aktivitas terakhir',
  'overview.totalCount': '{count} total',
  'overview.noIncidents': 'Tidak ada insiden aktif',
  'overview.noIncidentsText':
    'Alert yang berbagi IP atau nama pengguna dalam 24 jam akan dikelompokkan otomatis setelah ingesti.',

  'events.searchTitle': 'Cari event',
  'events.searchSub': 'Filter berdasarkan IP sumber, jenis event, akun, atau rentang waktu (input UTC, tampilan lokal)',
  'events.uploadTitle': 'Unggah file log',
  'events.uploadSub': '.jsonl / .json · maks 10MB',
  'events.uploading': 'Mengunggah…',
  'events.uploadResult': ({ file, accepted, rejected, alerts }) =>
    `${file}: ${accepted} diterima, ${rejected} ditolak, ${alerts} alert dipicu`,
  'events.uploadFailed': 'Unggah gagal: {message}',
  'events.sourceIp': 'IP sumber',
  'events.eventType': 'Jenis event',
  'events.allTypes': 'Semua jenis',
  'events.username': 'Nama pengguna',
  'events.from': 'Dari',
  'events.to': 'Sampai',
  'events.search': 'Cari',
  'events.reset': 'Reset',
  'events.stream': 'Aliran event',
  'events.streamSub': '{total} event cocok · halaman {page}/{pages}',
  'events.emptyTitle': 'Tidak ada event yang cocok',
  'events.emptyText': 'Hapus filter atau unggah fixture JSONL dari toolbar.',
  'events.timestamp': 'Waktu',
  'events.user': 'Pengguna',
  'events.message': 'Pesan',
  'events.detail': 'Detail event',
  'events.eventId': 'ID event',
  'events.source': 'Sumber',
  'events.timestampLocal': 'Waktu (lokal)',
  'events.type': 'Jenis',
  'events.attributes': 'Atribut',
  'events.showing': 'Menampilkan {from}–{to} dari {total}',

  'alerts.detections': 'Deteksi',
  'alerts.detectionsSub': '{alerts} · klik untuk memeriksa',
  'alerts.noAlerts': 'Belum ada alert',
  'alerts.noAlertsText': 'Unggah skenario dari Penjelajah Event untuk memicu deteksi.',
  'alerts.select': 'Pilih alert',
  'alerts.selectText': 'Jejak bukti, alasan risiko, dan metadata aturan muncul di sini.',
  'alerts.incident': 'Insiden',
  'alerts.triage': 'Triase',
  'alerts.acknowledge': 'Akui',
  'alerts.investigate': 'Investigasi',
  'alerts.markResolved': 'Tandai selesai',
  'alerts.close': 'Tutup',
  'alerts.falsePositive': 'Positif palsu',
  'alerts.falsePositivePrompt': 'Mengapa alert ini positif palsu? (wajib, tercatat audit)',
  'alerts.closePrompt': 'Alasan menutup alert ini? (wajib, tercatat audit)',
  'alerts.detectedAt': 'terdeteksi {time}',
  'alerts.statusReason': 'Alasan {status}:',
  'alerts.rule': 'Aturan',
  'alerts.ruleVersion': 'Versi aturan',
  'alerts.windowStart': 'Awal jendela',
  'alerts.windowEnd': 'Akhir jendela',
  'alerts.evidenceTimeline': 'Linimasa bukti · {events}',
  'alerts.viewRelated': 'Lihat event terkait',
  'alerts.noEvidence': 'Tidak ada event bukti tertaut.',

  'incidents.queue': 'Antrean insiden',
  'incidents.queueSub': '{total} total · {active} aktif · korelasi mengelompokkan indikator yang sama',
  'incidents.noIncidents': 'Belum ada insiden',
  'incidents.noIncidentsText':
    'Alert yang berbagi IP atau nama pengguna dalam 24 jam akan dikelompokkan otomatis. Unggah skenario untuk mengisi antrean.',
  'incidents.select': 'Pilih insiden',
  'incidents.selectText': 'Risiko, alert tertaut, bukti, catatan investigasi, dan jejak aktivitas muncul di sini.',
  'incidents.updatedAt': 'diperbarui {time}',
  'incidents.autoCorrelated': 'terkorrelasi otomatis',
  'incidents.status': 'Status',
  'incidents.severity': 'Tingkat',
  'incidents.assignee': 'Penanggung jawab',
  'incidents.linkedAlerts': 'Alert tertaut',
  'incidents.closedReason': 'Alasan penutupan',
  'incidents.indicators': 'Indikator',
  'incidents.noIndicators': 'Tidak ada indikator tercatat.',
  'incidents.linkedAlertsCount': 'Alert tertaut · {count}',
  'incidents.noAlertsLinked': 'Tidak ada alert tertaut.',
  'incidents.notes': 'Catatan investigasi',
  'incidents.noNotes': 'Belum ada catatan. Dokumentasikan apa yang Anda periksa dan singkirkan.',
  'incidents.notePlaceholder': 'Tambah catatan investigasi — apa yang Anda verifikasi, dan apa yang Anda singkirkan?',
  'incidents.addNote': 'Tambah catatan',
  'incidents.adding': 'Menambahkan…',
  'incidents.activity': 'Linimasa aktivitas',
  'incidents.evidence': 'Bukti · {events}',
  'incidents.viewSourceEvents': 'Lihat event sumber',
  'incidents.updatedNotice': 'Insiden diperbarui dan tercatat di audit.',
  'incidents.noteNotice': 'Catatan ditambahkan ke linimasa insiden.',
  'incidents.exportedNotice': 'Laporan Markdown diekspor.',
  'incidents.prompt.falsePositive': 'Mengapa insiden ini positif palsu? (wajib, tercatat audit)',
  'incidents.prompt.closure': 'Ringkasan penutupan (wajib, tercatat audit)',
  'incidents.action.triage': 'Triase',
  'incidents.action.investigate': 'Investigasi',
  'incidents.action.contain': 'Kendalikan',
  'incidents.action.resolve': 'Selesaikan',
  'incidents.action.close': 'Tutup',
  'incidents.action.reopen': 'Buka kembali investigasi',
  'incidents.action.falsePositive': 'Positif palsu',
  'incidents.timeline.created': 'Insiden dibuat',
  'incidents.timeline.alertsLinked': 'Alert ditautkan',
  'incidents.timeline.statusChanged': 'Status diubah',
  'incidents.timeline.assignmentChanged': 'Penugasan diubah',
  'incidents.timeline.noteAdded': 'Catatan investigasi',
  'incidents.timeline.titleChanged': 'Judul diperbarui',
  'incidents.timeline.severityChanged': 'Tingkat diubah',

  'incidents.ai.title': 'Investigasi AI',
  'incidents.ai.generate': 'Hasilkan ringkasan AI',
  'incidents.ai.generating': 'Mengasilkan…',
  'incidents.ai.summary': 'Ringkasan AI',
  'incidents.ai.nextSteps': 'Langkah selanjutnya',
  'incidents.ai.limitations': 'Keterbatasan',
  'incidents.ai.evidence': 'Referensi bukti',
  'incidents.ai.timeline': 'Timeline',
  'incidents.ai.unknowns': 'Tidak diketahui',
  'incidents.ai.altHypotheses': 'Hipotesa alternatif',
  'incidents.ai.confidence': 'Tingkat kepercayaan',
  'incidents.ai.unavailable': 'Layanan AI tidak tersedia',
  'incidents.ai.disclaimer': 'Asisten AI saja — bukan bukti kompromi.',
  'incidents.ai.noIncident': 'Pilih insiden terlebih dahulu.',
  'incidents.ai.model': 'Model',
  'incidents.ai.prompt': 'Versi prompt',

  'rules.title': 'Registri aturan deteksi',
  'rules.sub':
    'Hanya-baca pada tahap ini · setiap aturan dilengkapi kasus uji positif & negatif di test suite API',
  'rules.count': '{count} aturan',
  'rules.enabledCount': '{count} aktif',
  'rules.emptyTitle': 'Tidak ada aturan dimuat',
  'rules.emptyText': 'Registri disediakan oleh API di /api/v1/rules.',
  'rules.testCases': 'Kasus uji ({count})',
  'rules.enabled': 'aktif',
  'rules.disabled': 'nonaktif',

  'sources.title': 'Sumber log terdaftar',
  'sources.sub': '{sources} · {healthy} sehat',
  'sources.emptyTitle': 'Belum ada sumber terdaftar',
  'sources.emptyText': 'Tambahkan sumber untuk mengelompokkan event masuk dan memantau kesehatan ingesti.',
  'sources.source': 'Sumber',
  'sources.id': 'ID',
  'sources.type': 'Jenis',
  'sources.status': 'Status',
  'sources.criticality': 'Kritikalitas',
  'sources.created': 'Dibuat',
  'sources.register': 'Daftarkan sumber',
  'sources.registerSub': 'Membutuhkan peran analis atau admin',
  'sources.name': 'Nama',
  'sources.namePlaceholder': 'mis. Gateway Autentikasi (staging)',
  'sources.criticalityLabel': 'Kritikalitas aset ({value}/100)',
  'sources.criticalityHelp':
    'Menjadi komponen aset dalam skor risiko. Semakin tinggi = semakin besar dampak bisnis saat sumber ini terlibat.',
  'sources.add': 'Tambah sumber',
  'sources.adding': 'Mendaftarkan…',
  'sources.notes': 'Catatan',
  'sources.notesTextA':
    'Sumber mengelompokkan event untuk filter dan pelaporan kesehatan. Kritikalitas dipakai mesin deteksi saat menghitung dampak aset. Simulator demo mengirim ke',
  'sources.notesTextB': '(kritikalitas 70).',
  'sources.registered': 'Sumber "{name}" terdaftar.',
  'sources.health.healthy': 'sehat',
  'sources.health.degraded': 'menurun',
  'sources.health.offline': 'offline',
  'sources.health.unknown': 'tidak diketahui',
};

const dictionaries: Record<Lang, Record<TranslationKey, Message>> = { en, id };

const STATUS_KEYS: Record<string, TranslationKey> = {
  new: 'status.new',
  triaged: 'status.triaged',
  investigating: 'status.investigating',
  contained: 'status.contained',
  resolved: 'status.resolved',
  closed: 'status.closed',
  false_positive: 'status.false_positive',
};

const SEVERITY_KEYS: Record<string, TranslationKey> = {
  critical: 'severity.critical',
  high: 'severity.high',
  medium: 'severity.medium',
  low: 'severity.low',
  info: 'severity.info',
};

const RISK_KEYS: Record<string, TranslationKey> = {
  info: 'risk.info',
  low: 'risk.low',
  medium: 'risk.medium',
  high: 'risk.high',
  critical: 'risk.critical',
};

const ROLE_KEYS: Record<string, TranslationKey> = {
  admin: 'role.admin',
  analyst: 'role.analyst',
  responder: 'role.responder',
  viewer: 'role.viewer',
};

const EVENT_TYPE_KEYS: Record<string, TranslationKey> = {
  authentication_failed: 'eventType.authentication_failed',
  authentication_success: 'eventType.authentication_success',
  authorization_denied: 'eventType.authorization_denied',
  admin_action: 'eventType.admin_action',
  web_request: 'eventType.web_request',
  high_risk_event: 'eventType.high_risk_event',
  generic: 'eventType.generic',
};

const SOURCE_STATUS_KEYS: Record<string, TranslationKey> = {
  healthy: 'sources.health.healthy',
  degraded: 'sources.health.degraded',
  offline: 'sources.health.offline',
  unknown: 'sources.health.unknown',
};

function detectLang(): Lang {
  const saved = localStorage.getItem('sx_lang');
  if (saved === 'en' || saved === 'id') return saved;
  return navigator.language.toLowerCase().startsWith('id') ? 'id' : 'en';
}

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  locale: string;
  t: (key: TranslationKey, vars?: Vars) => string;
  statusLabel: (status: string) => string;
  severityLabel: (severity: string) => string;
  riskLabel: (tone: string) => string;
  roleLabel: (role: string) => string;
  sourceStatusLabel: (status: string) => string;
  eventTypeLabel: (type: string) => string;
  fmtDateTime: (iso?: string) => string;
  timeAgo: (iso?: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);
  const locale = lang === 'id' ? 'id-ID' : 'en-US';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = dictionaries[lang]['app.documentTitle'] as string;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem('sx_lang', next);
    setLangState(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Vars) => {
      const message = dictionaries[lang][key];
      if (typeof message === 'function') return message(vars ?? {});
      return message.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? `{${name}}`));
    },
    [lang]
  );

  const value = useMemo<I18nValue>(() => {
    const label = (mapping: Record<string, TranslationKey>, raw: string) => {
      const key = mapping[raw];
      return key ? t(key) : titleCase(raw);
    };

    return {
      lang,
      setLang,
      locale,
      t,
      statusLabel: (status) => label(STATUS_KEYS, status),
      severityLabel: (severity) => label(SEVERITY_KEYS, severity),
      riskLabel: (tone) => label(RISK_KEYS, tone),
      roleLabel: (role) => label(ROLE_KEYS, role),
      sourceStatusLabel: (status) => label(SOURCE_STATUS_KEYS, status),
      eventTypeLabel: (type) => label(EVENT_TYPE_KEYS, type),
      fmtDateTime: (iso) => formatDateTime(iso, locale),
      timeAgo: (iso) => formatTimeAgo(iso, locale),
    };
  }, [lang, locale, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
