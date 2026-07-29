import { useTranslation } from "react-i18next";
import { normalizeLang } from "../i18n/locales";
import { LanguageSelect } from "./LanguageSelect";
import { EnglishPrivacyPolicy, EnglishTerms } from "./LegalPage.en";
import { JapanesePrivacyPolicy, JapaneseTerms } from "./LegalPage.ja";

export type LegalKind = "privacy" | "terms";

export function LegalPage({ kind }: { kind: LegalKind }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.resolvedLanguage ?? i18n.language) ?? "ko";
  const effectiveDate = {
    ko: "시행일: 2026년 7월 28일",
    en: "Effective date: July 28, 2026",
    ja: "施行日：2026年7月28日",
  }[lang];

  return (
    <article className="legal-page">
      <header className="legal-header">
        <a href="/">🌱 {t("common.serviceName")}</a>
        <div>
          <span>{effectiveDate}</span>
          <LanguageSelect />
        </div>
      </header>
      <LocalizedLegalContent kind={kind} lang={lang} />
    </article>
  );
}

function LocalizedLegalContent({
  kind,
  lang,
}: {
  kind: LegalKind;
  lang: "ko" | "en" | "ja";
}) {
  if (lang === "en") {
    return kind === "privacy" ? <EnglishPrivacyPolicy /> : <EnglishTerms />;
  }
  if (lang === "ja") {
    return kind === "privacy" ? <JapanesePrivacyPolicy /> : <JapaneseTerms />;
  }
  return kind === "privacy" ? <PrivacyPolicy /> : <Terms />;
}

