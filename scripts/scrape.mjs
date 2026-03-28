import Parser from 'rss-parser';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const parser = new Parser({
  customFields: {
    item: ['content:encoded'],
  }
});
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATA_FILE = path.join(process.cwd(), 'src', 'data', 'deals.json');
const AMAZON_TAG = 'blogotron-20';

async function run() {
  console.log("Starting Blogotron RSS Scraper...");
  
  if (!GEMINI_API_KEY) {
    console.warn("⚠️ No GEMINI_API_KEY found. Falling back to extracting high-quality human descriptions from Slickdeals.");
  }
  
  let ai;
  if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }

  console.log("Fetching Slickdeals RSS...");
  const feed = await parser.parseURL('https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1');
  
  const rawDeals = [];
  for (const item of feed.items) {
    const title = item.title || '';
    const link = item.link || '';
    const rawContent = item['content:encoded'] || item.content || item.contentSnippet || '';
    
    // Extract Image
    let imageUrl = '';
    const imgMatch = rawContent.match(/<img[^>]+src="([^">]+)"/);
    if (imgMatch && imgMatch[1]) {
      imageUrl = imgMatch[1];
      // Convert 300x300 thumb to larger if possible, otherwise keep thumb
      imageUrl = imageUrl.replace('/300x300/', '/1200x1200/');
    }

    // Extract cleaner text from RSS HTML
    let cleanDescription = rawContent
      .replace(/<img[^>]*>/g, '') // Remove images from text
      .replace(/<br\s*[\/]?>/gi, '\\n') // Convert BR to newlines
      .replace(/<\/?[^>]+(>|$)/g, "") // Strip raw tags
      .replace(/Thumb Score: \+[0-9]+/g, '') // Remove thumb score text
      .trim();

    // Take the first chunk of text as the description
    const paragraphs = cleanDescription.split('\\n').map(p => p.trim()).filter(p => p.length > 10);
    const bodyText = paragraphs.join('</p><p>');

    const priceMatch = title.match(/\$[0-9]+,[0-9]{3}(\.[0-9]{2})?|\$[0-9]+(\.[0-9]{2})?/);
    const price = priceMatch ? priceMatch[0] : 'See Price';

    // Must be Amazon related
    if (title.toLowerCase().includes('amazon') || rawContent.toLowerCase().includes('amazon')) {
      rawDeals.push({
        title,
        price,
        imageUrl,
        heat: 100, // RSS frontpage default
        rawLink: link,
        fallbackContent: `<p>${bodyText}</p>`
      });
    }
  }
  
  let existingDeals = [];
  if (fs.existsSync(DATA_FILE)) {
    try {
      existingDeals = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      existingDeals = [];
    }
  }
  const existingTitles = existingDeals.map(d => d.title);
  let newDealsToAdd = [];

  const toProcess = rawDeals.slice(0, 8); // Top 8 deals

  for (const deal of toProcess) {
    if (existingTitles.includes(deal.title)) {
      continue;
    }
    
    let postBody = `<h2>The Deal Breakdown</h2>${deal.fallbackContent}<h2>Why It's Worth It</h2><p>This Amazon deal was heavily upvoted by the enthusiast community, verifying its price accuracy and value. At <strong>${deal.price}</strong>, stock is likely limited.</p>`;
    
    if (ai) {
      try {
        const contentPrompt = `You are a deals editor at a PC hardware and tech publication (like Tom's Hardware). Write a dramatic, urgent advertorial post for this deal.
Deal: ${deal.title}
Price: ${deal.price}
Details: ${deal.fallbackContent}

Structure:
<h2>The Market Problem</h2> (why prices are high right now for this category)
<h2>The Deal</h2> (specs, value, what makes it good, reference the details)
<h2>Should You Buy It?</h2> (Urgent closing verdict)

Return raw HTML only (no markdown code blocks, just pure h2 and p tags). Keep it under 200 words.`;

        const contentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: contentPrompt,
        });
        
        let html = contentResponse.text || postBody;
        html = html.replace(/```html/g, '').replace(/```/g, '').trim();
        postBody = html;
      } catch (err) {
        console.error(`AI API Error: ${err.message}`);
      }
    }

    let affiliateUrl = deal.rawLink;
    if (deal.title.toLowerCase().includes('amazon')) {
        affiliateUrl = deal.rawLink + (deal.rawLink.includes('?') ? '&' : '?') + 'tag=' + AMAZON_TAG; 
    }

    newDealsToAdd.push({
      deal_id: 'deal-' + Date.now() + '-' + Math.floor(Math.random()*1000),
      title: deal.title,
      price: deal.price,
      heat_score: deal.heat,
      link: affiliateUrl,
      image_url: deal.imageUrl,
      content: postBody,
      posted_at: new Date().toISOString()
    });
    
    await new Promise(r => setTimeout(r, 1000));
  }

  if (newDealsToAdd.length > 0) {
    existingDeals = existingDeals.filter(d => d.deal_id !== "mock-001");
    const combined = [...newDealsToAdd, ...existingDeals].slice(0, 50); // Keep last 50
    fs.writeFileSync(DATA_FILE, JSON.stringify(combined, null, 2));
    console.log(`Successfully added ${newDealsToAdd.length} new Amazon deals!`);
  } else {
    console.log("No new deals to add.");
  }
}

run().catch(console.error);
