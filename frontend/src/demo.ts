import type {
  DashboardSummary,
  EvidenceResponse,
  Flag,
  RiskSignal,
  RiskScore,
  RiskTier,
  RoleMode,
  TextMatch,
  Work,
} from "./types";

export const demoWorks: Work[] = [
  {
    id: "MPL-2407",
    title: "Construction of Community Bhavan at Shivpur Ward 7",
    description:
      "Construction of a community bhavan near the Shivpur Ward 7 primary school, including hall, accessible toilet and approach path.",
    state: "Uttar Pradesh",
    district: "Varanasi",
    constituency: "Varanasi",
    mp_name: "Demo MP Kavita Mishra",
    category: "Building",
    sanction_amount: 7_500_000,
    expenditure: 5_900_000,
    status: "In progress",
    sanctioned_date: "2024-01-12",
    last_progress_date: "2025-12-05",
    progress_percent: 78,
    source: "synthetic",
    lat: 25.3621,
    lon: 82.9552,
    risk_score: 91,
    risk_tier: "red",
  },
  {
    id: "MPL-1982",
    title: "शिवपुर वार्ड 7 में सामुदायिक भवन निर्माण",
    description:
      "प्राथमिक विद्यालय के पास सामुदायिक भवन, सुलभ शौचालय और पहुँच मार्ग का निर्माण।",
    state: "Uttar Pradesh",
    district: "Varanasi",
    constituency: "Varanasi",
    mp_name: "Demo MP Kavita Mishra",
    category: "Building",
    sanction_amount: 7_820_000,
    expenditure: 6_100_000,
    status: "In progress",
    sanctioned_date: "2024-02-03",
    last_progress_date: "2025-11-28",
    progress_percent: 74,
    source: "synthetic",
    lat: 25.3642,
    lon: 82.9576,
    risk_score: 83,
    risk_tier: "red",
  },
  {
    id: "MPL-1468",
    title: "Strengthening of Chitaipur–Kandwa link road",
    description:
      "Strengthening and drainage works on the Chitaipur–Kandwa rural link road over a 2.4 kilometre section.",
    state: "Uttar Pradesh",
    district: "Varanasi",
    constituency: "Varanasi",
    mp_name: "Demo MP Kavita Mishra",
    category: "Road",
    sanction_amount: 12_400_000,
    expenditure: 4_300_000,
    status: "Stalled",
    sanctioned_date: "2023-05-18",
    last_progress_date: "2024-01-10",
    progress_percent: 35,
    source: "synthetic",
    lat: 25.2676,
    lon: 82.9708,
    risk_score: 78,
    risk_tier: "red",
  },
  {
    id: "MPL-4300",
    title: "Solar drinking-water points for five wards",
    description:
      "Installation of five solar-assisted drinking-water points with storage and public taps across urban wards.",
    state: "Uttar Pradesh",
    district: "Lucknow",
    constituency: "Lucknow",
    mp_name: "Smt. Naina Qureshi",
    category: "Water",
    sanction_amount: 22_000_000,
    expenditure: 18_600_000,
    quantity: 5,
    unit: "drinking-water point",
    unit_cost: 4_400_000,
    status: "In progress",
    sanctioned_date: "2024-08-20",
    last_progress_date: "2026-05-14",
    progress_percent: 81,
    source: "synthetic",
    lat: 26.8467,
    lon: 80.9462,
    risk_score: 72,
    risk_tier: "red",
  },
  {
    id: "MPL-4301",
    title: "Solar drinking-water points for two wards",
    description:
      "Installation of two solar-assisted drinking-water points with storage and public taps.",
    state: "Uttar Pradesh",
    district: "Lucknow",
    constituency: "Lucknow",
    mp_name: "Smt. Naina Qureshi",
    category: "Water",
    sanction_amount: 8_100_000,
    expenditure: 7_400_000,
    quantity: 2,
    unit: "drinking-water point",
    unit_cost: 4_050_000,
    status: "Completed",
    sanctioned_date: "2024-07-10",
    last_progress_date: "2025-12-18",
    progress_percent: 100,
    source: "synthetic",
    lat: 26.881,
    lon: 80.993,
    risk_score: 18,
    risk_tier: "green",
  },
  {
    id: "MPL-3114",
    title: "Expansion of primary health centre at Sanganer",
    description:
      "Addition of consultation rooms, a minor procedure room and covered waiting area at the primary health centre.",
    state: "Rajasthan",
    district: "Jaipur",
    constituency: "Jaipur Rural",
    mp_name: "Shri Raghav Rathore",
    category: "Health",
    sanction_amount: 18_500_000,
    expenditure: 16_000_000,
    quantity: 1,
    unit: "facility extension",
    unit_cost: 18_500_000,
    status: "In progress",
    sanctioned_date: "2024-06-11",
    last_progress_date: "2026-03-09",
    progress_percent: 86,
    source: "synthetic",
    lat: 26.8194,
    lon: 75.7873,
    risk_score: 74,
    risk_tier: "red",
  },
  {
    id: "MPL-3115",
    title: "Extension rooms at Bagru primary health centre",
    description:
      "Addition of consultation and waiting rooms at the Bagru primary health centre.",
    state: "Rajasthan",
    district: "Jaipur",
    constituency: "Jaipur Rural",
    mp_name: "Shri Raghav Rathore",
    category: "Health",
    sanction_amount: 6_200_000,
    expenditure: 5_900_000,
    quantity: 1,
    unit: "facility extension",
    unit_cost: 6_200_000,
    status: "Completed",
    sanctioned_date: "2024-04-02",
    last_progress_date: "2025-09-21",
    progress_percent: 100,
    source: "synthetic",
    lat: 26.8097,
    lon: 75.5431,
    risk_score: 22,
    risk_tier: "green",
  },
  {
    id: "MPL-2788",
    title: "Science laboratory block at Delina higher secondary school",
    description:
      "Construction and furnishing of a two-room science laboratory block at Delina higher secondary school.",
    state: "Jammu and Kashmir",
    district: "Baramulla",
    constituency: "Baramulla",
    mp_name: "Smt. Samira Shah",
    category: "Education",
    sanction_amount: 5_500_000,
    expenditure: 5_300_000,
    status: "Completed",
    sanctioned_date: "2024-03-14",
    last_progress_date: "2025-10-22",
    progress_percent: 100,
    source: "synthetic",
    lat: 34.214,
    lon: 74.343,
    risk_score: 69,
    risk_tier: "amber",
  },
  {
    id: "MPL-2831",
    title: "Laboratory refurbishment at Kreeri higher secondary school",
    description:
      "Refurbishment and equipment support for the science laboratory at Kreeri higher secondary school.",
    state: "Jammu and Kashmir",
    district: "Baramulla",
    constituency: "Baramulla",
    mp_name: "Smt. Samira Shah",
    category: "Education",
    sanction_amount: 5_700_000,
    expenditure: 5_600_000,
    status: "Completed",
    sanctioned_date: "2024-05-19",
    last_progress_date: "2025-11-04",
    progress_percent: 100,
    source: "synthetic",
    lat: 34.161,
    lon: 74.268,
    risk_score: 64,
    risk_tier: "amber",
  },
  {
    id: "MPL-3220",
    title: "Upgradation of approach road from Manpur to Buniyadganj",
    description:
      "Surface renewal and side-drain work on the approach road from Manpur to Buniyadganj.",
    state: "Bihar",
    district: "Gaya",
    constituency: "Gaya",
    mp_name: "Shri Devendra Prasad",
    category: "Road",
    sanction_amount: 9_600_000,
    expenditure: 8_200_000,
    status: "In progress",
    sanctioned_date: "2024-09-06",
    last_progress_date: "2026-02-17",
    progress_percent: 84,
    source: "synthetic",
    lat: 24.947,
    lon: 85.039,
    risk_score: 61,
    risk_tier: "amber",
  },
  {
    id: "MPL-3221",
    title: "मानपुर से बुनियादगंज पहुँच पथ का उन्नयन",
    description:
      "मानपुर से बुनियादगंज तक पहुँच पथ की सतह और किनारे की नाली का सुधार।",
    state: "Bihar",
    district: "Gaya",
    constituency: "Gaya",
    mp_name: "Shri Devendra Prasad",
    category: "Road",
    sanction_amount: 9_300_000,
    expenditure: 7_900_000,
    status: "In progress",
    sanctioned_date: "2024-10-01",
    last_progress_date: "2026-02-01",
    progress_percent: 82,
    source: "synthetic",
    lat: 24.949,
    lon: 85.035,
    risk_score: 55,
    risk_tier: "amber",
  },
  {
    id: "MPL-4102",
    title: "Rainwater recharge shafts at three public campuses",
    description:
      "Construction of recharge shafts and filtration chambers at three public campuses.",
    state: "Maharashtra",
    district: "Satara",
    constituency: "Satara",
    mp_name: "Smt. Meera Jagtap",
    category: "Water",
    sanction_amount: 4_800_000,
    expenditure: 3_100_000,
    status: "In progress",
    sanctioned_date: "2025-02-16",
    last_progress_date: "2026-06-12",
    progress_percent: 62,
    source: "synthetic",
    lat: 17.68,
    lon: 74.018,
    risk_score: 41,
    risk_tier: "amber",
  },
  {
    id: "MPL-4200",
    title: "Community sanitation complex at Kamakhyanagar",
    description:
      "Construction of a community sanitation complex with accessible cubicles and water storage.",
    state: "Odisha",
    district: "Dhenkanal",
    constituency: "Dhenkanal",
    mp_name: "Shri Abhinav Mohanty",
    category: "Sanitation",
    sanction_amount: 3_900_000,
    expenditure: 1_000_000,
    status: "Stalled",
    sanctioned_date: "2023-11-08",
    last_progress_date: "2024-08-19",
    progress_percent: 26,
    source: "synthetic",
    lat: 20.933,
    lon: 85.544,
    risk_score: 57,
    risk_tier: "amber",
  },
  {
    id: "MPL-4201",
    title: "Public sanitation block at Bhuban",
    description:
      "Construction of a public sanitation block with water storage and accessible cubicles.",
    state: "Odisha",
    district: "Dhenkanal",
    constituency: "Dhenkanal",
    mp_name: "Shri Abhinav Mohanty",
    category: "Sanitation",
    sanction_amount: 3_600_000,
    expenditure: 3_400_000,
    status: "Completed",
    sanctioned_date: "2024-01-11",
    last_progress_date: "2025-03-27",
    progress_percent: 100,
    source: "synthetic",
    lat: 20.881,
    lon: 85.833,
    risk_score: 24,
    risk_tier: "green",
  },
  {
    id: "MPL-5100",
    title: "Multipurpose hall at Sonapur public ground",
    description:
      "Construction of a multipurpose public hall with accessible entry and utility room.",
    state: "Assam",
    district: "Kamrup Metropolitan",
    constituency: "Gauhati",
    mp_name: "Smt. Elora Deka",
    category: "Building",
    sanction_amount: 8_600_000,
    expenditure: 6_700_000,
    status: "In progress",
    sanctioned_date: "2024-12-07",
    last_progress_date: "2026-07-02",
    progress_percent: 79,
    source: "synthetic",
    lat: 26.115,
    lon: 91.979,
    risk_score: 30,
    risk_tier: "green",
  },
  {
    id: "MPL-5200",
    title: "Diagnostic equipment room at Hunsur taluk hospital",
    description:
      "Preparation of a diagnostic equipment room, power conditioning and patient waiting area.",
    state: "Karnataka",
    district: "Mysuru",
    constituency: "Mysuru",
    mp_name: "Dr. Kiran Gowda",
    category: "Health",
    sanction_amount: 6_900_000,
    expenditure: 4_900_000,
    status: "In progress",
    sanctioned_date: "2025-01-23",
    last_progress_date: "2026-06-26",
    progress_percent: 71,
    source: "synthetic",
    lat: 12.305,
    lon: 76.655,
    risk_score: 27,
    risk_tier: "green",
  },
];