// 본문은 저장소 원본(PRIVACY.md / TERMS.md)과 같은 내용이어야 한다.
// 한쪽만 고치면 같은 시행일로 서로 다른 방침이 공개된다.
function PrivacyPolicy() {
  return (
    <>
      <h1>개인정보 처리방침</h1>
      <p className="legal-lead">
        1일 1OTT 운영자(이하 “운영자”)는 「개인정보 보호법」 등 관련
        법령을 준수하며, 1일 1OTT 서비스(이하 “서비스”) 이용자의
        개인정보를 다음과 같이 처리합니다.
      </p>

      <section>
        <h2>1. 처리 목적과 항목</h2>
        <div className="legal-table-wrap">
          <table>
            <thead>
              <tr>
                <th>목적</th>
                <th>처리 항목</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>회원가입과 본인 식별</td>
                <td>이름, 이메일 주소, 비밀번호 단방향 해시</td>
              </tr>
              <tr>
                <td>로그인과 보안 유지</td>
                <td>
                  세션 토큰, IP 주소, User-Agent, 로그인·세션 생성 및 만료
                  시각
                </td>
              </tr>
              <tr>
                <td>Passkey 인증</td>
                <td>
                  Passkey 이름, 공개키, credential ID, 기기 유형, 백업 여부,
                  transport, AAGUID, 등록 시각
                </td>
              </tr>
              <tr>
                <td>서비스 제공</td>
                <td>
                  사용자명, 공개 프로필 설정, 언어, 시청 날짜, 콘텐츠
                  제목·유형·외부 콘텐츠 ID, 반응, 감상, 이용 플랫폼
                </td>
              </tr>
              <tr>
                <td>장애 대응과 보안</td>
                <td>요청·오류·배포 로그, 접속 일시와 요청 메타데이터</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          비밀번호 원문은 저장하지 않고 Better Auth가 생성한 단방향 해시를
          저장합니다. Passkey의 생체정보는 이용자의 기기를 벗어나지 않으며
          서비스에는 공개키와 인증에 필요한 메타데이터만 저장됩니다.
        </p>
        <p>
          브라우저에는 필수 세션 쿠키와 언어(<code>1ott.lang</code>)·테마(
          <code>theme</code>) 설정이 저장됩니다. 광고, 행동 추적 또는 맞춤형
          마케팅 쿠키는 사용하지 않습니다.
        </p>
      </section>

      <section>
        <h2>2. 처리 근거</h2>
        <p>
          운영자는 서비스 이용계약의 체결·이행, 이용자 요청 처리, 서비스
          보안과 부정 이용 방지를 위해 필요한 범위에서 개인정보를
          처리합니다. 선택 항목은 이용자가 해당 기능을 사용할 때만
          처리합니다.
        </p>
        <p>
          만 14세 미만 아동을 대상으로 서비스를 제공하지 않으며, 만 14세
          미만 아동의 개인정보임을 알게 된 경우 지체 없이 삭제합니다.
        </p>
      </section>

      <section>
        <h2>3. 보유 및 이용 기간</h2>
        <ul>
          <li>회원정보와 서비스 기록: 회원 탈퇴 또는 삭제 요청 처리 시까지</li>
          <li>세션 정보: 세션 만료, 로그아웃 또는 다른 세션 해지 시까지</li>
          <li>일회성 인증정보: 인증 목적 달성 또는 유효기간 만료 시까지</li>
          <li>장애 대응·보안 로그: 생성일로부터 최대 30일</li>
          <li>
            관계 법령에 별도 보존 의무가 있는 정보: 해당 법령에서 정한 기간
          </li>
        </ul>
        <p>
          삭제 요청을 받으면 지체 없이 삭제를 진행합니다. 백업에 남은
          정보는 복구 목적 외에는 사용하지 않으며 백업 주기에 따라
          삭제합니다.
        </p>
      </section>

      <section>
        <h2>4. 제3자 제공과 공개 프로필</h2>
        <p>
          운영자는 이용자의 개인정보를 제3자에게 판매하지 않습니다. 다음
          경우를 제외하고 이용자의 동의 없이 제3자에게 제공하지 않습니다.
        </p>
        <ul>
          <li>
            법령에 근거가 있거나 수사기관 등 권한 있는 기관이 적법한 절차로
            요구한 경우
          </li>
          <li>급박한 생명·신체·재산상 이익을 보호하기 위해 필요한 경우</li>
        </ul>
        <p>
          공개 프로필은 기본적으로 비활성화되어 있습니다. 이용자가
          사용자명을 설정하고 공개 옵션을 직접 켠 경우에만 사용자명, 이름,
          시청 날짜별 건수, 총 기록 수와 최근 콘텐츠 포스터가 공개됩니다.
          공개 옵션을 끄면 해당 프로필은 더 이상 공개되지 않습니다.
        </p>
        <p>
          작품별 공개 페이지에는 특정 개인을 식별하지 않는 시청자 수와 반응
          집계가 표시될 수 있습니다.
        </p>
      </section>

      <section>
        <h2>5. 처리위탁 및 국외 이전</h2>
        <p>서비스는 다음 사업자의 인프라를 사용합니다.</p>
        <div className="legal-table-wrap">
          <table>
            <thead>
              <tr>
                <th>수탁자</th>
                <th>업무</th>
                <th>이전 항목·목적</th>
                <th>이전 국가·시점·방법</th>
                <th>보유 기간</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Cloudflare, Inc.</td>
                <td>
                  웹 호스팅, API 실행, D1 데이터베이스, 보안과 장애 로그
                </td>
                <td>
                  제1항의 서비스 데이터 전체를 서비스 제공·보안 목적으로
                  처리
                </td>
                <td>
                  미국 등 Cloudflare 글로벌 인프라 소재 국가로 서비스 이용
                  시 암호화된 네트워크를 통해 전송
                </td>
                <td>
                  서비스 이용계약과 Cloudflare 설정에 따른 기간 또는 삭제
                  요청 처리 시까지
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Cloudflare의 인프라 위치는 네트워크 운영 상황에 따라 달라질 수
          있습니다. 국외 이전을 원하지 않는 이용자는 서비스 이용을
          중단하고 개인정보 삭제를 요청할 수 있으나, 이 경우 서비스를
          제공할 수 없습니다.
        </p>
        <p>
          콘텐츠 검색과 상세 정보 제공을 위해 서버가 TMDB에 검색어·콘텐츠
          ID를, YouTube oEmbed에 이용자가 입력한 YouTube URL·영상 ID를
          전송할 수 있습니다. 이름, 이메일, 세션 토큰과 시청 기록은 이
          요청에 포함하지 않습니다.
        </p>
      </section>

      <section>
        <h2>6. 이용자의 권리와 행사 방법</h2>
        <p>
          이용자는 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지와 동의
          철회를 요청할 수 있습니다. 시청 기록은 서비스에서 직접
          수정·삭제하거나 Markdown으로 내보낼 수 있으며, 공개 프로필은
          마이페이지에서 언제든 비활성화할 수 있습니다.
        </p>
        <p>
          계정과 개인정보 전체 삭제 또는 그 밖의 요청은{" "}
          <a href="mailto:support@1day1ott.com">support@1day1ott.com</a>으로
          보내 주세요. 운영자는 본인 확인 후 관련 법령에서 정한 기간 내에
          처리 결과를 안내합니다. 법정대리인은 관련 법령이 허용하는 범위에서
          이용자의 권리를 대신 행사할 수 있습니다.
        </p>
      </section>

      <section>
        <h2>7. 파기 절차와 방법</h2>
        <p>
          보유 기간이 끝났거나 처리 목적을 달성한 개인정보는 복구하기
          어려운 방법으로 삭제합니다. 전자적 파일은 논리적으로 삭제하고,
          별도 출력물이 있는 경우 분쇄 또는 소각합니다.
        </p>
      </section>

      <section>
        <h2>8. 안전성 확보 조치</h2>
        <p>운영자는 개인정보 보호를 위해 다음 조치를 적용합니다.</p>
        <ul>
          <li>HTTPS를 통한 전송 구간 암호화</li>
          <li>비밀번호 단방향 해시와 Passkey 공개키 인증</li>
          <li>secret의 환경변수·Cloudflare secret 분리</li>
          <li>세션 기반 인증과 사용자별 데이터 접근 통제</li>
          <li>개인정보 접근 최소화와 보안 업데이트</li>
        </ul>
      </section>

      <section>
        <h2>9. 개인정보 보호 문의</h2>
        <ul>
          <li>담당: 1일 1OTT 운영자</li>
          <li>
            이메일:{" "}
            <a href="mailto:support@1day1ott.com">support@1day1ott.com</a>
          </li>
        </ul>
        <p>
          개인정보 침해에 관한 상담이나 신고가 필요한 경우
          한국인터넷진흥원(KISA)이 운영하는 개인정보침해 신고센터(국번 없이
          118), 개인정보 분쟁조정위원회, 경찰청 또는 대검찰청 등 관계 기관에
          문의할 수 있습니다.
        </p>
      </section>

      <section>
        <h2>10. 방침 변경</h2>
        <p>
          이 방침이 변경되면 시행 전에 서비스 또는 저장소를 통해 변경
          내용과 시행일을 알립니다. 이용자 권리에 중대한 변경은 합리적인
          기간을 두고 안내합니다.
        </p>
      </section>
    </>
  );
}

