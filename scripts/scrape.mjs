import Parser from 'rss-parser';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import 'dotenv/config';

const parser = new Parser({
  customFields: {
    item: ['content:encoded'],
  }
});
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATA_FILE = path.join(process.cwd(), 'src', 'data', 'deals.json');
const AMAZON_TAG = 'blogotron-20';

function resolveFinalUrl(url) {
  try {
    // using curl handles redirects robustly exactly like a browser
    const finalUrl = execSync(`curl -s -L -A "Mozilla/5.0" -o /dev/null -w "%{url_effective}" "${url}"`, { encoding: 'utf8', timeout: 10000 });
    return finalUrl.trim();
  } catch (e) {
    console.error("Curl link resolution failed:", e.message);
    return url;
  }
}

async function run() {
  console.log("Starting Blogotron RSS Scraper...");
  
  let ai;
  if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }

  const feed = await parser.parseURL('https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1');
  
  const rawDeals = [];
  for (const item of feed.items) {
    const title = item.title || '';
    const link = item.link || '';
    const rawContent = item['content:encoded'] || item.content || item.contentSnippet || '';
    
    let imageUrl = '';
    const imgMatch = rawContent.match(/<img[^>]+src="([^">]+)"/);
    if (imgMatch && imgMatch[1]) {
      imageUrl = imgMatch[1].replace('/300x300/', '/1200x1200/');
    }

    let cleanDescription = rawContent
      .replace(/<img[^>]*>/g, '') 
      .replace(/<br\s*[\/]?>/gi, '\\n') 
      .replace(/<\/?[^>]+(>|$)/g, "") 
      .replace(/Thumb Score: \+[0-9]+/g, '') 
      .trim();

    const paragraphs = cleanDescription.split('\\n').map(p => p.trim()).filter(p => p.length > 10);
    const bodyText = paragraphs.join('</p><p>');

    const priceMatch = title.match(/\$[0-9]+,[0-9]{3}(\.[0-9]{2})?|\$[0-9]+(\.[0-9]{2})?/);
    const price = priceMatch ? priceMatch[0] : 'See Price';

    let clickUrl = link;
    const hrefs = rawContent.match(/href="([^">]+)"/g) || [];
    for (const h of hrefs) {
      const url = h.replace('href="', '').replace('"', '');
      if (url.includes('click') && url.toLowerCase().includes('amazon')) {
        clickUrl = url;
        break; 
      }
    }

    if (title.toLowerCase().includes('amazon') || rawContent.toLowerCase().includes('amazon')) {
      rawDeals.push({
        title,
        price,
        imageUrl,
        heat: 100,
        rawLink: clickUrl,
        fallbackContent: `<p>${bodyText}</p>`
      });
    }
  }
  
  let existingDeals = [];
  if (fs.existsSync(DATA_FILE)) { existingDeals = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  const existingTitles = existingDeals.map(d => d.title);
  let newDealsToAdd = [];

  const toProcess = rawDeals.slice(0, 8); 

  for (const deal of toProcess) {
    if (existingTitles.includes(deal.title)) {
      // If we already resolved it previously, but it failed, we could retry. 
      // But let's assume it's correctly cached to avoid spamming curl.
      continue;
    }
    
    console.log(`Processing: ${deal.title}`);
    let postBody = `<h2>The Deal Breakdown</h2>${deal.fallbackContent}<h2>Why It's Worth It</h2><p>This Amazon deal was heavily upvoted by the enthusiast community, verifying its price accuracy and value. At <strong>${deal.price}</strong>, stock is likely limited.</p>`;

    // Resolve native Amazon ASIN and clean affiliate tags
    let affiliateUrl = deal.rawLink;
    try {
      let finalUrl = resolveFinalUrl(deal.rawLink);
      if (finalUrl.includes('amazon.') || finalUrl.includes('amzn.to')) {
        const urlObj = new URL(finalUrl);
        urlObj.searchParams.set('tag', AMAZON_TAG);
        urlObj.searchParams.delete('ascsubtag');
        urlObj.searchParams.delete('creative');
        urlObj.searchParams.delete('camp');
        urlObj.searchParams.delete('linkCode');
        urlObj.searchParams.delete('smid');
        affiliateUrl = urlObj.toString();
        console.log(`Resolved Amazon ASIN: ${affiliateUrl}`);
      } else {
        console.log(`Resolved URL was not Amazon: ${finalUrl}`);
        affiliateUrl = finalUrl;
      }
    } catch(e) { console.error("Could not resolve redirect"); }

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
    const combined = [...newDealsToAdd, ...existingDeals].slice(0, 50);
    fs.writeFileSync(DATA_FILE, JSON.stringify(combined, null, 2));
    console.log(`Added ${newDealsToAdd.length} new targeted deals.`);
  } else {
    console.log("No new deals to add.");
  }
}

run().catch(console.error);
