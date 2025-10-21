  # 🧠 MindSieve --- AI Tutor & Research Assistant

**Submission for the [AI Accelerate Hackathon (Elastic
Challenge)](https://aiinaction.devpost.com)**\
**Stack:** Next.js · Elastic (BM25 + vector hybrid) · Vertex AI (Gemini
2.5 Pro + `text-embedding-005`) · Cloud Run · Tailwind · shadcn/ui ·
GSAP\
**Region:** Google Cloud --- `europe-west1`

> *MindSieve transforms complex research questions into engaging, cited
> explanations. It fuses Elastic's hybrid search with Gemini reasoning
> to create an intelligent AI tutor for learners and researchers alike.*

------------------------------------------------------------------------

  ------------------------------ --------------------------------
  **🚀 Live Demo**               **\[YOUR_DEPLOYED_URL_HERE\]**
  **🎬 Video Pitch (≤ 3 min)**   **\[YOUTUBE_OR_VIMEO_URL\]**
  ------------------------------ --------------------------------

> **Note on data:** The Elastic backend consists of **700K+ arXiv
> Computer Science** articles extended with **Vertex AI
> `text-embedding-005` (768‑dim vectors)**.\
> Backfill is automated via **Cloud Run** and **Cloud Scheduler**, which
> continuously update the Elastic index from the arXiv API (methodology
> excluded here).

------------------------------------------------------------------------

## ✨ Why MindSieve

-   Traditional keyword search forces readers to skim PDFs and miss
    conceptual links.\
-   MindSieve combines **semantic search (vectors)** and **keyword
    relevance (BM25)** for deep, context‑aware retrieval.\
-   Gemini then produces **concise, source‑cited explanations** in a
    **tutor‑friendly Markdown format**, balancing accessibility and
    academic rigor.\
-   The interface emphasizes **clarity and curiosity**, not chat‑bot
    verbosity.

------------------------------------------------------------------------

## 🧭 Architecture

### Overview

``` mermaid
flowchart LR
  user([Learner / Researcher]) --> ui["Next.js App"]
  ui -->|query| api_chat["API /api/chat"]
  api_chat --> es["ElasticSearch (BM25 + KNN)"]
  es -->|"top‑k documents"| gemini["Vertex AI Gemini 2.5 Pro"]
  gemini -->|"streamed answer + citations"| ui

  subgraph GCP [Google Cloud Platform]
    cr[Cloud Run (App)]
    sm[Secret Manager]
    es
    gemini
    sm --> cr
  end
```

### Retrieval Pipeline

``` mermaid
sequenceDiagram
  participant UI as Next.js UI
  participant Chat as /api/chat
  participant ES as Elasticsearch
  participant Gemini as Vertex AI Gemini
  participant SM as Secret Manager

  UI->>Chat: User question
  Chat->>SM: Fetch ES + Vertex secrets
  Chat->>ES: Hybrid search (BM25 + vector)
  ES-->>Chat: Top‑k hits (title, summary, embeddings)
  Chat->>Gemini: Synthesis prompt (sources JSON)
  Gemini-->>Chat: Markdown answer + citations
  Chat-->>UI: Stream response
```

------------------------------------------------------------------------

## 🧩 Features

✅ **Hybrid retrieval** --- BM25 + `text-embedding-005` vector KNN\
✅ **Tutor‑style synthesis** --- Beginner‑first, then expert notes\
✅ **Source transparency** --- Inline citations linked to original arXiv
papers\
✅ **Streaming answers** --- Gemini's tokens rendered live in the UI\
✅ **Automatic index backfill** --- via Cloud Run + Cloud Scheduler\
✅ **Modern UI** --- shadcn/ui, Tailwind, GSAP animations

------------------------------------------------------------------------

## ⚙️ Stack Summary

  Layer               Tech
  ------------------- -------------------------------------------------
  **Frontend**        Next.js (App Router), Tailwind, shadcn/ui, GSAP
  **Backend API**     Node 18 + Cloud Run
  **Search Engine**   Elasticsearch (BM25 + `vector` + RRF fusion)
  **Embeddings**      Vertex AI `text-embedding-005` (768‑dim)
  **LLM**             Vertex AI Gemini 2.5 Pro
  **Data Source**     arXiv Computer Science corpus (700k+ docs)
  **Orchestration**   Cloud Run + Cloud Scheduler for ingestion

------------------------------------------------------------------------

## 🚀 Quickstart

### Prerequisites

-   Node.js **18+**
-   ElasticSearch cluster (with vector + text fields)
-   Google Cloud project with **Vertex AI** & **Secret Manager** enabled

### 1️⃣ Install

``` bash
pnpm install
```

### 2️⃣ Configure Secrets

Create secrets in **Google Secret Manager**:

``` bash
gcloud secrets create elastic-url --data-file=- --replication-policy="automatic"
gcloud secrets create elastic-api-key --data-file=- --replication-policy="automatic"
gcloud secrets create vertex-model --data-file=- --replication-policy="automatic"
```

Grant access to the Cloud Run service account:

``` bash
SA_EMAIL="mindsieve-runner@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts create mindsieve-runner --project $GCP_PROJECT_ID
gcloud projects add-iam-policy-binding $GCP_PROJECT_ID   --member serviceAccount:${SA_EMAIL}   --role roles/secretmanager.secretAccessor
```

### 3️⃣ Run locally

``` bash
pnpm dev
# Open http://localhost:3000
```

------------------------------------------------------------------------

## ☁️ Deploy (Cloud Run)

``` bash
gcloud builds submit --tag europe-west1-docker.pkg.dev/$GCP_PROJECT_ID/mindsieve/web:latest

gcloud run deploy mindsieve-web   --image=europe-west1-docker.pkg.dev/$GCP_PROJECT_ID/mindsieve/web:latest   --platform=managed   --region=europe-west1   --allow-unauthenticated   --service-account=mindsieve-runner@${GCP_PROJECT_ID}.iam.gserviceaccount.com   --set-env-vars=NODE_ENV=production,GCP_PROJECT_ID=$GCP_PROJECT_ID,VERTEX_LOCATION=europe-west1,VERTEX_MODEL=gemini-2.5-pro,EMBEDDING_MODEL=text-embedding-005
```

------------------------------------------------------------------------

## 🧱 Roadmap

-   Multi‑turn memory with persistent session context\
-   Expanded sources (PubMed, Springer, Crossref)\
-   Personal tutor profiles + saved collections\
-   Automated evaluation (nDCG@k, citation fidelity)\
-   Mobile‑friendly progressive web app

------------------------------------------------------------------------

## 🧑‍💻 Team & Credits

-   **@frozenace** --- Lead Developer, ML Integration\
-   **Elastic** --- Hybrid search engine + hackathon sponsor\
-   **Google Cloud** --- Vertex AI (Gemini + embeddings)\
-   **arXiv.org** --- Open academic data

------------------------------------------------------------------------

## 📄 License

MIT License © 2025 MindSieve
