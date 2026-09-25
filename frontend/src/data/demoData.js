export const fse = { name: 'Aarav Sharma', first: 'Aarav', role: 'Field Sales Executive' }

export const kpis = [
  { k: 'Assigned Visits', v: 24, d: '+4 today', up: true },
  { k: 'Completed', v: 17, d: '71% coverage', up: true },
  { k: 'Priority Merchants', v: 6, d: '2 critical', up: false },
  { k: 'Verified Visits', v: 15, d: '88% evidence confidence', up: true },
]

export const merchants = [
  { id: 'm1', name: 'Ramesh General Store', location: 'Dadar, Mumbai', pri: 'HIGH', km: 1.2, qr: 38, trend: -12, comp: 'HIGH', competitor: 'PhonePe', last: '2 days ago', action: 'Reposition Paytm QR', reasons: ['QR visibility poor', 'PhonePe dominance high', 'Transactions ↓12%'], score: 92, soundbox: 82 },
  { id: 'm2', name: 'Sharma Mart', location: 'Matunga, Mumbai', pri: 'HIGH', km: 2.4, qr: 44, trend: -8, comp: 'MEDIUM', competitor: 'PhonePe', last: 'Yesterday', action: 'Clear QR obstruction', reasons: ['QR placement obstructed', 'Transaction decline', 'Vision confidence 54%'], score: 84, soundbox: 76 },
  { id: 'm3', name: 'Patel Foods', location: 'Prabhadevi, Mumbai', pri: 'MEDIUM', km: 0.8, qr: 61, trend: -3, comp: 'MEDIUM', competitor: 'Google Pay', last: '3 days ago', action: 'Merchant guidance', reasons: ['Audit due', 'QR visibility moderate', 'Follow-up required'], score: 68, soundbox: 71 },
  { id: 'm4', name: 'Kumar Stationery', location: 'Dadar West, Mumbai', pri: 'LOW', km: 3.1, qr: 79, trend: 4, comp: 'LOW', competitor: 'None detected', last: '5 days ago', action: 'Routine check-in', reasons: ['Healthy QR visibility', 'Positive transaction trend'], score: 42, soundbox: 88 },
  { id: 'm5', name: 'Desai Chemists', location: 'Shivaji Park, Mumbai', pri: 'MEDIUM', km: 1.9, qr: 57, trend: -5, comp: 'HIGH', competitor: 'PhonePe', last: '4 days ago', action: 'Reposition QR', reasons: ['Competitor visibility high', 'Transaction trend declining'], score: 73, soundbox: 79 },
]

export const mapPoints = [[18,62,'done'],[26,40,'done'],[31,72,'done'],[38,30,'done'],[44,58,'done'],[50,44,'done'],[55,70,'done'],[62,34,'done'],[68,52,'done'],[74,26,'done'],[80,64,'done'],[85,40,'done'],[35,50,'high'],[58,24,'high'],[46,78,'pending'],[72,72,'pending'],[22,24,'pending']]

export const activity = [
  { t: '09:42', title: 'Visit verified', sub: 'Ramesh General Store', s: 'ok' },
  { t: '10:18', title: 'AI audit completed', sub: 'Sharma Mart', s: 'ok' },
  { t: '11:04', title: 'Intervention completed', sub: 'Patel Foods', s: 'ok' },
  { t: '12:16', title: 'Visit pending', sub: 'Kumar Stationery', s: 'wait' },
]

export const alerts = [
  { sev: 'HIGH', title: 'PhonePe dominance detected', m: 'Ramesh General Store', at: '09:44' },
  { sev: 'MEDIUM', title: 'QR placement obstructed', m: 'Sharma Mart', at: '10:20' },
  { sev: 'LOW', title: 'Merchant audit due', m: 'Patel Foods', at: '11:30' },
]

export const health = { labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], series: [
  { name: 'QR visibility', c: '#b7ff3c', d: [52,50,47,44,42,40,38] },
  { name: 'Transaction trend', c: '#3ddc97', d: [70,68,71,64,60,58,55] },
  { name: 'Competitor dominance', c: '#ff6b5f', d: [30,34,38,45,52,58,66] },
] }

export const mini = [
  { k: 'Distance Today', v: '18.4 km' },
  { k: 'Successful Interventions', v: '11' },
  { k: 'Suspicious Visits', v: '1', warn: true },
  { k: 'Observed Transaction Change', v: '+14%' },
]

