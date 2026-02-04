# finPal Demo Mode Documentation

This document explains how the demo mode system works in finPal, including backend setup, frontend integration, and how to replicate it in other palStack applications.

## Overview

Demo mode provides pre-configured accounts with sample data that users can try without registration. Key features:
- **Pre-seeded demo accounts** with realistic financial data
- **Timed sessions** (default 10 minutes) with automatic logout
- **Restricted features** (no CSV import, no API key settings)
- **Visual indicators** showing demo status and time remaining

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Web UI)                        │
├─────────────────────────────────────────────────────────────────┤
│  Login.tsx          │  DemoBanner.tsx    │  useDemoTimer.ts     │
│  - Fetches demo     │  - Shows countdown │  - Manages timer     │
│    accounts on load │  - Visual urgency  │  - Auto-logout       │
│  - Quick-login      │  - CTA to register │  - Calculates        │
│    buttons          │                    │    remaining time    │
├─────────────────────────────────────────────────────────────────┤
│                         authStore.ts                             │
│  - Stores isDemoUser, demoExpiresAt                              │
│  - Persisted to localStorage                                     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend (Flask)                          │
├─────────────────────────────────────────────────────────────────┤
│  api/v1/demo.py     │  api/v1/auth.py    │  services/demo/      │
│  - GET /status      │  - Returns         │    service.py        │
│  - GET /accounts    │    demo_expires_at │  - Seeds accounts    │
│                     │    for demo users  │  - Creates mock data │
├─────────────────────────────────────────────────────────────────┤
│                         config.py                                │
│  - DEMO_MODE (bool)                                              │
│  - DEMO_TIMEOUT_MINUTES (int, default: 10)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Backend Implementation

### 1. Configuration (`src/config.py`)

```python
# Demo mode
DEMO_MODE = os.getenv('DEMO_MODE', 'False').lower() == 'true'
DEMO_TIMEOUT_MINUTES = int(os.getenv('DEMO_TIMEOUT_MINUTES', 10))
MAX_CONCURRENT_DEMO_SESSIONS = int(os.getenv('MAX_CONCURRENT_DEMO_SESSIONS', 10))
```

**Environment Variables:**
| Variable | Default | Description |
|----------|---------|-------------|
| `DEMO_MODE` | `false` | Enable/disable demo mode |
| `DEMO_TIMEOUT_MINUTES` | `10` | Session timeout in minutes |
| `MAX_CONCURRENT_DEMO_SESSIONS` | `10` | Max simultaneous demo sessions |

### 2. Demo Service (`src/services/demo/service.py`)

The demo service handles:
- **Account definitions** - Email, password, name, persona, currency
- **Seeding on startup** - Creates accounts if they don't exist
- **Mock data generation** - Transactions, budgets, accounts, investments

#### Demo Account Structure

```python
DEMO_ACCOUNTS = [
    {
        'email': 'demo1@finpal.demo',
        'password': 'demo1234',
        'name': 'Alex Demo',
        'currency': 'USD',
        'persona': 'Personal budgeter',
        'description': 'Personal finance enthusiast tracking daily expenses'
    },
    # ... more accounts
]
```

#### Personas

Each demo account has a different "persona" with tailored mock data:

| Persona | Currency | Focus |
|---------|----------|-------|
| Personal budgeter | USD | Daily expenses, budgets |
| International user | EUR | Multi-currency, travel |
| Group expense tracker | USD | Shared expenses, splits |
| Investor | GBP | Portfolios, dividends |

#### Mock Data Seeding

When a demo user is created, the service automatically generates:
- **Bank accounts** (checking, credit, investment based on persona)
- **60 days of transactions** (income, expenses by category)
- **Budgets** (monthly limits for key categories)
- **Investments** (for investor persona only)
- **Groups** (shared expense groups)

### 3. Demo API Endpoints (`api/v1/demo.py`)

```
GET /api/v1/demo/status
```
Returns demo mode status:
```json
{
  "enabled": true,
  "timeout_minutes": 10
}
```

```
GET /api/v1/demo/accounts
```
Returns demo account credentials (only when demo mode is enabled):
```json
[
  {
    "email": "demo1@finpal.demo",
    "password": "demo1234",
    "name": "Alex Demo",
    "persona": "Personal budgeter",
    "currency": "USD"
  }
]
```

### 4. Auth Integration (`api/v1/auth.py`)

On login, the auth endpoint checks if the user is a demo user and sets appropriate token expiry:

