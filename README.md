# XAA Weather API - Netlify Deployment

A serverless weather API protected by Okta XAA (eXternal Agent Access) token authentication.

## Overview

This Netlify function:
1. Receives requests with XAA token in the Authorization header
2. Validates the token against Okta's introspection endpoint
3. Fetches weather data from OpenWeatherMap API
4. Returns the weather data if the token is valid

## Project Structure

```
netlify-weather-api/
├── netlify/
│   └── functions/
│       └── weather.js      # Serverless function
├── public/
│   └── index.html          # API documentation page
├── netlify.toml            # Netlify configuration
├── package.json            # Node.js dependencies
└── README.md               # This file
```

## Deployment Instructions

### Prerequisites

1. A Netlify account (free tier works)
2. Netlify CLI installed (optional, for CLI deployment)
3. Git installed

### Option 1: Deploy via Netlify UI (Recommended)

1. **Push to GitHub**
   ```bash
   cd netlify-weather-api
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR-USERNAME/xaa-weather-api.git
   git push -u origin main
   ```

2. **Connect to Netlify**
   - Go to [app.netlify.com](https://app.netlify.com)
   - Click "Add new site" > "Import an existing project"
   - Select your GitHub repository
   - Configure build settings (should auto-detect from netlify.toml)
   - Click "Deploy site"

3. **Configure Environment Variables**
   - Go to Site Settings > Environment Variables
   - Add the following variables:

   | Variable | Value | Required |
   |----------|-------|----------|
   | `OKTA_DOMAIN` | `bala-secures-ai.oktapreview.com` | Yes |
   | `OKTA_AUTH_SERVER_ID` | `ausxz4fe1zFC3wYBU1d7` | Yes |
   | `OKTA_CLIENT_ID` | `wlpyvb6ikeAjKuy4L1d7` | Yes |
   | `OKTA_CLIENT_SECRET` | Your client secret | Optional* |
   | `WEATHER_API_KEY` | `79bfe8c8457f902007e552c4938f930a` | Yes |

   *Client secret is needed for token introspection. Without it, the function falls back to local JWT validation.

4. **Trigger Redeploy**
   - Go to Deploys > Trigger deploy > Deploy site

### Option 2: Deploy via Netlify CLI

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**
   ```bash
   netlify login
   ```

3. **Initialize and Deploy**
   ```bash
   cd netlify-weather-api
   npm install
   netlify init
   netlify deploy --prod
   ```

4. **Set Environment Variables**
   ```bash
   netlify env:set OKTA_DOMAIN "bala-secures-ai.oktapreview.com"
   netlify env:set OKTA_AUTH_SERVER_ID "ausxz4fe1zFC3wYBU1d7"
   netlify env:set OKTA_CLIENT_ID "wlpyvb6ikeAjKuy4L1d7"
   netlify env:set WEATHER_API_KEY "79bfe8c8457f902007e552c4938f930a"
   ```

### Option 3: One-Click Deploy

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/YOUR-USERNAME/xaa-weather-api)

## Testing the API

### Using curl

```bash
# Replace YOUR-SITE with your Netlify site name
# Replace YOUR-XAA-TOKEN with a valid XAA token

curl -X POST https://YOUR-SITE.netlify.app/.netlify/functions/weather \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR-XAA-TOKEN" \
  -d '{"city": "San Francisco", "state": "CA"}'
```

### Using Postman

1. Create a new POST request
2. URL: `https://YOUR-SITE.netlify.app/.netlify/functions/weather`
3. Headers:
   - `Content-Type: application/json`
   - `Authorization: Bearer YOUR-XAA-TOKEN`
4. Body (raw JSON):
   ```json
   {
     "city": "San Francisco",
     "state": "CA"
   }
   ```

### Expected Response

```json
{
  "city": "San Francisco",
  "state": "CA",
  "temperature": 65.5,
  "feelsLike": 63.2,
  "humidity": 72,
  "minTemperature": 62.1,
  "maxTemperature": 68.9,
  "condition": "Clouds",
  "conditionDescription": "scattered clouds",
  "windSpeed": 12.5,
  "weatherDescription": "Current weather in San Francisco, CA: 65.5°F (feels like 63.2°F). Conditions: scattered clouds. Humidity: 72%. Wind speed: 12.5 mph.",
  "success": true,
  "tokenInfo": {
    "subject": "00uw25t4pqnHgHldK1d7",
    "clientId": "wlpyvb6ikeAjKuy4L1d7",
    "scope": "mcp:read mcp:write"
  }
}
```

## Update Salesforce Apex Class

After deployment, update the `NETLIFY_WEATHER_API` constant in `XAACheckWeather.apex`:

```apex
private static final String NETLIFY_WEATHER_API = 'https://YOUR-SITE.netlify.app/.netlify/functions/weather';
```

Also add the Netlify domain to Salesforce Remote Site Settings:
1. Setup > Remote Site Settings > New
2. Name: `Netlify_Weather_API`
3. URL: `https://YOUR-SITE.netlify.app`

## Local Development

```bash
cd netlify-weather-api
npm install
npm run dev
```

This starts a local server at `http://localhost:8888`.

## Troubleshooting

### 401 Unauthorized
- Verify the XAA token is valid and not expired
- Check that the Authorization header format is correct: `Bearer <token>`
- Ensure environment variables are set correctly in Netlify

### 500 Internal Server Error
- Check Netlify function logs: Site > Functions > weather > View logs
- Verify WEATHER_API_KEY is set correctly

### CORS Errors
- The function includes CORS headers for all origins
- For production, consider restricting to specific domains

## Security Considerations

1. **Token Introspection**: For production, enable client credentials by setting `OKTA_CLIENT_SECRET`
2. **Rate Limiting**: Consider adding rate limiting for production use
3. **CORS**: Restrict allowed origins in production
4. **Logging**: Be careful not to log sensitive token information
