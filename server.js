const express = require('express');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const ICAL_URL = 'https://icalendar.teamapp.com/clubs/933841/events_subscriptions.ics?id=25592787&secret=BAhJIj1YajVtSFQxQ1NTTzdlNVBGVU9PQ2laMHdHbVhYME9DMjZsdjlRc2hoRnQ0b0o4WVVVS05aSDd6aQY6BkVU--e5f6c04aadd6e20f4135be8112d4639c6673e5dd&team_id=all';

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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
