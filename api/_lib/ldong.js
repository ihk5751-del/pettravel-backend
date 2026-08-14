// api/_lib/ldong.js
// 법정동 시도/시군구 코드 -> 실제 지역명 변환 테이블
// KorPetTourService2의 ldongCode2 API를 한 번 호출해서 캐싱해두고,
// lDongRegnCd + lDongSignguCd 조합으로 지역명을 찾을 때 사용합니다.

const TOUR_API_BASE = "https://apis.data.go.kr/B551011/KorPetTourService2";

let ldongCache = { map: null, timestamp: 0 };
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24시간 (거의 안 바뀌는 데이터라 길게 캐싱)

async function getLdongMap() {
  const now = Date.now();
  if (ldongCache.map && now - ldongCache.timestamp < CACHE_TTL_MS) {
    return ldongCache.map;
  }

  const serviceKey = process.env.TOUR_API_KEY;
  if (!serviceKey) return {};

  const params = new URLSearchParams({
    serviceKey,
    numOfRows: "300",
    pageNo: "1",
    MobileOS: "ETC",
    MobileApp: "PetTravel",
    lDongListYn: "Y",
    _type: "json",
  });

  try {
    const res = await fetch(`${TOUR_API_BASE}/ldongCode2?${params.toString()}`);
    const json = await res.json();
    const items = json?.response?.body?.items?.item;
    if (!Array.isArray(items)) return {};

    const map = {};
    for (const item of items) {
      // key 예시: "11-110" (서울 종로구)
      const key = `${item.lDongRegnCd}-${item.lDongSignguCd}`;
      map[key] = `${item.lDongRegnNm} ${item.lDongSignguNm || ""}`.trim();
      // 시군구코드 없이 시도만 있는 경우도 대비
      if (!ldongCache.regnOnly) ldongCache.regnOnly = {};
      ldongCache.regnOnly[item.lDongRegnCd] = item.lDongRegnNm;
    }

    ldongCache = { map, regnOnly: ldongCache.regnOnly, timestamp: now };
    return map;
  } catch (err) {
    console.error("ldongCode2 호출 실패:", err);
    return {};
  }
}

// lDongRegnCd, lDongSignguCd -> "서울특별시 종로구" 같은 문자열 반환
async function resolveRegionName(regnCd, signguCd) {
  if (!regnCd) return null;
  const map = await getLdongMap();
  const key = `${regnCd}-${signguCd}`;
  if (map[key]) return map[key];
  // 시군구 매칭 실패시 시도명만이라도 반환
  return ldongCache.regnOnly?.[regnCd] || null;
}

module.exports = { resolveRegionName };
