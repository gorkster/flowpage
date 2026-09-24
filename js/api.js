// API client for USGS NWIS & Colorado DWR (CDSS HydroBase)
// Handles parallel data fetching, error handling, normalization, metrics, and local caching

const CACHE_KEY = 'south_platte_flow_cache_v2';
const FETCH_TIMEOUT_MS = 15000;

export async function fetchAllStationData(stations) {
  const cdwrStations = stations.filter(s => s.agency === 'CDWR');
  const usgsStations = stations.filter(s => s.agency === 'USGS');

  const cdwrPromise = fetchCDWRData(cdwrStations);
  const usgsPromise = fetchUSGSData(usgsStations);

  const results = await Promise.allSettled([cdwrPromise, usgsPromise]);

  const stationDataMap = {};
  let cdwrSuccess = false;
  let usgsSuccess = false;

  if (results[0].status === 'fulfilled' && results[0].value) {
    Object.assign(stationDataMap, results[0].value);
    cdwrSuccess = true;
  } else {
    console.error('CDWR fetch error:', results[0].reason);
  }

  if (results[1].status === 'fulfilled' && results[1].value) {
    Object.assign(stationDataMap, results[1].value);
    usgsSuccess = true;
  } else {
    console.error('USGS fetch error:', results[1].reason);
  }

  // Combine fetched data with static stations definitions
  const mergedStations = stations.map(station => {
    const live = stationDataMap[station.id] || {
      flow: null,
      stage: null,
      latestTime: null,
      points: [],
      min24h: null,
      max24h: null,
      avg24h: null,
      change24h: null,
      changePct24h: null,
      trend: 'unknown',
      status: 'offline'
    };

    return {
      ...station,
      ...live
    };
  });

  const now = new Date();
  const payload = {
    updatedAt: now.toISOString(),
    cdwrSuccess,
    usgsSuccess,
    isCached: false,
    stations: mergedStations
  };

  // If at least one source succeeded, cache the latest state
  if (cdwrSuccess || usgsSuccess) {
    saveToCache(payload);
  } else {
    // If both failed, try reading from cache
    const cached = loadFromCache();
    if (cached) {
      cached.isCached = true;
      return cached;
    }
  }

  return payload;
}

// Fetch CDWR Telemetry Time Series with retry
async function fetchCDWRData(cdwrStations, attempt = 1) {
  if (!cdwrStations.length) return {};
  const abbrevs = cdwrStations.map(s => s.id).join(',');

  // Query past 3 days to guarantee 48-72h of hydrograph points
  const d = new Date();
  d.setDate(d.getDate() - 3);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const startDate = `${year}-${month}-${day}`;

  const url = `https://dwr.state.co.us/Rest/GET/api/v2/telemetrystations/telemetrytimeseriesraw/?format=json&abbrev=${abbrevs}&parameter=DISCHRG,GAGE_HT&startDate=${startDate}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 1200));
        return fetchCDWRData(cdwrStations, attempt + 1);
      }
      throw new Error(`CDWR HTTP ${res.status}`);
    }
    const json = await res.json();
    const resultList = json.ResultList || [];

    const groupedFlows = {};
    const groupedStages = {};

    for (const r of resultList) {
      if (r.measValue === null || r.measValue === undefined) continue;
      const abbrev = r.abbrev;
      // DWR timestamps are local Colorado Mountain Time (UTC-6)
      const time = new Date(r.measDateTime + '-06:00');
      const val = Number(r.measValue);

      if (r.parameter === 'DISCHRG') {
        if (!groupedFlows[abbrev]) groupedFlows[abbrev] = [];
        groupedFlows[abbrev].push({ time, value: val });
      } else if (r.parameter === 'GAGE_HT') {
        if (!groupedStages[abbrev]) groupedStages[abbrev] = [];
        groupedStages[abbrev].push({ time, value: val });
      }
    }

    const resultMap = {};
    for (const s of cdwrStations) {
      const flowPoints = groupedFlows[s.id] || [];
      const stagePoints = groupedStages[s.id] || [];

      flowPoints.sort((a, b) => a.time - b.time);
      stagePoints.sort((a, b) => a.time - b.time);

      const latestFlow = flowPoints.length > 0 ? flowPoints[flowPoints.length - 1].value : null;
      const latestTime = flowPoints.length > 0 ? flowPoints[flowPoints.length - 1].time : null;
      const latestStage = stagePoints.length > 0 ? stagePoints[stagePoints.length - 1].value : null;

      const stats = calculateSeriesStats(flowPoints);

      resultMap[s.id] = {
        flow: latestFlow,
        stage: latestStage,
        latestTime: latestTime ? latestTime.toISOString() : null,
        points: flowPoints.map(p => ({ time: p.time.toISOString(), value: p.value })),
        ...stats,
        status: latestTime ? getFreshnessStatus(latestTime) : 'offline'
      };
    }

    return resultMap;
  } catch (err) {
    clearTimeout(timeoutId);
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 1200));
      return fetchCDWRData(cdwrStations, attempt + 1);
    }
    console.error('Error fetching CDWR data:', err);
    throw err;
  }
}

// Fetch USGS Instantaneous Values (IV) with retry
async function fetchUSGSData(usgsStations, attempt = 1) {
  if (!usgsStations.length) return {};
  const sites = usgsStations.map(s => s.id).join(',');
  const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${sites}&parameterCd=00060,00065&period=P3D`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 1200));
        return fetchUSGSData(usgsStations, attempt + 1);
      }
      throw new Error(`USGS HTTP ${res.status}`);
    }
    const json = await res.json();
    const timeSeriesList = json.value?.timeSeries || [];

    const groupedFlows = {};
    const groupedStages = {};

    for (const ts of timeSeriesList) {
      const siteCode = ts.sourceInfo?.siteCode?.[0]?.value;
      const paramCode = ts.variable?.variableCode?.[0]?.value;
      const values = ts.values?.[0]?.value || [];

      const points = [];
      for (const v of values) {
        const val = parseFloat(v.value);
        // Exclude USGS error code -999999
        if (!isNaN(val) && val >= 0) {
          points.push({
            time: new Date(v.dateTime),
            value: val
          });
        }
      }

      if (paramCode === '00060') {
        groupedFlows[siteCode] = points;
      } else if (paramCode === '00065') {
        groupedStages[siteCode] = points;
      }
    }

    const resultMap = {};
    for (const s of usgsStations) {
      const flowPoints = groupedFlows[s.id] || [];
      const stagePoints = groupedStages[s.id] || [];

      flowPoints.sort((a, b) => a.time - b.time);
      stagePoints.sort((a, b) => a.time - b.time);

      const latestFlow = flowPoints.length > 0 ? flowPoints[flowPoints.length - 1].value : null;
      const latestTime = flowPoints.length > 0 ? flowPoints[flowPoints.length - 1].time : null;
      const latestStage = stagePoints.length > 0 ? stagePoints[stagePoints.length - 1].value : null;

      const stats = calculateSeriesStats(flowPoints);

      resultMap[s.id] = {
        flow: latestFlow,
        stage: latestStage,
        latestTime: latestTime ? latestTime.toISOString() : null,
        points: flowPoints.map(p => ({ time: p.time.toISOString(), value: p.value })),
        ...stats,
        status: latestTime ? getFreshnessStatus(latestTime) : 'offline'
      };
    }

    return resultMap;
  } catch (err) {
    clearTimeout(timeoutId);
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 1200));
      return fetchUSGSData(usgsStations, attempt + 1);
    }
    console.error('Error fetching USGS data:', err);
    throw err;
  }
}

