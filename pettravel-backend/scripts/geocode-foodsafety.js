// scripts/geocode-foodsafety.js
//
// data/foodsafety.json의 563건은 주소만 있고 위경도가 없어요.
// 카카오맵 주소검색 API로 각 주소를 좌표로 변환해서 파일을 덮어씁니다.
//
// 사용법:
//   1) 카카오 REST API 키를 환경변수로 설정
//      export KAKAO_REST_API_KEY=본인_카카오_REST_API_키
//   2) node scripts/geocode-foodsafety.js 실행
//
// 매 요청마다 API를 부르지 않고, 이렇게 한 번 미리 변환해서
// data/foodsafety.json에 좌표를 박아두는 방식이에요 (매 사용자 요청마다 지오코딩하면 느리고 비효율적).

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "foodsafety.json");
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;

if (!KAKAO_KEY) {
  console.error("환경변수 KAKAO_REST_API_KEY가 설정되지 않았어요.");
  console.error("실행 전에: export KAKAO_REST_API_KEY=본인_키");
  process.exit(1);
}

async function geocodeAddress(address) {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(
    address
  )}`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`카카오 API 오류: ${res.status}`);
  }
  const json = await res.json();
  const first = json.documents?.[0];
  if (!first) return null;
  return { lat: parseFloat(first.y), lng: parseFloat(first.x) };
}

// 카카오 API 호출 제한(초당 요청 수)을 지키기 위한 딜레이
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const raw = fs.readFileSync(DATA_PATH, "utf-8");
  const places = JSON.parse(raw);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    if (place.geocoded) continue; // 이미 처리된 건 건너뜀 (재실행 시 이어서 진행)

    try {
      const coords = await geocodeAddress(place.address);
      if (coords) {
        place.lat = coords.lat;
        place.lng = coords.lng;
        place.geocoded = true;
        success++;
      } else {
        console.warn(`좌표 못 찾음 (${i + 1}/${places.length}): ${place.address}`);
        failed++;
      }
    } catch (err) {
      console.error(`오류 (${i + 1}/${places.length}): ${err.message}`);
      failed++;
    }

    if ((i + 1) % 50 === 0) {
      console.log(`진행상황: ${i + 1}/${places.length}`);
      // 중간중간 저장해서, 도중에 끊겨도 처음부터 다시 안 해도 되게
      fs.writeFileSync(DATA_PATH, JSON.stringify(places, null, 2), "utf-8");
    }

    await sleep(100); // 초당 약 10건 페이스
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(places, null, 2), "utf-8");
  console.log(`\n완료! 성공 ${success}건, 실패 ${failed}건`);
}

main();