export const demoFlags: Flag[] = [
  {
    id: "FLG-091",
    work_id: "MPL-2407",
    detector: "duplicate_work",
    severity: "red",
    points: 91,
    summary:
      "Description, location and amount are unusually close to another sanctioned work. Human review required.",
    related_work_id: "MPL-1982",
    evidence: {
      text_score: 92,
      distance_km: 0.31,
      amount_delta_percent: 4.1,
      source: "synthetic",
    },
    review_status: "pending",
  },
  {
    id: "FLG-078",
    work_id: "MPL-1468",
    detector: "stalled_work",
    severity: "red",
    points: 78,
    summary:
      "No progress update has been recorded for more than two years on an incomplete work.",
    related_work_id: "MPL-2407",
    evidence: {
      months_without_update: 31,
      progress_percent: 35,
      source: "synthetic",
    },
    review_status: "pending",
  },
  {
    id: "FLG-072",
    work_id: "MPL-4300",
    detector: "unit_cost_outlier",
    severity: "red",
    points: 72,
    summary:
      "Sanctioned cost per installation is materially above the synthetic district peer median.",
    related_work_id: "MPL-4301",
    evidence: {
      peer_multiple: 1.74,
      peer_group_size: 8,
      source: "synthetic",
    },
    review_status: "pending",
  },
  {
    id: "FLG-074",
    work_id: "MPL-3114",
    detector: "unit_cost_outlier",
    severity: "red",
    points: 74,
    summary:
      "Sanction amount is above the robust synthetic peer range for comparable health-centre extensions.",
    related_work_id: "MPL-3115",
    evidence: {
      peer_multiple: 2.18,
      peer_group_size: 11,
      source: "synthetic",
    },
    review_status: "pending",
  },
  {
    id: "FLG-069",
    work_id: "MPL-2788",
    detector: "photo_reuse",
    severity: "amber",
    points: 69,
    summary:
      "Two completion-photo records have closely matching synthetic perceptual hashes.",
    related_work_id: "MPL-2831",
    evidence: {
      phash_distance: 3,
      compared_photos: 2,
      source: "synthetic",
    },
    review_status: "pending",
  },
  {
    id: "FLG-061",
    work_id: "MPL-3220",
    detector: "duplicate_work",
    severity: "amber",
    points: 61,
    summary:
      "Multilingual description and coordinate proximity warrant a duplicate-work review.",
    related_work_id: "MPL-3221",
    evidence: {
      text_score: 86,
      distance_km: 0.48,
      amount_delta_percent: 3.1,
      source: "synthetic",
    },
    review_status: "pending",
  },
  {
    id: "FLG-057",
    work_id: "MPL-4200",
    detector: "stalled_work",
    severity: "amber",
    points: 57,
    summary:
      "The last recorded progress update is old relative to the work’s incomplete status.",
    related_work_id: "MPL-4201",
    evidence: {
      months_without_update: 24,
      progress_percent: 26,
      source: "synthetic",
    },
    review_status: "pending",
  },
];

