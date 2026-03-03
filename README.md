# AI-Powered CRM Leads Generator

A fully functional, AI-enabled CRM system for generating and managing leads with beautiful particle effects and modern UI.

## Features

- 🤖 **AI-Powered Lead Processing**: Uses OpenAI to analyze and enrich lead data
- 🎨 **Beautiful UI**: Modern design with particle effects, gradient colors, and smooth animations
- 📊 **Lead Dashboard**: Comprehensive dashboard to view, filter, and manage leads
- 🔍 **Smart Search & Filter**: Search leads by company, contact, industry, or email
- 📈 **Lead Scoring**: AI-generated lead scores and priority levels
- 🎯 **Recommended Actions**: AI-suggested next steps for each lead
- ✨ **Particle Effects**: Interactive particle background that responds to cursor movement and scrolling
- 📱 **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices

## Tech Stack

- **React 18** - Modern React with hooks
- **Vite** - Fast build tool and dev server
- **React Router** - Multi-page dashboard layout
- **React Query** - Data fetching & caching
- **Supabase (Postgres + Auth + RLS)** - Backend, database, and auth
- **OpenAI API** - AI-powered lead processing and scoring
- **TSParticles** - Particle effects background
- **Lucide React** - Modern icon library
- **Recharts** - Analytics charts (ready to extend)

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd CRMLeads
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

4. Add your OpenAI API key to `.env`:
```
VITE_OPENAI_API_KEY=your_actual_api_key_here
```

5. Start the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Deployment to Vercel

### Option 1: Deploy via Vercel CLI

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

3. Add your environment variable in Vercel dashboard:
   - Go to your project settings
   - Navigate to Environment Variables
   - Add `VITE_OPENAI_API_KEY` with your API key

### Option 2: Deploy via GitHub

1. Push your code to GitHub

2. Import your repository in [Vercel](https://vercel.com)

3. Add environment variable `VITE_OPENAI_API_KEY` in project settings

4. Deploy!

## Project Structure

```
CRMLeads/
├── src/
│   ├── components/
│   │   ├── Header.jsx          # Navigation header
│   │   ├── LeadGenerator.jsx   # Lead generation form
│   │   ├── LeadDashboard.jsx   # Lead management dashboard
│   │   └── ParticleBackground.jsx  # Particle effects
│   ├── services/
│   │   └── openaiService.js    # OpenAI integration
│   ├── App.jsx                 # Main app component
│   ├── main.jsx                # Entry point
│   └── index.css               # Global styles
├── index.html
├── package.json
├── vite.config.js
└── vercel.json                 # Vercel configuration
```

## Usage

### Generating Leads

1. Navigate to the "Generate Leads" tab
2. Fill in the required fields (Company Name, Industry, Contact Name, Email)
3. Optionally fill in additional fields for better AI analysis
4. Click "Generate Lead" to process with AI
5. The AI will analyze the data and generate:
   - Lead score (0-100)
   - Priority level (high/medium/low)
   - Recommended actions
   - Estimated value
   - Next steps
   - Tags

### Managing Leads

1. Navigate to the "Dashboard" tab
2. Use the search bar to find specific leads
3. Filter by priority level
4. Click on a lead card to view detailed information
5. View AI analysis, contact information, and recommended actions

## Environment Variables

- `VITE_OPENAI_API_KEY` - Your OpenAI API key (required)
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon public key

## Color Scheme

The app uses a modern, AI-themed color palette:
- **Primary**: Indigo (#6366f1)
- **Secondary**: Purple (#8b5cf6)
- **Accent**: Pink (#ec4899)
- **Background**: Dark slate (#0f172a)
- **Text**: Light slate (#f1f5f9)

## Features in Detail

### AI Lead Processing

The OpenAI service processes lead data and provides:
- Intelligent lead scoring
- Priority classification
- Actionable recommendations
- Value estimation
- Next steps guidance

### Particle Effects

Interactive particle background that:
- Responds to cursor movement
- Reacts to scrolling
- Creates beautiful visual effects
- Enhances the AI-themed aesthetic

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project for your own purposes.

## Support

For issues and questions, please open an issue on GitHub.

---

Built with ❤️ using React and OpenAI
