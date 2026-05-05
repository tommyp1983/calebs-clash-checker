const express = require('express');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const ICAL_URL = 'https://icalendar.teamapp.com/clubs/933841/events_subscriptions.ics?id=25592787&secret=BAhJIj1YajVtSFQxQ1NTTzdlNVBGVU9PQ2laMHdHbVhYME9DMjZsdjlRc2hoRnQ0b0o4WVVVS05aSDd6aQY6BkVU--e5f6c04aadd6e20f4135be8112d4639c6673e5dd&team_id=all';

// All known venues [lng, lat] — home + basketball + common soccer grounds
const VENUES = {
  Home:       [115.7530, -31.8318],  // Sorrento WA 6020
  Warwick:    [115.8131, -31.8389],  // Warwick Stadium
  Joondalup:  [115.7628, -31.7456],  // Arena Joondalup
  Morley:     [115.9028, -31.8886],  // Morley Sport & Rec
  Lakeside:   [115.8345, -32.0731],  // Lakeside Recreation Centre
  Willetton:  [115.8701, -32.0444],  // Willetton Basketball Stadium
  Sorrento:   [115.7530, -31.8318],  // Sorrento FC home ground
  Carine:     [115.7900, -31.8550],  // Carine area
};

const VENUE_KEYS = Object.keys(VENUES);

// Fallback matrix (minutes) — used if ORS API is unavailable
// travelMatrix[from][to] = minutes
let travelMatrix = {
  Home:      { Home:0,  Warwick:12, Joondalup:20, Morley:25, Lakeside:38, Willetton:38, Sorrento:5,  Carine:8  },
  Warwick:   { Home:12, Warwick:0,  Joondalup:22, Morley:18, Lakeside:32, Willetton:30, Sorrento:12, Carine:10 },
  Joondalup: { Home:20, Warwick:22, Joondalup:0,  Morley:30, Lakeside:45, Willetton:45, Sorrento:20, Carine:18 },
  Morley:    { Home:25, Warwick:18, Joondalup:30, Morley:0,  Lakeside:35, Willetton:32, Sorrento:25, Carine:22 },
  Lakeside:  { Home:38, Warwick:32, Joondalup:45, Morley:35, Lakeside:0,  Willetton:15, Sorrento:38, Carine:35 },
  Willetton: { Home:38, Warwick:30, Joondalup:45, Morley:32, Lakeside:15, Willetton:0,  Sorrento:35, Carine:32 },
  Sorrento:  { Home:5,  Warwick:12, Joondalup:20, Morley:25, Lakeside:38, Willetton:35, Sorrento:0,  Carine:8  },
  Carine:    { Home:8,  Warwick:10, Joondalup:18, Morley:22, Lakeside:35, Willetton:32, Sorrento:8,  Carine:0  },
};

function orsPost(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.openrouteservice.org',
      path: '/v2/matrix/driving-car',
      method: 'POST',
      headers: {
        'Authorization': process.env.ORS_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

async function fetchTravelMatrix() {
  if (!process.env.ORS_API_KEY) {
    console.log('No ORS_API_KEY — using fallback travel matrix');
    return;
  }

  const coords = VENUE_KEYS.map(k => VENUES[k]);

  try {
    const result = await orsPost({
      locations: coords,
      sources: Array.from({ length: coords.length }, (_, i) => i),
      destinations: Array.from({ length: coords.length }, (_, i) => i),
      metrics: ['duration'],
    });

    if (result.status === 200) {
      const json = JSON.parse(result.body);
      // durations[i][j] = seconds from venue i to venue j
      VENUE_KEYS.forEach((fromKey, i) => {
        VENUE_KEYS.forEach((toKey, j) => {
          travelMatrix[fromKey][toKey] = Math.ceil(json.durations[i][j] / 60);
        });
      });
      console.log('✅ ORS travel matrix loaded');
    } else {
      console.warn('ORS error:', result.status, result.body.slice(0, 200));
    }
  } catch (err) {
    console.warn('ORS failed, using fallback matrix:', err.message);
  }
}

// Match a venue string to a key in our matrix
function matchVenue(venueStr) {
  if (!venueStr) return null;
  const lower = venueStr.toLowerCase();
  for (const key of VENUE_KEYS) {
    if (lower.includes(key.toLowerCase())) return key;
  }
  return null;
}

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'caleb-clash-checker (2).html'));
});

app.get('/soccer', (req, res) => {
  https.get(ICAL_URL, (upstream) => {
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    upstream.pipe(res);
  }).on('error', (err) => {
    console.error('Failed to fetch iCal:', err.message);
    res.status(502).send('Failed to fetch soccer schedule');
  });
});

// Returns full venue-to-venue matrix so the frontend can look up any pair
app.get('/travel-times', (req, res) => {
  res.json(travelMatrix);
});

fetchTravelMatrix();

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
