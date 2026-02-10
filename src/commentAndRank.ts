import { Page } from 'playwright';
import { openai, WEBSITE_URL, humanDelay } from './utils';
import { COMMENT_AND_RANK_PROMPT } from './prompts/commentAndRankPrompt';

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

export async function commentAndRank(page: Page) {
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
                content: COMMENT_AND_RANK_PROMPT,
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