export const roleScope = {
  ministry: {
    label: "Ministry",
    scope: "National synthetic scope",
    summary:
      "Prioritise cross-state review patterns and open the highest-risk evidence first.",
  },
  state: {
    label: "State",
    scope: "Uttar Pradesh synthetic scope",
    summary:
      "Compare district review load and isolate works that need state-level follow-up.",
  },
  district: {
    label: "District",
    scope: "Varanasi synthetic scope",
    summary:
      "Resolve local evidence, record a decision and retain the reason for audit.",
  },
  mp: {
    label: "MP",
    scope: "Demo MP Kavita Mishra · synthetic scope",
    summary:
      "Inspect recommended works with scoped anomalies and dispute mismatched evidence.",
  },
} satisfies Record<RoleMode, { label: string; scope: string; summary: string }>;

const workById = new Map(demoWorks.map((work) => [work.id, work]));

function isInRoleScope(work: Work, role: RoleMode) {
  if (role === "state") return work.state === "Uttar Pradesh";
  if (role === "district") return work.district === "Varanasi";
  if (role === "mp") return work.mp_name === "Demo MP Kavita Mishra";
  return true;
}

function riskTierFromScore(score: number): RiskTier {
  if (score >= 70) return "red";
  if (score >= 40) return "amber";
  return "green";
}

