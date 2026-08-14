# 펫트래블 백엔드

한국관광공사(KorPetTourService2) + 강원도 반려동물 동반관광 정보 + 식품안전나라
반려동물 동반출입 음식점 현황, 이렇게 세 데이터 소스를 하나의 API로 합쳐주는
Vercel 서버리스 백엔드입니다.

## 폴더 구조

```
pettravel-backend/
├── api/
│   ├── places.js       ← 메인 API (/api/places)
│   └── _lib/
│       └── ldong.js    ← 법정동 코드 → 지역명 변환 헬퍼
├── data/
│   ├── gangwon.json     ← 강원도 CSV를 미리 변환해둔 정적 데이터 (474건)
│   └── foodsafety.json  ← 식품안전나라 엑셀을 미리 변환해둔 정적 데이터 (563건, 위경도 없음)
├── package.json
└── .env.example
```

## 배포 방법 (Vercel)

1. 이 폴더 전체를 GitHub 저장소로 올리세요 (새 repo 만들고 push).
2. https://vercel.com 에 가입 (GitHub 계정으로 로그인하면 편해요).
3. "New Project" → 방금 만든 GitHub 저장소 선택 → Import.
4. 배포 전 **Environment Variables** 설정 화면에서:
   - `TOUR_API_KEY` = 공공데이터포털에서 발급받은 "일반 인증키(Decoding)" 값
   - (선택) `KAKAO_REST_API_KEY` = 나중에 지오코딩 붙일 때 사용
5. Deploy 버튼 클릭. 1~2분이면 배포 끝나고, 다음과 같은 주소가 생겨요:
   ```
   https://프로젝트이름.vercel.app/api/places
   ```

## 사용법

배포 후 브라우저나 프로토타입 코드에서 이렇게 호출하면 됩니다:

```
GET /api/places                    → 전체 장소 목록
GET /api/places?category=숙소       → 숙소만
GET /api/places?category=식당       → 식당만
GET /api/places?region=춘천         → "춘천"이 지역명에 포함된 곳만
```

응답 형태:

```json
{
  "count": 1234,
  "places": [
    {
      "id": "tour-2930927",
      "category": "관광지",
      "name": "...",
      "region": "강원특별자치도 춘천시",
      "address": "...",
      "tel": null,
      "lat": 37.88,
      "lng": 127.73,
      "amenities": ["전구역 동반가능"],
      "source": "한국관광공사_반려동물_동반여행_서비스"
    }
  ]
}
```

## 로컬에서 테스트하기 (선택)

```bash
npm i -g vercel
cd pettravel-backend
cp .env.example .env    # 실제 인증키로 채워넣기
vercel dev               # http://localhost:3000/api/places 로 테스트 가능
```

## 아직 안 된 것 (다음 단계)

- **식품안전나라 데이터 지오코딩**: `data/foodsafety.json`의 563건은 `lat`/`lng`가
  전부 `null`이에요. 카카오맵 주소검색 API로 좌표를 채워야 지도에 표시할 수 있어요.
  (한 번만 돌리면 되는 배치 스크립트로 처리하는 게 효율적 — API를 매 요청마다
  부르지 않고, 미리 변환해서 `foodsafety.json`에 좌표를 채워넣는 방식 추천)
- **강원도 데이터 ↔ 식품안전나라 데이터 중복 제거**: 강원도의 "식음료"(153건)와
  식품안전나라 강원 지역(27건)이 겹칠 가능성이 있어요. 업소명+주소 유사도로
  중복 판별 로직이 필요해요.
- **한국관광공사 API의 amenities 품질이 낮음**: 실측 결과 `acmpyTypeCd` 정도만
  채워지는 경우가 많아서, 상세 이용조건은 추후 사용자 리뷰/직접 수집으로
  보완하는 걸 고려해야 해요.
- **캐싱 전략 고도화**: 지금은 서버리스 함수 내 메모리 캐시(warm 상태에서만
  유효)라 완벽하지 않아요. 트래픽이 늘면 Vercel KV나 별도 DB로 캐싱하는 걸
  고려하세요.
