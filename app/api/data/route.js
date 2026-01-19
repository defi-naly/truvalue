// app/api/data/route.js
// This API route fetches data from Yahoo Finance and FRED
export const dynamic = 'force-dynamic';

import yahooFinance from 'yahoo-finance2';

// FRED API - Get your free key at: https://fred.stlouisfed.org/docs/api/api_key.html
const FRED_API_KEY = process.env.FRED_API_KEY || 'f25fd4b35fd3c61de4746a3eafcec7c5';

// Yahoo Finance symbols
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

// FRED series IDs
const FRED_SERIES = {
  PCE: 'PCEPI',              // PCE Price Index
  CASE_SHILLER: 'CSUSHPISA', // Case-Shiller National Home Price Index
};

// Fetch data from FRED API
async function fetchFredSeries(seriesId, startDate) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&observation_start=${startDate}&frequency=m`;
  
  try {
    const response = await fetch(url, { next: { revalidate: 86400 } }); // Cache for 24 hours
    if (!response.ok) throw new Error(`FRED API error: ${response.status}`);
    const data = await response.json();
    
    return data.observations
      .filter(obs => obs.value !== '.')
      .map(obs => ({
        date: obs.date,
        value: parseFloat(obs.value),
      }));
  } catch (error) {
    console.error(`Error fetching FRED series ${seriesId}:`, error);
    return null;
  }
}

// Fetch data from Yahoo Finance
async function fetchYahooData(symbol, startDate) {
  try {
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
    console.error(`Error fetching Yahoo data for ${symbol}:`, error);
    return null;
  }
}

// Calculate Mag7 equal-weight index
function calculateMag7(stocks, dates) {
  const mag7Data = [];
  
  // Get base values for indexing (first available date where all stocks have data)
  let baseValues = null;
  
  for (const date of dates) {
    const values = {};
    let allPresent = true;
    
    for (const [name, data] of Object.entries(stocks)) {
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
      
      // Calculate equal-weight return
      let totalReturn = 0;
      for (const [name, value] of Object.entries(values)) {
        totalReturn += value / baseValues[name];
      }
      const avgReturn = totalReturn / Object.keys(values).length;
      
      mag7Data.push({
        date,
        value: avgReturn * 100, // Index starting at 100
      });
    }
  }
  
  return mag7Data;
}

// Merge all data into unified monthly series
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
    
    // Only include rows that have at least SPX data
    if (row.SPX) {
      merged.push(row);
    }
  }
  
  return merged;
}

export async function GET() {
  try {
    const startDate = '2014-01-01';
    
    // Fetch all data in parallel
    const [
      spxData,
      aaplData,
      msftData,
      googData,
      amznData,
      nvdaData,
      metaData,
      tslaData,
      btcData,
      goldData,
      silverData,
      uraData,
      pceData,
      caseShillerData,
    ] = await Promise.all([
      fetchYahooData(YAHOO_SYMBOLS.SPX, startDate),
      fetchYahooData(YAHOO_SYMBOLS.AAPL, startDate),
      fetchYahooData(YAHOO_SYMBOLS.MSFT, startDate),
      fetchYahooData(YAHOO_SYMBOLS.GOOG, startDate),
      fetchYahooData(YAHOO_SYMBOLS.AMZN, startDate),
      fetchYahooData(YAHOO_SYMBOLS.NVDA, startDate),
      fetchYahooData(YAHOO_SYMBOLS.META, startDate),
      fetchYahooData(YAHOO_SYMBOLS.TSLA, startDate),
      fetchYahooData(YAHOO_SYMBOLS.BTC, startDate),
      fetchYahooData(YAHOO_SYMBOLS.GOLD, startDate),
      fetchYahooData(YAHOO_SYMBOLS.SILVER, startDate),
      fetchYahooData(YAHOO_SYMBOLS.URA, startDate),
      fetchFredSeries(FRED_SERIES.PCE, startDate),
      fetchFredSeries(FRED_SERIES.CASE_SHILLER, startDate),
    ]);
    
    // Get all unique dates from SPX (most complete)
    const allDates = spxData?.map(d => d.date) || [];
    
    // Calculate Mag7 composite
    const mag7Stocks = {
      AAPL: aaplData,
      MSFT: msftData,
      GOOG: googData,
      AMZN: amznData,
      NVDA: nvdaData,
      META: metaData,
      TSLA: tslaData,
    };
    
    // Filter out null datasets
    const validMag7Stocks = Object.fromEntries(
      Object.entries(mag7Stocks).filter(([_, v]) => v !== null)
    );
    
    const mag7Data = Object.keys(validMag7Stocks).length >= 5 
      ? calculateMag7(validMag7Stocks, allDates)
      : null;
    
    // Merge all datasets
    const datasets = {
      SPX: spxData,
      MAG7: mag7Data,
      BTC: btcData,
      GOLD: goldData,
      SILVER: silverData,
      URANIUM: uraData,
      PCE: pceData,
      CASE_SHILLER: caseShillerData,
    };
    
    const mergedData = mergeData(datasets, allDates);
    
    // Return success response
    return Response.json({
      success: true,
      data: mergedData,
      sources: {
        SPX: spxData ? 'Yahoo Finance' : 'unavailable',
        MAG7: mag7Data ? 'Calculated from Yahoo Finance' : 'unavailable',
        BTC: btcData ? 'Yahoo Finance' : 'unavailable',
        GOLD: goldData ? 'Yahoo Finance' : 'unavailable',
        SILVER: silverData ? 'Yahoo Finance' : 'unavailable',
        URANIUM: uraData ? 'Yahoo Finance (URA ETF)' : 'unavailable',
        PCE: pceData ? 'FRED' : 'unavailable',
        CASE_SHILLER: caseShillerData ? 'FRED' : 'unavailable',
      },
      lastUpdated: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return Response.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