export function getDemoSummary(role: RoleMode): DashboardSummary {
  const works = demoWorks.filter((work) => isInRoleScope(work, role));
  const workIds = new Set(works.map((work) => work.id));
  const flags = demoFlags.filter(
    (flag) =>
      workIds.has(flag.work_id) ||
      (flag.related_work_id !== null && workIds.has(flag.related_work_id)),
  );
  const flaggedWorkIds = new Set(
    flags.flatMap((flag) =>
      [flag.work_id, flag.related_work_id].filter(
        (workId): workId is string => workId !== null && workIds.has(workId),
      ),
    ),
  );
  const detectorCounts: Record<string, number> = {
    duplicate_work: 0,
    unit_cost_outlier: 0,
    stalled_work: 0,
    photo: 0,
  };

  flags.forEach((flag) => {
    const detector =
      flag.detector === "photo_reuse" || flag.detector === "photo_quality"
        ? "photo"
        : flag.detector;
    detectorCounts[detector] = (detectorCounts[detector] ?? 0) + 1;
  });

  const districtGroups = new Map<string, Work[]>();
  works.forEach((work) => {
    const key = `${work.state}::${work.district}`;
    const existing = districtGroups.get(key) ?? [];
    existing.push(work);
    districtGroups.set(key, existing);
  });

  const byDistrict = Array.from(districtGroups.values())
    .map((districtWorks) => {
      const districtWorkIds = new Set(districtWorks.map((work) => work.id));
      const districtFlags = flags.filter(
        (flag) =>
          districtWorkIds.has(flag.work_id) ||
          (flag.related_work_id !== null && districtWorkIds.has(flag.related_work_id)),
      );
      const districtFlaggedWorkIds = new Set(
        districtFlags.flatMap((flag) =>
          [flag.work_id, flag.related_work_id].filter(
            (workId): workId is string =>
              workId !== null && districtWorkIds.has(workId),
          ),
        ),
      );
      const totalRisk = districtWorks.reduce((sum, work) => sum + work.risk_score, 0);
      const maxRisk = Math.max(...districtWorks.map((work) => work.risk_score));

      return {
        state: districtWorks[0].state,
        district: districtWorks[0].district,
        total_works: districtWorks.length,
        flagged_works: districtFlaggedWorkIds.size,
        pending_review: districtFlags.filter((flag) => flag.review_status === "pending").length,
        average_risk: Math.round(totalRisk / districtWorks.length),
        max_risk: maxRisk,
        risk_tier: riskTierFromScore(maxRisk),
      };
    })
    .sort((a, b) => b.max_risk - a.max_risk);

  return {
    totals: {
      works: works.length,
      flags: flags.length,
      flagged_works: flaggedWorkIds.size,
      high_risk: works.filter((work) => work.risk_tier === "red").length,
      pending_review: flags.filter((flag) => flag.review_status === "pending").length,
      sanction_amount: works.reduce((sum, work) => sum + work.sanction_amount, 0),
    },
    detector_counts: detectorCounts,
    provenance_counts: {
      synthetic: works.length,
      real_scraped: 0,
      manually_compiled: 0,
    },
    by_district: byDistrict,
    audit_queue: flags
      .map((flag) => {
        const queuedWorkId = workIds.has(flag.work_id)
          ? flag.work_id
          : flag.related_work_id;
        return {
          flag,
          work: queuedWorkId ? workById.get(queuedWorkId) : undefined,
        };
      })
      .filter((item): item is { flag: Flag; work: Work } => Boolean(item.work))
      .sort((a, b) => b.work.risk_score - a.work.risk_score),
  };
}

