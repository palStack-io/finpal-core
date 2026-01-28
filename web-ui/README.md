# DollarPal Web App

**Modern React-based web frontend for Dollar Dollar Bill Y'all**

Part of the **PalStacks** ecosystem.

## 🎨 Branding

This app uses **currency-based branding**:
- **USD** → DollarPal
- **EUR** → EuroPal
- **GBP** → PoundPal
- **INR** → RupeePal
- And more...

Users select their preferred currency during onboarding, which determines the app name and branding displayed throughout.

## 🚀 Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **State Management**: Zustand
- **API Client**: Axios + TanStack Query
- **Date Handling**: date-fns

## 📁 Project Structure

```
dollardollar-web/
├── src/
│   ├── assets/          # Images, fonts, static files
│   │   └── images/      # dddby.png, dollar.png logos
│   ├── components/      # React components
│   │   ├── auth/        # Login, Register, Onboarding
│   │   ├── layout/      # Header, Sidebar, Footer
│   │   └── common/      # Reusable UI components
│   ├── config/          # App configuration
│   │   ├── branding.ts  # Currency-based branding logic
│   │   ├── theme.ts     # Color palette & design tokens
│   │   └── api.ts       # API endpoints configuration
│   ├── hooks/           # Custom React hooks
│   ├── pages/           # Page components (routes)
│   ├── services/        # API service functions
│   ├── store/           # Zustand state stores
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Utility functions
├── .env                 # Environment variables
├── Dockerfile           # Docker container config
└── nginx.conf          # Nginx config for production
```

## 🎨 Design System

### Color Palette
Ported from the original HTML theme:

```css
Primary Green:    #15803d
Dark Green:       #166534
Accent Gold:      #fbbf24
Light Gold:       #fef3c7
Background Dark:  #111827
Background Darker:#030712
Money Green:      #22c55e
```

### Key Design Features
- Dark theme with gradient background
- Money symbol grid background
- Smooth transitions and hover effects
- Custom scrollbar styling
- Rounded cards with backdrop blur

## 🔧 Setup & Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Environment Variables

Create a `.env` file with:

```env
VITE_API_BASE_URL=http://localhost:5000
VITE_DEFAULT_CURRENCY=USD
VITE_APP_NAME=DollarPal
VITE_PARENT_BRAND=PalStacks
```

## 📦 Building for Production

```bash
# Build the app
npm run build

# Preview production build
npm run preview
```

## 🐳 Docker

### Build Docker image

```bash
docker build -t dollardollar-web .
```

### Run container

```bash
docker run -p 3000:80 dollardollar-web
```

## 🔐 User Onboarding Flow

On first login, users are prompted to set:

1. **Default Currency** - Determines app branding (DollarPal/EuroPal/etc)
2. **Timezone** - For accurate transaction timestamps
3. **Notification Preferences** - Email, push, budget alerts, etc.

These settings can be changed later in user preferences.

## 🌐 API Integration

The web app communicates with the Flask backend at:
- **Development**: `http://localhost:5000`
- **Production**: Set via `VITE_API_BASE_URL`

API endpoints are defined in `src/config/api.ts`

## 📱 Related Projects

- **dollardollar-mobile/** - React Native mobile app (iOS/Android)
- **dollardollar/** - Flask backend API

## 🎯 Roadmap

- [x] Basic Vite + React setup
- [x] Tailwind CSS configuration
- [x] Branding system with currency support
- [x] Theme configuration
- [ ] Authentication pages (Login/Register)
- [ ] User onboarding flow
- [ ] Dashboard
- [ ] Transactions management
- [ ] Budgets & analytics
- [ ] Settings & preferences

## 📄 License

Part of the Dollar Dollar Bill Y'all project.

---

**Built with ❤️ for the PalStacks ecosystem**
