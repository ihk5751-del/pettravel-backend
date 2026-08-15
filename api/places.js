// api/places.js
// 펫트래블 통합 장소 API
//
// - 한국관광공사 KorPetTourService2 (실시간 API 호출)
// - 강원도 반려동물 동반관광 정보 (정적 JSON, 사전 변환됨)
// - 식품안전나라 반려동물 동반출입 음식점 (정적 JSON, 위경도 없음)
//
// 세 소스를 하나의 스키마로 합쳐서 반환합니다.
// 배포: Vercel (이 파일이 자동으로 /api/places 엔드포인트가 됩니다)

const gangwonData = require("../data/gangwon.json");
const foodsafetyData = require("../data/foodsafety.json");
const { resolveRegionName } = require("./_lib/ldong");

const TOUR_API_BASE = "https://apis.data.go.kr/B551011/KorPetTourService2";

// contenttypeid -> 우리 카테고리 매핑
// 표준 TourAPI contenttypeid (실제 API 응답이 이 체계를 씀 - "신분류코드"인 75~85와는 다른 구분류코드)
// 12=관광지, 14=문화시설, 15=축제공연행사, 25=여행코스, 28=레포츠, 32=숙박, 38=쇼핑, 39=음식점
const CONTENTTYPE_MAP = {
  "32": "숙소",
  "39": "식당",
  "12": "관광지",
  "14": "관광지",
  "28": "관광지",
  "25": "관광지",
};

// 캐시 (서버리스 함수는 매 요청마다 새로 뜰 수 있어서 완벽하진 않지만,
// warm 상태에서는 재사용되어 API 호출 횟수를 줄여줍니다)
let tourApiCache = { data: null, timestamp: 0 };
const CACHE_TTL_MS = 1000 * 60 * 30; // 30분

async function fetchTourApiList(numOfRows = 20) {
  const serviceKey = process.env.TOUR_API_KEY;
  if (!serviceKey) {
    console.warn("TOUR_API_KEY가 설정되지 않아 한국관광공사 데이터는 건너뜁니다.");
    return [];
  }

  const now = Date.now();
  if (tourApiCache.data && now - tourApiCache.timestamp < CACHE_TTL_MS) {
    return tourApiCache.data;
  }

  const params = new URLSearchParams({
    serviceKey, // URLSearchParams가 알아서 인코딩해줍니다
    numOfRows: String(numOfRows),
    pageNo: "1",
    MobileOS: "ETC",
    MobileApp: "PetTravel",
    _type: "json",
    arrange: "A",
  });

  const listUrl = `${TOUR_API_BASE}/areaBasedList2?${params.toString()}`;

  let listJson;
  try {
    const res = await fetch(listUrl);
    listJson = await res.json();
  } catch (err) {
    console.error("areaBasedList2 호출 실패:", err);
    return [];
  }

  const items = listJson?.response?.body?.items?.item;
  if (!items || !Array.isArray(items)) {
    return [];
  }

  // 각 항목에 대해 상세정보(detailPetTour2)를 병렬로 호출해서 amenities 채우기
  const detailed = await Promise.all(
    items.map(async (item) => {
      const category = CONTENTTYPE_MAP[String(item.contenttypeid)];
      if (!category) return null; // 매핑 안 되는 카테고리(쇼핑/교통 등)는 제외

      let amenities = [];
      try {
        const detailParams = new URLSearchParams({
          serviceKey,
          numOfRows: "1",
          pageNo: "1",
          MobileOS: "ETC",
          MobileApp: "PetTravel",
          contentId: item.contentid,
          _type: "json",
        });
        const detailRes = await fetch(
          `${TOUR_API_BASE}/detailPetTour2?${detailParams.toString()}`
        );
        const detailJson = await detailRes.json();
        const detail = detailJson?.response?.body?.items?.item?.[0];
        if (detail) {
          // 실측 결과 etcAcmpyInfo 등은 대부분 비어있어서,
          // 값이 있는 필드만 골라서 amenities 배열에 담습니다.
          const candidates = [
            detail.acmpyTypeCd,
            detail.acmpyPsblCpam,
            detail.acmpyNeedMtr,
            detail.etcAcmpyInfo,
          ];
          amenities = candidates.filter((v) => v && v.trim() !== "");
        }
      } catch (err) {
        // 상세정보 실패해도 기본 정보는 살려서 반환
        console.error(`detailPetTour2 실패 (contentid=${item.contentid}):`, err);
      }

      const region = await resolveRegionName(item.lDongRegnCd, item.lDongSignguCd);

      return {
        id: `tour-${item.contentid}`,
        category,
        name: item.title,
        region,
        address: [item.addr1, item.addr2].filter(Boolean).join(" "),
        tel: item.tel || null,
        lat: item.mapy ? parseFloat(item.mapy) : null,
        lng: item.mapx ? parseFloat(item.mapx) : null,
        amenities,
        image: item.firstimage || item.firstimage2 || null,
        source: "한국관광공사_반려동물_동반여행_서비스",
      };
    })
  );

  const result = detailed.filter(Boolean);
  tourApiCache = { data: result, timestamp: now };
  return result;
}

module.exports = async function handler(req, res) {
  const { category, region } = req.query;

  let allPlaces = [];

  try {
    const tourPlaces = await fetchTourApiList(60);
    allPlaces = [...tourPlaces, ...gangwonData, ...foodsafetyData];
  } catch (err) {
    console.error("데이터 병합 중 오류:", err);
    // 한국관광공사 API가 실패해도 정적 데이터는 반환
    allPlaces = [...gangwonData, ...foodsafetyData];
  }

  // 필터 적용
  if (category) {
    allPlaces = allPlaces.filter((p) => p.category === category);
  }
  if (region) {
    allPlaces = allPlaces.filter((p) => p.region && p.region.includes(region));
  }

  res.setHeader("Access-Control-Allow-Origin", "*"); // 프론트 어디서든 호출 가능하게
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate"); // 30분 CDN 캐시
  res.status(200).json({
    count: allPlaces.length,
    places: allPlaces,
  });
};
