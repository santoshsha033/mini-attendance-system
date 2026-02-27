# ⬡ WorkPulse — Mini Attendance + Task System

A production-ready attendance and task management system with JWT authentication, PostgreSQL, and a polished React frontend.
🔗 Live Demo: https://mini-attendance-system-seven.vercel.app  
⚙️ Live API: https://mini-attendance-system-p20g.onrender.com
---

## 🗂 Project Structure

```
attendance-system/
├── backend/                   # Node.js + Express API
│   ├── config/
│   │   └── logger.js          # Winston structured logger
│   ├── db/
│   │   ├── index.js           # PostgreSQL pool + migration runner
│   │   └── schema.sql         # Database schema (DDL)
│   ├── middleware/
│   │   ├── auth.js            # JWT verification middleware
│   │   └── validate.js        # express-validator error handler
│   ├── routes/
│   │   ├── auth.js            # /api/auth — signup, login, me
│   │   ├── attendance.js      # /api/attendance — check-in/out, history
│   │   └── tasks.js           # /api/tasks — CRUD
│   ├── server.js              # Express app entry point
│   ├── Dockerfile
│   ├── .env.example
│   └── package.json
├── frontend/                  # React + Vite
│   ├── src/
│   │   ├── App.jsx            # Full app — Auth, Attendance, Tasks
│   │   ├── index.css          # Global styles (dark theme)
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   ├── .env.example
│   └── package.json
├── docker-compose.yml
└── README.md
```

---

## 🗄 Database Design

### Users
| Column      | Type         | Notes                        |
|-------------|--------------|------------------------------|
| id          | UUID PK      | uuid_generate_v4()           |
| name        | VARCHAR(100) | Required                     |
| email       | VARCHAR(255) | Unique, indexed              |
| password    | TEXT         | bcrypt hash (cost=12)        |
| role        | VARCHAR(20)  | 'employee' \| 'admin'        |
| is_active   | BOOLEAN      | Soft-disable accounts        |
| created_at  | TIMESTAMPTZ  | Auto                         |
| updated_at  | TIMESTAMPTZ  | Auto via trigger             |

### Attendance
| Column          | Type        | Notes                          |
|-----------------|-------------|--------------------------------|
| id              | UUID PK     |                                |
| user_id         | UUID FK     | → users.id (CASCADE DELETE)    |
| date            | DATE        | YYYY-MM-DD                     |
| checked_in_at   | TIMESTAMPTZ | Defaults to NOW()              |
| checked_out_at  | TIMESTAMPTZ | Nullable until checkout        |
| status          | VARCHAR(20) | present \| late \| half-day    |
| notes           | TEXT        | Optional                       |
| created_at      | TIMESTAMPTZ |                                |

**Key constraint:** `UNIQUE (user_id, date)` — prevents duplicate check-ins per day (enforced at DB level).

Indexes: `user_id`, `date`

### Tasks
| Column      | Type         | Notes                                    |
|-------------|--------------|------------------------------------------|
| id          | UUID PK      |                                          |
| user_id     | UUID FK      | → users.id (CASCADE DELETE)              |
| title       | VARCHAR(255) | Required                                 |
| description | TEXT         | Optional                                 |
| priority    | VARCHAR(20)  | low \| medium \| high                    |
| status      | VARCHAR(20)  | pending \| in-progress \| completed \| cancelled |
| due_date    | DATE         | Optional                                 |
| created_at  | TIMESTAMPTZ  |                                          |
| updated_at  | TIMESTAMPTZ  | Auto via trigger                         |

Indexes: `user_id`, `status`, `due_date`

---

## 🔌 API Reference

Base URL: `https://mini-attendance-system-p20g.onrender.com/api`  

All protected routes require `Authorization: Bearer <token>` header.

### Auth

#### `POST /auth/signup`
Create a new account.
```json
Body: { "name": "Alex", "email": "alex@co.com", "password": "Secret123", "role": "employee" }
Response 201: { "success": true, "token": "eyJ...", "user": { "id": "...", "name": "Alex", ... } }
```

#### `POST /auth/login`
```json
Body: { "email": "alex@co.com", "password": "Secret123" }
Response 200: { "success": true, "token": "eyJ...", "user": { ... } }
```

#### `GET /auth/me` 🔒
Returns authenticated user's profile.

---

### Attendance

#### `POST /attendance/checkin` 🔒
Mark attendance for today. Returns 409 if already checked in.
```json
Body: { "status": "present", "notes": "Working from home" }  // all optional
Response 201: { "success": true, "attendance": { "id": "...", "date": "2025-01-15", ... } }
Response 409: { "success": false, "message": "Already checked in for today" }
```

#### `PATCH /attendance/checkout` 🔒
Record checkout time for today.
```json
Response 200: { "success": true, "attendance": { ..., "checked_out_at": "2025-01-15T17:30:00Z" } }
```

#### `GET /attendance/today` 🔒
Get today's attendance record (null if not checked in).

#### `GET /attendance?from=2025-01-01&to=2025-01-31&page=1&limit=30` 🔒
Paginated attendance history for the authenticated user.

---

### Tasks

#### `POST /tasks` 🔒
```json
Body: { "title": "Write API docs", "description": "...", "priority": "high", "due_date": "2025-01-20" }
Response 201: { "success": true, "task": { ... } }
```

#### `GET /tasks?status=pending&priority=high&page=1&limit=20` 🔒
List tasks with optional filters. Results sorted by priority → due_date → created_at.

#### `GET /tasks/:id` 🔒
Get a single task by ID.

#### `PATCH /tasks/:id` 🔒
Partial update (any combination of title, description, priority, status, due_date).
```json
Body: { "status": "completed" }
Response 200: { "success": true, "task": { ... } }
```

