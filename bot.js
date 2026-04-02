require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');

// ======================== CONFIG ========================
const materiId = process.env.MATERI_ID || '3';
const CONFIG = {
  url: `https://pandawakkn.id/materi-mhs/${materiId}`,
  loginUrl: 'https://pandawakkn.id/login',
  username: process.env.PANDAWA_USERNAME,
  password: process.env.PANDAWA_PASSWORD,
  pptDir: path.join(__dirname, 'downloads', `materi_${materiId}`, 'ppt'),
  modulDir: path.join(__dirname, 'downloads', `materi_${materiId}`, 'modul'),
  outputDir: path.join(__dirname, 'output'),
};

// ======================== HELPERS ========================
function ensureDirs() {
  [CONFIG.pptDir, CONFIG.modulDir, CONFIG.outputDir].forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ======================== LOGIN ========================
async function login(page) {
  console.log('\n🔐 Logging in...');
  await page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2000);

  // Type credentials
  await page.type('input[type="email"], input[name="email"], input[type="text"]', CONFIG.username, { delay: 30 });
  await page.type('input[type="password"]', CONFIG.password, { delay: 30 });

  // Submit
  const submitBtn = await page.$('button[type="submit"]');
  if (submitBtn) {
    await submitBtn.click();
  } else {
    await page.keyboard.press('Enter');
  }

  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
  await sleep(3000);

  if (page.url().includes('login')) {
    throw new Error('Login failed - still on login page.');
  }
  console.log('  ✅ Login successful! URL:', page.url());
}

// ======================== EXPAND ACCORDION ========================
async function expandAccordion(page, sectionTitle) {
  console.log(`\n📂 Expanding section: "${sectionTitle}"...`);

  // Find and click the accordion button with the matching h3 text
  const clicked = await page.evaluate((title) => {
    const h3s = document.querySelectorAll('h3');
    for (const h3 of h3s) {
      if (h3.textContent.trim() === title) {
        // Find the parent button
        const btn = h3.closest('button');
        if (btn) {
          btn.click();
          return true;
        }
      }
    }
    return false;
  }, sectionTitle);

  if (clicked) {
    console.log(`  ✅ Expanded "${sectionTitle}"`);
    await sleep(3000); // Wait for content to load
  } else {
    console.log(`  ⚠️ Could not find section "${sectionTitle}"`);
  }
  return clicked;
}

// ======================== GET SECTION INFO ========================
async function getSectionInfo(page, sectionTitle) {
  // After expanding, read navigation info (Slide X dari Y / Halaman X dari Y)
  return await page.evaluate((title) => {
    const h3s = document.querySelectorAll('h3');
    for (const h3 of h3s) {
      if (h3.textContent.trim() === title) {
        // Find the parent container (the rounded-xl div)
        const container = h3.closest('.rounded-xl') || h3.closest('[class*="border"]');
        if (container) {
          // Look for slide/page info text in the expanded content
          const allText = container.textContent;
          
          // Match "Slide X dari Y" or "Halaman X dari Y"
          const slideMatch = allText.match(/Slide\s+(\d+)\s+dari\s+(\d+)/i);
          const pageMatch = allText.match(/Halaman\s+(\d+)\s+dari\s+(\d+)/i);
          
          if (slideMatch) return { current: parseInt(slideMatch[1]), total: parseInt(slideMatch[2]), type: 'slide' };
          if (pageMatch) return { current: parseInt(pageMatch[1]), total: parseInt(pageMatch[2]), type: 'halaman' };
        }
      }
    }
    
    // Broader search
    const bodyText = document.body.textContent;
    const slideMatch = bodyText.match(/Slide\s+(\d+)\s+dari\s+(\d+)/i);
    const pageMatch = bodyText.match(/Halaman\s+(\d+)\s+dari\s+(\d+)/i);
    if (slideMatch && title.includes('Slide')) return { current: parseInt(slideMatch[1]), total: parseInt(slideMatch[2]), type: 'slide' };
    if (pageMatch && title.includes('Dokumen')) return { current: parseInt(pageMatch[1]), total: parseInt(pageMatch[2]), type: 'halaman' };
    
    return null;
  }, sectionTitle);
}

