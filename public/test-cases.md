# Border Checker v2.0 — 실제 통과(PASS) / 실패(FAIL) 테스트 케이스 입력값 모음

> 아래 7개 테스트 케이스는 모두 실제 Border Checker v2.0 엔진(오프라인 휴리스틱 파서 + 결정론 AST 엔진)에서 **사전 검증 완료**된 입력값입니다.  
> LLM API 키가 없는 상태에서도 아래 값을 그대로 Step 1~3에 입력(또는 복붙)하고 **실시간 감사 실행**을 누르면 동일한 판정과 점수가 재현됩니다.

---

## 한눈에 보는 요약표

| 구분 | 케이스명 | 예상 판정 | 준수율 | Blocker / Warning / Drift | 핵심 시연 포인트 |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **PASS 1** | KR 국내 단독 일반 SaaS | `APPROVED` | **100% (10/10)** | `0 / 0 / 0` | 해외 이전 없음 + 비PII 벤더 제외 오탐 방지 |
| **PASS 2** | KR AI SaaS + OpenAI 처리위탁 특례 | `APPROVED` | **100% (18/18)** | `0 / 0 / 0` | PIPA 제28조의8 제1항 제3호 특례 + AI 기본법 충족 |
| **PASS 3** | KR·EU·JP 글로벌 서비스 완전 고지 | `APPROVED` | **100% (33/33)** | `0 / 0 / 0` | 4개 팩(PIPA·GDPR·APPI·CLOUD Act) 동시 통과 |
| **FAIL 1** | 위조 여권(Policy-Infra Drift) | `DRIFT_DETECTED` | **42% (11/26)** | `7 / 8 / 9` | "국내 단독 보관" 선언 vs US·JP 실제 이전 모순 |
| **FAIL 2** | 미고지 수신국 & 추가 수탁사 누락 | `DRIFT_DETECTED` | **85% (23/27)** | `2 / 2 / 4` | JP 사업자 + AWS 서울 + US만 고지(KR·Stripe 누락) |
| **FAIL 3** | 가상 국외 이전 + 암호화 OFF + 헬스케어 | `DENIED` | **19% (6/32)** | `17 / 9 / 8` | 해외 IAM/KMS 원격 접근 + EU/KR 다중 규제 충돌 |
| **FAIL 4** | 개인정보 처리방침 미작성 상태 | `DRIFT_DETECTED` | **50% (7/14)** | `3 / 4 / 1` | 처리방침 없음 체크 + 해외 결제 SDK 연동 |

---

# 1. 통과 성공 케이스 (PASS · APPROVED 100%)

## PASS 1. 국내 단독 운영 일반 SaaS (국외 이전 없음)

- **Step 1 (서비스 기본 정보)**
  - 우리 회사(사업자) 위치: `KR 한국`
  - 서비스 이용 고객 국가: `KR 한국`
  - 서비스 운영 분야: `일반 SaaS / 쇼핑몰 (GENERAL)`
- **Step 2 (클라우드 & 외부 서비스)**
  - 데이터 저장 서버(클라우드): `AWS 서울 (KR · ap-northeast-2)`
  - 외부 서비스 (`package.json` 업로드 또는 수동 추가):
    ```json
    {
      "name": "kr-domestic-shop",
      "dependencies": {
        "@tosspayments/payment-sdk": "^1.9.0"
      }
    }
    ```
  - 벤더 상세 설정: `Toss Payments` → 개인정보 전송 여부 **`아니오 (제외)`**
- **Step 3 (처리방침 & 기본 보안)**
  - 개인정보 처리방침 원문 (복붙용):
    ```text
    당사는 이용자의 이메일, 성명, 연락처 등 개인정보를 대한민국 국내 서버에만 단독 보관하며 어떠한 경우에도 국외로 이전하지 않습니다. 개인정보의 보유기간은 회원 탈퇴 시까지이며, 거부 방법 및 개인정보 보호책임자 안내를 제공합니다.
    ```
  - 보안 설정: 전송 암호화(TLS) `ON` / 저장 암호화(AES/KMS) `ON` / PII 마스킹 `OFF`
  - 가상 국외 이전: 해외 본사 IAM 열람 `OFF` / 해외 KMS 통제 `OFF`
- **예상 결과**: `APPROVED` · **100% (10/10 PASS)** · Blocker `0` / Warning `0` / Drift `0`

---

## PASS 2. 국내 AI SaaS + OpenAI 처리위탁 특례 (AI 기본법 포함 완전 통과)

