import { Page } from 'playwright';
import { openai, WEBSITE_URL, humanDelay } from './utils';
import { CREATE_IDEA_PROMPT } from './prompts/createIdeaPrompt';

export async function createIdea(page: Page) {
    console.log('Attempting to create a new idea...');
    // Navigate to the creation page directly
    await page.goto(`${WEBSITE_URL}create`, { waitUntil: 'networkidle' });

    console.log('Generating a new idea...');
    const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
            {
                role: 'system',
                content: CREATE_IDEA_PROMPT,
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