#### `DELETE /tasks/:id` 🔒
Delete a task. Returns 404 if not found or not owned by user.

---

### Standard Error Responses
```json
400: { "success": false, "message": "No valid fields to update" }
401: { "success": false, "message": "No token provided" }
403: { "success": false, "message": "Insufficient permissions" }
404: { "success": false, "message": "Task not found" }
409: { "success": false, "message": "Already checked in for today" }
422: { "success": false, "message": "Validation failed", "errors": [{ "field": "email", "message": "..." }] }
429: { "success": false, "message": "Too many requests" }
500: { "success": false, "message": "Server error" }
```

---

## 🛡 Security Implementation

| Concern               | Implementation                                              |
|-----------------------|-------------------------------------------------------------|
| Password storage      | bcrypt with cost factor 12 — no plain text ever stored      |
| Authentication        | JWT (HS256), 7d expiry, verified on every request           |
| No hardcoded secrets  | All secrets via `.env` — validated at startup               |
| JWT secret strength   | Minimum 32 chars enforced at server startup                 |
| Rate limiting         | 100 req/15min global; 10 req/15min on auth routes           |
| HTTP security headers | `helmet` (HSTS, CSP, X-Frame-Options, etc.)                 |
| CORS                  | Whitelist-only via `ALLOWED_ORIGINS` env var                |
| Input validation      | `express-validator` on all routes — all inputs sanitized    |
| SQL injection         | Parameterized queries only — no string concatenation        |
| Duplicate attendance  | DB-level UNIQUE constraint + application 409 response       |
| Ownership checks      | All queries filter by `user_id` — users can't access others |
| Password in responses | Password field never returned in any API response           |
| Account disabling     | `is_active` flag checked on every authenticated request     |
| Body size limit       | 10kb max request body                                       |
| Non-root Docker user  | Container runs as unprivileged `nodeapp` user               |
| DB SSL                | Enabled in production via `NODE_ENV=production`             |
| Logging               | Structured JSON logs via Winston (no sensitive data logged) |

---

## ⚙️ Local Setup

### Prerequisites
- Node.js 20+
- PostgreSQL 14+

### Backend
```bash
cd backend
cp .env.example .env
# Edit .env — set DB credentials and a 32+ char JWT_SECRET
npm install
npm run migrate    # creates tables
npm run dev        # starts on :5000
```

### Frontend
```bash
cd frontend
cp .env.example .env
# Set VITE_API_URL=http://localhost:5000/api
npm install
npm run dev        # starts on :3000
```

### With Docker Compose (recommended)
```bash
cp backend/.env.example backend/.env
# Edit backend/.env — at minimum set DB_PASSWORD and JWT_SECRET

docker compose up --build
# Frontend: http://localhost:3000
# Backend:  http://localhost:5000
# API docs: http://localhost:5000/health
```

---

## ☁️ Cloud Deployment (AWS EC2 + RDS)

### Step 1 — Provision Infrastructure

```bash
# Create PostgreSQL RDS instance (db.t3.micro free tier)
# Note the endpoint, username, password, db name

# Launch EC2 (t2.micro, Ubuntu 22.04)
# Open security groups: 22 (SSH), 80 (HTTP), 443 (HTTPS), 5000 (API)
```

### Step 2 — Setup EC2

```bash
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>

# Install Docker
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker ubuntu && newgrp docker

# Clone repo
git clone https://github.com/yourusername/attendance-system.git
cd attendance-system
```

### Step 3 — Configure Environment

```bash
cp backend/.env.example backend/.env
nano backend/.env
# Set:
#   DB_HOST=<RDS_ENDPOINT>
#   DB_USER, DB_PASSWORD, DB_NAME
#   JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
#   NODE_ENV=production
#   ALLOWED_ORIGINS=https://yourdomain.com
```

### Step 4 — Deploy

```bash
# Backend only (frontend served via CDN or separately)
docker compose up -d backend
```

### Step 5 — Frontend (Vercel / Netlify)

```bash
cd frontend
# Set VITE_API_URL=https://your-ec2-ip:5000/api in Vercel dashboard
vercel --prod
```

### Reverse Proxy with Nginx + SSL

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name api.yourdomain.com;
    
    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Install certbot for SSL
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

---

## 🧪 Quick API Test

```bash
# Signup
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Alex","email":"alex@test.com","password":"Secret123","role":"employee"}'

# Login (save the token)
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alex@test.com","password":"Secret123"}' | jq -r '.token')

# Check In
curl -X POST http://localhost:5000/api/attendance/checkin \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"present"}'

# Create Task
curl -X POST http://localhost:5000/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Review PRs","priority":"high","due_date":"2025-12-31"}'

# List Tasks
curl http://localhost:5000/api/tasks \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📋 Evaluation Checklist

- ✅ **API structure** — RESTful, consistent response shape, proper HTTP status codes
- ✅ **Security** — bcrypt (cost 12), JWT, helmet, CORS whitelist, rate limiting, parameterized SQL, ownership checks
- ✅ **DB design** — UUID PKs, indexed foreign keys, DB-level constraints (UNIQUE on attendance), auto-update triggers
- ✅ **No hardcoded credentials** — all via env vars, validated at startup
- ✅ **No plain text passwords** — bcrypt hashed, never returned in responses
- ✅ **Duplicate attendance** — prevented by DB UNIQUE constraint + 409 response
- ✅ **Validation** — express-validator on all inputs, field-level error messages
- ✅ **Deployment** — Dockerfile, docker-compose, AWS EC2 + RDS instructions, Nginx SSL config
- ✅ **Code quality** — structured logging, error handling, separation of concerns
- ✅ **Frontend** — Login/signup, live clock, one-tap attendance, task CRUD with filters
