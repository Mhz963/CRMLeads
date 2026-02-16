# Quick Setup Guide

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Environment Variables

Create a `.env` file in the root directory with your keys:

```
VITE_OPENAI_API_KEY=sk-your-actual-api-key-here
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

**Important**: 
- Never commit your `.env` file to version control
- Get your OpenAI key from [OpenAI Platform](https://platform.openai.com/api-keys)
- Get your Supabase URL and anon key from Supabase project settings → API
- The `.env` file is already in `.gitignore`

## Step 3: Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Step 4: Build for Production

```bash
npm run build
```

## Step 5: Deploy to Vercel

### Using Vercel CLI:

1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel`
3. Add environment variable `VITE_OPENAI_API_KEY` in Vercel dashboard

### Using GitHub:

1. Push code to GitHub
2. Import repository in Vercel
3. Add `VITE_OPENAI_API_KEY` in project settings
4. Deploy!

## Troubleshooting

### OpenAI API Errors

- Make sure your API key is correct
- Check that you have credits in your OpenAI account
- Verify the API key is set in `.env` file (not `.env.local`)

### Build Errors

- Make sure all dependencies are installed: `npm install`
- Clear node_modules and reinstall if needed: `rm -rf node_modules && npm install`

### Particle Effects Not Showing

- Check browser console for errors
- Ensure `tsparticles` and `react-particles` are installed
- Try clearing browser cache
