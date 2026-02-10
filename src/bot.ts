
import { chromium, Browser, Page } from 'playwright';
import { OpenAI } from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const { OPENAI_API_KEY } = process.env;

if (!OPENAI_API_KEY) {
  throw new Error('Missing environment variables. Please check your .env file.');
}

async function humanDelay(ms = 1000) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getLowestReachPost(page: Page) {
  console.log('Finding the post with the lowest reach...');
  await page.goto(`${WEBSITE_URL}dashboard`, { waitUntil: 'networkidle' });

  const posts = await page.locator('article').all();
  let lowestReachPost = null;
  let minReach = Infinity;

  for (const post of posts) {
    const reachText = await post.locator('p').filter({ hasText: 'Reach' }).textContent();
    const reach = reachText ? parseInt(reachText.replace('Reach ', ''), 10) : Infinity;

    if (reach < minReach) {
      minReach = reach;
      lowestReachPost = post;
    }
  }

  if (lowestReachPost) {
    console.log(`Found post with lowest reach: ${minReach}`);
    await lowestReachPost.click();
    await page.waitForLoadState('networkidle');
  } else {
    console.log('No posts found.');
  }
  return lowestReachPost;
}

async function commentAndRank(page: Page) {
  console.log('Attempting to comment and rank a post...');
  const post = await getLowestReachPost(page);
  if (!post) return;

  const postTitle = await page.locator('h1').textContent();
  console.log(`Generating comment for: ${postTitle}`);

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that provides constructive feedback on ideas. Your comments should be unique, insightful, and concise (2-3 sentences).',
      },
      {
        role: 'user',
        content: `Generate a constructive comment for an idea titled "${postTitle}".`,
      },
    ],
  });
  const comment = response.choices[0].message.content;

  if (comment) {
    console.log('Submitting comment...');
    await page.locator('[role="textbox"]').fill(comment);
    await page.getByRole('button', { name: 'Comment' }).click();
    await humanDelay(2000);
    console.log('Comment submitted.');
  }

  console.log('Ranking post...');
  // Rank 5 stars
  await page.locator('[aria-label="rating"] button').nth(4).click();
  console.log('Post ranked.');
}

async function createIdea(page: Page) {
  console.log('Attempting to create a new idea...');
  await page.goto(`${WEBSITE_URL}dashboard`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Submit Idea' }).click();
  await page.waitForURL(`${WEBSITE_URL}submit`, { waitUntil: 'networkidle' });

  console.log('Generating a new idea...');
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'You are an idea-generating assistant. Create a short, innovative tech idea title and a brief, compelling description (2-3 sentences). Format the output as JSON with "title" and "description" keys.',
      },
      {
        role: 'user',
        content: 'Generate a new tech startup idea.',
      },
    ],
    response_format: { type: "json_object" },
  });

  const ideaContent = response.choices[0].message.content;
  if (ideaContent) {
    const idea = JSON.parse(ideaContent);
    console.log(`Submitting new idea: "${idea.title}"`);
    await page.getByPlaceholder('Title').fill(idea.title);
    await page.locator('[role="textbox"]').fill(idea.description);
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.waitForURL(`${WEBSITE_URL}dashboard`, { waitUntil: 'networkidle' });
    console.log('New idea submitted successfully.');
  }
}

async function runBot() {
  let browser: Browser | null = null;
  try {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - startOfYear.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);

    const headless = process.env.HEADLESS !== 'false';
    browser = await chromium.launch({ headless });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(WEBSITE_URL, { waitUntil: 'networkidle' });

    // Day 1 of every 5-day cycle
    if (dayOfYear % 5 === 1) {
      await commentAndRank(page);
    }
    // Day 1 of every 20-day cycle
    else if (dayOfYear % 20 === 1) {
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

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const WEBSITE_URL = 'https://rateidea.us/';

runBot();
