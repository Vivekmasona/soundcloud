const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// SoundCloud Public v2 API Client ID (stable public key)
const SC_CLIENT_ID = 'i1DEw9QY1gU8aR5L5hJ0L0eB5tV8Z6F1'; 

// Search endpoint for Hindi, Bhojpuri, & all regional songs
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: "Query parameter 'q' is required (e.g. /api/search?q=bhojpuri hit song)"
    });
  }

  try {
    // 1. SoundCloud v2 Search API call
    const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${SC_CLIENT_ID}&limit=${limit}`;
    const searchResponse = await axios.get(searchUrl);

    const tracks = searchResponse.data.collection;

    if (!tracks || tracks.length === 0) {
      return res.json({ success: true, count: 0, tracks: [] });
    }

    // 2. Format tracks and extract streaming URLs
    const formattedTracks = await Promise.all(
      tracks.map(async (track) => {
        try {
          // Track ka stream URL nikalne ke liye media transcodings check karein
          const transcodings = track.media?.transcodings || [];
          const progressiveStream = transcodings.find(t => t.format.protocol === 'progressive');

          let cdnUrl = null;
          if (progressiveStream && progressiveStream.url) {
            // Stream URL ko actual playable mp3 link mein convert karna
            const streamRes = await axios.get(`${progressiveStream.url}?client_id=${SC_CLIENT_ID}`);
            cdnUrl = streamRes.data.url;
          }

          // Thumbnail size upgrade (-large to t500x500)
          let thumbnail = track.artwork_url || track.user?.avatar_url || null;
          if (thumbnail) {
            thumbnail = thumbnail.replace('-large', '-t500x500');
          }

          return {
            id: track.id,
            title: track.title,
            artist: track.user?.username || "Unknown Artist",
            duration: track.duration ? Math.floor(track.duration / 1000) : 0, // Seconds mein
            thumbnail: thumbnail,
            cdn_url: cdnUrl
          };
        } catch (err) {
          return null; // Agar koi track fail ho toh skip kar do
        }
      })
    );

    const validTracks = formattedTracks.filter(t => t !== null && t.cdn_url !== null);

    res.json({
      success: true,
      count: validTracks.length,
      tracks: validTracks
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to search SoundCloud",
      details: err.message
    });
  }
});

app.get('/', (req, res) => {
  res.json({ status: "SoundCloud Hindi/Bhojpuri Search API Active!" });
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
