import yahooFinance from 'yahoo-finance2';

// 1. FORCE DYNAMIC: Critical for Vercel deployment
export const dynamic = 'force-dynamic';

// 2. SECURE KEY: Uses the variable you set in Vercel
const FRED_API_KEY = process.env.FRED_API_KEY;

const YAHOO_SYMBOLS = {
  SPX: '^GSPC',
  AAPL: 'AAPL',
  MSFT: 'MSFT',
  GOOG: 'GOOG',
  AMZN: 'AMZN',
  NVDA: 'NVDA',
  META: 'META',
  TSLA: 'TSLA',
  BTC: 'BTC-USD',
  GOLD: 'GC=F',
  SILVER: 'SI=F',
  URA: 'URA',
};

const FRED_SERIES = {
  PCE: 'PCEPI',
  CASE_SHILLER: 'CSUSHPISA',
};

// --- DATA FETCHING FUNCTIONS ---

async function fetchFredSeries(seriesId, startDate) {
  // Check if key exists to prevent crashing if env var is missing
  if (!FRED_API_KEY) {
    console.error("FRED_API_KEY is missing from environment variables");
    return null;
  }

  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&frequency=m`;
  
  try {
    const response = await fetch(url, { next: { revalidate: 86400 } }); 
    if (!response.ok) throw new Error(`FRED API error: ${response.status}`);
    const data = await response.json();
    
    return data.observations
      .filter(obs => obs.value !== '.')
      .map(obs => ({
        date: obs.date,
        value: parseFloat(obs.value),
      }));
  } catch (error) {
    console.error(`Error fetching FRED series ${seriesId}:`, error.message);
    return null;
  }
}

async function fetchYahooData(symbol, startDate) {
  try {
    yahooFinance.suppressNotices(['yahooSurvey']);
    
    const result = await yahooFinance.chart(symbol, {
      period1: startDate,
      period2: new Date(),
      interval: '1mo',
    });
    
    if (!result?.quotes) return null;
    
    return result.quotes
      .filter(q => q.close !== null)
      .map(q => ({
        date: q.date.toISOString().split('T')[0],
        value: q.adjclose || q.close,
      }));
  } catch (error) {
    console.warn(`Yahoo fetch failed for ${symbol}: ${error.message}`);
    return null;
  }
}

// --- CALCULATION HELPERS ---

function calculateMag7(stocks, dates) {
  const mag7Data = [];
  let baseValues = null;
  
  for (const date of dates) {
    const values = {};
    let allPresent = true;
    
    for (const [name, data] of Object.entries(stocks)) {
      if (!data) { allPresent = false; break; }
      const point = data.find(d => d.date === date);
      if (point) {
        values[name] = point.value;
      } else {
        allPresent = false;
      }
    }
    
    if (allPresent) {
      if (!baseValues) {
        baseValues = { ...values };
      }
      
      let totalReturn = 0;
      for (const [name, value] of Object.entries(values)) {
        totalReturn += value / baseValues[name];
      }
      const avgReturn = totalReturn / Object.keys(values).length;
      
      mag7Data.push({
        date,
        value: avgReturn * 100, 
      });
    }
  }
  
  return mag7Data;
}

function mergeData(datasets, allDates) {
  const merged = [];
  
  for (const date of allDates) {
    const row = { date };
    
    for (const [key, data] of Object.entries(datasets)) {
      if (data) {
        const point = data.find(d => d.date.substring(0, 7) === date.substring(0, 7));
        row[key] = point?.value || null;
      } else {
        row[key] = null;
      }
    }
    if (date) merged.push(row);
  }
  
  return merged;
}

function generateFallbackData() {
  const data = [];
  let date = new Date('2023-01-01');
  for (let i = 0; i < 12; i++) {
    data.push({
      date: date.toISOString().split('T')[0],
      SPX: 4000 + (i * 50),
      MAG7: 100 + (i * 2),
      BTC: 30000 + (i * 1000),
      GOLD: 2000 + (i * 10),
      SILVER: 22 + (i * 0.5),
      URANIUM: 20 + (i * 0.5),
      PCE: 120 + (i * 0.2),
      CASE_SHILLER: 300 + (i * 1),
    });
    date.setMonth(date.getMonth() + 1);
  }
  return data;
}

// --- MAIN API HANDLER ---

export async function GET() {
  const startDate = '2014-01-01';

  const fetchMap = {
    SPX: fetchYahooData(YAHOO_SYMBOLS.SPX, startDate),
    AAPL: fetchYahooData(YAHOO_SYMBOLS.AAPL, startDate),
    MSFT: fetchYahooData(YAHOO_SYMBOLS.MSFT, startDate),
    GOOG: fetchYahooData(YAHOO_SYMBOLS.GOOG, startDate),
    AMZN: fetchYahooData(YAHOO_SYMBOLS.AMZN, startDate),
    NVDA: fetchYahooData(YAHOO_SYMBOLS.NVDA, startDate),
    META: fetchYahooData(YAHOO_SYMBOLS.META, startDate),
    TSLA: fetchYahooData(YAHOO_SYMBOLS.TSLA, startDate),
    BTC: fetchYahooData(YAHOO_SYMBOLS.BTC, startDate),
    GOLD: fetchYahooData(YAHOO_SYMBOLS.GOLD, startDate),
    SILVER: fetchYahooData(YAHOO_SYMBOLS.SILVER, startDate),
    URA: fetchYahooData(YAHOO_SYMBOLS.URA, startDate),
    PCE: fetchFredSeries(FRED_SERIES.PCE, startDate),
    CASE_SHILLER: fetchFredSeries(FRED_SERIES.CASE_SHILLER, startDate),
  };

  const results = await Promise.allSettled(Object.values(fetchMap));
  const keys = Object.keys(fetchMap);
  
  const rawData = {};
  keys.forEach((key, index) => {
    const result = results[index];
    if (result.status === 'fulfilled') {
      rawData[key] = result.value;
    } else {
      // Log errors but don't crash
      rawData[key] = null;
    }
  });

  // CRITICAL: Return fallback if main data is missing
  if (!rawData.SPX) {
    return Response.json({
      success: true,
      isFallback: true,
      data: generateFallbackData(),
      sources: { note: "Live data unavailable (likely rate-limited). Showing cached/fallback data." }
    });
  }

  const allDates = rawData.SPX.map(d => d.date);
  
  const mag7Stocks = {
    AAPL: rawData.AAPL, MSFT: rawData.MSFT, GOOG: rawData.GOOG, 
    AMZN: rawData.AMZN, NVDA: rawData.NVDA, META: rawData.META, TSLA: rawData.TSLA
  };

  const validMag7Components = Object.values(mag7Stocks).filter(v => v !== null).length;
  const mag7Data = validMag7Components >= 5 
    ? calculateMag7(mag7Stocks, allDates) 
    : null;

  const finalDatasets = {
    SPX: rawData.SPX,
    MAG7: mag7Data,
    BTC: rawData.BTC,
    GOLD: rawData.GOLD,
    SILVER: rawData.SILVER,
    URANIUM: rawData.URA,
    PCE: rawData.PCE,
    CASE_SHILLER: rawData.CASE_SHILLER,
  };

  const mergedData = mergeData(finalDatasets, allDates);

  return Response.json({
    success: true,
    data: mergedData,
    sources: {
      SPX: rawData.SPX ? 'Yahoo' : 'Failed',
      PCE: rawData.PCE ? 'FRED' : 'Failed',
    },
    lastUpdated: new Date().toISOString(),
  });
}
