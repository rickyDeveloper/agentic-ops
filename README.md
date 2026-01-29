# ACIP Dashboard - AUSTRAC Compliant Customer Identification System

An operations dashboard for managing ACIP (Applicable Customer Identification Procedure) with agentic AI workflow and human-in-the-loop controls, built for AUSTRAC compliance.

## Features

- **AI-Powered Document Extraction**: Automatically extract KYC data from ID documents using Gemini or OpenAI
- **LangGraph Workflow Engine**: State machine-based workflow with checkpointing and resumability
- **Human-in-the-Loop (HITL)**: Operations dashboard for review, approval, rejection, and escalation
- **AUSTRAC Compliance**: 15 business day deadline tracking, comprehensive audit trails
- **Real-time Updates**: WebSocket-based live dashboard updates
- **Risk Assessment**: Automatic risk classification with configurable auto-approval for low-risk cases

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      React Frontend                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │Dashboard │  │Case List │  │Case View │  │Actions   │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
                            │ HTTP / WebSocket
┌─────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ REST API     │  │ WebSocket    │  │ LangGraph    │          │
│  │ /api/cases   │  │ /ws/cases    │  │ Workflow     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                              │                   │
│  ┌──────────────────────────────────────────┘                   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐             │
│  │  │ Extract    │──│ AI Review  │──│ Verify     │──┐          │
│  │  │ Document   │  │ (Reviewer) │  │ Database   │  │          │
│  │  └────────────┘  └────────────┘  └────────────┘  │          │
│  │                                                   │          │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐ │          │
│  │  │ Human      │◄─│ Process    │──│ Finalize   │◄┘          │
│  │  │ Review     │  │ Decision   │  │ Case       │             │
│  │  │ (HITL)     │  └────────────┘  └────────────┘             │
│  │  └────────────┘                                              │
│  └──────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ acip_cases   │  │ case_actions │  │ audit_logs   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## ACIP Workflow States

```
[New Request] → Pending → Processing → AI Review → Verify
                                                      │
                    ┌─────────────────────────────────┤
                    │                                 │
                    ▼                                 ▼
              Awaiting Human ◄──────────────── Auto-Verified
                    │                          (Low Risk)
        ┌───────────┼───────────┬───────────┐
        │           │           │           │
        ▼           ▼           ▼           ▼
    Approved    Rejected    Escalated   Docs Requested
```

## Quick Start

### Prerequisites

- Docker and Docker Compose
- API key for Gemini or OpenAI

### 1. Clone and Configure

```bash
cd agentic-ops

# Create .env file from example
cp .env.example .env

# Edit .env and add your API key
nano .env
```

### 2. Start with Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

### 3. Access the Dashboard

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## Development Setup (Without Docker)

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/acip_db
export GEMINI_API_KEY=your_api_key

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/cases` | Create new ACIP request |
| GET | `/api/cases` | List cases with filters |
| GET | `/api/cases/{id}` | Get case details |
| PATCH | `/api/cases/{id}` | Update case |
| GET | `/api/cases/stats` | Get dashboard statistics |
| POST | `/api/cases/{id}/actions` | Perform HITL action |
| GET | `/api/cases/{id}/actions` | List case actions |
| GET | `/api/cases/{id}/audit` | Get audit trail |
| WS | `/ws/cases` | Real-time updates |

## Human-in-the-Loop Actions

| Action | Description |
|--------|-------------|
| `approve` | Approve the ACIP verification |
| `reject` | Reject with reason |
| `escalate` | Escalate to senior reviewer |
| `request_docs` | Request additional documents |
| `manual_override` | Override extracted data |
| `add_note` | Add note without status change |
| `assign` | Assign to specific operator |

## AUSTRAC Compliance Features

Based on [Chapter 79 of the AML/CTF Rules](https://www.austrac.gov.au/business/how-comply-guidance-and-resources/guidance-resources/carrying-out-applicable-customer-identification-after-commencing-open-bank-account):

1. **15 Business Day Deadline**: Automatic tracking of ACIP completion deadline
2. **Risk-Based Systems**: Configurable risk assessment and routing
3. **Comprehensive Audit Trail**: Full documentation of all processing steps
4. **Human Review**: Required for flagged or high-risk cases
5. **Escalation Path**: Support for escalation to senior reviewers
6. **Document Request Workflow**: Ability to request additional documents

## Project Structure

```
agentic-ops/
├── backend/
│   ├── app/
│   │   ├── api/           # API endpoints
│   │   ├── core/          # Core utilities (audit)
│   │   ├── models/        # Database models
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── services/      # Business logic
│   │   │   ├── acip_agent.py    # AI extraction
│   │   │   └── workflow.py      # LangGraph workflow
│   │   ├── config.py      # Configuration
│   │   ├── database.py    # Database setup
│   │   └── main.py        # FastAPI app
│   ├── alembic/           # Database migrations
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom hooks
│   │   ├── services/      # API client
│   │   └── types/         # TypeScript types
│   ├── package.json
│   └── Dockerfile
├── documents/             # Uploaded documents
├── audit_logs/            # Audit trail files
├── customer_db.json       # Customer database
├── docker-compose.yml
└── README.md
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://...` |
| `AI_PROVIDER` | AI provider (`gemini` or `openai`) | `gemini` |
| `GEMINI_API_KEY` | Google Gemini API key | - |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `ACIP_DEADLINE_DAYS` | AUSTRAC deadline in business days | `15` |
| `AUTO_APPROVE_LOW_RISK` | Auto-approve low-risk verified cases | `true` |

## License

MIT
