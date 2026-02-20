const data = require('./data/normalized/order-groups.json');

const nullVenta = data.filter((g: any) => !g.venta);
console.log(`Groups with null venta: ${nullVenta.length}`);

// What do they have?
let hasLog = 0, hasEnv = 0, hasBoth = 0;
for (const g of nullVenta) {
  if (g.logistica) hasLog++;
  if (g.envios_somnio) hasEnv++;
  if (g.logistica && g.envios_somnio) hasBoth++;
}
console.log(`  has logistica: ${hasLog}`);
console.log(`  has envios: ${hasEnv}`);
console.log(`  has both: ${hasBoth}`);

// Sample
console.log('\nSample null venta group:');
console.log(JSON.stringify(nullVenta[0], null, 2).slice(0, 1500));
