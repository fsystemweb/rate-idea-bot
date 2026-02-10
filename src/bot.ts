import { chromium, Browser } from 'playwright';
import { WEBSITE_URL, humanDelay } from './utils';
import { createIdea } from './createIdea';
import { commentAndRank } from './commentAndRank';

async function runBot() {
  let browser: Browser | null = null;
  try {
    const now = new Date();

    const headless = process.env.HEADLESS !== 'false';
    browser = await chromium.launch({ headless });
    let context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(WEBSITE_URL, { waitUntil: 'networkidle' });
    const dayOfMonth = now.getDate();

    if (dayOfMonth % 10 === 5) {
      await commentAndRank(page);
    } else if (dayOfMonth % 10 === 0) {
      await createIdea(page);
    } else {
      console.log('No action scheduled for today. Browsing a bit...');
      await page.goto(`${WEBSITE_URL}dashboard`, { waitUntil: 'networkidle' });
      await humanDelay(5000); // Simulate browsing
    }

    console.log('Bot run finished.');

  } catch (error) {
    console.error('An error occurred during the bot run:', error);
    if (browser) {
      const page = browser.contexts()[0]?.pages()[0];
      if (page) {
        const path = `error-screenshot-${Date.now()}.png`;
        await page.screenshot({ path, fullPage: true });
        console.log(`Screenshot saved to ${path}`);
      }
    }
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runBot();
