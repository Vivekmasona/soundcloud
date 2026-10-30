const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Audius Public Discovery Node (Open Music Index)
const AUDIUS_NODE = 'https://discoveryprovider.audius.co';

// Search endpoint (SoundCloud jaisa index search)
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: "Query parameter 'q' is required (e.g. /api/search?q=lofi)"
    });
  }

  try {
    // Audius tracks search API call
    const response = await axios.get(`${AUDIUS_NODE}/v1/tracks/search`, {
      params: {
        query: query,
        limit: limit
      }
    });

    const tracks = response.data.data;

    if (!tracks || tracks.length === 0) {
      return res.json({ success: true, count: 0, tracks: [] });
    }

    // Format data into your required clean JSON structure
    const formattedTracks = tracks.map(track => {
      // Direct stream CDN URL
      const cdnUrl = `${AUDIUS_NODE}/v1/tracks/${track.id}/stream`;
      
      // Best artwork/thumbnail selection
      const artwork = track.artwork ? (track.artwork['480x480'] || track.artwork['150x150'] || null) : null;

      return {
        id: track.id,
        title: track.title,
        artist: track.user ? track.user.name : "Unknown Artist",
        duration: track.duration || 0, // Seconds mein duration
        thumbnail: artwork,
        cdn_url: cdnUrl
      };
    });

    res.json({
      success: true,
      count: formattedTracks.length,
      tracks: formattedTracks
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch music from Audius index",
      details: err.message
    });
  }
});

app.get('/', (req, res) => {
  res.json({ status: "Audius Music Index API is running smoothly!" });
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