function Terms() {
  return (
    <>
      <h1>이용약관</h1>
      <p className="legal-lead">
        이 약관은 1일 1OTT 운영자(이하 “운영자”)가 제공하는 1일 1OTT
        서비스(이하 “서비스”)의 이용 조건과 운영자 및 이용자의 권리·의무를
        정합니다.
      </p>

      <section>
        <h2>제1조 목적과 적용</h2>
        <p>
          이 약관은 웹사이트와 관련 API 등 서비스 이용에 적용됩니다.
          이용자가 회원가입을 완료하거나 서비스를 계속 이용하면 이 약관과{" "}
          <a href="/privacy">개인정보 처리방침</a>에 동의한 것으로 봅니다.
        </p>
      </section>

      <section>
        <h2>제2조 서비스 내용</h2>
        <p>서비스는 다음 기능을 무료로 제공합니다.</p>
        <ul>
          <li>
            이용자가 시청한 콘텐츠와 감상을 기록·조회·수정·삭제하는 기능
          </li>
          <li>시청 기록을 잔디, 달력, 통계 등으로 표시하는 기능</li>
          <li>이용자가 선택한 경우 공개 프로필을 공유하는 기능</li>
          <li>기록을 Markdown 형식으로 가져오고 내보내는 기능</li>
          <li>
            TMDB, YouTube 등 외부 서비스와 연동해 콘텐츠 정보를 조회하는
            기능
          </li>
        </ul>
        <p>
          운영자는 서비스 품질 개선, 보안, 외부 서비스 정책 또는 운영상
          필요에 따라 기능을 변경하거나 중단할 수 있습니다. 중요한 변경은
          가능한 범위에서 미리 알립니다.
        </p>
      </section>

      <section>
        <h2>제3조 이용 자격과 계정</h2>
        <p>
          서비스는 만 14세 이상만 이용할 수 있습니다. 이용자는 정확하고
          최신인 정보를 제공하고 자신의 로그인 수단을 안전하게 관리해야
          합니다. 계정에서 발생한 이상 활동을 발견하면 즉시 비밀번호를
          변경하거나 운영자에게 알려야 합니다.
        </p>
        <p>
          이용자는 다른 사람의 정보나 계정을 무단으로 사용해서는 안 되며,
          하나의 계정을 여러 사람이 공동으로 사용해 서비스의 보안을
          해쳐서는 안 됩니다.
        </p>
      </section>

      <section>
        <h2>제4조 사용자 콘텐츠</h2>
        <p>
          이용자가 입력한 콘텐츠 제목, 시청 기록, 반응, 감상과 그 밖의
          정보(이하 “사용자 콘텐츠”)에 대한 권리는 이용자에게 남습니다.
        </p>
        <p>
          이용자는 운영자에게 사용자 콘텐츠를 서비스 제공에 필요한 범위에서
          저장·처리·표시·백업하고 이용자가 선택한 공개 범위에서 공유할 수
          있는 비독점적이고 무상의 이용 권한을 부여합니다. 이 권한은 서비스
          제공 목적에 한정되며 사용자 콘텐츠 삭제 시 종료됩니다. 다만
          기술적으로 필요한 백업 보존 기간과 법령상 보존 의무는 예외로
          합니다.
        </p>
        <p>
          이용자는 자신이 게시할 권한이 있는 정보만 입력해야 하며, 타인의
          저작권·상표권·개인정보 등 권리를 침해해서는 안 됩니다.
        </p>
      </section>

      <section>
        <h2>제5조 금지 행위</h2>
        <p>이용자는 다음 행위를 해서는 안 됩니다.</p>
        <ul>
          <li>서비스 또는 다른 이용자의 계정에 대한 무단 접근</li>
          <li>악성코드 배포, 취약점 악용, 인증 우회 또는 보안 기능 방해</li>
          <li>자동화된 대량 요청 등 서비스에 과도한 부하를 주는 행위</li>
          <li>불법·유해 정보, 타인의 개인정보 또는 권리 침해 콘텐츠 게시</li>
          <li>
            서비스나 외부 API의 이용 조건을 위반하는 데이터 수집·재배포
          </li>
          <li>운영자를 사칭하거나 서비스 운영을 방해하는 행위</li>
        </ul>
        <p>
          운영자는 위반 행위의 중단을 요청하거나 필요한 범위에서 콘텐츠
          접근 또는 계정 이용을 제한할 수 있습니다. 긴급하지 않은 경우
          이용자에게 사유와 이의제기 방법을 안내합니다.
        </p>
      </section>

      <section>
        <h2>제6조 외부 서비스</h2>
        <p>
          서비스는 TMDB, YouTube, Cloudflare 등 제3자의 서비스와 인프라를
          사용합니다. 외부 서비스의 정보 정확성·가용성과 정책은 해당
          제공자가 관리하며, 외부 서비스의 중단이나 정책 변경으로 일부
          기능이 제한될 수 있습니다.
        </p>
        <p lang="en">
          This service uses TMDB and the TMDB APIs but is not endorsed,
          certified, or otherwise approved by TMDB.
        </p>
      </section>

      <section>
        <h2>제7조 개인정보</h2>
        <p>
          개인정보 처리에 관한 사항은 <a href="/privacy">개인정보 처리방침</a>
          을 따릅니다. 공개 프로필은 이용자가 직접 공개 옵션을 켠 경우에만
          활성화됩니다.
        </p>
      </section>

      <section>
        <h2>제8조 서비스 이용 중단과 계정 삭제</h2>
        <p>
          이용자는 서비스 이용을 언제든 중단할 수 있으며,{" "}
          <a href="mailto:support@1day1ott.com">support@1day1ott.com</a>으로
          계정과 개인정보 삭제를 요청할 수 있습니다. 삭제 전 필요한 기록은
          Markdown 내보내기 기능으로 보관해야 합니다.
        </p>
        <p>
          운영자가 서비스를 종료하는 경우 가능한 범위에서 사전에 안내하고
          이용자가 기록을 내보낼 수 있는 합리적인 기간을 제공합니다.
        </p>
      </section>

      <section>
        <h2>제9조 보증과 책임</h2>
        <p>
          운영자는 서비스를 안정적으로 제공하기 위해 노력하지만 서비스가
          항상 중단 없이 제공되거나 모든 정보가 정확하다고 보증하지
          않습니다. 서비스는 시청 기록 관리를 위한 도구이며, 외부 콘텐츠
          정보는 각 제공자의 데이터를 기반으로 합니다.
        </p>
        <p>
          운영자의 고의 또는 중대한 과실이 없는 한 천재지변, 외부 인프라
          장애, 이용자의 귀책사유 또는 제3자의 불법행위로 발생한 손해에
          대해 책임을 지지 않습니다. 이 약관의 어떤 조항도 관련 법령에 따라
          제한되거나 배제할 수 없는 소비자의 권리를 제한하지 않습니다.
        </p>
      </section>

      <section>
        <h2>제10조 약관 변경</h2>
        <p>
          운영자는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수
          있습니다. 이용자 권리에 중대한 변경은 시행 전에 서비스 또는
          저장소를 통해 변경 내용과 시행일을 안내합니다.
        </p>
      </section>

      <section>
        <h2>제11조 준거법과 분쟁</h2>
        <p>
          이 약관은 대한민국 법률을 따릅니다. 분쟁이 발생하면 당사자는 먼저
          성실하게 협의하며, 해결되지 않는 경우 민사소송법 등 관계 법령에
          따른 관할 법원에서 해결합니다.
        </p>
      </section>

      <section>
        <h2>제12조 문의</h2>
        <ul>
          <li>운영자: 1일 1OTT 운영자</li>
          <li>
            이메일:{" "}
            <a href="mailto:support@1day1ott.com">support@1day1ott.com</a>
          </li>
        </ul>
      </section>
    </>
  );
}
