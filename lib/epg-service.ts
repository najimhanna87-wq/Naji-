/**
 * EPG Service — fetches and parses XMLTV data from the Xtream Codes API.
 *
 * Xtream EPG endpoint:
 *   GET {baseUrl}/xmltv.php?username={user}&password={pass}
 *
 * This service:
 *  1. Fetches the XMLTV XML (cached for 30 minutes in memory)
 *  2. Parses <programme> elements for a given channel tvg-id
 *  3. Returns current and next programme info
 */

export interface EpgProgram {
  title: string;
  description?: string;
  start: Date;
  stop: Date;
  channelId: string;
}

export interface EpgChannelInfo {
  current: EpgProgram | null;
  next: EpgProgram | null;
}

// In-memory cache
let cachedXml: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Parsed programme map: channelId → sorted programmes
let programmeMap: Map<string, EpgProgram[]> = new Map();
let lastParsedXml = '';

/**
 * Parse XMLTV date string: "20240101120000 +0000" → Date
 */
function parseXmltv(dateStr: string): Date {
  // Format: YYYYMMDDHHmmss [+HHMM]
  const clean = dateStr.trim();
  const year = parseInt(clean.substring(0, 4), 10);
  const month = parseInt(clean.substring(4, 6), 10) - 1;
  const day = parseInt(clean.substring(6, 8), 10);
  const hour = parseInt(clean.substring(8, 10), 10);
  const min = parseInt(clean.substring(10, 12), 10);
  const sec = parseInt(clean.substring(12, 14), 10);

  // Timezone offset
  let offsetMs = 0;
  const tzPart = clean.substring(15).trim();
  if (tzPart) {
    const sign = tzPart[0] === '-' ? -1 : 1;
    const tzH = parseInt(tzPart.substring(1, 3), 10);
    const tzM = parseInt(tzPart.substring(3, 5), 10);
    offsetMs = sign * (tzH * 60 + tzM) * 60 * 1000;
  }

  const utc = Date.UTC(year, month, day, hour, min, sec) - offsetMs;
  return new Date(utc);
}

/**
 * Parse XMLTV XML string into the programme map.
 */
function parseXml(xml: string): void {
  if (xml === lastParsedXml) return; // already parsed
  lastParsedXml = xml;
  programmeMap = new Map();

  // Simple regex-based parser (no DOM available in RN)
  const progRegex = /<programme\s([^>]*)>([\s\S]*?)<\/programme>/g;
  const attrRegex = /(\w+)="([^"]*)"/g;
  const titleRegex = /<title[^>]*>([^<]*)<\/title>/;
  const descRegex = /<desc[^>]*>([^<]*)<\/desc>/;

  let match: RegExpExecArray | null;
  let count = 0;
  const MAX_PROGRAMS = 5000; // Prevent infinite loops or extreme memory usage

  while ((match = progRegex.exec(xml)) !== null && count < MAX_PROGRAMS) {
    count++;
    const attrsStr = match[1];
    const body = match[2];

    let start = '';
    let stop = '';
    let channelId = '';

    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
      if (attrMatch[1] === 'start') start = attrMatch[2];
      else if (attrMatch[1] === 'stop') stop = attrMatch[2];
      else if (attrMatch[1] === 'channel') channelId = attrMatch[2];
    }

    if (!start || !stop || !channelId) continue;

    const titleMatch = titleRegex.exec(body);
    const descMatch = descRegex.exec(body);

    const prog: EpgProgram = {
      title: titleMatch ? titleMatch[1].trim() : 'Unknown',
      description: descMatch ? descMatch[1].trim() : undefined,
      start: parseXmltv(start),
      stop: parseXmltv(stop),
      channelId,
    };

    if (!programmeMap.has(channelId)) {
      programmeMap.set(channelId, []);
    }
    programmeMap.get(channelId)!.push(prog);
  }

  // Sort each channel's programmes by start time
  for (const [, progs] of programmeMap) {
    progs.sort((a, b) => a.start.getTime() - b.start.getTime());
  }
}

/**
 * Fetch EPG XML from Xtream API (with 30-min cache).
 */
async function fetchEpgXml(baseUrl: string, username: string, password: string): Promise<string> {
  const now = Date.now();
  if (cachedXml && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedXml;
  }

  const url = `${baseUrl}/xmltv.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

  const response = await fetch(url, {
    headers: { Accept: 'application/xml, text/xml, */*' },
  });

  if (!response.ok) throw new Error(`EPG fetch failed: ${response.status}`);

  const xml = await response.text();
  cachedXml = xml;
  cacheTimestamp = now;
  return xml;
}

/**
 * Get current and next programme for a channel.
 * @param tvgId  The channel's tvg-id (from stream_icon or epg_channel_id)
 */
export function getChannelEpg(tvgId: string): EpgChannelInfo {
  if (!tvgId) return { current: null, next: null };

  const progs = programmeMap.get(tvgId);
  if (!progs || progs.length === 0) return { current: null, next: null };

  const now = new Date();
  let currentIdx = -1;

  for (let i = 0; i < progs.length; i++) {
    if (progs[i].start <= now && progs[i].stop > now) {
      currentIdx = i;
      break;
    }
  }

  const current = currentIdx >= 0 ? progs[currentIdx] : null;
  const next = currentIdx >= 0 && currentIdx + 1 < progs.length ? progs[currentIdx + 1] : null;

  return { current, next };
}

/**
 * Load EPG data from the Xtream API.
 * Call this once when the app starts or when credentials change.
 */
export async function loadEpg(baseUrl: string, username: string, password: string): Promise<void> {
  try {
    const xml = await fetchEpgXml(baseUrl, username, password);
    parseXml(xml);
  } catch (err) {
    // EPG is optional — silently fail
    console.warn('[EPG] Failed to load:', err);
  }
}

/**
 * Clear EPG cache (e.g., on logout).
 */
export function clearEpgCache(): void {
  cachedXml = null;
  cacheTimestamp = 0;
  programmeMap = new Map();
  lastParsedXml = '';
}

/**
 * Format a Date as HH:MM (local time).
 */
export function formatEpgTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Calculate progress percentage of the current programme (0-100).
 */
export function getEpgProgress(prog: EpgProgram): number {
  const now = Date.now();
  const total = prog.stop.getTime() - prog.start.getTime();
  if (total <= 0) return 0;
  const elapsed = now - prog.start.getTime();
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}
