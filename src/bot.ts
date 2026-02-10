
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

async function getLowestFeedbackPost(page: Page) {
  console.log('Finding the post with the lowest feedback count...');
  await page.goto(`${WEBSITE_URL}`, { waitUntil: 'networkidle' });

  // Wait for posts to load
  try {
    await page.waitForSelector('a[href^="/idea/"]', { timeout: 10000 });
  } catch (e) {
    console.log('No posts found on home page.');
    return null;
  }

  const posts = await page.locator('a[href^="/idea/"]').all();
  let lowestFeedbackPostUrl: string | null = null;
  let minFeedback = Infinity;

  for (const post of posts) {
    // Check if it's a valid idea card
    const href = await post.getAttribute('href');
    if (!href || href === '/create') continue;

    // Look for the feedback text like "0 feedback" or "X feedback"
    const feedbackElement = post.locator('span').filter({ hasText: /feedback$/i }).first();

    // Default to 0 if no feedback text is found (new ideas often have no text or "0 feedback")
    let feedbackCount = 0;

    if (await feedbackElement.count() > 0) {
      const feedbackText = await feedbackElement.textContent();
      // Parse "3 feedback" -> 3
      feedbackCount = feedbackText ? parseInt(feedbackText.replace(/[^0-9]/g, ''), 10) : 0;
    }

    if (feedbackCount < minFeedback) {
      minFeedback = feedbackCount;
      lowestFeedbackPostUrl = href;
    }
  }

  if (lowestFeedbackPostUrl) {
    console.log(`Found post with lowest feedback: ${minFeedback}, URL: ${lowestFeedbackPostUrl}`);
  } else {
    console.log('No posts found.');
  }
  return lowestFeedbackPostUrl;
}

async function commentAndRank(page: Page) {
  console.log('Attempting to comment and rank a post...');
  const postUrl = await getLowestFeedbackPost(page);
  if (!postUrl) return;

  // Navigate explicitly
  await page.goto(`${WEBSITE_URL}${postUrl.replace(/^\//, '')}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `debug-nav-explicit-${Date.now()}.png` });

  const postTitle = await page.locator('h1').textContent();
  console.log(`Generating comment for: ${postTitle}`);

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that provides constructive feedback on ideas. Your comments should be unique, funny, faithful, insightful, and concise (2 sentences). Analyze the idea and provide a score from 1 (terrible) to 10 (excellent) based on its potential and execution. Format the output as JSON with "comment" and "score" keys.',
      },
      {
        role: 'user',
        content: `Generate a constructive comment and rating for an idea titled "${postTitle}".`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = JSON.parse(response.choices[0].message.content || '{}');
  const { comment, score } = content;

  // Start the Rate/Feedback flow
  console.log('Initiating feedback flow...');
  // The Rate button is actually a link styled as a button
  const rateButton = page.getByRole('link', { name: 'Rate' }).first();
  const rateHref = await rateButton.getAttribute('href');
  console.log(`Rate button href: ${rateHref}`);

  if (await rateButton.isVisible()) {
    await rateButton.click();
    await humanDelay(2000);
    console.log(`URL after clicking Rate: ${page.url()}`);

    // Check if we moved to feedback page
    if (!page.url().includes('/feedback/')) {
      console.log('Click did not navigate to feedback. Trying manual navigation...');
      // Construct feedback URL. Usually /idea/ID -> /feedback/ID
      // postUrl is /idea/ID, we need to extract URL
      if (postUrl) {
        const feedbackUrl = postUrl.replace('/idea/', '/feedback/');
        console.log(`Manually creating feedback URL from ${postUrl} to ${feedbackUrl}`);
        // Ensure WEBSITE_URL ends with / or not depending on use
        await page.goto(`${WEBSITE_URL}${feedbackUrl.replace(/^\//, '')}`, { waitUntil: 'networkidle' });
      }
    }

    await page.screenshot({ path: `debug-nav-after-rate-${Date.now()}.png` });
  } else {
    console.error('Rate button (link) not found. Taking screenshot...');
    await page.screenshot({ path: `debug-rate-button-${Date.now()}.png` });
    return;
  }

  // Step 1: Ranking (Slider)
  if (score) {
    console.log(`Setting score: ${score}/10`);
    const slider = page.locator('input[type="range"]');
    try {
      await slider.waitFor({ state: 'visible', timeout: 5000 });
      if (await slider.isVisible()) {
        await slider.fill(score.toString());
        await slider.dispatchEvent('input');
        await slider.dispatchEvent('change');
        await humanDelay(500);
      }
    } catch (e) {
      console.error('Slider not found. Screenshotting...');
      await page.screenshot({ path: `debug-slider-missing-${Date.now()}.png` });
    }
  }

  // Click Next to go to Comment step
  console.log('Proceeding to comment step...');
  const nextButton = page.getByRole('button', { name: 'Next' });
  if (await nextButton.isVisible()) {
    await nextButton.click();
    await humanDelay(1000);
    console.log(`URL after clicking Next: ${page.url()}`);
    await page.screenshot({ path: `debug-nav-after-next-${Date.now()}.png` });
  }

  // Step 2: Commenting
  if (comment) {
    console.log(`Submitting comment: "${comment}"`);

    // Wait for the textarea to appear (Step 2 transition)
    const commentBox = page.locator('textarea').first();
    try {
      await commentBox.waitFor({ state: 'visible', timeout: 10000 });
    } catch (e) {
      console.error('Timeout waiting for comment box. Taking screenshot...');
      await page.screenshot({ path: `debug-comment-box-missing-${Date.now()}.png` });
      return;
    }

    if (await commentBox.isVisible()) {
      await commentBox.fill(comment);
      await humanDelay(500);

      // Submit
      const submitButton = page.getByRole('button', { name: 'Submit Feedback' }).first();
      if (await submitButton.isVisible()) {
        await submitButton.click();
        console.log('Feedback submitted.');
        await page.waitForLoadState('networkidle');
      } else {
        // Fallback to "Submit"
        const fallbackSubmit = page.getByRole('button', { name: 'Submit' }).first();
        if (await fallbackSubmit.isVisible()) {
          await fallbackSubmit.click();
          console.log('Feedback submitted (fallback button).');
          await page.waitForLoadState('networkidle');
        } else {
          console.error('Submit button not found.');
        }
      }
    } else {
      console.error('Comment box not found in Step 2.');
    }
  }
}

