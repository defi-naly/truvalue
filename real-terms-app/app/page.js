'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

// Asset definitions
const ASSETS = {
  SPX: { name: 'S&P 500', color: '#3b82f6' },
  MAG7: { name: 'Mag 7', color: '#a855f7' },
  BTC: { name: 'Bitcoin', color: '#f59e0b' },
  GOLD: { name: 'Gold', color: '#d4af37' },
  SILVER: { name: 'Silver', color: '#94a3b8' },
  URANIUM: { name: 'Uranium', color: '#22d3ee' },
};

const TIME_RANGES = {
  '1Y': 12,
  '3Y': 36,
  '5Y': 60,
  '10Y': 120,
  'MAX': 999,
};

const DENOMINATORS = {
  GOLD: 'vs Gold',
  HOUSES: 'vs Houses',
  PCE: 'PCE Adjusted',
  USD: 'Nominal USD',
};

export default function Dashboard() {
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sources, setSources] = useState({});
  
  const [selectedAssets, setSelectedAssets] = useState(['SPX', 'MAG7', 'BTC', 'GOLD']);
  const [denominator, setDenominator] = useState('GOLD');
  const [timeRange, setTimeRange] = useState('5Y');
  const [indexed, setIndexed] = useState(true);
  const [logScale, setLogScale] = useState(false);
  const [hoveredAsset, setHoveredAsset] = useState(null);

  // Fetch data on mount
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch('/api/data');
        const result = await response.json();
        
        if (result.success) {
          setRawData(result.data);
          setSources(result.sources);
        } else {
          setError(result.error || 'Failed to fetch data');
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, []);

  // Filter by time range
  const filteredData = useMemo(() => {
    if (!rawData) return [];
    const months = TIME_RANGES[timeRange];
    if (months === 999) return rawData;
    return rawData.slice(-months);
  }, [rawData, timeRange]);

  // Transform data based on denominator and indexing
  const chartData = useMemo(() => {
    if (filteredData.length === 0) return [];
    
    const baseValues = {};
    const latestPCE = filteredData[filteredData.length - 1]?.PCE;
    
    return filteredData.map((row, i) => {
      const result = { date: row.date };
      
      Object.keys(ASSETS).forEach(asset => {
        let value = row[asset];
        if (value === null || value === undefined) {
          result[asset] = null;
          return;
        }
        
        // Apply denominator transformation
        if (denominator === 'PCE' && row.PCE && latestPCE) {
          value = value * (latestPCE / row.PCE);
        } else if (denominator === 'GOLD' && row.GOLD) {
          value = value / row.GOLD;
        } else if (denominator === 'HOUSES' && row.CASE_SHILLER) {
          value = (value / row.CASE_SHILLER) * 100;
        }
        
        // Index to 100 if enabled
        if (indexed) {
          if (i === 0 || baseValues[asset] === undefined) {
            baseValues[asset] = value;
          }
          if (baseValues[asset]) {
            value = (value / baseValues[asset]) * 100;
          }
        }
        
        result[asset] = value !== null ? Math.round(value * 10000) / 10000 : null;
      });
      
      return result;
    });
  }, [filteredData, denominator, indexed]);

  // Calculate performance metrics
  const metrics = useMemo(() => {
    if (chartData.length < 2) return {};
    const first = chartData[0];
    const last = chartData[chartData.length - 1];
    const result = {};
    
    selectedAssets.forEach(asset => {
      if (first[asset] && last[asset]) {
        const change = ((last[asset] - first[asset]) / first[asset]) * 100;
        result[asset] = {
          change: change.toFixed(1),
          positive: change >= 0
        };
      }
    });
    
    return result;
  }, [chartData, selectedAssets]);

  const toggleAsset = useCallback((asset) => {
    setSelectedAssets(prev => 
      prev.includes(asset) 
        ? prev.filter(a => a !== asset)
        : [...prev, asset]
    );
  }, []);

  const formatYAxis = (value) => {
    if (value === null || value === undefined) return '';
    if (indexed) return value.toFixed(0);
    if (denominator === 'GOLD') {
      if (value >= 100) return value.toFixed(0) + ' oz';
      if (value >= 1) return value.toFixed(1) + ' oz';
      return value.toFixed(2) + ' oz';
    }
    if (denominator === 'HOUSES') return value.toFixed(1);
    if (value >= 1000000) return '$' + (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return '$' + (value / 1000).toFixed(0) + 'K';
    return '$' + value.toFixed(0);
  };

  const formatTooltipValue = (value) => {
    if (value === null || value === undefined) return 'N/A';
    if (indexed) return value.toFixed(1);
    if (denominator === 'GOLD') return value.toFixed(3) + ' oz';
    if (denominator === 'HOUSES') return value.toFixed(2);
    return '$' + value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    
    return (
      <div style={{
        background: 'rgba(5, 5, 8, 0.96)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '8px',
        padding: '14px 18px',
        fontSize: '13px',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)'
      }}>
        <div style={{ 
          color: 'rgba(255, 255, 255, 0.4)', 
          marginBottom: '10px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '11px'
        }}>
          {label}
        </div>
        {payload.filter(p => p.value !== null).sort((a, b) => b.value - a.value).map(entry => (
          <div 
            key={entry.dataKey}
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '32px',
              marginBottom: '5px'
            }}
          >
            <span style={{ color: entry.color, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: entry.color }} />
              {ASSETS[entry.dataKey]?.name}
            </span>
            <span style={{ color: '#fff', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
              {formatTooltipValue(entry.value)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const periodDescription = useMemo(() => {
    if (filteredData.length < 2) return '';
    return `${filteredData[0].date} → ${filteredData[filteredData.length - 1].date}`;
  }, [filteredData]);

  // Loading state
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#07070a',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', system-ui, sans-serif"
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            border: '3px solid rgba(255,255,255,0.1)',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }} />
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>Loading market data...</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>
            Fetching from Yahoo Finance & FRED
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#07070a',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', system-ui, sans-serif"
      }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <div style={{ fontSize: '18px', marginBottom: '12px' }}>Failed to load data</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '20px' }}>
            {error}
          </div>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              background: '#3b82f6',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#07070a',
      color: '#fff',
      fontFamily: "'Inter', system-ui, sans-serif"
    }}>
      {/* Header */}
      <header style={{ padding: '40px 40px 28px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.25em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.3)',
                margin: '0 0 14px 0'
              }}>
                Real Terms
              </h1>
              <p style={{ fontSize: '32px', fontWeight: 300, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                Asset Performance<br />
                <span style={{ color: 'rgba(255,255,255,0.45)' }}>in Real Terms</span>
              </p>
            </div>
            <div style={{ textAlign: 'right', fontSize: '11px', color: 'rgba(255,255,255,0.25)', fontFamily: "'JetBrains Mono', monospace" }}>
              <div>{periodDescription}</div>
              <div style={{ marginTop: '4px', color: '#4ade80' }}>● Live Data</div>
            </div>
          </div>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.35)', marginTop: '16px', maxWidth: '480px', lineHeight: 1.6 }}>
            Price assets in gold, housing, or PCE to see regime change instead of nominal illusions.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '28px 40px 48px' }}>
        {/* Controls */}
        <div style={{ display: 'flex', gap: '36px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {/* Denominator */}
          <div>
            <label style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', display: 'block', marginBottom: '10px' }}>
              Denominator
            </label>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {Object.entries(DENOMINATORS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDenominator(key)}
                  style={{
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: denominator === key ? 500 : 400,
                    background: denominator === key ? 'rgba(255,255,255,0.08)' : 'transparent',
                    border: '1px solid',
                    borderColor: denominator === key ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                    borderRadius: '5px',
                    color: denominator === key ? '#fff' : 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Time Range */}
          <div>
            <label style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', display: 'block', marginBottom: '10px' }}>
              Time Range
            </label>
            <div style={{ display: 'flex', gap: '4px' }}>
              {Object.keys(TIME_RANGES).map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: timeRange === range ? 500 : 400,
                    background: timeRange === range ? 'rgba(255,255,255,0.08)' : 'transparent',
                    border: '1px solid',
                    borderColor: timeRange === range ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                    borderRadius: '5px',
                    color: timeRange === range ? '#fff' : 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    fontFamily: "'JetBrains Mono', monospace"
                  }}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          
          {/* Display Options */}
          <div>
            <label style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', display: 'block', marginBottom: '10px' }}>
              Display
            </label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setIndexed(!indexed)}
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: indexed ? 500 : 400,
                  background: indexed ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: '1px solid',
                  borderColor: indexed ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                  borderRadius: '5px',
                  color: indexed ? '#fff' : 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                Indexed
              </button>
              <button
                onClick={() => setLogScale(!logScale)}
                style={{
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: logScale ? 500 : 400,
                  background: logScale ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: '1px solid',
                  borderColor: logScale ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                  borderRadius: '5px',
                  color: logScale ? '#fff' : 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                Log
              </button>
            </div>
          </div>
        </div>

        {/* Asset Selection */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', display: 'block', marginBottom: '10px' }}>
            Assets
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {Object.entries(ASSETS).map(([key, asset]) => {
              const isSelected = selectedAssets.includes(key);
              const metric = metrics[key];
              return (
                <button
                  key={key}
                  onClick={() => toggleAsset(key)}
                  onMouseEnter={() => setHoveredAsset(key)}
                  onMouseLeave={() => setHoveredAsset(null)}
                  style={{
                    padding: '10px 16px',
                    fontSize: '13px',
                    fontWeight: isSelected ? 500 : 400,
                    background: isSelected 
                      ? `linear-gradient(135deg, ${asset.color}15 0%, ${asset.color}08 100%)`
                      : 'rgba(255,255,255,0.015)',
                    border: '1px solid',
                    borderColor: isSelected ? asset.color + '40' : 'rgba(255,255,255,0.05)',
                    borderRadius: '6px',
                    color: isSelected ? '#fff' : 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isSelected ? asset.color : 'rgba(255,255,255,0.15)'
                  }} />
                  <span>{asset.name}</span>
                  {isSelected && metric && (
                    <span style={{
                      fontSize: '11px',
                      fontFamily: "'JetBrains Mono', monospace",
                      color: metric.positive ? '#4ade80' : '#f87171'
                    }}>
                      {metric.positive ? '+' : ''}{metric.change}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Chart */}
        <div style={{
          background: 'rgba(255,255,255,0.01)',
          border: '1px solid rgba(255,255,255,0.04)',
          borderRadius: '10px',
          padding: '24px',
          marginBottom: '32px'
        }}>
          <div style={{ height: '460px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 16, right: 24, left: 8, bottom: 16 }}>
                <XAxis 
                  dataKey="date" 
                  axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                  tickFormatter={(val) => val?.split('-')[0]}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis 
                  scale={logScale ? 'log' : 'auto'}
                  domain={logScale ? ['auto', 'auto'] : indexed ? [0, 'auto'] : ['auto', 'auto']}
                  axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
                  tickFormatter={formatYAxis}
                  width={65}
                />
                <Tooltip content={<CustomTooltip />} />
                
                {indexed && <ReferenceLine y={100} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />}
                
                {selectedAssets.map(asset => (
                  <Line
                    key={asset}
                    type="monotone"
                    dataKey={asset}
                    stroke={ASSETS[asset].color}
                    strokeWidth={hoveredAsset === asset ? 2.5 : 1.8}
                    dot={false}
                    connectNulls
                    opacity={hoveredAsset && hoveredAsset !== asset ? 0.2 : 1}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Data Sources */}
        <div style={{
          background: 'rgba(255,255,255,0.01)',
          border: '1px solid rgba(255,255,255,0.04)',
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '32px'
        }}>
          <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', marginBottom: '10px' }}>
            Data Sources
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
            {Object.entries(sources).map(([key, source]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: source === 'unavailable' ? '#f87171' : '#4ade80' }}>
                  {source === 'unavailable' ? '○' : '●'}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{key}:</span>
                <span>{source}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Explainer Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '40px' }}>
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px', padding: '18px 20px' }}>
            <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#d4af37', marginBottom: '8px' }}>vs Gold</div>
            <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
              Price in gold ounces. Reveals whether assets preserve purchasing power or just ride dollar debasement.
            </p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px', padding: '18px 20px' }}>
            <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#60a5fa', marginBottom: '8px' }}>vs Houses</div>
            <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
              Relative to Case-Shiller Index. Shows performance against the primary store of American wealth.
            </p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px', padding: '18px 20px' }}>
            <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a78bfa', marginBottom: '8px' }}>PCE Adjusted</div>
            <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
              Fed's preferred inflation measure. Real returns after adjusting for official purchasing power erosion.
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer style={{
          borderTop: '1px solid rgba(255,255,255,0.04)',
          paddingTop: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: 'rgba(255,255,255,0.2)',
          fontSize: '11px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            Market data from Yahoo Finance. PCE & Case-Shiller from FRED. 
            Mag7 = equal-weight AAPL, MSFT, GOOG, AMZN, NVDA, META, TSLA.
            Uranium = URA ETF.
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace" }}>v4.0 Live</div>
        </footer>
      </main>
    </div>
  );
}
