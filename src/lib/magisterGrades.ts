export type MagisterGrade = {
  course: string;
  description: string;
  grade: string;
  numericGrade: number | null;
  weight: number | "";
  date: string;
  displayDate: string;
  period: string;
  isSufficient: boolean;
  counts: boolean;
  columnType: string;
};

export type CourseGradeGroup = {
  course: string;
  grades: MagisterGrade[];
  gradeCount: number;
  weightedAverage: number | null;
  latestDisplayDate: string;
};

export type FetchMagisterGradesResult = {
  grades: MagisterGrade[];
  meta: {
    fetchedAt: string;
    personId: number | string;
    enrollmentId: number | string;
    gradeCount: number;
  };
};

export async function fetchMagisterGrades(input: {
  magisterBaseUrl: string;
  accessToken: string;
}): Promise<FetchMagisterGradesResult> {
  const response = await fetch("/api/public/magister-grades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  let payload: (FetchMagisterGradesResult & { error?: string }) | null = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Geen reactie ontvangen van de import.");
  }

  if (!response.ok || !payload || payload.error) {
    throw new Error(payload?.error || `Importeren mislukt (HTTP ${response.status}).`);
  }

  return payload;
}

export function buildCourseGroups(grades: MagisterGrade[]): CourseGradeGroup[] {
  const grouped = grades.reduce<Record<string, MagisterGrade[]>>((acc, grade) => {
    const course = grade.course || "Onbekend vak";
    acc[course] ??= [];
    acc[course].push(grade);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([course, courseGrades]) => {
      const sortedGrades = [...courseGrades].sort((a, b) => {
        const aTime = a.date ? new Date(a.date).getTime() : 0;
        const bTime = b.date ? new Date(b.date).getTime() : 0;
        return bTime - aTime;
      });

      return {
        course,
        grades: sortedGrades,
        gradeCount: sortedGrades.length,
        weightedAverage: calculateWeightedAverage(sortedGrades),
        latestDisplayDate: sortedGrades[0]?.displayDate || "",
      };
    })
    .sort((a, b) => a.course.localeCompare(b.course, "nl"));
}

export function calculateWeightedAverage(grades: MagisterGrade[]) {
  let weightedTotal = 0;
  let totalWeight = 0;

  for (const grade of grades) {
    const numericWeight = Number(grade.weight);
    if (grade.numericGrade == null || !grade.counts || !Number.isFinite(numericWeight)) {
      continue;
    }
    weightedTotal += grade.numericGrade * numericWeight;
    totalWeight += numericWeight;
  }

  if (totalWeight === 0) return null;
  return Math.round((weightedTotal / totalWeight) * 10) / 10;
}