- **Step 1 (서비스 기본 정보)**
  - 우리 회사(사업자) 위치: `KR 한국`
  - 서비스 이용 고객 국가: `KR 한국`
  - 서비스 운영 분야: `AI 서비스 (AI_SAAS)`
- **Step 2 (클라우드 & 외부 서비스)**
  - 데이터 저장 서버(클라우드): `AWS 서울 (KR · ap-northeast-2)`
  - 외부 서비스 (`package.json` 업로드 또는 버튼 클릭):
    ```json
    {
      "name": "kr-ai-summary-saas",
      "dependencies": {
        "openai": "^4.70.0",
        "@tosspayments/payment-sdk": "^1.9.0"
      }
    }
    ```
  - 벤더 상세 설정:
    - `OpenAI LLC`: 개인정보 전송 **`예`** · 용도 **`서비스 운영 위탁 (제3호 특례)`** · 리전 `US`
    - `Toss Payments`: 개인정보 전송 **`아니오 (제외)`**
- **Step 3 (처리방침 & 기본 보안)**
  - 개인정보 처리방침 원문 (복붙용):
    ```text
    당사는 생성형 인공지능(AI) 기반 문서 요약 기능을 운용하며 AI 생성 결과물 표시(워터마크·배지)를 제공합니다. 개인정보 보호법 제28조의8 제1항 제3호(국외 처리위탁 및 보관)에 따라 OpenAI LLC(미국)에 마스킹 처리된 프롬프트 데이터와 이메일을 실시간 암호화 전송합니다. 보유기간은 위탁 계약 종료 시까지이며, 거부 방법 및 거부 시 기능 제한 안내를 제공합니다. 미국 FISA/CLOUD Act 수신국 보호 제도 안내와 DPF 안전장치, Zero Data Retention(AI 학습 제외)을 적용합니다.
    ```
  - 보안 설정: TLS `ON` / AES·KMS `ON` / **전송 전 PII 마스킹 `ON`**
  - 가상 국외 이전: 해외 IAM `OFF` / 해외 KMS `OFF`
- **예상 결과**: `APPROVED` · **100% (18/18 PASS)** · Blocker `0` / Warning `0` / Drift `0`
  - 적용 팩: `KR_PIPA` (10/10), `US_CLOUD_ACT` (4/4), `KR_AI_BASIC_ACT` (4/4)

---

## PASS 3. 한국·유럽·일본 글로벌 서비스 (다국가 완전 고지 통과)

- **Step 1 (서비스 기본 정보)**
  - 우리 회사(사업자) 위치: `KR 한국`
  - 서비스 이용 고객 국가: `KR 한국`, `EU 유럽`, `JP 일본`
  - 서비스 운영 분야: `일반 SaaS / 쇼핑몰 (GENERAL)`
- **Step 2 (클라우드 & 외부 서비스)**
  - 데이터 저장 서버(클라우드): `AWS 서울 (KR)`, `AWS 도쿄 (JP)` 동시 선택
  - 외부 서비스 (`package.json` 업로드 또는 `Stripe` 버튼 클릭):
    ```json
    {
      "name": "global-commerce-platform",
      "dependencies": {
        "stripe": "^17.0.0"
      }
    }
    ```
  - 벤더 상세 설정:
    - `Stripe, Inc.`: 개인정보 전송 **`예`** · 용도 **`서비스 운영 위탁 (제3호 특례)`** · 리전 `US`
- **Step 3 (처리방침 & 기본 보안)**
  - 개인정보 처리방침 원문 (복붙용):
    ```text
    당사는 서비스 제공을 위해 이용자의 이메일, 결제 정보를 수집하며, 국외 이전 별도 동의를 받아 일본(도쿄) 리전과 미국(US) 소재 Stripe, Inc.에 개인정보 보호법 제28조의8 제1항 제3호 국외 처리위탁 및 보관으로 실시간 암호화 전송합니다. 보유기간은 계약 종료 시까지이며, 동의 철회 및 거부 방법을 안내합니다. 미국 FISA/CLOUD Act 및 일본 수신국 개인정보 보호 제도 정보와 SCC 표준계약조항·DPF 안전장치를 적용합니다.
    ```
  - 보안 설정: TLS `ON` / AES·KMS `ON` / **전송 전 PII 마스킹 `ON`**
  - 가상 국외 이전: 해외 IAM `OFF` / 해외 KMS `OFF`