```python
is_demo = user.is_demo_user
demo_timeout_minutes = current_app.config.get('DEMO_TIMEOUT_MINUTES', 10)

if is_demo:
    access_expires = timedelta(minutes=demo_timeout_minutes)
    refresh_expires = timedelta(minutes=demo_timeout_minutes)
    demo_expires_at = (datetime.utcnow() + access_expires).isoformat() + 'Z'
else:
    access_expires = timedelta(hours=24)
    refresh_expires = timedelta(days=30)
    demo_expires_at = None
```

The login response includes `demo_expires_at` for demo users:
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "user": {
    "id": "demo1@finpal.demo",
    "name": "Alex Demo",
    "is_demo_user": true,
    ...
  },
  "demo_expires_at": "2026-02-04T15:00:00Z"
}
```

### 5. User Model (`src/models/user.py`)

The User model has an `is_demo_user` boolean field:

```python
class User(db.Model):
    # ...
    is_demo_user = db.Column(db.Boolean, default=False)
```

### 6. App Initialization (`src/__init__.py`)

Demo accounts are seeded on app startup:

```python
def create_app():
    # ... app setup ...

    with app.app_context():
        # Seed demo accounts if demo mode is enabled
        if app.config.get('DEMO_MODE', False):
            from src.services.demo import DemoService
            result = DemoService.seed_demo_accounts()
            app.logger.info(f"Demo mode enabled: {result.get('message', 'Demo accounts ready')}")
```

---

## Frontend Implementation

### 1. Demo Service (`services/demoService.ts`)

```typescript
export const demoService = {
  async getDemoStatus(): Promise<DemoStatus> {
    const response = await api.get<DemoStatus>('/api/v1/demo/status');
    return response.data;
  },

  async getDemoAccounts(): Promise<DemoAccount[]> {
    const response = await api.get<DemoAccount[]>('/api/v1/demo/accounts');
    return response.data;
  },
};
```

### 2. Login Page Integration (`pages/Login.tsx`)

On mount, the login page:
1. Fetches demo status from `/api/v1/demo/status`
2. If enabled, fetches demo accounts from `/api/v1/demo/accounts`
3. Displays demo account buttons for one-click login

```typescript
useEffect(() => {
  const fetchDemoStatus = async () => {
    const status = await demoService.getDemoStatus();
    setDemoStatus(status);

    if (status.enabled) {
      const accounts = await demoService.getDemoAccounts();
      setDemoAccounts(accounts);
    }
  };
  fetchDemoStatus();
}, []);
```

Demo login handler:
```typescript
const handleDemoLogin = async (account: DemoAccount) => {
  const response = await authService.login({
    email: account.email,
    password: account.password
  });
  login(response.user, response.access_token, response.refresh_token, response.demo_expires_at);
  navigate('/dashboard');
};
```

### 3. Auth Store (`store/authStore.ts`)

The auth store tracks demo-specific state:

```typescript
interface AuthStore {
  // ... other fields ...
  isDemoUser: boolean;
  demoExpiresAt: string | null;