function duplicateSignals(flag: Flag): RiskSignal[] {
  if (flag.id === "FLG-091") {
    return [
      {
        label: "Multilingual description match",
        value: "92 / 100",
        points: 32,
        explanation:
          "Synthetic pair score across English and Hindi descriptions; this is not an accuracy claim.",
      },
      {
        label: "Coordinate proximity",
        value: "0.31 km",
        points: 24,
        explanation:
          "Recorded coordinates place both proposed assets within the same local review radius.",
      },
      {
        label: "Sanction amount proximity",
        value: "4.1% delta",
        points: 20,
        explanation:
          "The two synthetic sanction amounts fall inside the configured comparison band.",
      },
      {
        label: "Timing overlap",
        value: "22 days",
        points: 15,
        explanation:
          "Sanctions were recorded close together with no continuation reference in the demo data.",
      },
    ];
  }

  return [
    {
      label: "Multilingual description match",
      value: "86 / 100",
      points: 24,
      explanation:
        "Synthetic English-to-Hindi comparison score; a reviewer must still inspect work intent.",
    },
    {
      label: "Coordinate proximity",
      value: "0.48 km",
      points: 16,
      explanation: "Both synthetic coordinates fall within the configured local comparison radius.",
    },
    {
      label: "Sanction amount proximity",
      value: "3.1% delta",
      points: 12,
      explanation: "The compared amounts are close after unit normalisation.",
    },
    {
      label: "Timing overlap",
      value: "25 days",
      points: 9,
      explanation: "The sanction dates overlap enough to require a continuation check.",
    },
  ];
}

