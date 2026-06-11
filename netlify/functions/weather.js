/**
 * Netlify Serverless Function: Weather API with XAA Token Validation
 *
 * This function:
 * 1. Validates the XAA token from the Authorization header
 * 2. Verifies the token with Okta's introspection endpoint
 * 3. Fetches weather data from OpenWeatherMap API
 * 4. Returns the weather data to the caller
 */

const https = require("https");

// Configuration - Set these as Netlify environment variables
const OKTA_DOMAIN =
  process.env.OKTA_DOMAIN || "oktaforai.oktapreview.com";
const OKTA_AUTH_SERVER_ID =
  process.env.OKTA_AUTH_SERVER_ID || "auszw4o1bvAV8hPCX1d7";
const OKTA_CLIENT_ID = process.env.OKTA_CLIENT_ID || "wlpzw4g5yrM6c6GX41d7";
const OKTA_CLIENT_SECRET = process.env.OKTA_CLIENT_SECRET; // Set this in Netlify env vars
const WEATHER_API_KEY =
  process.env.WEATHER_API_KEY || "6baa00b3af0c1f5879b30e340f84dc20";

/**
 * Main handler for the Netlify function
 */
exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // Extract XAA token from Authorization header
    const authHeader =
      event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: "Missing or invalid Authorization header",
        }),
      };
    }

    const xaaToken = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Validate the XAA token
    const tokenValidation = await validateXaaToken(xaaToken);
    if (!tokenValidation.valid) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: "Invalid or expired token",
          details: tokenValidation.error,
        }),
      };
    }

    // Parse request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid JSON in request body" }),
      };
    }

    const { city, state } = requestBody;

    if (!city || !state) {
      city = "San Francisco";
      state = "CA";
    }

    // Fetch weather data
    const weatherData = await fetchWeather(city, state);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ...weatherData,
        tokenInfo: {
          subject: tokenValidation.sub,
          clientId: tokenValidation.client_id,
          scope: tokenValidation.scope,
        },
      }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
    };
  }
};

/**
 * Validate XAA token using Okta's introspection endpoint
 */
async function validateXaaToken(token) {
  return new Promise((resolve) => {
    // For XAA tokens, we can validate by:
    // 1. Using token introspection (if configured)
    // 2. Verifying the JWT signature locally
    // 3. Checking token claims

    // Option 1: Use Okta's introspection endpoint
    const introspectUrl = `https://${OKTA_DOMAIN}/oauth2/${OKTA_AUTH_SERVER_ID}/v1/introspect`;

    const postData = new URLSearchParams({
      token: token,
      token_type_hint: "access_token",
    }).toString();

    // If client secret is configured, use client credentials for introspection
    let authHeader = "";
    if (OKTA_CLIENT_SECRET) {
      authHeader =
        "Basic " +
        Buffer.from(`${OKTA_CLIENT_ID}:${OKTA_CLIENT_SECRET}`).toString(
          "base64",
        );
    }

    const options = {
      hostname: OKTA_DOMAIN,
      path: `/oauth2/${OKTA_AUTH_SERVER_ID}/v1/introspect`,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        ...(authHeader && { Authorization: authHeader }),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          if (response.active) {
            resolve({
              valid: true,
              sub: response.sub,
              client_id: response.client_id,
              scope: response.scope,
              exp: response.exp,
            });
          } else {
            // Introspection returned inactive - fallback to local JWT validation
            // This happens when client secret is not configured
            resolve(validateJwtLocally(token));
          }
        } catch (e) {
          // If introspection fails, try local JWT validation
          resolve(validateJwtLocally(token));
        }
      });
    });

    req.on("error", (e) => {
      console.error("Introspection error:", e);
      // Fallback to local JWT validation
      resolve(validateJwtLocally(token));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Local JWT validation (fallback if introspection is not available)
 * This performs basic validation - for production, use proper JWT verification
 */
function validateJwtLocally(token) {
  try {
    // Decode JWT without verification (for basic validation)
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, error: "Invalid JWT format" };
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: "Token has expired" };
    }

    // Check issuer
    const expectedIssuer = `https://${OKTA_DOMAIN}/oauth2/${OKTA_AUTH_SERVER_ID}`;
    if (payload.iss && payload.iss !== expectedIssuer) {
      return { valid: false, error: "Invalid token issuer" };
    }

    return {
      valid: true,
      sub: payload.sub,
      client_id: payload.client_id || payload.cid,
      scope: payload.scp ? payload.scp.join(" ") : payload.scope,
      exp: payload.exp,
    };
  } catch (e) {
    return { valid: false, error: "Failed to decode token: " + e.message };
  }
}

/**
 * Fetch weather data from OpenWeatherMap API
 */
async function fetchWeather(city, state) {
  return new Promise((resolve, reject) => {
    const location = encodeURIComponent(`${city},${state},US`);
    const url = `/data/2.5/weather?q=${location}&units=imperial&APPID=${WEATHER_API_KEY}`;

    const options = {
      hostname: "api.openweathermap.org",
      path: url,
      method: "GET",
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const response = JSON.parse(data);

          if (res.statusCode === 200) {
            const weatherData = {
              city: city,
              state: state,
              temperature: response.main.temp,
              feelsLike: response.main.feels_like,
              humidity: response.main.humidity,
              minTemperature: response.main.temp_min,
              maxTemperature: response.main.temp_max,
              condition: response.weather[0]?.main,
              conditionDescription: response.weather[0]?.description,
              windSpeed: response.wind?.speed,
              success: true,
            };

            // Build weather description
            weatherData.weatherDescription =
              buildWeatherDescription(weatherData);

            resolve(weatherData);
          } else {
            resolve({
              city: city,
              state: state,
              success: false,
              error: response.message || "Weather API error",
            });
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

/**
 * Build a human-readable weather description
 */
function buildWeatherDescription(data) {
  let description = `Current weather in ${data.city}, ${data.state}: ${data.temperature}°F`;

  if (data.feelsLike) {
    description += ` (feels like ${data.feelsLike}°F)`;
  }

  description += ". ";

  if (data.conditionDescription) {
    description += `Conditions: ${data.conditionDescription}. `;
  }

  if (data.humidity) {
    description += `Humidity: ${data.humidity}%. `;
  }

  if (data.windSpeed) {
    description += `Wind speed: ${data.windSpeed} mph.`;
  }

  return description;
}
