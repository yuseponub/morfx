const data = require('./data/normalized/rematch-candidates.json');

// Full details of 1 standalone logística
const log1 = data.logisticaSinVenta.find(
  (c: any) => c.recommendation === 'truly_unmatched'
);
console.log('=== Sample standalone logística (all fields) ===');
console.log(JSON.stringify(log1, null, 2));

// Full details of 1 standalone envío
const env1 = data.enviosSinLogistica.find(
  (c: any) => c.recommendation === 'truly_unmatched' && c.phone
);
console.log('\n=== Sample standalone envío (all fields) ===');
console.log(JSON.stringify(env1, null, 2));

// Also check unmatched.json structure for ventas sin logística
const unmatched = require('./data/normalized/unmatched.json');
console.log('\n=== Sample venta sin logística (all fields) ===');
console.log(JSON.stringify(unmatched.ventasSinLogistica[0], null, 2));

// Check enviosSinLogistica in unmatched vs rematch
console.log('\n=== Sample envío sin logística from unmatched.json ===');
console.log(JSON.stringify(unmatched.enviosSinLogistica[0], null, 2));