function evidenceSignals(flag: Flag): RiskSignal[] {
  if (flag.detector === "duplicate_work") return duplicateSignals(flag);

  if (flag.detector === "unit_cost_outlier") {
    const isLucknow = flag.id === "FLG-072";
    return [
      {
        label: "Peer-group cost multiple",
        value: isLucknow ? "1.74× median" : "2.18× median",
        points: isLucknow ? 34 : 38,
        explanation:
          "Compared with a synthetic category × district × year peer group using a robust median.",
      },
      {
        label: "Robust deviation",
        value: isLucknow ? "3.2 MAD" : "3.7 MAD",
        points: isLucknow ? 22 : 24,
        explanation:
          "Median absolute deviation limits the influence of unusually large peer values.",
      },
      {
        label: "Peer-group support",
        value: isLucknow ? "8 works" : "11 works",
        points: 10,
        explanation:
          "The demo score records the comparison-set size so a reviewer can judge its strength.",
      },
      {
        label: "Completion adjustment",
        value: "Applied",
        points: isLucknow ? 6 : 2,
        explanation:
          "Progress and expenditure status were included before assigning review priority.",
      },
    ];
  }

  if (flag.detector === "photo_reuse") {
    return [
      {
        label: "Perceptual-hash distance",
        value: "3 bits",
        points: 34,
        explanation:
          "Synthetic photo metadata falls inside the configured near-duplicate review threshold.",
      },
      {
        label: "Different work identifiers",
        value: "Confirmed",
        points: 16,
        explanation: "The compared photo references belong to two separate synthetic work records.",
      },
      {
        label: "Different asset locations",
        value: "6.9 km",
        points: 11,
        explanation: "The works are recorded at different synthetic locations in the same district.",
      },
      {
        label: "Image quality check",
        value: "Usable",
        points: 8,
        explanation: "The synthetic metadata does not indicate blur severe enough to block review.",
      },
    ];
  }

  const isVaranasi = flag.id === "FLG-078";
  return [
    {
      label: "No-progress interval",
      value: isVaranasi ? "31 months" : "24 months",
      points: isVaranasi ? 34 : 27,
      explanation: "Measured from the last synthetic progress entry to the demo review date.",
    },
    {
      label: "Incomplete progress",
      value: isVaranasi ? "35%" : "26%",
      points: isVaranasi ? 22 : 18,
      explanation: "Recorded completion is below the configured lapse-register threshold.",
    },
    {
      label: "Expenditure without completion",
      value: isVaranasi ? "₹43 lakh" : "₹10 lakh",
      points: isVaranasi ? 14 : 8,
      explanation: "Synthetic expenditure is present while the work remains incomplete.",
    },
    {
      label: "Status consistency check",
      value: "Stalled",
      points: isVaranasi ? 8 : 4,
      explanation: "The source status supports review but does not determine the final decision.",
    },
  ];
}