export const steps = [
  ['SEE','Vision AI understands the merchant counter.'],
  ['VERIFY','GPS, timestamp and evidence validate the visit.'],
  ['DECIDE','SightPay determines the recommended action.'],
  ['ACT','Sarvam + n8n execute the intervention.'],
  ['MEASURE','Transaction behavior is tracked after the visit.'],
  ['LEARN','Merchant context becomes persistent memory.'],
]

export const stack = [
  ['Vision AI','Sees merchant conditions.','Scan'],
  ['GPS + Evidence','Proves the visit.','ShieldCheck'],
  ['Sarvam','Communicates locally.','Languages'],
  ['n8n','Turns decisions into actions.','Workflow'],
  ['Cognee','Remembers merchant context.','Brain'],
  ['Transaction Engine','Measures observed change.','TrendingUp'],
]

export const strip = [
  ['SEE','AI-powered merchant counter analysis'],
  ['VERIFY','GPS + evidence + fraud signals'],
  ['ACT','AI-generated field interventions'],
  ['MEASURE','Post-intervention outcomes'],
]

export const visit = {
  id: 'SP-10482', merchantId: 'm1', merchant: merchants[0], date: '24 Sep 2026', time: '09:42 AM', status: 'VERIFIED',
  verification: { gps: 'VERIFIED', timestamp: 'VERIFIED', geofence: '43m', hash: 'MATCHED', authenticity: 94 },
  imageQuality: 'GOOD', visionConfidence: 93,
  vision: {
    paytm: { score: 38, visibility: 'Poor', obstruction: 'Detected' },
    soundbox: { score: 82, present: 'Yes', visible: 'Yes' },
    competitor: { name: 'PhonePe', dominance: 'HIGH' },
    recommendation: 'Reposition Paytm QR',
  },
  evidenceChain: [
    ['09:41:52','GPS captured'],['09:42:03','Image captured'],['09:42:04','Image hash generated'],['09:42:05','Vision analysis started'],['09:42:07','AI audit completed'],['09:42:08','Fraud/evidence validation passed'],
  ],
  authenticitySignals: [
    ['GPS proximity','✓'],['Geofence','✓'],['Timestamp consistency','✓'],['Image hash','✓'],['Image quality','✓'],['Visit history anomaly','✓'],['Potential reuse','No anomaly'],
  ],
  guidance: { language: 'Hindi', message: 'QR code ko billing counter ke paas aur clearly visible jagah par rakhein...', audio: false },
}

export const managerKpis = [
  ['TOTAL VISITS','128','normal'],['VERIFIED','114','good'],['PENDING','9','pending'],['SUSPICIOUS','5','danger'],['INTERVENTIONS','87','good'],['ESCALATIONS','6','pending'],
]

export const exceptions = [
  { type:'SUSPICIOUS VISIT', merchant:'Ramesh General Store', detail:'GPS mismatch', sub:'2.4 km from expected location', action:'REVIEW', severity:'danger', id:'SP-10482' },
  { type:'LOW AI CONFIDENCE', merchant:'Sharma Mart', detail:'Vision confidence 54%', sub:'Review counter evidence before escalation', action:'ESCALATE', severity:'pending', id:'SP-10476' },
  { type:'REPEATED NON-COMPLIANCE', merchant:'Patel Foods', detail:'3 consecutive low QR visibility audits', sub:'Merchant intervention follow-up required', action:'REVIEW', severity:'pending', id:'SP-10461' },
]

export const fsePerformance = [
  ['Aarav Sharma',24,23,18,'96%',1],['Neha Patel',21,19,15,'90%',2],['Rahul Mehta',19,18,12,'94%',0],['Isha Desai',22,20,14,'91%',1],
]

export const impact = {
  kpis: [['Successful Interventions','87'],['Observed Transaction Change','+14%'],['QR Visibility Improvement','+26 pts'],['Merchants Recovered','31'],['Visits Measured','74']],
  beforeAfter: { labels:['-6d','-5d','-4d','-3d','-2d','-1d','INT','+1d','+2d','+3d','+4d','+5d','+6d'], baseline:[40,41,42,42,43,42,42,46,48,49,50,50,50], observed:[40,41,42,42,43,42,42,45,47,49,50,50,50] },
  interventions: [['QR Repositioning',42,38,31,'+19%'],['Soundbox Activation',21,19,16,'+11%'],['Merchant Guidance',18,17,14,'+8%']],
  trend: [4,6,5,9,8,11,10,14,13,16,15,19,18,21],
}

export const memories = [
  'QR repositioning attempted','PhonePe sticker observed','Merchant requested Hindi guidance','Transaction decline observed after previous visit'
]
