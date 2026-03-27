import { chromium } from 'playwright';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATA_FILE = path.join(process.cwd(), 'src', 'data', 'deals.json');
const AMAZON_TAG = 'blogotron-20';

async function run() {
  console.log("Starting Blogotron Scraper...");
  
  if (!GEMINI_API_KEY) {
    console.warn("⚠️ No GEMINI_API_KEY found. Skipping AI generation.");
  }
  
  let ai;
  if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Loading Slickdeals frontpage...");
  await page.goto('https://slickdeals.net/deals/frontpage/', { waitUntil: 'domcontentloaded' });
  
  // Basic scraping for deal items
  const dealElements = await page.$$('.bp-p-dealCard');
  console.log(`Found ${dealElements.length} deals.`);
  
  const rawDeals = [];
  
  for (let i = 0; i < Math.min(dealElements.length, 15); i++) {
    try {
      const el = dealElements[i];
      const titleEl = await el.$('.bp-c-card_title');
      const title = titleEl ? await titleEl.innerText() : '';
      
      const priceEl = await el.$('.bp-p-dealCard_price');
      const price = priceEl ? await priceEl.innerText() : '';
      
      const heatEl = await el.$('.bp-p-dealCard_score');
      const heat = heatEl ? parseInt((await heatEl.innerText()).replace(/[^0-9]/g, ''), 10) : 0;
      
      const linkEl = await el.$('.bp-c-button--deal-clickout');
      let linkUrl = linkEl ? await linkEl.getAttribute('href') : '';
      
      // We only care about Amazon deals!
      let isAmazon = false;
      if (linkUrl && linkUrl.includes('amazon') || title.toLowerCase().includes('amazon')) {
         isAmazon = true;
      }
      
      if (isAmazon && title && price) {
        rawDeals.push({ title, price, heat, rawLink: linkUrl });
      }
    } catch (e) {
      console.log(`Error parsing deal card ${i}: ${e.message}`);
    }
  }

  console.log(`Filtered down to ${rawDeals.length} Amazon deals.`);
  
  // Load existing deals to prevent duplicates
  let existingDeals = [];
  if (fs.existsSync(DATA_FILE)) {
    existingDeals = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  const existingTitles = existingDeals.map(d => d.title);
  
  let newDealsToAdd = [];

  for (const deal of rawDeals) {
    if (existingTitles.includes(deal.title)) {
      console.log(`Skipping duplicate: ${deal.title}`);
      continue;
    }
    
    // Attempt to follow link to get final URL
    let finalUrl = deal.rawLink;
    if (finalUrl && finalUrl.startsWith('/')) finalUrl = 'https://slickdeals.net' + finalUrl;
    
    console.log(`Analyzing: ${deal.title} (${deal.price})`);
    
    let content = `<p>Premium Amazon deal alert for ${deal.title}. At ${deal.price}, this is a solid buy based on community sentiment.</p>`;
    let isApproved = true;

    if (ai) {
      try {
        const sentimentPrompt = `You are a Deals Analyst. Determine if this Amazon deal is worth writing about.
Deal: ${deal.title}
Price: ${deal.price}
Heat Score: ${deal.heat}

Return ONLY: [APPROVE] or [REJECT] followed by a single sentence explaining why.
Reject low-grade off-brand items. Approve name-brand tech, electronics, PC parts, or high-end home goods.`;

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

Return raw HTML only (no markdown code blocks, just pure h2 and p tags). Keep it under 250 words.`;

          const contentResponse = await ai.models.generateContent({
             model: 'gemini-2.5-pro',
             contents: contentPrompt,
          });
          
          let html = contentResponse.text || content;
          html = html.replace(/```html/g, '').replace(/```/g, '').trim();
          content = html;
        }
      } catch (err) {
        console.error(`AI API Error: ${err.message}`);
      }
    }

    if (isApproved) {
      // Clean up Amazon URL and add affiliate tag (blogotron-20)
      // Note: Full URL resolution would require actually clicking through redirect chains,
      // Here we assume it's recognizable or just append it.
      // If we can't extract ASIN easily, we append ?tag=blogotron-20 
      let affiliateUrl = finalUrl;
      if (finalUrl && finalUrl.includes('amazon.')) {
         let urlObj = new URL(finalUrl);
         urlObj.searchParams.set('tag', AMAZON_TAG);
         affiliateUrl = urlObj.toString();
      }

      newDealsToAdd.push({
        deal_id: 'deal-' + Date.now() + '-' + Math.floor(Math.random()*1000),
        title: deal.title,
        price: deal.price,
        heat_score: deal.heat,
        link: affiliateUrl,
        content: content,
        posted_at: new Date().toISOString()
      });
    }
    
    // Rate limit delay to avoid ban
    await new Promise(r => setTimeout(r, 2000));
  }

  await browser.close();
  
  if (newDealsToAdd.length > 0) {
    const combined = [...existingDeals, ...newDealsToAdd];
    fs.writeFileSync(DATA_FILE, JSON.stringify(combined, null, 2));
    console.log(`Successfully added ${newDealsToAdd.length} new Amazon deals to the site!`);
  } else {
    console.log("No new deals to add this run.");
  }
}

run().catch(console.error);