- **예상 결과**: `APPROVED` · **100% (33/33 PASS)** · Blocker `0` / Warning `0` / Drift `0`
  - 적용 팩: `KR_PIPA` (10/10), `EU_GDPR` (10/10), `JP_APPI` (9/9), `US_CLOUD_ACT` (4/4)

---

# 2. 실패 / 차단 케이스 (FAIL · DRIFT_DETECTED / DENIED)

## FAIL 1. 위조 여권(Policy-Infra Drift) — "국내 단독 보관" 선언 vs US·JP 실제 이전

- **Step 1 (서비스 기본 정보)**
  - 우리 회사(사업자) 위치: `KR 한국`
  - 서비스 이용 고객 국가: `KR 한국`, `US 미국`
  - 서비스 운영 분야: `AI 서비스 (AI_SAAS)`
- **Step 2 (클라우드 & 외부 서비스)**
  - 데이터 저장 서버(클라우드): `AWS 도쿄 (JP · ap-northeast-1)`
  - 외부 서비스 (`package.json` 업로드 또는 버튼 클릭):
    ```json
    {
      "name": "fake-domestic-ai-app",
      "dependencies": {
        "openai": "^4.70.0",
        "stripe": "^17.0.0",
        "mixpanel": "^2.55.0"
      }
    }
    ```
  - 벤더 상세 설정:
    - `OpenAI LLC`: 개인정보 전송 `예` · 용도 `서비스 운영 위탁`
    - `Stripe, Inc.`: 개인정보 전송 `예` · 용도 `서비스 운영 위탁`
    - `Mixpanel, Inc.`: 개인정보 전송 `예` · 용도 **`광고·분석·외부 공유 (ANALYTICS)`**
- **Step 3 (처리방침 & 기본 보안)**
  - 개인정보 처리방침 원문 (복붙용):
    ```text
    회사는 이용자의 모든 개인정보를 대한민국 국내 서버에만 단독 보관하며, 어떠한 경우에도 제3자에게 제공하거나 국외로 이전하지 않습니다.
    ```
  - 보안 설정: TLS `ON` / AES·KMS `ON` / PII 마스킹 `OFF`
  - 가상 국외 이전: 해외 IAM `OFF` / 해외 KMS `OFF`
- **예상 결과**: `DRIFT_DETECTED` · **42% (11/26 PASS)** · Blocker `7` / Warning `8` / Drift `9`
  - 주요 적발: `국내보관 모순`, `미공개 이전국(US, JP)`, `미공개 수탁사(OpenAI, Stripe, Mixpanel)`, CCPA `Do Not Sell/Share` 누락, KR AI 기본법 제31조 미고지

---

## FAIL 2. 미고지 수신국 & 추가 수탁사 누락 (부분 고지 함정 탐지)

> 처리방침에 `US`와 `OpenAI`는 적혀 있지만, 실제 인프라인 **`AWS 서울(KR)`**과 추가 SDK인 **`Stripe`**가 누락된 정교한 위반 시나리오입니다.

- **Step 1 (서비스 기본 정보)**
  - 우리 회사(사업자) 위치: `JP 일본`
  - 서비스 이용 고객 국가: `KR 한국`, `GB 영국`
  - 서비스 운영 분야: `AI 서비스 (AI_SAAS)`
- **Step 2 (클라우드 & 외부 서비스)**
  - 데이터 저장 서버(클라우드): `AWS 서울 (KR · ap-northeast-2)`
  - 외부 서비스 (`package.json` 업로드 또는 `OpenAI` + `Stripe` 클릭):
    ```json
    {
      "name": "jp-crossborder-ai",
      "dependencies": {
        "openai": "^4.70.0",
        "stripe": "^17.0.0"
      }
    }
    ```
  - 벤더 상세 설정: `OpenAI LLC`, `Stripe, Inc.` 모두 개인정보 전송 **`예`**
- **Step 3 (처리방침 & 기본 보안)**
  - 개인정보 처리방침 원문 (복붙용 — 일부러 `KR`과 `Stripe`를 빠뜨린 방침):
    ```text
    당사는 생성형 인공지능(AI) 기반 기능을 운용하며 AI 생성 결과물 표시를 제공합니다. 국외 처리위탁을 위해 OpenAI LLC(미국)에 마스킹된 프롬프트를 실시간 암호화 전송합니다. 보유기간은 계약 종료 시까지이며 거부 방법과 미국 CLOUD Act 안내, DPF 안전장치, ZDR(학습 제외)을 적용합니다.
    ```
  - 보안 설정: TLS `ON` / AES·KMS `ON` / PII 마스킹 `ON`
  - 가상 국외 이전: 해외 IAM `OFF` / 해외 KMS `OFF`
