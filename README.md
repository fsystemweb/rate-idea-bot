# RateIdea.us Bot

This project implements a production-ready Playwright bot designed to interact with `https://rateidea.us/`. The bot performs actions like commenting, ranking posts, and creating new ideas on a scheduled basis, simulating user activity.

## Features

*   **Comment and Rank Posts** 
*   **Create New Ideas:** 
*   **Headless Execution:** Designed to run headlessly for server environments like GitHub Actions.
*   **Environment Variable Support:** Securely manages API keys and other configurations.
*   **GitHub Actions Integration:** Automated scheduling and manual triggering via GitHub Actions workflows.

## Technical Stack

*   **Node.js (18+):** JavaScript runtime environment.
*   **Playwright:** A robust library for browser automation.
*   **OpenAI API:** Used for generating creative comments and new ideas.
*   **TypeScript:** For type-safe and maintainable code.
*   **GitHub Actions:** For continuous integration and deployment with scheduled runs.

## Project Structure

```
rateidea-bot/
├── .github/
│   └── workflows/
│       └── bot.yml           # GitHub Actions workflow definition
├── .env.example              # Example environment variables file
├── .gitignore                # Specifies intentionally untracked files
├── package.json              # Project dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── src/
    └── bot.ts                # Main bot logic
```

## Getting Started

Follow these steps to set up and run the bot.

### 1. Local Setup

*   **Clone the Repository:**
    ```bash
    git clone https://github.com/your-username/rateidea-bot.git
    cd rateidea-bot
    ```
*   **Install Dependencies:**
    ```bash
    npm install
    npx playwright install --with-deps # Install Playwright browsers
    ```
*   **Configure Environment Variables:**
    Create a `.env` file in the root of your project based on `.env.example`.

    ```
    # .env

    # Your OpenAI API Key
    OPENAI_API_KEY="sk-..."

    # Set to "false" to run in headed mode for debugging
    # HEADLESS="true" by default in production, "false" for local debugging
    ```
    **Important:** Replace `"sk-..."` with your actual OpenAI API Key.

### 2. Running Locally

To test the bot on your local machine, ensure your `.env` file is configured, and then run:

```bash
npm start
```

### 3. Debugging (Optional)

*   **Headed Mode:** To observe the bot's actions in a browser window, change `HEADLESS="true"` to `HEADLESS="false"` in your `.env` file.
*   **Error Screenshots:** The bot is configured to take a full-page screenshot if an unexpected error occurs during its run. These screenshots will be saved in the project root directory, named `error-screenshot-<timestamp>.png`.

### 4. GitHub Actions Deployment

To automate the bot's execution on a schedule using GitHub Actions:

*   **Create a GitHub Repository:**
    Initialize a new GitHub repository and push your project code to it.
*   **Add GitHub Secrets:**
    In your GitHub repository, navigate to `Settings` > `Secrets and variables` > `Actions`. Add a new repository secret:
    *   `OPENAI_API_KEY`: Your OpenAI API key.

    **Note:** Since `rateidea.us` supports anonymous interaction, no user credentials (email/password) are needed or stored.
*   **Workflow Activation:**
    Once the code is pushed and secrets are configured, the GitHub Actions workflow (`.github/workflows/bot.yml`) will automatically become active.
    *   **Scheduled Runs:** The bot is scheduled to run daily at 8:00 AM UTC.
    *   **Manual Trigger:** You can manually initiate a run from the "Actions" tab in your GitHub repository by selecting the "RateIdea.us Bot" workflow and clicking "Run workflow".

## Customization

*   **Selectors:** If the website's structure (`https://rateidea.us/`) changes, you may need to update the Playwright selectors in `src/bot.ts`. You can use Playwright's [codegen](https://playwright.dev/docs/codegen) tool (`npx playwright codegen https://rateidea.us/`) to help find new selectors.
*   **Scheduling Logic:** Adjust the frequency of commenting/ranking and idea creation by modifying the date checks in `src/bot.ts` (currently based on days ending in 5 or 0).
*   **OpenAI Prompts:** Customize the behavior of the AI-generated comments and ideas by editing the `messages` array within the `openai.chat.completions.create` calls in `src/bot.ts`.
*   **Website URL:** The target URL is defined by the `WEBSITE_URL` constant in `src/bot.ts`.