async function createIdea(page: Page) {
  console.log('Attempting to create a new idea...');
  // Navigate to the creation page directly
  await page.goto(`${WEBSITE_URL}create`, { waitUntil: 'networkidle' });

  console.log('Generating a new idea...');
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'You are a creative consciousness capable of conducting thought experiments in any domain. Generate a unique, intriguing idea. It can be about ANYTHING: a new startup, a philosophical question, a travel destination, a culinary experiment, a social movement, or a technological breakthrough. Do NOT limit yourself to "tech" or "apps". The idea should be thought-provoking. Provide a catchy "title" and a compelling "description" (2-3 sentences). Format as JSON.',
      },
      {
        role: 'user',
        content: 'Generate a new idea.',
      },
    ],
    response_format: { type: "json_object" },
  });

  const ideaContent = response.choices[0].message.content;
  if (ideaContent) {
    const idea = JSON.parse(ideaContent);
    console.log(`Submitting new idea: "${idea.title}"`);

    // Step 1: Fill details
    await page.getByPlaceholder('e.g., AI-powered fitness coach').fill(idea.title);
    await page.getByPlaceholder('Describe your idea in detail. What problem does it solve? Who would use it?').fill(idea.description);

    // Click "Next" to proceed to Step 2
    console.log('Completing Step 1...');
    await page.getByRole('button', { name: 'Next' }).click();
    await humanDelay(1000);

    // Step 2: Privacy (Default is fine, usually public) and Submit
    // Look for "Create Idea" button
    const createButton = page.getByRole('button', { name: 'Create Idea' });
    if (await createButton.isVisible()) {
      console.log('Completing Step 2 (Final Submission)...');

      // Take a debug screenshot before clicking submit
      await page.screenshot({ path: `debug-before-submit-${Date.now()}.png` });

      await createButton.click();

      console.log('Waiting for navigation or success...');

      try {
        // Wait for "Idea Created!" text
        await page.getByText('Idea Created!', { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
        console.log(`Success! Idea created.`);

        console.log(`Current URL: ${page.url()}`);

      } catch (e) {
        console.error('Did not see "Idea Created!" message. Taking screenshot...');
        await page.screenshot({ path: `debug-submission-failed-${Date.now()}.png` });
      }

    } else {
      console.error('Could not find "Create Idea" button in Step 2. Taking screenshot...');
      await page.screenshot({ path: `debug-step2-button-missing-${Date.now()}.png` });
    }

    console.log('New idea process completed section.');
  }
}

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
      //await createIdea(page);

      await commentAndRank(page);
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
