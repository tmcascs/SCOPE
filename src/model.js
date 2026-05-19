import { readFileSync } from 'node:fs';

export const MAX_LOOKUP_RADIUS_M = 300;

function toTableKey(value) {
  return String(Math.round(value));
}

function normalizeCmdlKey(cmdlPpm) {
  return Number(cmdlPpm).toFixed(1);
}

function resolveLookupPoint(tableByHeight, heightKey, windSpeedMps, field) {
  const rowByWind = tableByHeight?.[String(heightKey)];
  if (!rowByWind) {
    return undefined;
  }

  const speeds = Object.keys(rowByWind)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!speeds.length) {
    return undefined;
  }

  if (windSpeedMps < speeds[0]) {
    return null;
  }

  const clampedWind = Math.min(windSpeedMps, speeds[speeds.length - 1]);

  let lowerIdx = 0;
  while (lowerIdx < speeds.length - 1 && speeds[lowerIdx + 1] <= clampedWind) {
    lowerIdx += 1;
  }

  const upperIdx = lowerIdx === speeds.length - 1 ? lowerIdx : lowerIdx + 1;
  const lowerSpeed = speeds[lowerIdx];
  const upperSpeed = speeds[upperIdx];

  const lower = rowByWind[String(lowerSpeed)]?.[field] ?? null;
  const upper = rowByWind[String(upperSpeed)]?.[field] ?? null;

  if (lower === null && upper === null) {
    return null;
  }

  if (lowerIdx === upperIdx || upperSpeed === lowerSpeed) {
    return lower ?? upper;
  }

  if (lower === null) {
    return upper;
  }

  if (upper === null) {
    return lower;
  }

  const weight = (clampedWind - lowerSpeed) / (upperSpeed - lowerSpeed);
  return lower + (upper - lower) * weight;
}

function interpolateAcrossHeight(tableByHeight, heightDeltaM, windSpeedMps, field) {
  const low = Math.floor(heightDeltaM);
  const high = Math.ceil(heightDeltaM);
  const weight = heightDeltaM - low;

  const lowValue = resolveLookupPoint(tableByHeight, low, windSpeedMps, field);
  const highValue = resolveLookupPoint(tableByHeight, high, windSpeedMps, field);

  if (lowValue === undefined && highValue === undefined) {
    return undefined;
  }

  if (lowValue === null && highValue === null) {
    return null;
  }

  if (high === low || weight <= 0) {
    return lowValue ?? highValue;
  }

  if (lowValue === undefined) {
    return highValue;
  }

  if (highValue === undefined) {
    return lowValue;
  }

  if (lowValue === null) {
    return highValue;
  }

  if (highValue === null) {
    return lowValue;
  }

  return lowValue + (highValue - lowValue) * weight;
}

export function loadLookupFromFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function getDetectionWindow(lookup, params) {
  const {
    emissionRateKgPerHour,
    cmdlPpm,
    heightDeltaM,
    windSpeedMps
  } = params;

  const emissionKey = toTableKey(emissionRateKgPerHour * 1000);
  const cmdlKey = normalizeCmdlKey(cmdlPpm);
  const tableByHeight = lookup?.[emissionKey]?.[cmdlKey];

  if (!tableByHeight) {
    return {
      maxRangeM: undefined,
      minRangeM: undefined,
      limitHit: false
    };
  }

  const clampedHeight = Math.max(0, Math.min(20, Number(heightDeltaM)));
  const maxRangeM = interpolateAcrossHeight(tableByHeight, clampedHeight, Number(windSpeedMps), 'xdetect');
  const minRangeM = interpolateAcrossHeight(tableByHeight, clampedHeight, Number(windSpeedMps), 'xdetect_rising');

  const nearestHeight = Math.round(clampedHeight);
  const nearestWind = String(Math.round(Number(windSpeedMps)));
  const point = tableByHeight?.[String(nearestHeight)]?.[nearestWind];
  const limitHit = Boolean(point?.limit_hit);

  return {
    maxRangeM,
    minRangeM,
    limitHit,
    cappedAtM: limitHit ? MAX_LOOKUP_RADIUS_M : undefined
  };
}
