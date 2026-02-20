const data = require('./data/normalized/rematch-candidates.json');

console.log('=== LOGISTICA SIN VENTA ===');
const logByRec: Record<string, number> = {};
for (const c of data.logisticaSinVenta) {
  const r = c.recommendation || 'unknown';
  logByRec[r] = (logByRec[r] || 0) + 1;
}
console.log('By recommendation:', logByRec);

const logReal = data.logisticaSinVenta.filter(
  (c: any) => c.recommendation === 'truly_unmatched' || c.recommendation === 'review'
);
console.log(`\nReal standalone logísticas (${logReal.length}):`);
for (const r of logReal) {
  console.log(JSON.stringify({
    id: r.id, name: r.name, stage: r.stage,
    phone: r.phone, recommendation: r.recommendation,
    amount: r.amount, callbell: r.callbell,
    address: r.address, department: r.department, city: r.city,
    created: r.created, modified: r.modified,
    carrier: r.carrier, guia: r.guia, description: r.description,
  }, null, 2));
}

console.log('\n=== ENVIOS SIN LOGISTICA ===');
const envByRec: Record<string, number> = {};
for (const c of data.enviosSinLogistica) {
  const r = c.recommendation || 'unknown';
  envByRec[r] = (envByRec[r] || 0) + 1;
}
console.log('By recommendation:', envByRec);

const envReal = data.enviosSinLogistica.filter(
  (c: any) => c.recommendation === 'truly_unmatched' || c.recommendation === 'review'
);
console.log(`\nReal standalone envíos (${envReal.length}):`);
for (const r of envReal) {
  console.log(JSON.stringify({
    id: r.id, name: r.name, stage: r.stage,
    phone: r.phone, recommendation: r.recommendation,
  }));
}
