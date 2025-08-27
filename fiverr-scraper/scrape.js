const puppeteer = require('puppeteer');

const queries = [
  'react developer',
  'node js express developer',
  'tailwind css developer',
  'mongodb developer',
  'firebase developer',
  'asp.net developer'
];

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

async function collectGigs(page, query){
  const url = `https://www.fiverr.com/search/gigs?query=${encodeURIComponent(query)}&seller_details=new_seller`;
  await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
  // accept cookies if present
  try { await page.waitForSelector('#onetrust-accept-btn-handler', {timeout: 4000}); await page.click('#onetrust-accept-btn-handler'); } catch(_) {}
  await sleep(2000);
  for (let i=0;i<8;i++){ await page.evaluate(()=>window.scrollBy(0, window.innerHeight)); await sleep(600); }
  const links = await page.$$eval('a', as => {
    const out = [];
    const seen = new Set();
    for (const a of as) {
      const h = a.href || '';
      if (/https?:\/\/www\.fiverr\.com\/(?:share|s)\//.test(h)) {
        if (!seen.has(h)) { seen.add(h); out.push(h); }
      }
    }
    return out;
  });
  return links.slice(0, 20);
}

async function extractFromGig(page, gigUrl){
  try {
    await page.goto(gigUrl, {waitUntil: 'domcontentloaded', timeout: 60000});
    await sleep(1500);
    const data = await page.evaluate(() => {
      const pick = sel => document.querySelector(sel);
      // find any element that says New Seller on the gig page
      const hasNewSeller = !!Array.from(document.querySelectorAll('*')).find(n => /New Seller/i.test(n.textContent||''));
      // seller profile link
      let profileHref = '';
      const sellerAnchor = document.querySelector('a[href^="/users/"]') || document.querySelector('a[href^="/profile/"]') || document.querySelector('a[data-testid="seller-link"]');
      if (sellerAnchor) {
        profileHref = sellerAnchor.getAttribute('href') || '';
        if (profileHref && !/^https?:/i.test(profileHref)) profileHref = 'https://www.fiverr.com' + profileHref;
      }
      // derive username
      let user = '';
      const m = profileHref.match(/fiverr\.com\/(?:users\/)?([^\/?#]+)/);
      if (m) user = m[1];
      // rating and orders
      const text = document.body.innerText || '';
      const ratingMatch = text.match(/(\d+(?:\.\d+)?)\s*\(?\d*\)?\s*\bRating/i);
      let rating = null;
      if (!ratingMatch) {
        const alt = text.match(/(\d+\.\d+)\s*out of\s*5/);
        rating = alt ? parseFloat(alt[1]) : null;
      } else rating = parseFloat(ratingMatch[1]);
      const ordersMatch = text.match(/(\d+)\s+orders?\s+in\s+queue/i);
      const orders = ordersMatch ? parseInt(ordersMatch[1],10) : null;
      return {hasNewSeller, profileHref, user, rating, orders};
    });
    if (data.hasNewSeller && data.profileHref && data.user) {
      return {user: data.user, url: data.profileHref, gigUrl, rating: data.rating, orders: data.orders};
    }
  } catch(e) {}
  return null;
}

(async () => {
  const browser = await puppeteer.launch({headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  await page.setViewport({width: 1366, height: 900});
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  const candidates = new Map();
  for (const q of queries) {
    const gigLinks = await collectGigs(page, q);
    for (const link of gigLinks) {
      const p = await browser.newPage();
      const info = await extractFromGig(p, link);
      await p.close();
      if (info && !candidates.has(info.user)) { candidates.set(info.user, {...info, query: q}); }
      if (candidates.size >= 12) break; // keep it tight
    }
    if (candidates.size >= 12) break;
  }

  const list = Array.from(candidates.values()).sort((a,b)=>{
    const ao = a.orders||0, bo=b.orders||0; if (bo!==ao) return bo-ao; return (b.rating||0)-(a.rating||0);
  }).slice(0,5);

  console.log(JSON.stringify(list, null, 2));
  await browser.close();
})();