// ======================== CAPTURE SLIDE/PAGE IMAGE ========================
async function captureImage(page, sectionTitle, savePath) {
  // Try to find and download the image from the expanded section
  const imgSrc = await page.evaluate((title) => {
    const h3s = document.querySelectorAll('h3');
    for (const h3 of h3s) {
      if (h3.textContent.trim() === title) {
        const container = h3.closest('.rounded-xl') || h3.closest('[class*="border"]') || h3.closest('.overflow-hidden');
        if (container) {
          // Look for img elements in the expanded content
          const imgs = container.querySelectorAll('img');
          for (const img of imgs) {
            // Skip small icons
            if (img.src && (img.naturalWidth > 100 || img.clientWidth > 100)) {
              return img.src;
            }
          }
        }
      }
    }

    // Broader search - find the large content image 
    const allImgs = document.querySelectorAll('img');
    for (const img of allImgs) {
      if (img.src && !img.src.includes('logo') && !img.src.includes('avatar') && !img.src.includes('icon')) {
        if (img.naturalWidth > 200 || img.clientWidth > 200) {
          return img.src;
        }
      }
    }
    return null;
  }, sectionTitle);

  if (imgSrc) {
    try {
      // Download via fetch
      const imageBuffer = await page.evaluate(async (src) => {
        const response = await fetch(src, { credentials: 'include' });
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        return Array.from(new Uint8Array(arrayBuffer));
      }, imgSrc);
      
      fs.writeFileSync(savePath, Buffer.from(imageBuffer));
      console.log(`    ✅ Downloaded: ${path.basename(savePath)} (from: ${imgSrc.substring(imgSrc.lastIndexOf('/') + 1).substring(0, 50)})`);
      return true;
    } catch (e) {
      console.log(`    ⚠️ Download failed: ${e.message}`);
    }
  }

  // Fallback: screenshot the image element area
  console.log(`    📸 Fallback: taking screenshot...`);
  try {
    const imgHandle = await page.evaluateHandle((title) => {
      const h3s = document.querySelectorAll('h3');
      for (const h3 of h3s) {
        if (h3.textContent.trim() === title) {
          const container = h3.closest('.rounded-xl') || h3.closest('[class*="border"]');
          if (container) {
            const img = container.querySelector('img');
            if (img) return img;
            // Return the content area
            const body = container.querySelector('div:not(:first-child)');
            if (body) return body;
          }
        }
      }
      return null;
    }, sectionTitle);

    if (imgHandle && imgHandle.asElement()) {
      await imgHandle.asElement().screenshot({ path: savePath });
      console.log(`    ✅ Screenshot: ${path.basename(savePath)}`);
      return true;
    }
  } catch (e) {
    console.log(`    ⚠️ Screenshot failed: ${e.message}`);
  }
  return false;
}

// ======================== CLICK NAVIGATION BUTTON ========================
async function clickNavButton(page, buttonText, sectionTitle) {
  return await page.evaluate((btnText, secTitle) => {
    const h3s = document.querySelectorAll('h3');
    for (const h3 of h3s) {
      if (h3.textContent.trim() === secTitle) {
        const container = h3.closest('.rounded-xl') || h3.closest('[class*="border"]') || h3.closest('.overflow-hidden');
        if (container) {
          const buttons = container.querySelectorAll('button');
          for (const btn of buttons) {
            const text = btn.textContent.trim().toLowerCase();
            if (text.includes(btnText.toLowerCase()) && !btn.disabled) {
              btn.click();
              return 'clicked';
            }
            if (text.includes('tunggu') && btnText.toLowerCase() === 'selanjutnya') {
              return 'waiting'; // Button is in "Tunggu" state
            }
          }
        }
      }
    }

    // Broader search
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      const text = btn.textContent.trim().toLowerCase();
      if (text.includes(btnText.toLowerCase()) && !btn.disabled) {
        btn.click();
        return 'clicked_broad';
      }
      if (text.includes('tunggu') && btnText.toLowerCase() === 'selanjutnya') {
        return 'waiting';
      }
    }
    return 'not_found';
  }, buttonText, sectionTitle);
}

