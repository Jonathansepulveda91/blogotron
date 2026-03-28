import Parser from 'rss-parser';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const parser = new Parser();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATA_FILE = path.join(process.cwd(), 'src', 'data', 'deals.json');
const AMAZON_TAG = 'blogotron-20';

async function run() {
  console.log("Starting Blogotron RSS Scraper...");
  
  if (!GEMINI_API_KEY) {
    console.warn("⚠️ No GEMINI_API_KEY found. Skipping AI generation.");
  }
  
  let ai;
  if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }

  console.log("Fetching Slickdeals RSS...");
  const feed = await parser.parseURL('https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1');
  console.log(`Found ${feed.items.length} top deals in RSS.`);

  const rawDeals = [];
  for (const item of feed.items) {
    const title = item.title || '';
    const link = item.link || '';
    const content = item.contentSnippet || item.content || '';
    
    // Attempt to extract price from title (e.g. "... $12.99 ...")
    const priceMatch = title.match(/\$[0-9]+(\.[0-9]{2})?/);
    const price = priceMatch ? priceMatch[0] : 'See Price';

    // Must be Amazon related
    if (title.toLowerCase().includes('amazon') || content.toLowerCase().includes('amazon')) {
      rawDeals.push({
        title,
        price,
        heat: 100, // RSS doesn't give exact heat, just top deals
        rawLink: link
      });
    }
  }

  console.log(`Filtered down to ${rawDeals.length} Amazon deals.`);
  
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

  // Limit to 5 per run to avoid spamming the site layout or API limits during testing
  const toProcess = rawDeals.slice(0, 5);

  for (const deal of toProcess) {
    if (existingTitles.includes(deal.title)) {
      console.log(`Skipping duplicate: ${deal.title}`);
      continue;
    }
    
    console.log(`Analyzing: ${deal.title} (${deal.price})`);
    
    let postBody = `<h2>The Deal</h2><p>Premium Amazon deal alert for ${deal.title}. At ${deal.price}, this is a solid buy based on community sentiment.</p>`;
    let isApproved = true;

    if (ai) {
      try {
        const sentimentPrompt = `You are a Deals Analyst. Determine if this Amazon deal is worth writing about.
Deal: ${deal.title}
Price: ${deal.price}

Return ONLY: [APPROVE] or [REJECT] followed by a single sentence explaining why.
Reject low-grade off-brand items. Approve name-brand tech, electronics, PC parts, household, or high-quality goods. If unsure, default to APPROVE.`;

        const gateResponse = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: sentimentPrompt,
        });
        
        const gateText = gateResponse.text || '';
        if (gateText.includes('[REJECT]')) {
          console.log(`❌ AI Rejected: ${gateText}`);
          isApproved = false;
        } else {
          console.log(`✅ AI Approved: ${gateText}`);
          
          const contentPrompt = `You are a deals editor at a PC hardware and tech publication (like Tom's Hardware). Write a dramatic, urgent advertorial post for this deal.
Deal: ${deal.title}
Price: ${deal.price}

Structure:
<h2>The Market Problem</h2> (why prices are high right now for this category)
<h2>The Deal</h2> (specs, value, what makes it good)
<h2>Should You Buy It?</h2> (Urgent closing verdict)

Return raw HTML only (no markdown code blocks, just pure h2 and p tags). Keep it under 200 words.`;

          const contentResponse = await ai.models.generateContent({
             model: 'gemini-2.5-pro',
             contents: contentPrompt,
          });
          
          let html = contentResponse.text || postBody;
          html = html.replace(/```html/g, '').replace(/```/g, '').trim();
          postBody = html;
        }
      } catch (err) {
        console.error(`AI API Error: ${err.message}`);
      }
    }

    if (isApproved) {
      // Basic affiliate injection
      let affiliateUrl = deal.rawLink;
      if (deal.title.toLowerCase().includes('amazon')) {
          affiliateUrl = deal.rawLink + '?tag=' + AMAZON_TAG; 
      }

      newDealsToAdd.push({
        deal_id: 'deal-' + Date.now() + '-' + Math.floor(Math.random()*1000),
        title: deal.title,
        price: deal.price,
        heat_score: deal.heat,
        link: affiliateUrl,
        content: postBody,
        posted_at: new Date().toISOString()
      });
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }

  if (newDealsToAdd.length > 0) {
    // Add real data, filter out mock-001 if present
    existingDeals = existingDeals.filter(d => d.deal_id !== "mock-001");
    const combined = [...existingDeals, ...newDealsToAdd];
    fs.writeFileSync(DATA_FILE, JSON.stringify(combined, null, 2));
    console.log(`Successfully added ${newDealsToAdd.length} new Amazon deals to the site!`);
  } else {
    console.log("No new deals to add this run.");
  }
}

run().catch(console.error);
