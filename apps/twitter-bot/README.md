# Twitter Bot

AI-powered Twitter bot that generates authentic, high-engagement posts in your voice using Claude AI.

## Features

- **Voice Learning**: Analyzes your existing tweets to learn your writing style, tone, vocabulary, and patterns
- **Engagement Optimization**: Uses proven viral patterns and Twitter algorithm insights to maximize engagement
- **Claude-Powered Generation**: Generates tweets that sound authentically like you, not like AI
- **Anti-AI Detection**: Built-in checks to avoid common AI tells and corporate speak
- **Configurable Scheduling**: Set your posting frequency, topics, and preferred times
- **Review Dashboard**: Web interface to review, approve, or reject generated tweets before posting
- **Rate Limiting**: Respects Twitter API limits and prevents spam posting

## Prerequisites

1. **Twitter Developer Account** with API v2 access
   - Apply at https://developer.twitter.com/
   - You need "Read and write" permissions
   - Get your API keys, access tokens, and bearer token

2. **Anthropic API Key** for Claude
   - Get one at https://console.anthropic.com/

3. **PostgreSQL** database

4. **Redis** for job queue

## Setup

### 1. Install dependencies

From the monorepo root:

```bash
pnpm install
```

### 2. Configure environment

Copy the example env file and fill in your credentials:

```bash
cd apps/twitter-bot
cp .env.example .env
```

Required environment variables:

```env
# Twitter API v2
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_secret
TWITTER_BEARER_TOKEN=your_bearer_token
TWITTER_USERNAME=your_username

# Anthropic Claude
ANTHROPIC_API_KEY=your_anthropic_api_key

# Database & Redis
DATABASE_URL=postgres://user:pass@localhost:5432/grep3
REDIS_URL=redis://localhost:6379
```

### 3. Set up database

Run database migrations from the core package:

```bash
# From monorepo root
pnpm --filter=@grep3/core migrate
```

This creates the following tables:
- `twitter_bot_voice_profiles` - Learned voice patterns from your tweets
- `twitter_bot_generated_tweets` - Generated tweets (pending, approved, posted)
- `twitter_bot_posting_schedules` - Posting frequency and preferences

### 4. Build

```bash
pnpm --filter=@grep3/twitter-bot build
```

## Usage

### Analyze Your Voice (First Time Setup)

Before generating tweets, analyze your existing tweets to learn your voice:

```bash
# Using CLI
npm run analyze

# Or specify a username
npm run analyze your_username
```

This fetches your recent tweets and builds a voice profile including:
- Typical tweet length
- Tone (casual, technical, professional, etc.)
- Common phrases you use
- Topics you cover
- Emoji/hashtag usage patterns
- Best performing patterns

### Generate Tweets

Generate tweets on a specific topic:

```bash
npm run generate "building in public" 3
```

Tweets are saved as "pending" and require approval before posting.

### Run the Web Dashboard

Start the web server to review and manage tweets:

```bash
npm run start
```

Visit http://localhost:8010 to:
- View pending tweets and their engagement scores
- Approve or reject generated tweets
- Generate new tweets
- View your voice profile
- See recently posted tweets

### Run Background Workers

For automated generation and posting:

```bash
# In separate terminals:
npm run resque:scheduler  # Handles scheduled jobs
npm run resque:worker     # Processes jobs
```

## How It Works

### Voice Analysis

The bot analyzes your tweets to extract:

1. **Writing Style**: Average length, sentence structure, vocabulary level
2. **Tone**: Technical, casual, professional, conversational, etc.
3. **Patterns**: Common phrases, question frequency, emoji usage
4. **Topics**: What you typically tweet about
5. **Best Performers**: Patterns from your highest-engagement tweets

### Content Generation

When generating tweets, Claude is given:

1. Your complete voice profile
2. 10-20 of your best tweets as style examples
3. Engagement optimization patterns
4. A list of "AI tells" to avoid

The prompt explicitly instructs Claude to:
- Match your exact writing style
- Use patterns that drive engagement
- Avoid corporate speak and AI markers
- Keep it authentic and human-sounding

### Engagement Optimization

Based on Twitter algorithm research, the bot optimizes for:

- **Hook patterns**: "Unpopular opinion:", "Here's what nobody tells you...", etc.
- **Format selection**: Lists, personal stories, contrarian takes
- **Length optimization**: Sweet spot for maximum engagement
- **Question hooks**: Drive replies and algorithm boost
- **Posting timing**: Based on when your tweets perform best

### Scoring

Each generated tweet gets an engagement score (0-100) based on:

- Length (70-100 chars is optimal)
- Presence of proven hooks
- Questions that invite engagement
- Alignment with your voice patterns
- Absence of AI markers

## Configuration Options

Set these in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `TWEETS_PER_DAY` | 3 | Target number of tweets per day |
| `MIN_HOURS_BETWEEN_POSTS` | 4 | Minimum gap between posts |
| `MAX_TWEETS_TO_ANALYZE` | 500 | How many tweets to analyze for voice |
| `TOPICS` | software development,crypto,web3 | Comma-separated topic list |
| `AUTO_POST` | false | If true, posts without manual approval |

## Docker Deployment

Build and run with Docker:

```bash
# From monorepo root

# Build images
docker build -f apps/twitter-bot/Dockerfile -t twitter-bot-web .
docker build -f apps/twitter-bot/Dockerfile.worker -t twitter-bot-worker .
docker build -f apps/twitter-bot/Dockerfile.scheduler -t twitter-bot-scheduler .

# Run with docker-compose
docker-compose up twitter-bot-web twitter-bot-worker twitter-bot-scheduler
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Dashboard |
| GET | `/api/tweets/pending` | List pending tweets |
| POST | `/api/tweets/:id/approve` | Approve a tweet |
| POST | `/api/tweets/:id/reject` | Reject a tweet |
| POST | `/api/generate` | Generate new tweets |
| POST | `/api/analyze` | Re-analyze voice |
| GET | `/api/voice-profile` | Get voice profile |
| POST | `/api/schedule` | Update posting schedule |

## Safety Features

1. **Manual Approval by Default**: Tweets require approval before posting
2. **Rate Limiting**: Respects min hours between posts
3. **No Secrets in Tweets**: Won't include API keys or sensitive data
4. **Engagement Score Threshold**: Low-scoring tweets are flagged
5. **AI Detection**: Scores penalize common AI markers

## Troubleshooting

### "Not enough tweets for analysis"

You need at least 20 original tweets (not replies/retweets) for voice analysis.

### "No voice profile found"

Run `npm run analyze` before generating tweets.

### Tweets sound too formal

Your voice profile may be based on limited data. Try:
1. Running analysis with more tweets (`MAX_TWEETS_TO_ANALYZE=1000`)
2. Regenerating with feedback: "make it more casual and conversational"

### Low engagement scores

Check that your generated tweets:
- Include hooks from your best performers
- Match your typical tweet length
- Don't have AI tells

## License

MIT
