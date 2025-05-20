import axios from 'axios';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const WA_AUTH_HEADER = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };

// Fetch image content from WhatsApp API and analyze via OpenAI (GPT-4 Vision)
export async function analyzeImage(mediaId) {
  try {
    // Step 1: Get a temporary URL for the media
    const mediaUrlRes = await axios.get(`https://graph.facebook.com/v17.0/${mediaId}`, { headers: WA_AUTH_HEADER });
    const mediaUrl = mediaUrlRes.data.url;
    // Step 2: Download the image bytes
    const imageRes = await axios.get(mediaUrl, { headers: WA_AUTH_HEADER, responseType: 'arraybuffer' });
    const imageBuffer = imageRes.data;
    const base64Image = imageBuffer.toString('base64');
    // Construct a data URL for the image
    const mimeType = imageRes.headers['content-type'] || 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64Image}`;
    // Step 3: Call OpenAI GPT-4 with image and prompt to analyze profile
    const messages = [
      { role: "user", content: [
          { type: "text", text: "Analise esta imagem de perfil digital e descreva brevemente características e interesses da pessoa:" },
          { type: "image", image: { base64: dataUrl } }
        ]
      }
    ];
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    };
    const body = {
      model: "gpt-4",
      messages: messages,
      temperature: 0.5,
      max_tokens: 500
    };
    const response = await axios.post(OPENAI_API_URL, body, { headers });
    const analysisText = response.data.choices[0].message.content;
    // Return the analysis text (trim to remove any leading/trailing whitespace)
    return analysisText.trim();
  } catch (err) {
    console.error("Vision analysis failed:", err.response?.data || err.message);
    return '';
  }
}