// ======================== SCRAPE PPT SLIDES ========================
async function scrapePPT(page) {
  console.log('\n📊 ====== SCRAPING PPT SLIDES ======');

  // Expand PPT accordion
  await expandAccordion(page, 'Slide / PPT');
  await sleep(3000);

  // Get total slides
  let info = await getSectionInfo(page, 'Slide / PPT');
  const totalSlides = info ? info.total : 20;
  console.log(`  Total slides: ${totalSlides}`);

  for (let i = 1; i <= totalSlides; i++) {
    console.log(`\n  📄 Slide ${i}/${totalSlides}`);
    await sleep(1500);

    const savePath = path.join(CONFIG.pptDir, `slide_${String(i).padStart(3, '0')}.png`);
    await captureImage(page, 'Slide / PPT', savePath);

    // Navigate to next slide
    if (i < totalSlides) {
      const result = await clickNavButton(page, 'Selanjutnya', 'Slide / PPT');
      if (result === 'clicked' || result === 'clicked_broad') {
        console.log(`    ➡️ Next slide`);
        await sleep(2000);
      } else {
        console.log(`    ⚠️ Nav button result: ${result}`);
        await sleep(1000);
      }
    }
  }

  console.log('\n  ✅ PPT scraping complete!');
}

// ======================== SCRAPE MODULE ========================
async function scrapeModule(page) {
  console.log('\n📚 ====== SCRAPING MODULE PAGES ======');

  // First, scroll up and make sure Dokumen Materi is visible
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1000);

  // Expand Module accordion
  await expandAccordion(page, 'Dokumen Materi');
  await sleep(3000);

  // Get total pages
  let info = await getSectionInfo(page, 'Dokumen Materi');
  const totalPages = info ? info.total : 40;
  console.log(`  Total pages: ${totalPages}`);

  for (let i = 1; i <= totalPages; i++) {
    console.log(`\n  📄 Module page ${i}/${totalPages}`);

    // Scroll to make sure the module content is visible
    await page.evaluate(() => {
      const h3s = document.querySelectorAll('h3');
      for (const h3 of h3s) {
        if (h3.textContent.trim() === 'Dokumen Materi') {
          h3.scrollIntoView({ behavior: 'smooth', block: 'start' });
          break;
        }
      }
    });
    await sleep(2000);

    const savePath = path.join(CONFIG.modulDir, `modul_${String(i).padStart(3, '0')}.png`);
    await captureImage(page, 'Dokumen Materi', savePath);

    // Navigate to next page
    if (i < totalPages) {
      // The module has a "Tunggu 5s" timer before button becomes "Selanjutnya"
      let result = await clickNavButton(page, 'Selanjutnya', 'Dokumen Materi');

      if (result === 'waiting') {
        console.log(`    ⏳ Waiting for timer (5s)...`);
        await sleep(6000); // Wait 6 seconds for the 5s timer + buffer
        result = await clickNavButton(page, 'Selanjutnya', 'Dokumen Materi');
      }

      if (result === 'clicked' || result === 'clicked_broad') {
        console.log(`    ➡️ Next page`);
        await sleep(3000); // Wait for content to load
      } else if (result === 'waiting') {
        // Still waiting, try again
        console.log(`    ⏳ Still waiting, trying again...`);
        await sleep(5000);
        result = await clickNavButton(page, 'Selanjutnya', 'Dokumen Materi');
        if (result === 'clicked' || result === 'clicked_broad') {
          console.log(`    ➡️ Next page (retry)`);
          await sleep(3000);
        } else {
          // Try clicking any button with "Tunggu" text after waiting
          console.log(`    ⏳ Clicking Tunggu button directly...`);
          await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
              const text = btn.textContent.trim().toLowerCase();
              if (text.includes('tunggu') || text.includes('selanjutnya')) {
                btn.click();
                break;
              }
            }
          });
          await sleep(3000);
        }
      } else {
        console.log(`    ⚠️ Nav result: ${result}`);
      }
    }
  }

  console.log('\n  ✅ Module scraping complete!');
}

