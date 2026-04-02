// Refined diagnostic - dumps key HTML sections and waits for dynamic content
require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const materiId = process.env.MATERI_ID || '3';
const CONFIG = {
  url: `https://pandawakkn.id/materi-mhs/${materiId}`,
  loginUrl: 'https://pandawakkn.id/login',
  username: process.env.PANDAWA_USERNAME,
  password: process.env.PANDAWA_PASSWORD,
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--start-maximized', '--no-sandbox'],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    // Login
    console.log('Logging in...');
    await page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle2' });
    await sleep(2000);

    await page.type('input[type="email"], input[name="email"], input[type="text"]', CONFIG.username, { delay: 30 });
    await page.type('input[type="password"]', CONFIG.password, { delay: 30 });
    
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
    else await page.keyboard.press('Enter');

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await sleep(3000);
    console.log('Logged in. URL:', page.url());

    // Navigate to materi
    await page.goto(CONFIG.url, { waitUntil: 'networkidle2' });
    await sleep(5000); // Wait longer for dynamic content
    console.log('Materi page loaded. URL:', page.url());

    // Take a full page screenshot
    await page.screenshot({ path: path.join(__dirname, 'debug_fullpage.png'), fullPage: true });
    console.log('Full page screenshot saved');

    // Dump the main content HTML (just the relevant portion)
    const htmlDump = await page.evaluate(() => {
      // Get the main content area
      const main = document.querySelector('main, [role="main"], .container, #app, #__next, body');
      if (!main) return document.body.innerHTML.substring(0, 10000);
      return main.innerHTML.substring(0, 15000);
    });
    fs.writeFileSync(path.join(__dirname, 'debug_html.txt'), htmlDump);
    console.log('HTML dump saved');

    // Try to find images specifically
    const imgInfo = await page.evaluate(() => {
      const result = [];
      const imgs = document.querySelectorAll('img');
      imgs.forEach((img, idx) => {
        const rect = img.getBoundingClientRect();
        result.push({
          idx, 
          src: img.src ? img.src.substring(0, 200) : 'no src',
          alt: img.alt || '',
          classes: img.className || '',
          display: window.getComputedStyle(img).display,
          visibility: window.getComputedStyle(img).visibility,
          width: img.naturalWidth,
          height: img.naturalHeight,
          clientW: img.clientWidth,
          clientH: img.clientHeight,
          rectY: Math.round(rect.y),
          parentTag: img.parentElement?.tagName,
          parentClass: img.parentElement?.className?.substring(0, 80) || '',
        });
      });
      return result;
    });
    console.log('\n=== ALL IMAGES ===');
    console.log(JSON.stringify(imgInfo, null, 2));

    // Find all buttons  
    const btnInfo = await page.evaluate(() => {
      const result = [];
      const btns = document.querySelectorAll('button');
      btns.forEach((btn, idx) => {
        const rect = btn.getBoundingClientRect();
        result.push({
          idx,
          text: btn.textContent.trim().substring(0, 60),
          classes: btn.className?.substring(0, 80) || '',
          disabled: btn.disabled,
          rectY: Math.round(rect.y),
          display: window.getComputedStyle(btn).display,
        });
      });
      return result;
    });
    console.log('\n=== ALL BUTTONS ===');
    console.log(JSON.stringify(btnInfo, null, 2));

    // Find text with "Slide" or "Halaman" 
    const textInfo = await page.evaluate(() => {
      const result = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent.trim();
        if (text && (text.includes('Slide') || text.includes('Halaman') || text.includes('dari') || 
                     text.includes('Selanjutnya') || text.includes('Sebelumnya') || text.includes('Tunggu') ||
                     text.includes('Dokumen') || text.includes('PPT') || text.includes('Resume'))) {
          if (text.length < 100 && text.length > 2) {
            result.push({
              text: text,
              parentTag: walker.currentNode.parentElement?.tagName,
              parentClass: walker.currentNode.parentElement?.className?.substring(0, 80) || '',
            });
          }
        }
      }
      return result;
    });
    console.log('\n=== RELEVANT TEXT NODES ===');
    console.log(JSON.stringify(textInfo, null, 2));

    // Check for canvas elements (some PPT renderers use canvas)
    const canvasInfo = await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas');
      return Array.from(canvases).map((c, i) => ({
        idx: i, width: c.width, height: c.height, 
        classes: c.className, id: c.id,
      }));
    });
    console.log('\n=== CANVAS ELEMENTS ===');
    console.log(JSON.stringify(canvasInfo, null, 2));

    // Check for iframes
    const iframeInfo = await page.evaluate(() => {
      const iframes = document.querySelectorAll('iframe');
      return Array.from(iframes).map((f, i) => ({
        idx: i, src: f.src?.substring(0, 200), classes: f.className, id: f.id,
      }));
    });
    console.log('\n=== IFRAMES ===');
    console.log(JSON.stringify(iframeInfo, null, 2));

    console.log('\n=== DONE - closing in 10s ===');
    await sleep(10000);

  } catch (e) {
    console.error('Error:', e.message);
    await sleep(5000);
  } finally {
    await browser.close();
  }
}

main();
