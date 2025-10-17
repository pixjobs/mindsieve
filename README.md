# 🧠 MindSieve — Research Assistant (Next.js Edition)

**Submission for the AI Accelerate Hackathon (Elastic Challenge).**  
**Stack:** Next.js · Elastic (BM25 + vectors) · Vertex AI (Gemini + `text-embedding-005`) · GSAP · Tailwind · shadcn/ui  
**Region:** Google Cloud **europe-west1** (Vertex AI + Cloud Run)

---

## 🧭 Architecture (Mermaid)

### System Flow
```mermaid
flowchart LR
  User[User] --> UI[Next.js UI - GSAP + shadcn]
  UI -->|query| API_Search[/api/search (hybrid)/]
  API_Search --> ES[(Elasticsearch BM25 + KNN)]
  ES -->|top k docs + chunks| API_Answer[/api/answer (Gemini)/]
  API_Answer --> Gemini[(Vertex AI Gemini\nregion: europe-west1)]
  API_Answer -.-> Secrets[(Secret Manager)]
  Gemini -->|citations + answer| UI
```

### Secrets & Runtime Access
```mermaid
flowchart TB
  subgraph Cloud [Google Cloud]
    SM[(Secret Manager)]
    CR[Cloud Run service - europe-west1]
    SA[(Service Account - secretAccessor)]
  end
  subgraph App [Next.js]
    API[/Server APIs: /api/search, /api/answer/]
  end
  SA --> CR
  SM -. fetch at runtime .-> API
  API -->|Elastic client| ES[(Elastic Cluster)]
  API -->|LLM calls| G[Vertex AI]
```

### Retrieval & Fusion Pipeline
```mermaid
sequenceDiagram
  participant UI as Next.js UI
  participant Search as /api/search
  participant ES as Elasticsearch
  participant Answer as /api/answer
  participant Gemini as Vertex AI Gemini (eu-west1)
  participant SM as Secret Manager

  UI->>Search: user question
  Search->>SM: fetch Elastic secrets
  Search->>ES: BM25 + KNN
  ES-->>Search: result lists
  Search->>Search: RRF fusion
  Search-->>UI: ranked contexts
  UI->>Answer: top-N passages
  Answer->>SM: load Vertex config
  Answer->>Gemini: synthesis prompt
  Gemini-->>Answer: answer + citations
  Answer-->>UI: stream tokens
```