// ======================== GENERATE PDF ========================
async function generatePDF(imageDir, outputPath, title) {
  console.log(`\n📄 Generating PDF: ${title}`);

  const files = fs.readdirSync(imageDir)
    .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .sort();

  if (files.length === 0) {
    console.log(`  ⚠️ No images found in ${imageDir}`);
    return;
  }

  console.log(`  Found ${files.length} images`);
  const pdfDoc = await PDFDocument.create();

  for (const file of files) {
    const filePath = path.join(imageDir, file);

    try {
      // Convert to PNG using sharp
      const pngBuffer = await sharp(filePath).png().toBuffer();
      const metadata = await sharp(filePath).metadata();

      const pdfImage = await pdfDoc.embedPng(pngBuffer);

      // Scale image to fit nicely on a page
      const imgW = metadata.width;
      const imgH = metadata.height;

      // Use image dimensions as page size, but scale if too large
      const maxDim = 1200;
      let pageW = imgW;
      let pageH = imgH;

      if (pageW > maxDim || pageH > maxDim) {
        const scale = Math.min(maxDim / pageW, maxDim / pageH);
        pageW = Math.round(pageW * scale);
        pageH = Math.round(pageH * scale);
      }

      const page = pdfDoc.addPage([pageW, pageH]);
      page.drawImage(pdfImage, { x: 0, y: 0, width: pageW, height: pageH });
    } catch (e) {
      console.log(`  ⚠️ Skipped ${file}: ${e.message}`);
    }
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`  ✅ PDF saved: ${outputPath} (${pdfDoc.getPageCount()} pages, ${(pdfBytes.length / 1024 / 1024).toFixed(2)} MB)`);
}

// ======================== MAIN ========================
async function main() {
  console.log('🤖 Bot Pandawa - Web Scraper');
  console.log('============================');
  console.log(`⏰ Start: ${new Date().toLocaleString()}\n`);

  ensureDirs();

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--start-maximized', '--no-sandbox'],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    // 1. Login
    await login(page);

    // 2. Navigate to materi
    console.log('\n🌐 Navigating to materi page...');
    await page.goto(CONFIG.url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);
    console.log('  ✅ Page loaded');

    // 3. Scrape PPT
    await scrapePPT(page);

    // 4. Reload page to reset state for module
    console.log('\n🔄 Reloading page for module...');
    await page.goto(CONFIG.url, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);

    // 5. Scrape Module
    await scrapeModule(page);

    // 6. STOP - Do NOT continue to resume
    console.log('\n🛑 STOP — Not proceeding to Resume section!');

    // 7. Generate PDFs
    await generatePDF(CONFIG.pptDir, path.join(CONFIG.outputDir, `Materi_${materiId}_PPT.pdf`), 'PPT Slides');
    await generatePDF(CONFIG.modulDir, path.join(CONFIG.outputDir, `Materi_${materiId}_Modul.pdf`), 'Dokumen Materi');

    console.log('\n\n============================');
    console.log('🎉 ALL DONE!');
    console.log(`📁 PPT PDF:    ${path.join(CONFIG.outputDir, `Materi_${materiId}_PPT.pdf`)}`);
    console.log(`📁 Module PDF: ${path.join(CONFIG.outputDir, `Materi_${materiId}_Modul.pdf`)}`);
    console.log(`⏰ End: ${new Date().toLocaleString()}`);
    console.log('============================\n');

  } catch (e) {
    console.error(`\n❌ Error: ${e.message}`);
    console.error(e.stack);
  } finally {
    await sleep(5000);
    await browser.close();
  }
}

main();
