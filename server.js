const express = require('express');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const ICAL_URL = 'https://icalendar.teamapp.com/clubs/933841/events_subscriptions.ics?id=25592787&secret=BAhJIj1YajVtSFQxQ1NTTzdlNVBGVU9PQ2laMHdHbVhYME9DMjZsdjlRc2hoRnQ0b0o4WVVVS05aSDd6aQY6BkVU--e5f6c04aadd6e20f4135be8112d4639c6673e5dd&team_id=all';

// Home origin — Sorrento WA 6020 [lng, lat]
const HOME = [115.7530, -31.8318];

// All venues that need drive times calculated [lng, lat]
const VENUES = {
  'Warwick':    [115.8131, -31.8389],
  'Joondalup':  [115.7628, -31.7456],
  'Morley':     [115.9028, -31.8886],
  'Lakeside':   [115.8345, -32.0731],
  'Willetton':  [115.8701, -32.0444],
  'Sorrento':   [115.7530, -31.8318],
  'Carine':     [115.7900, -31.8550],
};

// Cache of drive times (venue key → minutes), seeded with fallbacks
let travelCache = {
  'Warwick':   12, 'Joondalup': 20, 'Morley': 25,
  'Lakeside':  38, 'Willetton': 38, 'Sorrento': 5, 'Carine': 8,
};

function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchTravelTimes() {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    console.log('No ORS_API_KEY set — using fallback travel times');
    return;
  }

  const destinations = Object.values(VENUES);
  const venueKeys = Object.keys(VENUES);
  const body = JSON.stringify({
    locations: [HOME, ...destinations],
    metrics: ['duration'],
    units: 'km',
  });

  try {
    const res = await httpsGet(
      'https://api.openrouteservice.org/v2/matrix/driving-car',
      {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }
    );

    // ORS matrix endpoint requires POST — use a raw request instead
    const result = await new Promise((resolve, reject) => {
      const req = https.request(
        'https://api.openrouteservice.org/v2/matrix/driving-car',
        {
          method: 'POST',
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        }
      );
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body);
      req.end();
    });

    if (result.status === 200) {
      const json = JSON.parse(result.body);
      // Row 0 = from HOME, columns 1..N = to each venue
      const durations = json.durations[0];
      venueKeys.forEach((key, i) => {
        const mins = Math.ceil(durations[i + 1] / 60);
        travelCache[key] = mins;
        console.log(`Travel Sorrento → ${key}: ${mins} min`);
      });
    } else {
      console.warn('ORS API error:', result.status, result.body);
    }
  } catch (err) {
    console.warn('ORS fetch failed, using fallback times:', err.message);
  }
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

// Frontend fetches this to get real drive times
app.get('/travel-times', (req, res) => {
  res.json(travelCache);
});

if (require.main === module) {
  fetchTravelTimes().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  });
}

module.exports = app;
// Kick off travel time fetch for serverless cold starts too
fetchTravelTimes();
