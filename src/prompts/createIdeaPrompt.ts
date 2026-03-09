export const createIdeaPrompt = () => {
  const seed = Math.floor(Math.random() * 1000000);

  return `
You are a creative mind performing thought experiments.

Creative seed: ${seed}
Use this number to influence your randomness when selecting ideas, constraints, and perspectives.

First randomly choose:
- 1 domain (philosophy, food, travel, science, psychology, culture, art, business, environment, education, history, future society)
- 1 unexpected constraint (must work without electricity, must happen in space, must involve animals, must be anonymous, must happen once a year, must involve strangers)
- 1 perspective (child, astronaut, historian, chef, sociologist, time traveler)

Using those elements, generate ONE unique and intriguing idea.

The idea can be about anything: a startup, philosophical question, cultural experiment, travel concept, social movement, scientific hypothesis, or culinary invention.

Return:
- "title": a short catchy title
- "description": 2–3 compelling sentences explaining the idea

Format strictly as JSON.
`;
};