const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const queries = [
  'react developer',
  'node js express developer',
  'tailwind css developer',
  'mongodb developer',
  'firebase developer',
  'asp.net developer'
];

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

(async () => {
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  await page.setViewport({width: 1366, height: 900});

  const results = new Map();

  for (const q of queries) {
    const url = `https://www.fiverr.com/search/gigs?query=${encodeURIComponent(q)}&seller_details=new_seller`;
    try {
      await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
      try { await page.waitForSelector('#onetrust-accept-btn-handler', {timeout: 4000}); await page.click('#onetrust-accept-btn-handler'); } catch(_) {}
      for (let i=0;i<6;i++){ await page.evaluate(()=>window.scrollBy(0, window.innerHeight)); await sleep(500); }
      const gigLinks = await page.$$eval('a', as => Array.from(new Set(as.map(a=>a.href).filter(h=>/fiverr\.com\/(?:share|s)\//.test(h)))));
      for (const link of gigLinks.slice(0, 10)) {
        const p = await browser.newPage();
        try {
          await p.goto(link, {waitUntil: 'domcontentloaded', timeout: 60000});
          await sleep(1200);
          const data = await p.evaluate(() => {
            const hasNewSeller = !!Array.from(document.querySelectorAll('*')).find(n=>/New Seller/i.test(n.textContent||''));
            let profileHref = '';
            const a = document.querySelector('a[href^="/users/"]') || document.querySelector('a[data-testid="seller-link"]');
            if (a) { profileHref = a.getAttribute('href') || ''; if (profileHref && !/^https?:/i.test(profileHref)) profileHref = 'https://www.fiverr.com' + profileHref; }
            let user = '';
            const m = profileHref.match(/fiverr\.com\/(?:users\/)?([^\/?#]+)/);
            if (m) user = m[1];
            const text = document.body.innerText || '';
            const orders = (text.match(/(\d+)\s+orders?\s+in\s+queue/i)||[])[1] ? parseInt((text.match(/(\d+)\s+orders?\s+in\s+queue/i)||[])[1],10) : null;
            const rating = (text.match(/(\d+\.\d+)\s*out of\s*5/)||[])[1] ? parseFloat((text.match(/(\d+\.\d+)\s*out of\s*5/)||[])[1]) : null;
            return {hasNewSeller, profileHref, user, orders, rating};
          });
          if (data.hasNewSeller && data.user && data.profileHref && !results.has(data.user)) {
            results.set(data.user, {user: data.user, url: data.profileHref, gigUrl: link, query: q, orders: data.orders, rating: data.rating});
          }
        } catch(e) {}
        await p.close();
      }
    } catch(e) {}
    if (results.size >= 6) break;
  }

  const list = Array.from(results.values()).sort((a,b)=>{
    const ao=a.orders||0, bo=b.orders||0; if (bo!==ao) return bo-ao; return (b.rating||0)-(a.rating||0);
  }).slice(0,5);

  console.log(JSON.stringify(list, null, 2));
  await browser.close();
})();
