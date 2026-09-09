import { createSeededStore, readSeedFile } from "../src/agents/store.js";

const store = createSeededStore();
const snapshot = store.read();
const seed = readSeedFile();
console.log(`Loaded ${seed.services.length} services and ${seed.alerts.length} alerts from data/seed.json.`);
console.log(`Seeded ${snapshot.services.length} services and ${snapshot.alerts.length} alerts (3 firing, 3 resolved).`);

export { store };
