const express = require('express');
const cors = require('cors');
const { Client } = require('soundcloud-scraper');

const app = express();
const sc = new Client();

app.use(cors());
app.use(express.json());

// Endpoint: Search by Song Name (No strict limits)
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  // Default limit 20 set ki hai, lekin aap ?limit=50 ya ?limit=0 (unlimited ke liye) pass kar sakte hain
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: "Query parameter 'q' is required (e.g. /api/search?q=faded&limit=10)"
    });
  }

  try {
    const searchResults = await sc.search(query, "track");

    if (!searchResults || searchResults.length === 0) {
      return res.json({ success: true, count: 0, tracks: [] });
    }

    // Limit apply karna (agar limit=0 ya -1 ho toh saare results fetch honge)
    const targetResults = (limit <= 0) ? searchResults : searchResults.slice(0, limit);

    const formattedTracks = await Promise.all(
      targetResults.map(async (track) => {
        try {
          const songInfo = await sc.getSongInfo(track.url);
          const streamUrl = await songInfo.downloadProgressive();

          return {
            id: track.id || null,
            title: songInfo.title || track.title,
            duration: Math.floor(songInfo.duration / 1000), // Seconds mein duration
            thumbnail: songInfo.thumbnail ? songInfo.thumbnail.replace('-large', '-t500x500') : null,
            cdn_url: streamUrl || null,
            artist: songInfo.author ? songInfo.author.name : null
          };
        } catch (err) {
          return null;
        }
      })
    );

    const validTracks = formattedTracks.filter(t => t !== null);

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
  res.json({ status: "SoundCloud Search API Active (No Limits)" });
});

// Local testing ke liye
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