- **예상 결과**: `DRIFT_DETECTED` · **85% (23/27 PASS)** · Blocker `2` / Warning `2` / Drift `4`
  - 주요 적발:
    - `KR-PIPA-28-8-UNDISCLOSED-DEST` (`BLOCKER` · 미공개 이전국: KR, JP)
    - `JP-APPI-28-UNDISCLOSED-COUNTRY` (`BLOCKER` · 미공개 이전국: KR)
    - `KR-PIPA-26-2-ENTRUSTMENT-LIST` / `JP-APPI-27-UNDISCLOSED-VENDOR` (미공개 수탁사: Stripe)
  - Geo-Arc 맵에서 `JP → KR (Seoul)` 경로가 빨간 점선 + Shield X(`BLOCKED`)로 표시됨

---

## FAIL 3. 가상 국외 이전 + 암호화 OFF + AI 헬스케어 다중 규제 충돌 (`DENIED`)

- **Step 1 (서비스 기본 정보)**
  - 우리 회사(사업자) 위치: `KR 한국`
  - 서비스 이용 고객 국가: `KR 한국`, `EU 유럽`
  - 서비스 운영 분야: `헬스케어 / 의료 (HEALTHCARE)`
- **Step 2 (클라우드 & 외부 서비스)**
  - 데이터 저장 서버(클라우드): `AWS 서울 (KR · ap-northeast-2)`
  - 외부 서비스 (`package.json` 업로드):
    ```json
    {
      "name": "medai-diagnostics-api",
      "dependencies": {
        "@anthropic-ai/sdk": "^0.32.0",
        "segment": "^6.0.0"
      }
    }
    ```
  - 벤더 상세 설정:
    - `Anthropic PBC`: 개인정보 전송 `예` · 용도 `서비스 운영 위탁`
    - `Twilio Segment`: 개인정보 전송 `예` · 용도 **`광고·분석·외부 공유 (제3자 제공)`**
- **Step 3 (처리방침 & 기본 보안)**
  - 개인정보 처리방침 원문 (복붙용):
    ```text
    당사는 서비스 제공을 위해 필요한 최소한의 개인정보를 수집합니다.
    ```
  - 보안 설정: **전송 암호화(TLS) `OFF` / 저장 암호화(AES/KMS) `OFF` / PII 마스킹 `OFF`**
  - 가상 국외 이전: **해외 본사 IAM 열람 `ON` / 해외 KMS 암호화 키 통제 `ON`**
- **예상 결과**: `DENIED` · **19% (6/32 PASS)** · Blocker `17` / Warning `9` / Drift `8`
  - 주요 적발: `KR_PIPA` 가상 국외 이전·암호화 위반, `EU_GDPR` 제9조 민감정보·DPF 미인증, `US_CLOUD_ACT`, `KR_AI_BASIC_ACT`, `EU_AI_ACT` 고위험 AI 동시 차단

---

## FAIL 4. 개인정보 처리방침 미작성 상태 (핀테크 + Stripe)

- **Step 1 (서비스 기본 정보)**
  - 우리 회사(사업자) 위치: `KR 한국`
  - 서비스 이용 고객 국가: `KR 한국`
  - 서비스 운영 분야: `핀테크 / 결제 (FINTECH)`
- **Step 2 (클라우드 & 외부 서비스)**
  - 데이터 저장 서버(클라우드): `AWS 서울 (KR · ap-northeast-2)`
  - 외부 서비스: `Stripe` 추가 (개인정보 전송 **`예`**)
- **Step 3 (처리방침 & 기본 보안)**
  - **`개인정보 처리방침 문서가 아직 없습니다`** 체크박스 **ON** (원문 비움)
  - 보안 설정: TLS `ON` / AES·KMS `ON` / PII 마스킹 `OFF`
  - 가상 국외 이전: 해외 IAM `OFF` / 해외 KMS `OFF`
- **예상 결과**: `DRIFT_DETECTED` · **50% (7/14 PASS)** · Blocker `3` / Warning `4` / Drift `1`
  - 주요 적발: 처리방침 미게시(`KR-PIPA-30-1-POLICY-ESSENTIALS`), 국외 처리위탁 고지 누락(`KR-PIPA-28-8-3-ENTRUSTMENT`), 미공개 이전국(`KR-PIPA-28-8-UNDISCLOSED-DEST`)
