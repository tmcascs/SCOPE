import { loadLookupFromFile, getDetectionWindow } from '../src/model.js';

const lookup = loadLookupFromFile(new URL('../data/detection_lookup.json', import.meta.url));

const result = getDetectionWindow(lookup, {
  emissionRateKgPerHour: 10,
  cmdlPpm: 1.0,
  heightDeltaM: 4.5,
  windSpeedMps: 3
});

console.log('SCOPE detection query result');
console.log(JSON.stringify(result, null, 2));
