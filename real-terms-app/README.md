# Real Terms Dashboard

A live dashboard showing asset performance in real terms—priced in gold, housing, and PCE-adjusted dollars.

![Dashboard Preview](preview.png)

## Assets Tracked

- **S&P 500** - Broad US market
- **Mag 7** - Equal-weight index of Apple, Microsoft, Google, Amazon, NVIDIA, Meta, Tesla
- **Bitcoin** - BTC-USD
- **Gold** - Gold futures (GC=F)
- **Silver** - Silver futures (SI=F)
- **Uranium** - URA ETF

## Denominators

- **vs Gold** - Price in gold ounces
- **vs Houses** - Relative to Case-Shiller National Home Price Index
- **PCE Adjusted** - Inflation-adjusted using PCE Price Index
- **Nominal USD** - Raw dollar price

## Data Sources

| Data | Source | Cost |
|------|--------|------|
| Stocks, ETFs, Crypto | Yahoo Finance | Free |
| Gold & Silver Futures | Yahoo Finance | Free |
| PCE Price Index | FRED API | Free |
| Case-Shiller Index | FRED API | Free |

## Setup Instructions

### 1. Get a FRED API Key (Free)

1. Go to [https://fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html)
2. Click "Request API Key"
3. Create an account or sign in
4. Your API key will be displayed

### 2. Clone and Install

```bash
git clone <your-repo>
cd real-terms-app
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your FRED API key:

```
FRED_API_KEY=your_actual_key_here
```

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel (Free)

### Option 1: One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/real-terms-dashboard&env=FRED_API_KEY&envDescription=Get%20your%20free%20FRED%20API%20key%20at%20fred.stlouisfed.org)

### Option 2: Manual Deploy

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repository
4. Add environment variable: `FRED_API_KEY`
5. Deploy

## Deploy to Netlify (Free)

1. Push code to GitHub
2. Go to [netlify.com](https://netlify.com)
3. "Add new site" → "Import an existing project"
4. Connect your repository
5. Build settings:
   - Build command: `npm run build`
   - Publish directory: `.next`
6. Add environment variable: `FRED_API_KEY`
7. Deploy

## How It Works

### Data Flow

```
Browser → /api/data → Yahoo Finance API → Stock/Crypto prices
                    → FRED API → PCE, Case-Shiller
                    ↓
              Merge & Calculate Mag7
                    ↓
              Return JSON to frontend
```

### Mag7 Calculation

The Mag7 index is calculated as an equal-weight composite:

```javascript
// For each date, calculate average return vs base period
totalReturn = (AAPL/baseAAPL + MSFT/baseMSFT + ... + TSLA/baseTSLA) / 7
mag7Value = totalReturn * 100  // Indexed to 100
```

### Denominator Transformations

- **vs Gold**: `assetPrice / goldPrice`
- **vs Houses**: `(assetPrice / caseShillerIndex) * 100`
- **PCE Adjusted**: `assetPrice * (latestPCE / periodPCE)`

## Customization

### Add New Assets

Edit `app/api/data/route.js`:

```javascript
const YAHOO_SYMBOLS = {
  // Add your symbol
  AAPL: 'AAPL',
  // ...
};
```

### Change Colors

Edit `app/page.js`:

```javascript
const ASSETS = {
  SPX: { name: 'S&P 500', color: '#3b82f6' },
  // Change colors here
};
```

## Rate Limits

- **Yahoo Finance**: ~2000 requests/hour (unofficial, be respectful)
- **FRED API**: 120 requests/minute

The app caches data for 24 hours to stay well within limits.

## License

MIT

## Credits

- Market data: [Yahoo Finance](https://finance.yahoo.com)
- Economic data: [FRED](https://fred.stlouisfed.org) (Federal Reserve Bank of St. Louis)
- Built with [Next.js](https://nextjs.org) and [Recharts](https://recharts.org)
