import axios from 'axios';
import { load } from 'cheerio';
import { log } from '../utils/logger.js';

/**
 * Scrapes a public Instagram or LinkedIn profile URL to extract profile data.
 * @param {string} url - The URL of the Instagram or LinkedIn profile.
 * @returns {Promise<{name: string, bio: string, imageUrl: string, posts: string[]}>}
 */
async function scrapeProfile(url) {
  const profileData = { name: '', bio: '', imageUrl: '', posts: [] };

  try {
    // Fetch the profile page HTML
    const res = await axios.get(url, {
      headers: {
        // Set a User-Agent to mimic a normal browser request
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/100'
      }
    });
    const html = res.data;

    if (url.includes('instagram.com')) {
      // Attempt to parse Instagram profile JSON from window._sharedData script
      const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({.*?});<\/script>/);
      if (sharedDataMatch) {
        const jsonString = sharedDataMatch[1];
        const data = JSON.parse(jsonString);
        const user = data.entry_data?.ProfilePage?.[0]?.graphql?.user;
        if (user) {
          profileData.name = user.full_name || '';
          profileData.bio = user.biography || '';
          profileData.imageUrl = user.profile_pic_url_hd || user.profile_pic_url || '';
          // Extract captions of the last few posts (if available)
          const postsEdges = user.edge_owner_to_timeline_media?.edges || [];
          for (const edge of postsEdges.slice(0, 3)) {
            const captionNode = edge.node.edge_media_to_caption?.edges?.[0]?.node;
            if (captionNode && captionNode.text) {
              const text = captionNode.text;
              // Take first ~100 characters of caption as a sample
              const snippet = text.length > 100 ? text.substring(0, 100) + '...' : text;
              profileData.posts.push(snippet);
            }
          }
        }
      } else {
        // Fallback: use cheerio to extract basic info if JSON not found (this may be limited)
        const $ = load(html);
        profileData.name = $('h1').first().text().trim();
        profileData.bio = $('meta[property="og:description"]').attr('content') || '';
        profileData.imageUrl = $('meta[property="og:image"]').attr('content') || '';
      }
    } else if (url.includes('linkedin.com')) {
      // Load LinkedIn profile HTML into cheerio
      const $ = load(html);
      // Attempt to get name and headline from public profile
      let fullName = $('h1').first().text().trim();
      if (!fullName) {
        // Fallback to <title> parsing if h1 not accessible
        fullName = ($('title').text() || '').split('|')[0].trim();
      }
      let headline = $('h2').first().text().trim();
      if (!headline) {
        // Public profile might have headline in the meta description
        headline = $('meta[name="description"]').attr('content') || '';
      }
      const imageUrl = $('meta[property="og:image"]').attr('content') || '';
      profileData.name = fullName;
      profileData.bio = headline;
      profileData.imageUrl = imageUrl;
    }
  } catch (err) {
    log('Error scraping profile:', err.message || err);
    // In case of error, return whatever was gathered (possibly empty fields)
  }

  return profileData;
}

export default { scrapeProfile };
