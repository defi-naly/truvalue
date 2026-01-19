
// app/api/data/route.js
import yahooFinance from 'yahoo-finance2';

// Force dynamic to skip build-time fetching (crucial for Vercel)
export const dynamic = 'force-dynamic';

const FRED_API_KEY = process.env.FRED_API_KEY || 'YOUR_FRED_API_KEY';

const YAHOO_SYMBOLS = {
  SPX: '^GSPC',           // S&P 500
  AAPL: 'AAPL',           // Apple
  MSFT: 'MSFT',           // Microsoft
  GOOG: 'GOOG',           // Google
  AMZN: 'AMZN',           // Amazon
  NVDA: 'NVDA',           // NVIDIA
  META: 'META',           // Meta
  TSLA: 'TSLA',           // Tesla
  BTC: 'BTC-USD',         // Bitcoin
  GOLD: 'GC=F',           // Gold Futures
  SILVER: 'SI=F',         // Silver Futures
  URA: 'URA',             // Uranium ETF
};

const FRED_SERIES = {
  PCE: 'PCEPI',               // PCE Price Index
  CASE_SHILLER: 'CSUSHPISA',  // Case-Shiller National Home Price Index
};

// --- DATA FETCHING FUNCTIONS ---

async function fetchFredSeries(seriesId, startDate) {
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
    // Suppress console warnings from yahoo-finance2 library
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
      if (!data) { allPresent = false; break; } // Safety check
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
    // Include row if we have a date (even if data is partial)
    if (date) merged.push(row);
  }
  
  return merged;
}

// --- MAIN API HANDLER ---

export async function GET() {
  const startDate = '2014-01-01';

  // 1. Define all fetch promises mapped
