# Cost Model & Capacity Analysis

## 💰 Zero-Cost Infrastructure Verification

| Service Layer | Free Tier Allowance | Application Footprint | Estimated Cost |
|---|---|---|---|
| **Cloud Run Container** | 2 Million requests/month<br/>180,000 vCPU-seconds/month | Lightweight Express Node.js Server Proxy (~30MB RAM) | **$0.00 / month** |
| **GitHub Storage** | Unlimited public repositories<br/>5,000 REST requests / hour | Encrypted state bundles (`data/users/<id>/...`) | **$0.00 / month** |
| **Client Device** | Local WebCrypto & IndexedDB | Offloads 100% of cryptographic computation to client browser | **$0.00 / month** |
| **Database** | None (Uses GitHub as Primary Layer) | No database server required | **$0.00 / month** |
| **Total Operational Cost** | | | **$0.00 / month** |
