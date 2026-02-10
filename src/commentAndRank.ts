import { Page } from 'playwright';
import { openai, WEBSITE_URL, humanDelay } from './utils';
import { COMMENT_AND_RANK_PROMPT } from './prompts/commentAndRankPrompt';

async function getLowestFeedbackPost(page: Page) {
    console.log('Finding the post with the lowest feedback count...');
    await page.goto(`${WEBSITE_URL}`, { waitUntil: 'networkidle' });

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
        const href = await post.getAttribute('href');
        if (!href || href === '/create') continue;

        const feedbackElement = post.locator('span').filter({ hasText: /feedback$/i }).first();
        let feedbackCount = 0;

        if (await feedbackElement.count() > 0) {
            const feedbackText = await feedbackElement.textContent();
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

    // Navigate to the idea page
    await page.goto(`${WEBSITE_URL}${postUrl.replace(/^\//, '')}`, { waitUntil: 'networkidle' });

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

    // Navigate to the feedback page
    // Construct feedback URL from idea URL: /idea/ID -> /feedback/ID
    const ideaId = postUrl.split('/').pop();
    const feedbackUrl = `${WEBSITE_URL}feedback/${ideaId}`;
    console.log(`Navigating to feedback page: ${feedbackUrl}`);
    await page.goto(feedbackUrl, { waitUntil: 'networkidle' });
    // Wait for the feedback form to render (API loads idea, then renders the slider)
    await page.locator('input[type="range"]').waitFor({ state: 'visible', timeout: 15000 });
    console.log(`Feedback page loaded. URL: ${page.url()}`);
    await humanDelay(500);

    // Step 2: Set the ranking slider (React-controlled input)
    if (score) {
        console.log(`Setting score: ${score}/10`);
        const slider = page.locator('input[type="range"]');
        // Use the native value setter to bypass React's synthetic setter
        await slider.evaluate((el: HTMLInputElement, val: string) => {
            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            )!.set!;
            nativeSetter.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }, score.toString());
        await humanDelay(500);
        console.log('Score set successfully.');
    }

    // Step 3: Click "Next" to go to the suggestion/comment step
    console.log('Proceeding to comment step...');
    const nextButton = page.locator('button', { hasText: /Next/i }).first();
    await nextButton.click();
    // Wait for the textarea to appear (React state transition: "rating" -> "suggestion")
    await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 10000 });
    await humanDelay(500);

    // Step 4: Fill in the comment and submit
    if (comment) {
        console.log(`Submitting comment: "${comment}"`);
        await page.locator('textarea').first().fill(comment);
        await humanDelay(500);

        const submitButton = page.locator('button', { hasText: /Submit Feedback/i }).first();
        await submitButton.click();
        console.log('Feedback submitted successfully.');

        // Wait for the "Thank You!" confirmation
        await page.locator('text=Thank You!').waitFor({ state: 'visible', timeout: 10000 });
        console.log('Submission confirmed.');
    }
}