function textMatches(flag: Flag): TextMatch[] {
  if (flag.id === "FLG-091") {
    return [
      {
        language_pair: "English ↔ Hindi",
        score: 92,
        score_label: "Synthetic pair similarity",
        primary_text: "Construction of Community Bhavan at Shivpur Ward 7",
        related_text: "शिवपुर वार्ड 7 में सामुदायिक भवन निर्माण",
        primary_match: "Community Bhavan",
        related_match: "सामुदायिक भवन निर्माण",
        canonical_terms: ["community hall", "Shivpur Ward 7"],
        method_note:
          "Highlighted terms show the aligned concept. The score prioritises review; it does not decide the case.",
      },
    ];
  }

  if (flag.id === "FLG-061") {
    return [
      {
        language_pair: "English ↔ Hindi",
        score: 86,
        score_label: "Synthetic pair similarity",
        primary_text: "Upgradation of approach road from Manpur to Buniyadganj",
        related_text: "मानपुर से बुनियादगंज पहुँच पथ का उन्नयन",
        primary_match: "approach road from Manpur to Buniyadganj",
        related_match: "मानपुर से बुनियादगंज पहुँच पथ",
        canonical_terms: ["approach road", "Manpur", "Buniyadganj"],
        method_note:
          "The place names and work intent align across scripts; continuation status still needs human review.",
      },
    ];
  }

  return [];
}

function demoRisk(flag: Flag, work: Work): RiskScore {
  return {
    work_id: work.id,
    total_score: work.risk_score,
    tier: work.risk_tier,
    components: [
      {
        detector: flag.detector,
        points: work.risk_score,
        maximum_points: 100,
        flag_ids: [flag.id],
        explanation:
          "The static fallback uses a synthetic 100-point detector component so its displayed decomposition remains exact.",
      },
    ],
    explanation: `${flag.detector} ${work.risk_score} = ${work.risk_score}/100 (${work.risk_tier}); static synthetic scoring only.`,
  };
}

export function getDemoEvidence(flagId: string): EvidenceResponse | null {
  const flag = demoFlags.find((candidate) => candidate.id === flagId);
  if (!flag) return null;
  const primaryWork = workById.get(flag.work_id);
  if (!primaryWork) return null;
  const relatedWork = flag.related_work_id ? workById.get(flag.related_work_id) ?? null : null;
  const isPhotoFlag =
    flag.detector === "photo_reuse" || flag.detector === "photo_quality";

  return {
    flag,
    primary_work: primaryWork,
    related_work: relatedWork,
    risk: demoRisk(flag, primaryWork),
    signals: evidenceSignals(flag),
    text_matches: textMatches(flag),
    photo_evidence: {
      status: isPhotoFlag ? "flagged" : "not_flagged",
      summary: isPhotoFlag
        ? "Simulated photo metadata has a low perceptual-hash distance; no image assets are supplied for visual comparison."
        : "No photo-forensics signal contributes to this selected synthetic review.",
      primary_reference: isPhotoFlag ? "SYN-PHOTO-2788-A" : null,
      related_reference: isPhotoFlag ? "SYN-PHOTO-2831-B" : null,
      primary_url: null,
      related_url: null,
      details: isPhotoFlag ? flag.evidence : {},
    },
  };
}
