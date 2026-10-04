# Inter-Agency Data Sharing Agreement (DSA) Template (Phase 16)
## Disaster Response Telemetry & Survivor Location Exchange

**Governing Legislation:** Digital Personal Data Protection Act, 2023 (India) / Disaster Management Act, 2005  
**Data Fiduciary:** District Disaster Management Authority (DDMA)  
**Data Processors:** State Disaster Response Force (SDRF), National Disaster Response Force (NDRF), RescueNet Project Team

---

## 1. Purpose of Data Processing
Data collected through the RescueNet mesh network and tactical API is processed strictly and exclusively for:
1. Locating, triaging, and extracting individuals trapped in life-threatening disaster zones.
2. Routing search and rescue (SAR) reconnaissance and medical teams to emergency clusters.
3. Allocating relief supplies (potable water, medical evacuation, heavy extraction machinery).

---

## 2. Categories of Data Shared

| Data Element | Sensitivity Level | Access Restriction | Encryption & Storage |
| :--- | :--- | :--- | :--- |
| **Emergency Coordinates (GNSS)** | High (Location Data) | Authorized Rescuers & Dispatchers Only | AES-256 in transit and at rest |
| **Triage & Injury Tags** | High (Health Data) | Tactical Responders & Medical Officers | Redacted from public audit logs |
| **Phone Numbers (SMS Fallback)** | Sensitive PII | Agency Admin Only (Column-encrypted via pgcrypto) | Decrypted only on authorized dialer tap |
| **Hardware Ephemeral Keys** | Pseudonymous | Distributed over mesh | Rotates every 24 hours |

---

## 3. Obligations of Processing Agencies

1. **Strict Purpose Limitation:** Telemetry and location data shall never be commercialized, monetized, or shared with third parties for surveillance, law enforcement unrelated to rescue, or advertising.
2. **Access Control (RBAC):** Access to real-time maps is restricted to authenticated agency personnel holding valid X.509 certificates.
3. **Breach Notification:** In the event of an unauthorized data access incident, the Data Fiduciary shall be notified within 6 hours.
4. **Data Subject Rights:** Requests for erasure submitted via `/v1/privacy/deletion-request` shall be honored across all primary and replica databases within 24 hours.

---

## 4. Execution & Signatures

Signed on this [ DD ] day of [ Month ], 2026:

**For District Disaster Management Authority:**  
Signature: ___________________________  
Name: _______________________________  
Designation: District Collector & Magistrate  

**For State Disaster Response Force (SDRF):**  
Signature: ___________________________  
Name: _______________________________  
Designation: Commandant, Battalion HQ  
