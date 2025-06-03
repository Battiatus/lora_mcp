# Architecture & flow mcp server & client


```mermaid
graph TD
    subgraph "Client"
        UA[Utilisateur]
        Navigateur[Navigateur Web]
    end

    subgraph "Frontend (Cloud Run)"
        ReactApp[Application React]
        Auth[Authentification Firebase]
    end

    subgraph "Backend (Cloud Run)"
        API[API RESTful Express]
        AuthMiddleware[Middleware d'authentification]
        Services[Services & Contrôleurs]
        Playwright[Service Playwright]
    end

    subgraph "Firebase"
        FB_Auth[Authentication]
        FB_Firestore[Firestore Database]
    end

    subgraph "Google Cloud Platform"
        GCS[Cloud Storage]
        Logs[Cloud Logging]
        Monitoring[Cloud Monitoring]
    end

    UA --> Navigateur
    Navigateur <--> ReactApp
    
    ReactApp <--> Auth
    Auth <--> FB_Auth
    
    ReactApp <--> API
    API --> AuthMiddleware
    AuthMiddleware <--> FB_Auth
    
    AuthMiddleware --> Services
    Services <--> Playwright
    Services <--> FB_Firestore
    
    Playwright --> GCS
    API --> Logs
    API --> Monitoring

    classDef cloud fill:#f9f9f9,stroke:#333,stroke-width:1px;
    classDef firebase fill:#FFA000,stroke:#333,stroke-width:1px,color:white;
    classDef react fill:#61DAFB,stroke:#333,stroke-width:1px;
    classDef node fill:#68A063,stroke:#333,stroke-width:1px,color:white;
    classDef security fill:#FF6B6B,stroke:#333,stroke-width:1px;

    class GCS,Logs,Monitoring cloud;
    class FB_Auth,FB_Firestore firebase;
    class ReactApp,Auth react;
    class API,Services,Playwright node;
    class AuthMiddleware security;
    ```