  login: (user: User, accessToken: string, refreshToken: string, demoExpiresAt?: string) => void;
  setDemoExpiry: (expiresAt: string | null) => void;
  checkDemoExpiry: () => boolean;
}
```

### 4. Demo Timer Hook (`hooks/useDemoTimer.ts`)

Manages countdown and auto-logout:

```typescript
export function useDemoTimer(): UseDemoTimerReturn {
  const { isDemoUser, demoExpiresAt, logout } = useAuthStore();
  const navigate = useNavigate();
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    if (!isDemoUser || !demoExpiresAt) return;

    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setRemainingSeconds(remaining);

      if (remaining <= 0) {
        logout();
        navigate('/login', {
          state: { message: 'Your demo session has expired. Thank you for trying finPal!' }
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isDemoUser, demoExpiresAt]);

  return {
    remainingSeconds,
    isDemo: isDemoUser,
    formattedTime: formatTime(remainingSeconds),
    isExpired,
  };
}
```

### 5. Demo Banner Component (`components/DemoBanner.tsx`)

Displays a sticky banner for demo users showing:
- "Demo Mode" badge
- Time remaining countdown
- Feature restrictions notice
- "Sign up for free" CTA

The banner changes color based on urgency:
- **Blue** (default) - More than 3 minutes remaining
- **Orange** (warning) - Less than 3 minutes
- **Red** (urgent) - Less than 1 minute

```typescript
const getBannerStyle = () => {
  if (remainingSeconds < 60) {  // Urgent - red
    return { background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' };
  }
  if (remainingSeconds < 180) {  // Warning - orange
    return { background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)' };
  }
  return { background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' };  // Default - blue
};
```

### 6. Layout Integration

Add the DemoBanner to your main layout:

```typescript
// In your main layout component
import { DemoBanner } from '../components/DemoBanner';

export const MainLayout = ({ children }) => {
  return (
    <>
      <DemoBanner />
      <Header />
      <Sidebar />
      <main>{children}</main>
    </>
  );
};
```

---

## Docker Setup

### docker-compose.local.yml

```yaml
services:
  backend:
    environment:
      # Demo mode - set to true for demo, false for production
      DEMO_MODE: ${DEMO_MODE:-true}
      DEMO_TIMEOUT_MINUTES: ${DEMO_TIMEOUT_MINUTES:-10}
```

### Running with Demo Mode

```bash
# Enable demo mode (default in local)
docker compose -f docker-compose.local.yml up -d

# Disable demo mode
DEMO_MODE=false docker compose -f docker-compose.local.yml up -d

# Custom timeout (30 minutes)
DEMO_TIMEOUT_MINUTES=30 docker compose -f docker-compose.local.yml up -d
```

---

## How to Replicate for Other palStack Apps

### Step 1: Backend

1. **Add config variables** to `config.py`:
   ```python
   DEMO_MODE = os.getenv('DEMO_MODE', 'False').lower() == 'true'
   DEMO_TIMEOUT_MINUTES = int(os.getenv('DEMO_TIMEOUT_MINUTES', 10))
   ```

2. **Add `is_demo_user` field** to User model:
   ```python
   is_demo_user = db.Column(db.Boolean, default=False)
   ```

3. **Create demo service** (`services/demo/service.py`):
   - Define `DEMO_ACCOUNTS` list with credentials and personas
   - Implement `seed_demo_accounts()` for startup seeding
   - Implement `_seed_user_data()` for mock data generation
   - Customize mock data for your app's domain

4. **Create demo API endpoints** (`api/v1/demo.py`):
   - `GET /status` - returns enabled status and timeout
   - `GET /accounts` - returns demo account list

5. **Modify auth login** to return `demo_expires_at` for demo users

6. **Seed on startup** in `create_app()`:
   ```python
   if app.config.get('DEMO_MODE', False):
       from services.demo import DemoService
       DemoService.seed_demo_accounts()
   ```

### Step 2: Frontend

1. **Create demo service** (`services/demoService.ts`)

2. **Add to auth store**:
   - `isDemoUser: boolean`
   - `demoExpiresAt: string | null`

3. **Create useDemoTimer hook** for countdown and auto-logout

4. **Create DemoBanner component** with countdown display

5. **Modify Login page** to show demo accounts when enabled

6. **Add DemoBanner** to main layout

### Step 3: Docker

1. Add `DEMO_MODE` and `DEMO_TIMEOUT_MINUTES` to environment variables

---

## Demo Accounts Reference

| Email | Password | Name | Persona | Currency |
|-------|----------|------|---------|----------|
| demo1@finpal.demo | demo1234 | Alex Demo | Personal budgeter | USD |
| demo2@finpal.demo | demo1234 | Morgan Demo | International user | EUR |
| demo3@finpal.demo | demo1234 | Jordan Demo | Group expense tracker | USD |
| demo4@finpal.demo | demo1234 | Taylor Demo | Investor | GBP |

---

## Testing Demo Mode

```bash
# Check if demo mode is enabled
curl http://localhost:8085/api/v1/demo/status

# Get demo accounts
curl http://localhost:8085/api/v1/demo/accounts

# Login with demo account
curl -X POST http://localhost:8085/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo1@finpal.demo","password":"demo1234"}'
```

---

## File Reference

### Backend Files
- `src/config.py` - Demo configuration
- `src/services/demo/service.py` - Demo account seeding and data generation
- `src/services/demo/__init__.py` - Service exports
- `api/v1/demo.py` - Demo API endpoints
- `api/v1/auth.py` - Login with demo expiry
- `src/models/user.py` - User model with is_demo_user field
- `src/__init__.py` - App initialization with demo seeding

### Frontend Files
- `services/demoService.ts` - Demo API calls
- `store/authStore.ts` - Auth state with demo fields
- `hooks/useDemoTimer.ts` - Countdown and auto-logout hook
- `components/DemoBanner.tsx` - Demo mode banner component
- `pages/Login.tsx` - Login page with demo accounts display
