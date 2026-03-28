import Parser from 'rss-parser';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { chromium } from 'playwright';
import 'dotenv/config';

const parser = new Parser({
  customFields: { item: ['content:encoded'] }
});
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATA_FILE = path.join(process.cwd(), 'src', 'data', 'deals.json');
const IMAGES_DIR = path.join(process.cwd(), 'public', 'images');
const AMAZON_TAG = 'blogotron-20';

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function resolveFinalUrl(url) {
  try {
    const finalUrl = execSync(`curl -s -L -A "Mozilla/5.0" -o /dev/null -w "%{url_effective}" "${url}"`, { encoding: 'utf8', timeout: 10000 });
    return finalUrl.trim();
  } catch (e) {
    return url;
  }
}

async function downloadImage(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(path.join(IMAGES_DIR, filename), Buffer.from(arrayBuffer));
    return true;
  } catch (e) {
    return false;
  }
}

async function verifyAmazonDeal(url) {
  let isAvailable = true;
  let browser = null;
  try {
    console.log(`Verifying availability: ${url.substring(0, 60)}...`);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const html = await page.content();
    
    // Check for common out of stock indicators
    if (html.includes('Currently unavailable') || 
        html.includes('See All Buying Options') || 
        html.includes('Currently out of stock') ||
        html.includes('id="outOfStock"')) {
      isAvailable = false;
    }
  } catch (e) {
    console.log(`Amazon scrape timed out/failed. Proceeding as True to avoid false negatives. Error: ${e.message}`);
  } finally {
    if (browser) await browser.close();
  }
  return isAvailable;
}

async function run() {
  console.log("Starting Blogotron RSS Scraper...");
  let ai;
  if (GEMINI_API_KEY) { ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY }); }

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
      const url = h.replace('href="', '').replace('"', '').replace(/&amp;/g, '&');
      if (url.includes('click') && url.toLowerCase().includes('amazon')) {
        clickUrl = url;
        break; 
      }
    }

    if (title.toLowerCase().includes('amazon') || rawContent.toLowerCase().includes('amazon')) {
      rawDeals.push({
        title, price, imageUrl, heat: 100, rawLink: clickUrl, fallbackContent: `<p>${bodyText}</p>`
      });
    }
  }
  
  let existingDeals = [];
  if (fs.existsSync(DATA_FILE)) { existingDeals = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  const existingTitles = existingDeals.map(d => d.title);
  let newDealsToAdd = [];

  const toProcess = rawDeals.slice(0, 5); // Limit batch to 5 to avoid heavy playwright usage per run

  for (const deal of toProcess) {
    if (existingTitles.includes(deal.title)) continue;
    
    console.log(`Processing: ${deal.title}`);

    // Resolve native Amazon ASIN
    let affiliateUrl = deal.rawLink;
    let finalUrl = resolveFinalUrl(deal.rawLink);
    
    // VERIFY DEAL ON AMAZON
    if (finalUrl.includes('amazon.') || finalUrl.includes('amzn.to')) {
      const isActive = await verifyAmazonDeal(finalUrl);
      if (!isActive) {
        console.log(`❌ Deal Rejected: Amazon shows it as Unavailable or See All Buying Options.`);
        continue;
      }
    } else {
      console.log(`Not an Amazon URL natively. Skipping validation.`);
    }

    if (finalUrl.includes('amazon.') || finalUrl.includes('amzn.to')) {
      const urlObj = new URL(finalUrl);
      urlObj.searchParams.set('tag', AMAZON_TAG);
      urlObj.searchParams.delete('ascsubtag');
      urlObj.searchParams.delete('creative');
      urlObj.searchParams.delete('camp');
      urlObj.searchParams.delete('linkCode');
      urlObj.searchParams.delete('smid');
      affiliateUrl = urlObj.toString();
    }

    let postBody = `<h2>Overview</h2>${deal.fallbackContent}`;

    // Host image locally
    let localImage = null;
    if (deal.imageUrl) {
      const ext = path.extname(new URL(deal.imageUrl).pathname) || '.jpg';
      const filename = `img_${Date.now()}_${Math.floor(Math.random()*1000)}${ext}`;
      const success = await downloadImage(deal.imageUrl, filename);
      if (success) localImage = filename;
    }

    newDealsToAdd.push({
      deal_id: 'deal-' + Date.now() + '-' + Math.floor(Math.random()*1000),
      title: deal.title,
      price: deal.price,
      heat_score: deal.heat,
      link: affiliateUrl,
      image_url: deal.imageUrl,
      local_image: localImage,
      content: postBody,
      posted_at: new Date().toISOString()
    });
  }

  if (newDealsToAdd.length > 0) {
    existingDeals = existingDeals.filter(d => d.deal_id !== "mock-001");
    const combined = [...newDealsToAdd, ...existingDeals].slice(0, 50);
    fs.writeFileSync(DATA_FILE, JSON.stringify(combined, null, 2));
    console.log(`Added ${newDealsToAdd.length} new verified targeted deals.`);
  } else {
    console.log("No new deals to add.");
  }
}

run().catch(console.error);