// Compute 24h min, max, average, and 24h/6h change trends
function calculateSeriesStats(points) {
  if (!points || points.length === 0) {
    return {
      min24h: null,
      max24h: null,
      avg24h: null,
      change24h: null,
      changePct24h: null,
      trend: 'unknown'
    };
  }

  const latest = points[points.length - 1];
  const now = latest.time.getTime();
  const ms24hAgo = now - 24 * 60 * 60 * 1000;
  const ms6hAgo = now - 6 * 60 * 60 * 1000;

  const pts24h = points.filter(p => p.time.getTime() >= ms24hAgo);
  const values24h = pts24h.length > 0 ? pts24h.map(p => p.value) : points.map(p => p.value);

  const min24h = Math.min(...values24h);
  const max24h = Math.max(...values24h);
  const avg24h = parseFloat((values24h.reduce((a, b) => a + b, 0) / values24h.length).toFixed(1));

  // Find point closest to 24h ago
  let pt24hAgo = pts24h[0];
  let pt6hAgo = points.find(p => p.time.getTime() >= ms6hAgo) || pt24hAgo;

  const currentFlow = latest.value;
  const change24h = pt24hAgo ? parseFloat((currentFlow - pt24hAgo.value).toFixed(2)) : 0;
  const changePct24h = pt24hAgo && pt24hAgo.value > 0 
    ? parseFloat(((change24h / pt24hAgo.value) * 100).toFixed(1)) 
    : 0;

  // Determine trend based on 6h change
  let trend = 'steady';
  if (pt6hAgo) {
    const diff6h = currentFlow - pt6hAgo.value;
    const pct6h = pt6hAgo.value > 0 ? (diff6h / pt6hAgo.value) * 100 : 0;
    if (pct6h > 4 && Math.abs(diff6h) >= 1) {
      trend = 'rising';
    } else if (pct6h < -4 && Math.abs(diff6h) >= 1) {
      trend = 'falling';
    }
  }

  return {
    min24h,
    max24h,
    avg24h,
    change24h,
    changePct24h,
    trend
  };
}

function getFreshnessStatus(latestTime) {
  const ageMinutes = (Date.now() - new Date(latestTime).getTime()) / (1000 * 60);
  if (ageMinutes > 24 * 60) return 'stale'; // > 24h old
  if (ageMinutes > 4 * 60) return 'delayed'; // > 4h old
  return 'active';
}

function saveToCache(data) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    }
  } catch (e) {
    console.warn('Could not save to localStorage:', e);
  }
}

export function loadFromCache() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    }
    return null;
  } catch (e) {
    console.warn('Could not load from localStorage:', e);
    return null;
  }
}
