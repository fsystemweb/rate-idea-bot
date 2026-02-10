import { OpenAI } from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const { OPENAI_API_KEY } = process.env;

if (!OPENAI_API_KEY) {
    throw new Error('Missing environment variables. Please check your .env file.');
}

export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
export const WEBSITE_URL = 'https://rateidea.us/';

export async function humanDelay(ms = 1000) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
