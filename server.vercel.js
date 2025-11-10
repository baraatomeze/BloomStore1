const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend if present
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', platform: 'vercel', timestamp: new Date().toISOString() });
});

// SPA fallback (optional) – comment this out if you don't use a single-page app
app.get(/^(?!\/api).*/, (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  res.sendFile(indexPath, err => {
    if (err) res.status(404).send('Not Found');
  });
});

// Local run only
const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log('Local server running on http://localhost:' + PORT));
}

// Export for Vercel
module.exports = app;
